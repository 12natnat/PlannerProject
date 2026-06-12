import prisma from './prisma';

/**
 * Auto-cleanup module
 *
 * Removes:
 *  - DailySchedule records whose date < today - 14 days
 *  - WeeklySchedule records whose weekEndDate < today - 14 days
 *
 * Runs on server startup, then every 24 hours.
 */

const RETENTION_DAYS = 14;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getCutoffDate(): Date {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setTime(cutoff.getTime() - RETENTION_DAYS * ONE_DAY_MS);
  return cutoff;
}

export async function cleanupOldRecords(): Promise<{
  dailyDeleted: number;
  weeklyDeleted: number;
  cutoff: string;
}> {
  const cutoff = getCutoffDate();
  const cutoffISO = cutoff.toISOString().split('T')[0];

  try {
    const [dailyResult, weeklyResult] = await Promise.all([
      prisma.dailySchedule.deleteMany({
        where: { date: { lt: cutoff } },
      }),
      prisma.weeklySchedule.deleteMany({
        where: { weekEndDate: { lt: cutoff } },
      }),
    ]);

    const total = dailyResult.count + weeklyResult.count;
    if (total > 0) {
      console.log(
        `[Cleanup] Removed ${dailyResult.count} daily schedule(s) and ${weeklyResult.count} weekly schedule(s) older than ${cutoffISO}`,
      );
    } else {
      console.log(`[Cleanup] No records older than ${cutoffISO}`);
    }

    return {
      dailyDeleted: dailyResult.count,
      weeklyDeleted: weeklyResult.count,
      cutoff: cutoffISO,
    };
  } catch (err) {
    console.error('[Cleanup] Failed to remove old records:', err);
    throw err;
  }
}

let cleanupInterval: NodeJS.Timeout | null = null;

export function startCleanupSchedule(): void {
  // Run once on startup (non-blocking)
  cleanupOldRecords().catch((err) =>
    console.error('[Cleanup] Initial run failed:', err),
  );

  // Run daily
  if (cleanupInterval) clearInterval(cleanupInterval);
  cleanupInterval = setInterval(() => {
    cleanupOldRecords().catch((err) =>
      console.error('[Cleanup] Scheduled run failed:', err),
    );
  }, ONE_DAY_MS);
}

export function stopCleanupSchedule(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
