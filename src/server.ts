import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { prisma } from './utils/prisma.js';
import { getRedis, closeRedis } from './utils/redis.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { registerRateLimiter } from './middleware/rate-limiter.js';
import { validationRoutes } from './modules/validation/routes.js';
import { statsRoutes } from './modules/stats/routes.js';
import { tenantRoutes } from './modules/tenants/routes.js';
import { projectRoutes } from './modules/projects/routes.js';
import { codeRuleRoutes } from './modules/code-rules/routes.js';
import { auditRoutes } from './modules/audit/routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: false, // We use our own pino instance
  });

  // Plugins
  await app.register(cors, { origin: true });
  await app.register(helmet);
  await registerRateLimiter(app);

  // Middleware
  app.addHook('onRequest', requestLogger);
  app.setErrorHandler(errorHandler);

  // Health checks
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  app.get('/health/ready', async (_, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const redis = getRedis();
      await redis.ping();
      return { status: 'ready', postgres: 'ok', redis: 'ok' };
    } catch (err) {
      return reply.status(503).send({
        status: 'not_ready',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  app.get('/health/live', async () => ({ status: 'live' }));

  // Routes
  await app.register(validationRoutes);
  await app.register(statsRoutes);
  await app.register(tenantRoutes);
  await app.register(projectRoutes);
  await app.register(codeRuleRoutes);
  await app.register(auditRoutes);

  return app;
}

async function start() {
  const app = await buildApp();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    await app.close();
    await prisma.$disconnect();
    await closeRedis();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(`CodeGuard server running on ${config.host}:${config.port}`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

start();
