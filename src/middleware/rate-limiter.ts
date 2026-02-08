import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { config } from '../config/index.js';

export async function registerRateLimiter(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    max: config.rateLimitPerIpPerMinute,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: () => ({
      status: 'KO',
      error_code: 'RATE_LIMITED',
      error_message: 'Too many requests, please try again later',
    }),
  });
}
