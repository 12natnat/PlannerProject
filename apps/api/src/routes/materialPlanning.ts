import { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { config } from '../config';
import { authenticate, requireRole } from '../middleware/auth';
import { runMaterialCalculation, type MaterialCalcSource } from '../lib/materialCalcEngine';

/**
 * Route Material Planning berbasis PERIODE (PlanningCycle).
 *
 * Prinsip isolasi (rancangan §3.1):
 *  - Semua tabel data punya cycleId NOT NULL, dan semua unique diawali cycleId.
 *  - SETIAP query wajib memfilter cycleId. Tidak ada deleteMany tanpa filter.
 *  - NPOF adalah pengecualian: sumber global yang dipakai bersama semua periode.
 */

const SOURCE_TYPES = ['MRP', 'HOTLIST', 'STOCK_RM', 'OUTSTANDING_PO', 'WIP'] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

const RETENTION_MONTHS = 18;
const RETENTION_EXTENSIONS = [3, 6, 9, 12];

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/** "2026-09" -> "September 2026" */
function labelFromUploadMonth(uploadMonth: string): string {
  const [year, month] = uploadMonth.split('-');
  const idx = Number(month) - 1;
  const name = MONTH_NAMES_ID[idx] ?? uploadMonth;
  return `${name} ${year}`;
}

function uploadMonthOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Ambil periode atau kirim 404. Dipakai semua endpoint ber-:id. */
async function requireCycle(id: string) {
  const cycle = await prisma.planningCycle.findUnique({ where: { id } });
  return cycle;
}

/** Status turunan (rancangan §4.1.1) — tidak disimpan di database. */
function deriveStatus(
  cycle: { status: string; isLocked: boolean; lastDataChangeAt: Date },
  currentResult: { dataVersionAt: Date } | null,
) {
  let base: 'NOT_CALCULATED' | 'CALCULATED' | 'STALE';
  if (!currentResult) base = 'NOT_CALCULATED';
  else if (cycle.lastDataChangeAt.getTime() > currentResult.dataVersionAt.getTime()) base = 'STALE';
  else base = 'CALCULATED';
  return { base, isStale: base === 'STALE', isLocked: cycle.isLocked };
}

function displayText(firstUploadedAt: Date, calculatedAt: Date | null): string {
  const fmt = (d: Date) =>
    `${d.getUTCDate()} ${MONTH_NAMES_ID[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()} ${String(
      d.getUTCHours(),
    ).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return calculatedAt
    ? `Diupload pada ${fmt(firstUploadedAt)} · Dihitung pada ${fmt(calculatedAt)}`
    : `Diupload pada ${fmt(firstUploadedAt)} · Belum dihitung`;
}

/** Satu entri audit ringkas per aksi (bukan per baris data). */
async function writeAudit(params: {
  cycleId: string;
  userId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  sourceType?: string;
  entityType: string;
  entityId?: string;
  notes?: string;
  dataBefore?: unknown;
  dataAfter?: unknown;
}) {
  await prisma.cycleAuditLog.create({
    data: {
      cycleId: params.cycleId,
      userId: params.userId,
      action: params.action,
      sourceType: params.sourceType,
      entityType: params.entityType,
      entityId: params.entityId,
      notes: params.notes,
      dataBefore: (params.dataBefore ?? undefined) as any,
      dataAfter: (params.dataAfter ?? undefined) as any,
    },
  });
}

/**
 * Salin data dari tabel Master Data (live) ke dalam SATU periode.
 *
 * Dipakai supaya user tidak perlu upload ulang file Excel yang sama: data yang
 * sudah ada di Master Data langsung dijadikan isi periode. Data live sudah
 * terstruktur, jadi tidak perlu divalidasi lagi seperti jalur `import`.
 */
async function copyLiveIntoCycle(cycleId: string, source: SourceType, userId: string) {
  let inserted = 0;
  let replaced = 0;
  let mrpStart: Date | null = null;
  let mrpEnd: Date | null = null;

  switch (source) {
    case 'MRP': {
      const rows = await prisma.weeklySchedule.findMany({ include: { item: true } });
      const payload: Prisma.CycleMRPWeekCreateManyInput[] = rows.map((r) => ({
        cycleId,
        partNumber: r.item.partNumber,
        description: r.item.itemName,
        year: r.year,
        weekNumber: r.weekNumber,
        weekStartDate: r.weekStartDate,
        weekEndDate: r.weekEndDate,
        quantity: r.quantity,
      }));
      for (const r of rows) {
        if (!mrpStart || r.weekStartDate < mrpStart) mrpStart = r.weekStartDate;
        if (!mrpEnd || r.weekEndDate > mrpEnd) mrpEnd = r.weekEndDate;
      }
      replaced = await prisma.cycleMRPWeek.count({ where: { cycleId } });
      await prisma.$transaction(
        async (tx) => {
          await tx.cycleMRPWeek.deleteMany({ where: { cycleId } });
          for (let i = 0; i < payload.length; i += 1000) {
            await tx.cycleMRPWeek.createMany({ data: payload.slice(i, i + 1000) });
          }
        },
        { timeout: 180000, maxWait: 30000 },
      );
      inserted = payload.length;
      break;
    }
    case 'HOTLIST': {
      const rows = await prisma.hotlist.findMany();
      const payload: Prisma.CycleHotlistCreateManyInput[] = rows.map((h) => ({
        cycleId,
        partNumber: h.partNumber,
        biTotal: h.biTotal,
      }));
      replaced = await prisma.cycleHotlist.count({ where: { cycleId } });
      await prisma.$transaction(
        async (tx) => {
          await tx.cycleHotlist.deleteMany({ where: { cycleId } });
          for (let i = 0; i < payload.length; i += 1000) {
            await tx.cycleHotlist.createMany({ data: payload.slice(i, i + 1000) });
          }
        },
        { timeout: 180000, maxWait: 30000 },
      );
      inserted = payload.length;
      break;
    }
    case 'STOCK_RM': {
      const rows = await prisma.stockRawMaterial.findMany();
      const payload: Prisma.CycleStockRMCreateManyInput[] = rows.map((s) => ({
        cycleId,
        itemDesc: s.itemDesc,
        supplier: s.supplier,
        qty: s.qty,
        unit: s.unit,
        date: s.date,
      }));
      replaced = await prisma.cycleStockRM.count({ where: { cycleId } });
      await prisma.$transaction(
        async (tx) => {
          await tx.cycleStockRM.deleteMany({ where: { cycleId } });
          for (let i = 0; i < payload.length; i += 1000) {
            await tx.cycleStockRM.createMany({ data: payload.slice(i, i + 1000) });
          }
        },
        { timeout: 180000, maxWait: 30000 },
      );
      inserted = payload.length;
      break;
    }
    case 'OUTSTANDING_PO': {
      const rows = await prisma.outstandingPO.findMany();
      const payload: Prisma.CycleOutstandingPOCreateManyInput[] = rows.map((p) => ({
        cycleId,
        itemDesc: p.itemDesc,
        supplierName: p.supplierName,
        qtyOrder: p.qtyOrder,
        qtyOrderUnit: p.qtyOrderUnit,
        qtyDelivered: p.qtyDelivered,
        qtyDeliveredUnit: p.qtyDeliveredUnit,
        planReceivedDate: p.planReceivedDate,
      }));
      replaced = await prisma.cycleOutstandingPO.count({ where: { cycleId } });
      await prisma.$transaction(
        async (tx) => {
          await tx.cycleOutstandingPO.deleteMany({ where: { cycleId } });
          for (let i = 0; i < payload.length; i += 1000) {
            await tx.cycleOutstandingPO.createMany({ data: payload.slice(i, i + 1000) });
          }
        },
        { timeout: 180000, maxWait: 30000 },
      );
      inserted = payload.length;
      break;
    }
    default: {
      const rows = await prisma.wIP.findMany({ include: { item: true } });
      const payload: Prisma.CycleWIPCreateManyInput[] = rows.map((w) => ({
        cycleId,
        partNumber: w.item.partNumber,
        location: w.location,
        quantity: w.quantity,
      }));
      replaced = await prisma.cycleWIP.count({ where: { cycleId } });
      await prisma.$transaction(
        async (tx) => {
          await tx.cycleWIP.deleteMany({ where: { cycleId } });
          for (let i = 0; i < payload.length; i += 1000) {
            await tx.cycleWIP.createMany({ data: payload.slice(i, i + 1000) });
          }
        },
        { timeout: 180000, maxWait: 30000 },
      );
      inserted = payload.length;
      break;
    }
  }

  const now = new Date();
  await prisma.planningCycle.update({
    where: { id: cycleId },
    data: {
      lastUploadedAt: now,
      lastDataChangeAt: now,
      ...(source === 'MRP' && mrpStart && mrpEnd ? { mrpStartDate: mrpStart, mrpEndDate: mrpEnd } : {}),
    },
  });

  await prisma.cycleSourceUpload.create({
    data: {
      cycleId,
      sourceType: source,
      fileName: '(salin dari Master Data)',
      rowCount: inserted,
      mode: 'replace',
      uploadedBy: userId,
    },
  });

  await writeAudit({
    cycleId,
    userId,
    action: replaced > 0 ? 'UPDATE' : 'CREATE',
    sourceType: source,
    entityType: 'CycleSourceUpload',
    notes: `Salin ${source} dari Master Data: ${inserted} baris masuk, ${replaced} baris lama diganti.`,
  });

  return { source, inserted, replaced };
}

export default async function materialPlanningRoutes(server: FastifyInstance) {
  const editor = [authenticate, requireRole(['ADMIN'])];
  const superOnly = [authenticate, requireRole(['SUPER_ADMIN'])];

  // ══════════════════════════════════════════════════════════════════════
  // DAFTAR & PEMBUATAN PERIODE
  // ══════════════════════════════════════════════════════════════════════

  server.get('/api/v1/material-planning/cycles', { preValidation: [authenticate] }, async (_request, reply) => {
    const [cycles, npofAgg] = await Promise.all([
      prisma.planningCycle.findMany({
        orderBy: { uploadMonth: 'desc' },
        include: {
          uploads: { orderBy: { uploadedAt: 'desc' } },
          results: {
            select: {
              id: true,
              runNumber: true,
              calculatedAt: true,
              calculatedBy: true,
              dataVersionAt: true,
              isCurrent: true,
              isSaved: true,
              savedNote: true,
            },
          },
        },
      }),
      prisma.npofMaterial.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    ]);

    const npofLastUpdated = npofAgg._max.updatedAt;

    const data = cycles.map((c) => {
      const current = c.results.find((r) => r.isCurrent) ?? null;
      const { base, isStale, isLocked } = deriveStatus(c, current);
      return {
        id: c.id,
        uploadMonth: c.uploadMonth,
        label: c.label,
        status: c.status,
        derivedStatus: base,
        isStale,
        isLocked,
        displayText: displayText(c.firstUploadedAt, c.calculatedAt),
        firstUploadedAt: c.firstUploadedAt,
        lastUploadedAt: c.lastUploadedAt,
        lastDataChangeAt: c.lastDataChangeAt,
        mrpStartDate: c.mrpStartDate,
        mrpEndDate: c.mrpEndDate,
        weekCount: c.weekCount,
        notes: c.notes,
        currentResult: current
          ? {
              id: current.id,
              runNumber: current.runNumber,
              calculatedAt: current.calculatedAt,
              calculatedBy: current.calculatedBy,
              isSaved: current.isSaved,
              savedNote: current.savedNote,
            }
          : null,
        savedResultCount: c.results.filter((r) => r.isSaved).length,
        sources: c.uploads.map((u) => ({
          sourceType: u.sourceType,
          rowCount: u.rowCount,
          uploadedAt: u.uploadedAt,
          uploadedBy: u.uploadedBy,
          fileName: u.fileName,
        })),
        npofInfo: {
          isShared: true,
          totalRows: npofAgg._count._all,
          lastUpdatedAt: npofLastUpdated,
          changedSinceCalculation:
            Boolean(npofLastUpdated && current) &&
            Boolean(npofLastUpdated && current && npofLastUpdated.getTime() > current.calculatedAt.getTime()),
        },
      };
    });

    return reply.send({ data });
  });

  server.post(
    '/api/v1/material-planning/cycles',
    { preValidation: editor },
    async (request: FastifyRequest, reply) => {
      const body = (request.body || {}) as { label?: string; notes?: string; uploadMonth?: string };
      const now = new Date();
      const uploadMonth = body.uploadMonth && /^\d{4}-\d{2}$/.test(body.uploadMonth)
        ? body.uploadMonth
        : uploadMonthOf(now);

      const existing = await prisma.planningCycle.findUnique({ where: { uploadMonth } });
      if (existing) {
        return reply.code(409).send({
          error: 'Conflict',
          message: `Periode untuk bulan upload ${uploadMonth} sudah ada ("${existing.label}"). Upload data ke periode itu, atau hapus dulu.`,
          data: { id: existing.id, label: existing.label },
        });
      }

      const cycle = await prisma.planningCycle.create({
        data: {
          uploadMonth,
          label: body.label?.trim() || labelFromUploadMonth(uploadMonth),
          mrpStartDate: now,
          mrpEndDate: now,
          weekCount: 26,
          retentionDueAt: addMonths(now, RETENTION_MONTHS),
          notes: body.notes,
          createdBy: request.user!.id,
        },
      });

      await writeAudit({
        cycleId: cycle.id,
        userId: request.user!.id,
        action: 'CREATE',
        entityType: 'PlanningCycle',
        entityId: cycle.id,
        notes: `Periode dibuat: ${cycle.label} (bulan upload ${cycle.uploadMonth})`,
      });

      return reply.code(201).send({ data: cycle });
    },
  );

  server.get('/api/v1/material-planning/cycles/expired', { preValidation: editor }, async (_request, reply) => {
    const due = await prisma.planningCycle.findMany({
      where: { retentionDueAt: { lt: new Date() } },
      include: {
        results: {
          where: { isSaved: true },
          select: { id: true, runNumber: true, calculatedAt: true, savedNote: true },
        },
      },
      orderBy: { retentionDueAt: 'asc' },
    });

    return reply.send({
      data: due.map((c) => ({
        id: c.id,
        label: c.label,
        uploadMonth: c.uploadMonth,
        retentionDueAt: c.retentionDueAt,
        retentionNotifiedAt: c.retentionNotifiedAt,
        hasSavedResults: c.results.length > 0,
        savedResults: c.results,
      })),
      extensions: RETENTION_EXTENSIONS,
    });
  });

  server.get('/api/v1/material-planning/cycles/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cycle = await prisma.planningCycle.findUnique({
      where: { id },
      include: {
        uploads: { orderBy: { uploadedAt: 'desc' } },
        results: { orderBy: { runNumber: 'desc' } },
      },
    });
    if (!cycle) return reply.code(404).send({ error: 'Not Found', message: 'Periode tidak ditemukan' });

    const current = cycle.results.find((r) => r.isCurrent) ?? null;
    const counts = await Promise.all([
      prisma.cycleMRPWeek.count({ where: { cycleId: id } }),
      prisma.cycleHotlist.count({ where: { cycleId: id } }),
      prisma.cycleStockRM.count({ where: { cycleId: id } }),
      prisma.cycleOutstandingPO.count({ where: { cycleId: id } }),
      prisma.cycleWIP.count({ where: { cycleId: id } }),
    ]);

    return reply.send({
      data: {
        ...cycle,
        results: cycle.results.map((r) => ({ ...r, resultSnapshot: undefined, summarySnapshot: undefined })),
        derivedStatus: deriveStatus(cycle, current).base,
        rowCounts: {
          MRP: counts[0],
          HOTLIST: counts[1],
          STOCK_RM: counts[2],
          OUTSTANDING_PO: counts[3],
          WIP: counts[4],
        },
      },
    });
  });

  server.patch('/api/v1/material-planning/cycles/:id', { preValidation: editor }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { label?: string; notes?: string };
    const cycle = await requireCycle(id);
    if (!cycle) return reply.code(404).send({ error: 'Not Found', message: 'Periode tidak ditemukan' });

    const updated = await prisma.planningCycle.update({
      where: { id },
      data: { label: body.label?.trim() || cycle.label, notes: body.notes ?? cycle.notes },
    });

    await writeAudit({
      cycleId: id,
      userId: request.user!.id,
      action: 'UPDATE',
      entityType: 'PlanningCycle',
      entityId: id,
      dataBefore: { label: cycle.label, notes: cycle.notes },
      dataAfter: { label: updated.label, notes: updated.notes },
      notes: 'Label/catatan periode diubah',
    });

    return reply.send({ data: updated });
  });

  server.delete('/api/v1/material-planning/cycles/:id', { preValidation: superOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cycle = await requireCycle(id);
    if (!cycle) return reply.code(404).send({ error: 'Not Found', message: 'Periode tidak ditemukan' });

    // onDelete: Cascade menghapus 8 tabel turunannya sekaligus.
    await prisma.planningCycle.delete({ where: { id } });
    return reply.send({ success: true, message: `Periode "${cycle.label}" dihapus beserta seluruh datanya.` });
  });

  // ══════════════════════════════════════════════════════════════════════
  // IMPORT DATA SUMBER
  // ══════════════════════════════════════════════════════════════════════

  server.post('/api/v1/material-planning/cycles/:id/import', { preValidation: editor }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as {
      source?: string;
      data?: unknown[];
      fileName?: string;
      mode?: string;
    };

    const cycle = await requireCycle(id);
    if (!cycle) return reply.code(404).send({ error: 'Not Found', message: 'Periode tidak ditemukan' });
    if (cycle.isLocked) {
      return reply.code(409).send({ error: 'Conflict', message: 'Periode terkunci. Buka kunci dulu.' });
    }

    const source = String(body.source || '').toUpperCase() as SourceType;
    if (!SOURCE_TYPES.includes(source)) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: `Sumber tidak dikenal. Pilihan: ${SOURCE_TYPES.join(', ')}. NPOF dikelola di Master Data dan dipakai bersama semua periode.`,
      });
    }

    const rows = Array.isArray(body.data) ? body.data : [];
    if (rows.length === 0) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Data kosong.' });
    }

    const asRecord = (row: unknown) => (row || {}) as Record<string, unknown>;
    let skipped = 0;
    let mrpStart: Date | null = null;
    let mrpEnd: Date | null = null;

    // ── Tahap 1: validasi & susun data (TANPA database) ──────────────────
    // Dipisah dari tahap tulis supaya tidak ada satu query per baris.
    // Cara lama (satu create() per baris di dalam transaksi) gagal dengan
    // P2028 "Transaction not found" begitu barisnya ribuan — dan data MRP
    // nyata berisi ~16.000 baris.
    const mrpData: Prisma.CycleMRPWeekCreateManyInput[] = [];
    const hotlistData: Prisma.CycleHotlistCreateManyInput[] = [];
    const stockData: Prisma.CycleStockRMCreateManyInput[] = [];
    const poData: Prisma.CycleOutstandingPOCreateManyInput[] = [];
    const wipData: Prisma.CycleWIPCreateManyInput[] = [];

    switch (source) {
      case 'MRP': {
        for (const raw of rows) {
          const row = asRecord(raw);
          const partNumber = String(row.partNumber ?? '').trim();
          const weekStartDate = toDate(row.weekStartDate);
          const weekEndDate = toDate(row.weekEndDate) ?? weekStartDate;
          const weekNumber = Math.trunc(toNumber(row.weekNumber));
          if (!partNumber || !weekStartDate || !weekEndDate || !weekNumber) {
            skipped += 1;
            continue;
          }
          const year = Math.trunc(toNumber(row.year)) || weekStartDate.getUTCFullYear();
          mrpData.push({
            cycleId: id,
            partNumber,
            description: row.description ? String(row.description) : null,
            year,
            weekNumber,
            weekStartDate,
            weekEndDate,
            quantity: toNumber(row.quantity),
          });
          if (!mrpStart || weekStartDate < mrpStart) mrpStart = weekStartDate;
          if (!mrpEnd || weekEndDate > mrpEnd) mrpEnd = weekEndDate;
        }
        break;
      }
      case 'HOTLIST': {
        for (const raw of rows) {
          const row = asRecord(raw);
          const partNumber = String(row.partNumber ?? '').trim();
          if (!partNumber) {
            skipped += 1;
            continue;
          }
          hotlistData.push({ cycleId: id, partNumber, biTotal: toNumber(row.biTotal) });
        }
        break;
      }
      case 'STOCK_RM': {
        for (const raw of rows) {
          const row = asRecord(raw);
          const itemDesc = String(row.itemDesc ?? '').trim();
          if (!itemDesc) {
            skipped += 1;
            continue;
          }
          stockData.push({
            cycleId: id,
            itemDesc,
            supplier: row.supplier ? String(row.supplier) : null,
            qty: toNumber(row.qty),
            unit: String(row.unit ?? '').trim(),
            date: toDate(row.date) ?? new Date(),
          });
        }
        break;
      }
      case 'OUTSTANDING_PO': {
        for (const raw of rows) {
          const row = asRecord(raw);
          const itemDesc = String(row.itemDesc ?? '').trim();
          const supplierName = String(row.supplierName ?? '').trim();
          const planReceivedDate = toDate(row.planReceivedDate);
          if (!itemDesc || !supplierName || !planReceivedDate) {
            skipped += 1;
            continue;
          }
          poData.push({
            cycleId: id,
            itemDesc,
            supplierName,
            qtyOrder: toNumber(row.qtyOrder),
            qtyOrderUnit: String(row.qtyOrderUnit ?? '').trim(),
            qtyDelivered: toNumber(row.qtyDelivered),
            qtyDeliveredUnit: String(row.qtyDeliveredUnit ?? '').trim(),
            planReceivedDate,
          });
        }
        break;
      }
      default: {
        for (const raw of rows) {
          const row = asRecord(raw);
          const partNumber = String(row.partNumber ?? '').trim();
          const location = String(row.location ?? '').trim();
          if (!partNumber || !location) {
            skipped += 1;
            continue;
          }
          wipData.push({ cycleId: id, partNumber, location, quantity: toNumber(row.quantity) });
        }
        break;
      }
    }

    const inserted =
      mrpData.length + hotlistData.length + stockData.length + poData.length + wipData.length;

    // ── Tahap 2: timpa data sumber ini DI DALAM periode ini ──────────────
    // createMany per kelompok 1.000 baris: jauh lebih cepat daripada satu
    // query per baris, dan tidak menabrak batas waktu transaksi.
    const CHUNK = 1000;
    const previousCount = await prisma.$transaction(
      async (tx) => {
        switch (source) {
          case 'MRP': {
            const before = await tx.cycleMRPWeek.count({ where: { cycleId: id } });
            await tx.cycleMRPWeek.deleteMany({ where: { cycleId: id } });
            for (let i = 0; i < mrpData.length; i += CHUNK) {
              await tx.cycleMRPWeek.createMany({ data: mrpData.slice(i, i + CHUNK) });
            }
            return before;
          }
          case 'HOTLIST': {
            const before = await tx.cycleHotlist.count({ where: { cycleId: id } });
            await tx.cycleHotlist.deleteMany({ where: { cycleId: id } });
            for (let i = 0; i < hotlistData.length; i += CHUNK) {
              await tx.cycleHotlist.createMany({ data: hotlistData.slice(i, i + CHUNK) });
            }
            return before;
          }
          case 'STOCK_RM': {
            const before = await tx.cycleStockRM.count({ where: { cycleId: id } });
            await tx.cycleStockRM.deleteMany({ where: { cycleId: id } });
            for (let i = 0; i < stockData.length; i += CHUNK) {
              await tx.cycleStockRM.createMany({ data: stockData.slice(i, i + CHUNK) });
            }
            return before;
          }
          case 'OUTSTANDING_PO': {
            const before = await tx.cycleOutstandingPO.count({ where: { cycleId: id } });
            await tx.cycleOutstandingPO.deleteMany({ where: { cycleId: id } });
            for (let i = 0; i < poData.length; i += CHUNK) {
              await tx.cycleOutstandingPO.createMany({ data: poData.slice(i, i + CHUNK) });
            }
            return before;
          }
          default: {
            const before = await tx.cycleWIP.count({ where: { cycleId: id } });
            await tx.cycleWIP.deleteMany({ where: { cycleId: id } });
            for (let i = 0; i < wipData.length; i += CHUNK) {
              await tx.cycleWIP.createMany({ data: wipData.slice(i, i + CHUNK) });
            }
            return before;
          }
        }
      },
      { timeout: 180000, maxWait: 30000 },
    );

    const now = new Date();
    await prisma.planningCycle.update({
      where: { id },
      data: {
        lastUploadedAt: now,
        lastDataChangeAt: now,
        ...(source === 'MRP' && mrpStart && mrpEnd ? { mrpStartDate: mrpStart, mrpEndDate: mrpEnd } : {}),
      },
    });

    await prisma.cycleSourceUpload.create({
      data: {
        cycleId: id,
        sourceType: source,
        fileName: body.fileName ?? null,
        rowCount: inserted,
        mode: body.mode ?? 'replace',
        uploadedBy: request.user!.id,
      },
    });

    // SATU entri audit per aksi upload, bukan per baris data.
    await writeAudit({
      cycleId: id,
      userId: request.user!.id,
      action: previousCount > 0 ? 'UPDATE' : 'CREATE',
      sourceType: source,
      entityType: 'CycleSourceUpload',
      notes: `Upload ${source}: ${inserted} baris masuk, ${skipped} dilewati, ${previousCount} baris lama diganti. Hanya periode ini yang terpengaruh.`,
    });

    return reply.send({
      data: {
        source,
        inserted,
        skipped,
        replaced: previousCount,
        message: `Data ${source} periode "${cycle.label}" diganti. Hasil perhitungan periode ini perlu dihitung ulang. Periode lain tidak terpengaruh.`,
      },
    });
  });

  /**
   * Salin data dari Master Data ke periode ini.
   * body: { sources?: [...] } atau { source: 'MRP' }; 'ALL' = kelima sumber.
   */
  server.post('/api/v1/material-planning/cycles/:id/import-live', { preValidation: editor }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { source?: string; sources?: string[] };

    const cycle = await requireCycle(id);
    if (!cycle) return reply.code(404).send({ error: 'Not Found', message: 'Periode tidak ditemukan' });
    if (cycle.isLocked) {
      return reply.code(409).send({ error: 'Conflict', message: 'Periode terkunci. Buka kunci dulu.' });
    }

    const requested = (body.sources?.length ? body.sources : [body.source ?? 'ALL']).map((s) =>
      String(s).toUpperCase(),
    );
    const targets: SourceType[] = requested.includes('ALL')
      ? [...SOURCE_TYPES]
      : (requested.filter((s) => (SOURCE_TYPES as readonly string[]).includes(s)) as SourceType[]);

    if (targets.length === 0) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: `Sumber tidak dikenal. Pilihan: ALL, ${SOURCE_TYPES.join(', ')}.`,
      });
    }

    const results = [];
    for (const source of targets) {
      results.push(await copyLiveIntoCycle(id, source, request.user!.id));
    }

    return reply.send({
      data: results,
      message:
        'Data Master Data disalin ke periode ini. Hasil perhitungan periode ini perlu dihitung ulang. ' +
        'Periode lain tidak terpengaruh.',
    });
  });

  server.get('/api/v1/material-planning/cycles/:id/sources', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cycle = await requireCycle(id);
    if (!cycle) return reply.code(404).send({ error: 'Not Found', message: 'Periode tidak ditemukan' });

    const uploads = await prisma.cycleSourceUpload.findMany({
      where: { cycleId: id },
      orderBy: { uploadedAt: 'desc' },
    });

    const counts = await Promise.all([
      prisma.cycleMRPWeek.count({ where: { cycleId: id } }),
      prisma.cycleHotlist.count({ where: { cycleId: id } }),
      prisma.cycleStockRM.count({ where: { cycleId: id } }),
      prisma.cycleOutstandingPO.count({ where: { cycleId: id } }),
      prisma.cycleWIP.count({ where: { cycleId: id } }),
    ]);
    const rowCounts: Record<SourceType, number> = {
      MRP: counts[0],
      HOTLIST: counts[1],
      STOCK_RM: counts[2],
      OUTSTANDING_PO: counts[3],
      WIP: counts[4],
    };

    return reply.send({
      data: SOURCE_TYPES.map((sourceType) => {
        const latest = uploads.find((u) => u.sourceType === sourceType) ?? null;
        return {
          sourceType,
          rowCount: rowCounts[sourceType],
          uploaded: Boolean(latest),
          uploadedAt: latest?.uploadedAt ?? null,
          uploadedBy: latest?.uploadedBy ?? null,
          fileName: latest?.fileName ?? null,
        };
      }),
      npof: { isShared: true, note: 'NPOF dipakai bersama semua periode, dikelola di Master Data.' },
    });
  });

  server.get('/api/v1/material-planning/cycles/:id/npof-check', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const current = await prisma.cycleResult.findFirst({
      where: { cycleId: id, isCurrent: true },
      select: { calculatedAt: true },
    });
    const npofAgg = await prisma.npofMaterial.aggregate({ _max: { updatedAt: true } });
    const npofLastUpdated = npofAgg._max.updatedAt;

    const changed =
      Boolean(npofLastUpdated && current) &&
      Boolean(npofLastUpdated && current && npofLastUpdated.getTime() > current.calculatedAt.getTime());

    return reply.send({
      data: {
        changedSinceCalculation: changed,
        npofLastUpdatedAt: npofLastUpdated,
        lastCalculatedAt: current?.calculatedAt ?? null,
        message: changed
          ? 'NPOF sudah berubah sejak perhitungan terakhir. Perhitungan akan mengikuti NPOF terbaru.'
          : 'NPOF tidak berubah sejak perhitungan terakhir.',
      },
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // PERHITUNGAN
  // ══════════════════════════════════════════════════════════════════════

  server.post('/api/v1/material-planning/cycles/:id/calculate', { preValidation: editor }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cycle = await requireCycle(id);
    if (!cycle) return reply.code(404).send({ error: 'Not Found', message: 'Periode tidak ditemukan' });
    if (cycle.isLocked) {
      return reply.code(409).send({ error: 'Conflict', message: 'Periode terkunci. Buka kunci dulu.' });
    }

    const [mrpRows, hotlists, stocks, pos, wips, npofs] = await Promise.all([
      prisma.cycleMRPWeek.findMany({ where: { cycleId: id } }),
      prisma.cycleHotlist.findMany({ where: { cycleId: id } }),
      prisma.cycleStockRM.findMany({ where: { cycleId: id } }),
      prisma.cycleOutstandingPO.findMany({ where: { cycleId: id } }),
      prisma.cycleWIP.findMany({ where: { cycleId: id } }),
      prisma.npofMaterial.findMany(), // global, dipakai bersama semua periode
    ]);

    if (mrpRows.length === 0) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Periode ini belum punya data MRP. Upload data MRP dulu.',
      });
    }

    const source: MaterialCalcSource = {
      mrpWeeks: mrpRows.map((r) => ({
        partNumber: r.partNumber,
        description: r.description,
        year: r.year,
        weekNumber: r.weekNumber,
        weekStartDate: r.weekStartDate,
        weekEndDate: r.weekEndDate,
        quantity: r.quantity,
      })),
      hotlists: hotlists.map((h) => ({ partNumber: h.partNumber, biTotal: h.biTotal })),
      stocks: stocks.map((s) => ({ itemDesc: s.itemDesc, supplier: s.supplier, qty: s.qty, unit: s.unit })),
      pos: pos.map((p) => ({
        itemDesc: p.itemDesc,
        supplierName: p.supplierName,
        qtyOrder: p.qtyOrder,
        qtyOrderUnit: p.qtyOrderUnit,
        qtyDelivered: p.qtyDelivered,
        planReceivedDate: p.planReceivedDate,
      })),
      wips: wips.map((w) => ({ partNumber: w.partNumber, location: w.location, quantity: w.quantity })),
      npofs,
    };

    const result = runMaterialCalculation(source, {
      weekCount: cycle.weekCount,
      periodStartDate: cycle.mrpStartDate,
      timelineBaseDate: cycle.mrpStartDate,
      toleranceCm: config.materialCalc.sizeToleranceCm,
      sheetsPerRim: config.materialCalc.sheetsPerRim,
      requireSupplierMatch: config.materialCalc.requireSupplierMatch,
    });

    const calculatedAt = new Date();
    const runNumber = cycle.calculatedRunCount + 1;

    const created = await prisma.$transaction(async (tx) => {
      // Siklus hidup hasil (rancangan §4.1.5):
      //  - baris current lama yang isSaved = false -> dihapus
      //  - baris current lama yang isSaved = true  -> tetap disimpan
      const oldCurrent = await tx.cycleResult.findMany({ where: { cycleId: id, isCurrent: true } });
      const toDelete = oldCurrent.filter((r) => !r.isSaved).map((r) => r.id);
      if (toDelete.length > 0) {
        await tx.cycleResult.deleteMany({ where: { id: { in: toDelete }, cycleId: id } });
      }
      if (oldCurrent.length > 0) {
        await tx.cycleResult.updateMany({
          where: { cycleId: id, isCurrent: true },
          data: { isCurrent: false },
        });
      }

      const row = await tx.cycleResult.create({
        data: {
          cycleId: id,
          runNumber,
          periodStartDate: result.periodStartDate,
          periodEndDate: result.periodEndDate,
          periodWeeks: result.periodWeeks,
          calculatedAt,
          calculatedBy: request.user!.id,
          dataVersionAt: cycle.lastDataChangeAt,
          isCurrent: true,
          isSaved: false,
          resultSnapshot: {
            calculatedAt: calculatedAt.toISOString(),
            periodStartDate: result.periodStartDate.toISOString(),
            periodEndDate: result.periodEndDate.toISOString(),
            periodWeeks: result.periodWeeks,
            weekCount: result.weekCount,
            groups: result.groups,
          } as any,
          summarySnapshot: { totals: result.totals, weeks: result.weeks } as any,
        },
      });

      await tx.planningCycle.update({
        where: { id },
        data: {
          status: 'CALCULATED',
          calculatedAt,
          calculatedBy: request.user!.id,
          calculatedRunCount: runNumber,
        },
      });

      return row;
    });

    await writeAudit({
      cycleId: id,
      userId: request.user!.id,
      action: 'CREATE',
      entityType: 'CycleResult',
      entityId: created.id,
      notes: `Perhitungan run #${runNumber}: ${result.totals.partCount} part, ${result.totals.partsWithStock} part dapat stok.`,
    });

    return reply.code(201).send({
      data: {
        id: created.id,
        runNumber,
        calculatedAt,
        periodStartDate: result.periodStartDate,
        periodEndDate: result.periodEndDate,
        periodWeeks: result.periodWeeks,
        weekCount: result.weekCount,
        weeks: result.weeks,
        totals: result.totals,
        groups: result.groups,
      },
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // HASIL PERHITUNGAN
  // ══════════════════════════════════════════════════════════════════════

  server.get('/api/v1/material-planning/cycles/:id/results', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const results = await prisma.cycleResult.findMany({
      where: { cycleId: id },
      orderBy: { runNumber: 'desc' },
      select: {
        id: true,
        runNumber: true,
        periodStartDate: true,
        periodEndDate: true,
        periodWeeks: true,
        calculatedAt: true,
        calculatedBy: true,
        isCurrent: true,
        isSaved: true,
        savedNote: true,
        summarySnapshot: true,
      },
    });
    return reply.send({ data: results });
  });

  server.get('/api/v1/material-planning/cycles/:id/results/:resultId', { preValidation: [authenticate] }, async (request, reply) => {
    const { id, resultId } = request.params as { id: string; resultId: string };
    // where memakai id + cycleId supaya tidak bisa menembus periode lain.
    const result = await prisma.cycleResult.findFirst({ where: { id: resultId, cycleId: id } });
    if (!result) return reply.code(404).send({ error: 'Not Found', message: 'Hasil tidak ditemukan di periode ini' });
    return reply.send({ data: result });
  });

  server.patch(
    '/api/v1/material-planning/cycles/:id/results/:resultId',
    { preValidation: editor },
    async (request, reply) => {
      const { id, resultId } = request.params as { id: string; resultId: string };
      const body = (request.body || {}) as { isSaved?: boolean; savedNote?: string };
      const existing = await prisma.cycleResult.findFirst({ where: { id: resultId, cycleId: id } });
      if (!existing) return reply.code(404).send({ error: 'Not Found', message: 'Hasil tidak ditemukan di periode ini' });
      if (existing.isCurrent && body.isSaved === false) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Hasil yang sedang aktif tidak bisa dibatalkan penyimpanannya. Hitung ulang dulu.',
        });
      }

      const updated = await prisma.cycleResult.update({
        where: { id: resultId },
        data: {
          isSaved: body.isSaved ?? existing.isSaved,
          savedNote: body.savedNote ?? existing.savedNote,
        },
      });

      await writeAudit({
        cycleId: id,
        userId: request.user!.id,
        action: 'UPDATE',
        entityType: 'CycleResult',
        entityId: resultId,
        dataBefore: { isSaved: existing.isSaved, savedNote: existing.savedNote },
        dataAfter: { isSaved: updated.isSaved, savedNote: updated.savedNote },
        notes: updated.isSaved ? 'Hasil ditandai tersimpan' : 'Tanda tersimpan dibatalkan',
      });

      return reply.send({ data: updated });
    },
  );

  server.delete(
    '/api/v1/material-planning/cycles/:id/results/:resultId',
    { preValidation: editor },
    async (request, reply) => {
      const { id, resultId } = request.params as { id: string; resultId: string };
      const existing = await prisma.cycleResult.findFirst({ where: { id: resultId, cycleId: id } });
      if (!existing) return reply.code(404).send({ error: 'Not Found', message: 'Hasil tidak ditemukan di periode ini' });
      if (existing.isCurrent) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Hasil aktif tidak bisa dihapus langsung.' });
      }
      await prisma.cycleResult.delete({ where: { id: resultId } });
      await writeAudit({
        cycleId: id,
        userId: request.user!.id,
        action: 'DELETE',
        entityType: 'CycleResult',
        entityId: resultId,
        dataBefore: { runNumber: existing.runNumber },
        notes: `Versi tersimpan run #${existing.runNumber} dihapus`,
      });
      return reply.send({ success: true });
    },
  );

  // ══════════════════════════════════════════════════════════════════════
  // AUDIT & KUNCI MANUAL
  // ══════════════════════════════════════════════════════════════════════

  server.get('/api/v1/material-planning/cycles/:id/audit', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const logs = await prisma.cycleAuditLog.findMany({
      where: { cycleId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { name: true, email: true } } },
    });
    return reply.send({ data: logs });
  });

  server.post('/api/v1/material-planning/cycles/:id/lock', { preValidation: superOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { note?: string };
    const cycle = await requireCycle(id);
    if (!cycle) return reply.code(404).send({ error: 'Not Found', message: 'Periode tidak ditemukan' });

    const updated = await prisma.planningCycle.update({
      where: { id },
      data: { isLocked: true, lockedAt: new Date(), lockedBy: request.user!.id, lockNote: body.note },
    });
    await writeAudit({
      cycleId: id,
      userId: request.user!.id,
      action: 'UPDATE',
      entityType: 'PlanningCycle',
      entityId: id,
      notes: `Periode dikunci. ${body.note || ''}`.trim(),
    });
    return reply.send({ data: updated });
  });

  server.post('/api/v1/material-planning/cycles/:id/unlock', { preValidation: superOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cycle = await requireCycle(id);
    if (!cycle) return reply.code(404).send({ error: 'Not Found', message: 'Periode tidak ditemukan' });

    const updated = await prisma.planningCycle.update({
      where: { id },
      data: { isLocked: false, lockedAt: null, lockedBy: null, lockNote: null },
    });
    await writeAudit({
      cycleId: id,
      userId: request.user!.id,
      action: 'UPDATE',
      entityType: 'PlanningCycle',
      entityId: id,
      notes: 'Kunci periode dibuka',
    });
    return reply.send({ data: updated });
  });

  // ══════════════════════════════════════════════════════════════════════
  // RETENSI 18 BULAN
  // ══════════════════════════════════════════════════════════════════════

  server.post(
    '/api/v1/material-planning/cycles/:id/confirm-delete',
    { preValidation: editor },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const cycle = await requireCycle(id);
      if (!cycle) return reply.code(404).send({ error: 'Not Found', message: 'Periode tidak ditemukan' });

      await prisma.planningCycle.delete({ where: { id } });
      return reply.send({ success: true, message: `Periode "${cycle.label}" dihapus permanen.` });
    },
  );

  server.post(
    '/api/v1/material-planning/cycles/:id/extend-retention',
    { preValidation: editor },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body || {}) as { months?: number };
      const months = Number(body.months);
      if (!RETENTION_EXTENSIONS.includes(months)) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: `Durasi harus salah satu dari: ${RETENTION_EXTENSIONS.join(', ')} bulan.`,
        });
      }
      const cycle = await requireCycle(id);
      if (!cycle) return reply.code(404).send({ error: 'Not Found', message: 'Periode tidak ditemukan' });

      const updated = await prisma.planningCycle.update({
        where: { id },
        data: { retentionDueAt: addMonths(new Date(), months), retentionNotifiedAt: null },
      });
      await writeAudit({
        cycleId: id,
        userId: request.user!.id,
        action: 'UPDATE',
        entityType: 'PlanningCycle',
        entityId: id,
        notes: `Retensi diperpanjang ${months} bulan (jatuh tempo ${updated.retentionDueAt?.toISOString().slice(0, 10)}).`,
      });
      return reply.send({ data: updated });
    },
  );
}
