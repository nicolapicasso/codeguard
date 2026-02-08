import Redis from 'ioredis';
import Redlock from 'redlock';
import { config } from '../config/index.js';
import { logger } from './logger.js';

let redis: Redis | null = null;
let redlock: Redlock | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return Math.min(times * 200, 2000);
      },
    });
    redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));
  }
  return redis;
}

export function getRedlock(): Redlock {
  if (!redlock) {
    redlock = new Redlock([getRedis()], {
      driftFactor: 0.01,
      retryCount: 3,
      retryDelay: 200,
      retryJitter: 100,
    });
  }
  return redlock;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    redlock = null;
  }
}
