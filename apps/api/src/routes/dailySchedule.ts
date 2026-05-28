import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';

export default async function dailyScheduleRoutes(server: FastifyInstance) {
  // Get all daily schedules
  server.get('/api/v1/daily-schedule', { preValidation: [authenticate] }, async (request, reply) => {
    const { date, shift } = request.query as { date?: string; shift?: string };
    
    const whereClause: any = {};
    if (date) whereClause.date = new Date(date);
    if (shift) whereClause.shift = parseInt(shift);

    const schedules = await prisma.dailySchedule.findMany({
      where: whereClause,
      include: { item: true },
      orderBy: { date: 'desc' },
    });
    
    return reply.send({ data: schedules });
  });

  // Create or Update daily schedule (single record)
  server.post(
    '/api/v1/daily-schedule',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { date, shift, itemId, itemCode, quantity, saveMode } = request.body as any;

      if (!date || !shift || (!itemId && !itemCode) || quantity === undefined) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Missing required fields' });
      }

      const scheduleDate = new Date(date);

      // Resolve itemId from itemCode if needed
      let finalItemId = itemId;
      if (!finalItemId && itemCode) {
        let item = await prisma.item.findUnique({ where: { itemCode } });
        if (!item) {
          item = await prisma.item.create({
            data: { itemCode, itemName: itemCode, unit: 'PCS' },
          });
        }
        finalItemId = item.id;
      }

      const existingSchedule = await prisma.dailySchedule.findUnique({
        where: {
          date_shift_itemId: {
            date: scheduleDate,
            shift: parseInt(shift),
            itemId: finalItemId,
          },
        },
      });

      let schedule;
      if (existingSchedule) {
        const newQuantity = saveMode === 'add'
          ? existingSchedule.quantity + parseFloat(quantity)
          : parseFloat(quantity);

        schedule = await prisma.dailySchedule.update({
          where: { id: existingSchedule.id },
          data: { quantity: newQuantity },
        });

        await prisma.auditLog.create({
          data: {
            userId: request.user!.id,
            action: 'UPDATE',
            entityType: 'DailySchedule',
            entityId: schedule.id,
            dataBefore: existingSchedule as any,
            dataAfter: schedule as any,
          },
        });
      } else {
        schedule = await prisma.dailySchedule.create({
          data: {
            date: scheduleDate,
            shift: parseInt(shift),
            itemId: finalItemId,
            quantity: parseFloat(quantity),
          },
        });

        await prisma.auditLog.create({
          data: {
            userId: request.user!.id,
            action: 'CREATE',
            entityType: 'DailySchedule',
            entityId: schedule.id,
            dataAfter: schedule as any,
          },
        });
      }

      return reply.code(200).send({ data: schedule });
    }
  );

  // Bulk upsert daily schedules
  server.post(
    '/api/v1/daily-schedule/bulk',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { records, saveMode } = request.body as any;
      if (!Array.isArray(records) || records.length === 0) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No records provided' });
      }

      const results = [];
      for (const record of records) {
        const { date, shift, itemCode, toyName, quantity } = record;
        if (!date || !shift || !itemCode || quantity === undefined) continue;

        // Find or create Item
        let item = await prisma.item.findUnique({ where: { itemCode } });
        if (!item) {
          item = await prisma.item.create({
            data: { itemCode, itemName: toyName || itemCode, unit: 'PCS' },
          });
        } else if (toyName && item.itemName !== toyName) {
          // Update toyName if provided and different
          item = await prisma.item.update({
            where: { id: item.id },
            data: { itemName: toyName },
          });
        }

        const scheduleDate = new Date(date);
        const shiftNum = parseInt(shift);
        const qty = parseFloat(quantity);

        if (qty <= 0) continue; // Skip zero-quantity entries

        const existingSchedule = await prisma.dailySchedule.findUnique({
          where: {
            date_shift_itemId: {
              date: scheduleDate,
              shift: shiftNum,
              itemId: item.id,
            },
          },
        });

        let schedule;
        if (existingSchedule) {
          const newQuantity = saveMode === 'add'
            ? existingSchedule.quantity + qty
            : qty;

          schedule = await prisma.dailySchedule.update({
            where: { id: existingSchedule.id },
            data: { quantity: newQuantity },
          });
        } else {
          schedule = await prisma.dailySchedule.create({
            data: {
              date: scheduleDate,
              shift: shiftNum,
              itemId: item.id,
              quantity: qty,
            },
          });
        }

        await prisma.auditLog.create({
          data: {
            userId: request.user!.id,
            action: existingSchedule ? 'UPDATE' : 'CREATE',
            entityType: 'DailySchedule',
            entityId: schedule.id,
            notes: 'Bulk upserted Daily Schedule',
          },
        });

        results.push(schedule);
      }

      return reply.code(200).send({ data: results, count: results.length });
    }
  );

  // Update daily schedule by ID
  server.put(
    '/api/v1/daily-schedule/:id',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { date, shift, itemCode, quantity } = request.body as any;

      const scheduleDate = new Date(date);
      
      let finalItemId = undefined;
      if (itemCode) {
        let item = await prisma.item.findUnique({ where: { itemCode } });
        if (!item) {
          item = await prisma.item.create({
            data: { itemCode, itemName: itemCode, unit: 'PCS' },
          });
        }
        finalItemId = item.id;
      }

      const existingSchedule = await prisma.dailySchedule.findUnique({ where: { id } });
      if (!existingSchedule) {
        return reply.code(404).send({ error: 'Not Found', message: 'Daily schedule not found' });
      }

      const updateData: any = {
        date: scheduleDate,
        shift: parseInt(shift),
        quantity: parseFloat(quantity),
      };
      if (finalItemId) {
        updateData.itemId = finalItemId;
      }

      const schedule = await prisma.dailySchedule.update({
        where: { id },
        data: updateData,
      });

      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'UPDATE',
          entityType: 'DailySchedule',
          entityId: schedule.id,
          dataBefore: existingSchedule as any,
          dataAfter: schedule as any,
        },
      });

      return reply.send({ data: schedule });
    }
  );

  // Delete daily schedule
  server.delete(
    '/api/v1/daily-schedule/:id',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existingSchedule = await prisma.dailySchedule.findUnique({ where: { id } });
      if (!existingSchedule) {
        return reply.code(404).send({ error: 'Not Found', message: 'Daily schedule not found' });
      }

      await prisma.dailySchedule.delete({ where: { id } });

      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'DELETE',
          entityType: 'DailySchedule',
          entityId: id,
          dataBefore: existingSchedule as any,
        },
      });

      return reply.send({ success: true });
    }
  );
}
