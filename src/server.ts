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
import { adminBatchRoutes, publicBatchRoutes } from './modules/batch-generation/routes.js';
import { authenticateAdmin, hashPassword } from './modules/auth/jwt.js';
import { registerMetricsHooks, registerMetricsRoute } from './utils/metrics.js';

export async function buildApp() {
  const app = Fastify({
    logger: false, // We use our own pino instance
    trustProxy: true, // Trust X-Forwarded-For from OmniWallet / reverse proxies
  });

  // Plugins
  // SECURITY: Restrict CORS to configured origins in production
  const corsOrigin = config.nodeEnv === 'production'
    ? (process.env.CORS_ORIGIN || 'https://admin.omnicodex.com')
    : true;
  await app.register(cors, { origin: corsOrigin });
  await app.register(helmet, { contentSecurityPolicy: false });
  await registerRateLimiter(app);

  // OpenAPI / Swagger — disabled in production for security
  if (config.nodeEnv !== 'production') {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'OmniCodex API',
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
  }

  // Middleware
  app.addHook('onRequest', requestLogger);
  app.setErrorHandler(errorHandler);

  // Prometheus metrics
  registerMetricsHooks(app);
  registerMetricsRoute(app);

  // Health checks
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  app.get('/health/ready', async (_, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const redis = getRedis();
      await redis.ping();
      return { status: 'ready' };
    } catch {
      // SECURITY: Don't expose error details in production
      return reply.status(503).send({ status: 'not_ready' });
    }
  });

  app.get('/health/live', async () => ({ status: 'live' }));

  // Admin auth — Login with username + password
  app.post('/api/admin/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string };
    const result = await authenticateAdmin(username, password);
    if (!result) {
      return reply.status(401).send({ status: 'KO', error_code: 'AUTH_FAILED', error_message: 'Invalid credentials' });
    }
    return reply.status(200).send(result);
  });

  // Bootstrap: Create initial admin user if none exists (first-run only)
  app.post('/api/admin/auth/setup', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password', 'setup_secret'],
        properties: {
          username: { type: 'string', minLength: 3 },
          password: { type: 'string', minLength: 8 },
          setup_secret: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { username, password, setup_secret } = request.body as {
      username: string; password: string; setup_secret: string;
    };

    // Only works if setup_secret matches JWT_SECRET (env var, never exposed to browser)
    if (setup_secret !== config.jwtSecret) {
      return reply.status(403).send({ status: 'KO', error_code: 'FORBIDDEN', error_message: 'Invalid setup secret' });
    }

    // Check if any admin users already exist
    const existingCount = await prisma.adminUser.count();
    if (existingCount > 0) {
      return reply.status(409).send({ status: 'KO', error_code: 'ALREADY_SETUP', error_message: 'Admin users already exist. Use /api/admin/auth/login.' });
    }

    const user = await prisma.adminUser.create({
      data: {
        username,
        passwordHash: hashPassword(password),
        role: 'admin',
      },
    });

    return reply.status(201).send({
      status: 'OK',
      message: 'Admin user created. Use /api/admin/auth/login to obtain a token.',
      user: { id: user.id, username: user.username },
    });
  });

  // Routes
  await app.register(validationRoutes);
  await app.register(statsRoutes);
  await app.register(tenantRoutes);
  await app.register(projectRoutes);
  await app.register(codeRuleRoutes);
  await app.register(auditRoutes);
  await app.register(adminBatchRoutes);
  await app.register(publicBatchRoutes);

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
    logger.info(`OmniCodex server running on ${config.host}:${config.port}`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

start();
