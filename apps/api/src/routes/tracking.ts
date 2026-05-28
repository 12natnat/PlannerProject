import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { calculateItemStatus } from '@pdits/shared/src/utils/calculateStatus';

export default async function trackingRoutes(server: FastifyInstance) {
  // GET /api/v1/tracking/daily
  server.get('/api/v1/tracking/daily', { preValidation: [authenticate] }, async (request, reply) => {
    const { item_code, date, shift } = request.query as { item_code?: string; date?: string; shift?: string };

    if (!item_code || !date) {
      return reply.code(400).send({ error: 'Bad Request', message: 'item_code and date are required' });
    }

    const item = await prisma.item.findUnique({ where: { itemCode: item_code } });
    if (!item) {
      return reply.code(404).send({ error: 'Not Found', message: 'Item not found' });
    }

    const targetDate = new Date(date);

    // Get Demand
    const dailySchedule = await prisma.dailySchedule.findFirst({
      where: {
        itemId: item.id,
        date: targetDate,
        ...(shift ? { shift: parseInt(shift) } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    const demand = dailySchedule?.quantity || 0;

    // Get FG Stock
    const fgStockObj = await prisma.fGStock.findUnique({ where: { itemId: item.id } });
    const fgStock = fgStockObj?.quantity || 0;

    // Get WIP
    const wips = await prisma.wIP.findMany({ where: { itemId: item.id } });
    const totalWip = wips.reduce((acc, curr) => acc + curr.quantity, 0);

    const { status, gap, totalSupply } = calculateItemStatus({ demand, fgStock, wip: totalWip });

    return reply.send({
      item_code,
      item_name: item.itemName,
      date,
      demand,
      fg_stock: fgStock,
      in_production: totalWip,
      total_supply: totalSupply,
      gap,
      status,
      wip_details: wips.map((w) => ({
        wip_id: w.id,
        location: w.location,
        qty: w.quantity,
        progress_pct: w.progressPercent,
        shift: w.shift,
        date: w.date.toISOString().split('T')[0],
        estimated_finish: w.estimatedFinish.toISOString().split('T')[0],
        status: w.status,
      })),
    });
  });

  // GET /api/v1/tracking/dashboard
  server.get('/api/v1/tracking/dashboard', { preValidation: [authenticate] }, async (request, reply) => {
    const { date, shift } = request.query as { date?: string; shift?: string };
    const targetDate = date ? new Date(date) : new Date();

    const items = await prisma.item.findMany();
    
    // In a real scenario, this would be highly optimized using SQL aggregation.
    // For this implementation, we map over items to calculate individual statuses.
    let fulfilledCount = 0;
    let inProductionCount = 0;
    let shortageCount = 0;
    const gapAnalysis = [];
    const wipStatusList = [];

    for (const item of items) {
      const schedule = await prisma.dailySchedule.findFirst({
        where: {
          itemId: item.id,
          date: targetDate,
          ...(shift ? { shift: parseInt(shift) } : {}),
        },
      });
      const demand = schedule?.quantity || 0;

      const fgStockObj = await prisma.fGStock.findUnique({ where: { itemId: item.id } });
      const fgStock = fgStockObj?.quantity || 0;

      const wips = await prisma.wIP.findMany({ where: { itemId: item.id } });
      const totalWip = wips.reduce((acc, curr) => acc + curr.quantity, 0);

      const { status, gap } = calculateItemStatus({ demand, fgStock, wip: totalWip });

      if (status === 'FULFILLED') fulfilledCount++;
      else if (status === 'IN_PRODUCTION') inProductionCount++;
      else if (status === 'SHORTAGE') shortageCount++;

      gapAnalysis.push({
        itemCode: item.itemCode,
        itemName: item.itemName,
        demand,
        fgStock,
        wip: totalWip,
        gap,
        status,
      });

      for (const w of wips) {
        wipStatusList.push({
          itemCode: item.itemCode,
          itemName: item.itemName,
          location: w.location,
          qty: w.quantity,
          progress: w.progressPercent,
        });
      }
    }

    return reply.send({
      summary: {
        totalItems: items.length,
        fulfilled: fulfilledCount,
        inProduction: inProductionCount,
        shortage: shortageCount,
      },
      gapAnalysis,
      wipStatus: wipStatusList,
    });
  });
}
