import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';

export default async function fgStockRoutes(server: FastifyInstance) {
  // Get all FG stocks
  server.get('/api/v1/fg-stock', { preValidation: [authenticate] }, async (request, reply) => {
    const stocks = await prisma.fGStock.findMany({
      include: { item: true, user: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return reply.send({ data: stocks });
  });

  // Upsert FG stock
  server.post(
    '/api/v1/fg-stock',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { itemId, partNumber, quantity, date, notes, saveMode, unit } = request.body as any;

      if ((!itemId && !partNumber) || quantity === undefined || !date) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Missing required fields' });
      }

      let finalItemId = itemId;
      if (!finalItemId && partNumber) {
        let item = await prisma.item.findUnique({ where: { partNumber } });
        if (!item) {
          item = await prisma.item.create({
            data: { partNumber, description: partNumber, unit: unit || 'pcs' },
          });
        } else if (unit) {
          item = await prisma.item.update({
            where: { id: item.id },
            data: { unit },
          });
        }
        finalItemId = item.id;
      } else if (finalItemId && unit) {
        await prisma.item.update({
          where: { id: finalItemId },
          data: { unit },
        });
      }

      const inputDate = new Date(date);
      inputDate.setUTCHours(0, 0, 0, 0);

      const existingStock = await prisma.fGStock.findUnique({
        where: { itemId_date: { itemId: finalItemId, date: inputDate } },
      });

      let previousQuantity = 0;
      if (existingStock) {
        previousQuantity = existingStock.quantity;
      } else {
        const lastKnown = await prisma.fGStock.findFirst({
          where: { itemId: finalItemId, date: { lte: inputDate } },
          orderBy: { date: 'desc' }
        });
        if (lastKnown) previousQuantity = lastKnown.quantity;
      }

      const newQuantity = saveMode === 'add' ? previousQuantity + parseFloat(quantity) : parseFloat(quantity);

      let inQty = 0;
      let outQty = 0;
      if (saveMode === 'add') {
        inQty = parseFloat(quantity);
      } else {
        if (newQuantity > previousQuantity) {
          inQty = newQuantity - previousQuantity;
        } else if (newQuantity < previousQuantity) {
          outQty = previousQuantity - newQuantity;
        }
      }

      const updatedStock = await prisma.fGStock.upsert({
        where: { itemId_date: { itemId: finalItemId, date: inputDate } },
        update: {
          quantity: newQuantity,
          notes,
          updatedBy: request.user!.id,
        },
        create: {
          itemId: finalItemId,
          quantity: newQuantity,
          date: inputDate,
          notes,
          updatedBy: request.user!.id,
        },
      });

      if (inQty > 0 || outQty > 0) {
        await prisma.fGStockHistory.create({
          data: {
            itemId: finalItemId,
            inQty,
            outQty,
            balance: newQuantity,
            type: saveMode === 'add' ? 'ADD' : 'OVERWRITE',
            date: inputDate,
            notes,
            createdBy: request.user!.id,
          }
        });
      }

      // Audit Log
      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: existingStock ? 'UPDATE' : 'CREATE',
          entityType: 'FGStock',
          entityId: updatedStock.id,
          dataBefore: existingStock ? (existingStock as any) : null,
          dataAfter: updatedStock as any,
          notes: 'Upserted FG Stock',
        },
      });

      return reply.code(200).send({ data: updatedStock });
    }
  );
  // Bulk Upsert FG stock
  server.post(
    '/api/v1/fg-stock/bulk',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { records, saveMode } = request.body as any;
      if (!Array.isArray(records) || records.length === 0) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No records provided' });
      }

      if (saveMode === 'overwrite') {
        const uniqueCodes = [...new Set(records.map((r: any) => r.partNumber as string).filter(Boolean))];
        const existingItems = await prisma.item.findMany({ where: { partNumber: { in: uniqueCodes } } });
        const itemCodeToId: Record<string, string> = {};
        for (const item of existingItems) itemCodeToId[item.partNumber] = item.id;

        const scopeMap = new Map<string, { date: Date; itemIds: Set<string> }>();
        for (const r of records) {
          if (!r.partNumber || r.quantity === undefined || !r.date) continue;
          const date = new Date(r.date);
          const key = date.getTime().toString();
          
          if (!scopeMap.has(key)) {
            scopeMap.set(key, { date, itemIds: new Set() });
          }
          if (itemCodeToId[r.partNumber]) {
            scopeMap.get(key)!.itemIds.add(itemCodeToId[r.partNumber]);
          }
        }

        for (const scope of scopeMap.values()) {
          await prisma.fGStock.deleteMany({
            where: {
              date: scope.date,
              itemId: { notIn: Array.from(scope.itemIds) }
            }
          });
        }
      }

      const results = [];
      for (const record of records) {
        const { partNumber, quantity, date, unit } = record;
        if (!partNumber || quantity === undefined || !date) continue;

        let item = await prisma.item.findUnique({ where: { partNumber } });
        if (!item) {
          item = await prisma.item.create({
            data: { partNumber, description: partNumber, unit: unit || 'pcs' },
          });
        } else if (unit) {
          item = await prisma.item.update({
            where: { id: item.id },
            data: { unit },
          });
        }

        const inputDate = new Date(date);
        inputDate.setUTCHours(0, 0, 0, 0);

        const existingStock = await prisma.fGStock.findUnique({
          where: { itemId_date: { itemId: item.id, date: inputDate } },
        });

        let previousQuantity = 0;
        if (existingStock) {
          previousQuantity = existingStock.quantity;
        } else {
          const lastKnown = await prisma.fGStock.findFirst({
            where: { itemId: item.id, date: { lte: inputDate } },
            orderBy: { date: 'desc' }
          });
          if (lastKnown) previousQuantity = lastKnown.quantity;
        }

        const newQuantity = saveMode === 'add' ? previousQuantity + parseFloat(quantity) : parseFloat(quantity);

        let inQty = 0;
        let outQty = 0;
        if (saveMode === 'add') {
          inQty = parseFloat(quantity);
        } else {
          if (newQuantity > previousQuantity) {
            inQty = newQuantity - previousQuantity;
          } else if (newQuantity < previousQuantity) {
            outQty = previousQuantity - newQuantity;
          }
        }

        const updatedStock = await prisma.fGStock.upsert({
          where: { itemId_date: { itemId: item.id, date: inputDate } },
          update: {
            quantity: newQuantity,
            updatedBy: request.user!.id,
          },
          create: {
            itemId: item.id,
            quantity: newQuantity,
            date: inputDate,
            updatedBy: request.user!.id,
          },
        });

        if (inQty > 0 || outQty > 0) {
          await prisma.fGStockHistory.create({
            data: {
              itemId: item.id,
              inQty,
              outQty,
              balance: newQuantity,
              type: saveMode === 'add' ? 'ADD' : 'OVERWRITE',
              date: inputDate,
              notes: 'Bulk import',
              createdBy: request.user!.id,
            }
          });
        }

        await prisma.auditLog.create({
          data: {
            userId: request.user!.id,
            action: existingStock ? 'UPDATE' : 'CREATE',
            entityType: 'FGStock',
            entityId: updatedStock.id,
            notes: 'Bulk upserted FG Stock',
          },
        });
        results.push(updatedStock);
      }

      return reply.code(200).send({ data: results });
    }
  );

  // Update FG stock by ID
  server.put(
    '/api/v1/fg-stock/:id',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { quantity, date, notes } = request.body as any;

      const existingStock = await prisma.fGStock.findUnique({ where: { id } });
      if (!existingStock) {
        return reply.code(404).send({ error: 'Not Found', message: 'FG stock not found' });
      }

      const newQuantity = parseFloat(quantity);
      const previousQuantity = existingStock.quantity;
      let inQty = 0;
      let outQty = 0;

      if (newQuantity > previousQuantity) {
        inQty = newQuantity - previousQuantity;
      } else if (newQuantity < previousQuantity) {
        outQty = previousQuantity - newQuantity;
      }

      const updatedStock = await prisma.fGStock.update({
        where: { id },
        data: {
          quantity: parseFloat(quantity),
          date: new Date(date),
          notes,
          updatedBy: request.user!.id,
        },
      });

      if (inQty > 0 || outQty > 0) {
        await prisma.fGStockHistory.create({
          data: {
            itemId: updatedStock.itemId,
            inQty,
            outQty,
            balance: newQuantity,
            type: 'OVERWRITE',
            date: new Date(date),
            notes,
            createdBy: request.user!.id,
          }
        });
      }

      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'UPDATE',
          entityType: 'FGStock',
          entityId: updatedStock.id,
          dataBefore: existingStock as any,
          dataAfter: updatedStock as any,
          notes: 'Updated FG Stock',
        },
      });

      return reply.send({ data: updatedStock });
    }
  );

  // Bulk Delete FG stock
  server.delete(
    '/api/v1/fg-stock/bulk',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { ids } = request.body as { ids: string[] };
      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No ids provided' });
      }

      await prisma.fGStock.deleteMany({
        where: { id: { in: ids } },
      });

      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'DELETE',
          entityType: 'FGStock',
          entityId: 'bulk',
          notes: `Bulk deleted ${ids.length} records`,
        },
      });

      return reply.send({ success: true, count: ids.length });
    }
  );

  // Delete FG stock by ID
  server.delete(
    '/api/v1/fg-stock/:id',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existingStock = await prisma.fGStock.findUnique({ where: { id } });
      if (!existingStock) {
        return reply.code(404).send({ error: 'Not Found', message: 'FG stock not found' });
      }

      await prisma.fGStock.delete({ where: { id } });

      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'DELETE',
          entityType: 'FGStock',
          entityId: id,
          dataBefore: existingStock as any,
          notes: 'Deleted FG Stock',
        },
      });

      return reply.send({ success: true });
    }
  );
}
