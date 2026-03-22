import type { FastifyInstance } from 'fastify';
import { verifyJwt } from '../auth/jwt.js';
import { getAdminOverview, getTenantStats, getAdminProjectStats } from './admin-service.js';

export async function adminStatsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', verifyJwt);

  // GET /api/admin/stats/overview — Global KPIs
  app.get('/api/admin/stats/overview', async (_request, reply) => {
    const overview = await getAdminOverview();
    return reply.status(200).send(overview);
  });

  // GET /api/admin/stats/tenant/:id — Per-tenant analytics
  app.get('/api/admin/stats/tenant/:id', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', minimum: 1, maximum: 365 },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { days } = (request.query as { days?: number });
    const stats = await getTenantStats(id, days || 30);
    return reply.status(200).send(stats);
  });

  // GET /api/admin/stats/project/:id — Per-project analytics (admin version)
  app.get('/api/admin/stats/project/:id', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', minimum: 1, maximum: 365 },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { days } = (request.query as { days?: number });
    const stats = await getAdminProjectStats(id, days || 30);
    return reply.status(200).send(stats);
  });
}
