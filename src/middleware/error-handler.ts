import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../utils/logger.js';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  logger.error({ err: error, url: request.url, method: request.method }, 'Request error');

  const statusCode = error.statusCode || 500;
  reply.status(statusCode).send({
    status: 'KO',
    error_code: statusCode === 429 ? 'RATE_LIMITED' : 'INTERNAL_ERROR',
    error_message: statusCode === 500 ? 'Internal server error' : error.message,
  });
}
