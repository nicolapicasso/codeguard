import type { FastifyInstance } from 'fastify';
import { verifyJwt } from '../auth/jwt.js';
import {
  getFraudOverview,
  getValidationAttempts,
  getSuspiciousIps,
  getSuspiciousUsers,
  getGeoBlockedSummary,
} from './service.js';

export async function fraudRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', verifyJwt);

  // GET /api/admin/fraud/overview — Fraud KPIs
  app.get('/api/admin/fraud/overview', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' },
          days: { type: 'integer', minimum: 1, maximum: 365 },
        },
      },
    },
  }, async (request, reply) => {
    const { tenant_id, days } = request.query as { tenant_id?: string; days?: number };
    const overview = await getFraudOverview({ tenantId: tenant_id, days });
    return reply.status(200).send(overview);
  });

  // GET /api/admin/fraud/attempts — Validation attempt log
  app.get('/api/admin/fraud/attempts', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' },
          project_id: { type: 'string' },
          status: { type: 'string', enum: ['OK', 'KO'] },
          error_code: { type: 'string' },
          ip_address: { type: 'string' },
          ow_user_id: { type: 'string' },
          days: { type: 'integer', minimum: 1, maximum: 365 },
          page: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
  }, async (request, reply) => {
    const query = request.query as any;
    const result = await getValidationAttempts({
      tenantId: query.tenant_id,
      projectId: query.project_id,
      status: query.status,
      errorCode: query.error_code,
      ipAddress: query.ip_address,
      owUserId: query.ow_user_id,
      days: query.days,
      page: query.page,
      limit: query.limit,
    });
    return reply.status(200).send(result);
  });

  // GET /api/admin/fraud/suspicious-ips — IPs with high failure rates
  app.get('/api/admin/fraud/suspicious-ips', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' },
          days: { type: 'integer', minimum: 1, maximum: 365 },
          min_attempts: { type: 'integer', minimum: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { tenant_id, days, min_attempts } = request.query as any;
    const ips = await getSuspiciousIps({ tenantId: tenant_id, days, minAttempts: min_attempts });
    return reply.status(200).send(ips);
  });

  // GET /api/admin/fraud/suspicious-users — Users with suspicious patterns
  app.get('/api/admin/fraud/suspicious-users', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' },
          days: { type: 'integer', minimum: 1, maximum: 365 },
          min_attempts: { type: 'integer', minimum: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { tenant_id, days, min_attempts } = request.query as any;
    const users = await getSuspiciousUsers({ tenantId: tenant_id, days, minAttempts: min_attempts });
    return reply.status(200).send(users);
  });

  // GET /api/admin/fraud/geo-blocked — Geo-blocked attempts summary
  app.get('/api/admin/fraud/geo-blocked', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' },
          days: { type: 'integer', minimum: 1, maximum: 365 },
        },
      },
    },
  }, async (request, reply) => {
    const { tenant_id, days } = request.query as any;
    const summary = await getGeoBlockedSummary({ tenantId: tenant_id, days });
    return reply.status(200).send(summary);
  });
}
