import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
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
import { generateToken } from './modules/auth/jwt.js';

export async function buildApp() {
  const app = Fastify({
    logger: false, // We use our own pino instance
  });

  // Plugins
  await app.register(cors, { origin: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await registerRateLimiter(app);

  // OpenAPI / Swagger
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'CodeGuard API',
        description: 'Motor de Validación de Códigos Únicos — Middleware para OmniWallet',
        version: '1.0.0',
      },
      servers: [{ url: `http://localhost:${config.port}` }],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Api-Key',
            description: 'API Key del tenant para Validation API',
          },
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT token para Admin API',
          },
        },
      },
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

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

  // Admin auth — JWT token generation (for development/admin panel login)
  app.post('/api/admin/auth/token', {
    schema: {
      body: {
        type: 'object',
        required: ['secret'],
        properties: { secret: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { secret } = request.body as { secret: string };
    if (secret !== config.jwtSecret) {
      return reply.status(401).send({ status: 'KO', error_code: 'AUTH_FAILED', error_message: 'Invalid admin secret' });
    }
    const token = generateToken('admin');
    return reply.status(200).send({ token, expires_in: '8h' });
  });

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
