import type { FastifyInstance } from 'fastify';
import { verifyJwt } from '../auth/jwt.js';
import { createTenant, listTenants, getTenant, updateTenant, rotateKeys } from './service.js';
import { createTenantSchema, updateTenantSchema } from './schemas.js';

export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', verifyJwt);

  app.post('/api/admin/tenants', {
    schema: { body: createTenantSchema },
  }, async (request, reply) => {
    const body = request.body as { ow_tenant_id: string; name: string; webhook_url?: string };
    const tenant = await createTenant({
      owTenantId: body.ow_tenant_id,
      name: body.name,
      webhookUrl: body.webhook_url,
    });
    return reply.status(201).send(tenant);
  });

  app.get('/api/admin/tenants', async (_request, reply) => {
    const tenants = await listTenants();
    return reply.status(200).send(tenants);
  });

  app.get('/api/admin/tenants/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = await getTenant(id);
    if (!tenant) {
      return reply.status(404).send({ status: 'KO', error_code: 'NOT_FOUND', error_message: 'Tenant not found' });
    }
    return reply.status(200).send(tenant);
  });

  app.put('/api/admin/tenants/:id', {
    schema: { body: updateTenantSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; is_active?: boolean; webhook_url?: string };
    const tenant = await updateTenant(id, {
      name: body.name,
      isActive: body.is_active,
      webhookUrl: body.webhook_url,
    });
    return reply.status(200).send(tenant);
  });

  app.post('/api/admin/tenants/:id/rotate-keys', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = await rotateKeys(id);
    return reply.status(200).send({
      id: tenant.id,
      api_key: tenant.apiKey,
      api_secret: tenant.apiSecret,
    });
  });
}
