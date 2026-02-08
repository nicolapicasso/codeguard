import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { config } from '../config/index.js';
import { getRedis } from '../utils/redis.js';

export async function registerRateLimiter(app: FastifyInstance): Promise<void> {
  // Global rate limit by IP
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimitPerIpPerMinute,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    redis: getRedis(),
    errorResponseBuilder: () => ({
      status: 'KO',
      error_code: 'RATE_LIMITED',
      error_message: 'Too many requests, please try again later',
    }),
  });
}

/**
 * Per-user rate limit — applied specifically to validation routes.
 * Uses X-Api-Key + ow_user_id as the key.
 */
export async function registerUserRateLimiter(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    max: config.rateLimitPerUserPerMinute,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const apiKey = request.headers['x-api-key'] as string || 'unknown';
      const body = request.body as Record<string, unknown> | undefined;
      const owUserId = body?.ow_user_id as string || request.ip;
      return `user:${apiKey}:${owUserId}`;
    },
    redis: getRedis(),
    errorResponseBuilder: () => ({
      status: 'KO',
      error_code: 'RATE_LIMITED',
      error_message: 'User rate limit exceeded, please try again later',
    }),
  });
}
