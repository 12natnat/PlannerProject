import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const isDev = process.env.NODE_ENV === 'development';
const debugDb = process.env.DEBUG_DB === 'true';

// Only log queries in dev if DEBUG_DB is explicitly enabled
const logLevels: ('query' | 'info' | 'warn' | 'error')[] = isDev
  ? (debugDb ? ['query', 'info', 'warn', 'error'] : ['error', 'warn'])
  : ['error'];

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: logLevels,
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
