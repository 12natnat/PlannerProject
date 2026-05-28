import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const isDisabled = process.env.DISABLE_REDIS === 'true';

let redisInstance: any;
let hasLoggedError = false;

if (isDisabled) {
  console.log('ℹ️ Redis is disabled via DISABLE_REDIS config.');
  
  // Create a minimal mock client
  redisInstance = {
    ping: async () => 'PONG',
    quit: async () => 'OK',
    on: (event: string, callback: (...args: any[]) => void) => {
      if (event === 'connect') {
        setTimeout(callback, 0);
      }
      return redisInstance;
    },
    status: 'ready',
    disabled: true,
  };
} else {
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy(times) {
      // Quietly retry connecting every 10 seconds
      return 10000;
    },
  });

  client.on('connect', () => {
    console.log('✅ Redis connected');
    hasLoggedError = false;
  });

  client.on('error', (err: any) => {
    // Only log the connection error once to avoid spamming the console
    if (!hasLoggedError) {
      console.warn('⚠️ Redis is not running or connection refused. Caching is disabled. (This is normal if Redis is not installed localy)');
      hasLoggedError = true;
    }
  });

  redisInstance = client;
}

export const redis = redisInstance;
export default redis;

