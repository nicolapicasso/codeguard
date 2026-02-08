import type { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger.js';

export function requestLogger(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
): void {
  const start = Date.now();

  reply.then(
    () => {
      const duration = Date.now() - start;
      logger.info({
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        duration,
        ip: request.ip,
      }, 'Request completed');
    },
    (err) => {
      logger.error({ err }, 'Reply error');
    },
  );

  done();
}
