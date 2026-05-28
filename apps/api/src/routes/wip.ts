import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';

export default async function wipRoutes(server: FastifyInstance) {
  // Get all WIPs
  server.get('/api/v1/wip', { preValidation: [authenticate] }, async (request, reply) => {
    const wips = await prisma.wIP.findMany({
      include: { item: true, user: { select: { name: true } } },
    });
    return reply.send({ data: wips });
  });

  // Upsert WIP
  server.post(
    '/api/v1/wip',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { itemId, location, quantity, progressPercent, date, shift, estimatedFinish, status, notes, saveMode } = request.body as any;

      if (!itemId || !location || quantity === undefined || !date || !shift || !estimatedFinish) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Missing required fields' });
      }

      const existingWip = await prisma.wIP.findUnique({
        where: { itemId_location: { itemId, location } },
      });

      const updatedWip = await prisma.wIP.upsert({
        where: { itemId_location: { itemId, location } },
        update: {
          quantity: saveMode === 'add' ? (existingWip?.quantity || 0) + parseFloat(quantity) : parseFloat(quantity),
          progressPercent: parseInt(progressPercent || 0),
          date: new Date(date),
          shift: parseInt(shift),
          estimatedFinish: new Date(estimatedFinish),
          status: status || 'IN_PROGRESS',
          notes,
          updatedBy: request.user!.id,
        },
        create: {
          itemId,
          location,
          quantity: parseFloat(quantity),
          progressPercent: parseInt(progressPercent || 0),
          date: new Date(date),
          shift: parseInt(shift),
          estimatedFinish: new Date(estimatedFinish),
          status: status || 'IN_PROGRESS',
          notes,
          updatedBy: request.user!.id,
        },
      });

      // Audit Log
      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: existingWip ? 'UPDATE' : 'CREATE',
          entityType: 'WIP',
          entityId: updatedWip.id,
          dataBefore: existingWip ? (existingWip as any) : null,
          dataAfter: updatedWip as any,
        },
      });

      return reply.code(200).send({ data: updatedWip });
    }
  );

  // Bulk Upsert WIP
  server.post(
    '/api/v1/wip/bulk',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { records, saveMode } = request.body as any;
      if (!Array.isArray(records) || records.length === 0) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No records provided' });
      }

      const results = [];
      for (const record of records) {
        const { itemCode, location, quantity, date } = record;
        if (!itemCode || !location || quantity === undefined || !date) continue;

        let item = await prisma.item.findUnique({ where: { itemCode } });
        if (!item) {
          item = await prisma.item.create({
            data: { itemCode, itemName: itemCode, unit: 'pcs' },
          });
        }

        const existingWip = await prisma.wIP.findUnique({
          where: { itemId_location: { itemId: item.id, location } },
        });

        const updatedWip = await prisma.wIP.upsert({
          where: { itemId_location: { itemId: item.id, location } },
          update: {
            quantity: saveMode === 'add' ? (existingWip?.quantity || 0) + parseFloat(quantity) : parseFloat(quantity),
            date: new Date(date),
            updatedBy: request.user!.id,
          },
          create: {
            itemId: item.id,
            location,
            quantity: parseFloat(quantity),
            progressPercent: 0,
            date: new Date(date),
            shift: 1,
            estimatedFinish: new Date(new Date(date).getTime() + 86400000), // +1 day
            status: 'IN_PROGRESS',
            updatedBy: request.user!.id,
          },
        });

        await prisma.auditLog.create({
          data: {
            userId: request.user!.id,
            action: existingWip ? 'UPDATE' : 'CREATE',
            entityType: 'WIP',
            entityId: updatedWip.id,
            notes: 'Bulk upserted WIP',
          },
        });
        results.push(updatedWip);
      }

      return reply.code(200).send({ data: results });
    }
  );

  // Update WIP by ID
  server.put(
    '/api/v1/wip/:id',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { quantity, progressPercent, date, shift, estimatedFinish, status, notes } = request.body as any;

      const existingWip = await prisma.wIP.findUnique({ where: { id } });
      if (!existingWip) {
        return reply.code(404).send({ error: 'Not Found', message: 'WIP not found' });
      }

      const updatedWip = await prisma.wIP.update({
        where: { id },
        data: {
          quantity: parseFloat(quantity),
          progressPercent: parseInt(progressPercent || 0),
          date: new Date(date),
          shift: parseInt(shift),
          estimatedFinish: new Date(estimatedFinish),
          status: status || 'IN_PROGRESS',
          notes,
          updatedBy: request.user!.id,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'UPDATE',
          entityType: 'WIP',
          entityId: updatedWip.id,
          dataBefore: existingWip as any,
          dataAfter: updatedWip as any,
          notes: 'Updated WIP',
        },
      });

      return reply.send({ data: updatedWip });
    }
  );

  // Delete WIP by ID
  server.delete(
    '/api/v1/wip/:id',
    { preValidation: [authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existingWip = await prisma.wIP.findUnique({ where: { id } });
      if (!existingWip) {
        return reply.code(404).send({ error: 'Not Found', message: 'WIP not found' });
      }

      await prisma.wIP.delete({ where: { id } });

      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'DELETE',
          entityType: 'WIP',
          entityId: id,
          dataBefore: existingWip as any,
          notes: 'Deleted WIP',
        },
      });

      return reply.send({ success: true });
    }
  );
}
