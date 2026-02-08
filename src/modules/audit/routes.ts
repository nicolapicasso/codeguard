import type { FastifyInstance } from 'fastify';
import { verifyJwt } from '../auth/jwt.js';

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', verifyJwt);

  app.get('/api/admin/audit-log', async (_request, reply) => {
    // Placeholder — full persistence in Phase 2
    return reply.status(200).send({
      data: [],
      message: 'Audit log persistence will be available in Phase 2',
    });
  });
}
