import type { FastifyInstance } from 'fastify';
import { verifyApiKey } from '../auth/api-key.js';
import { getProjectStats } from './service.js';

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', verifyApiKey);

  app.get('/api/v1/stats/:project_id', async (request, reply) => {
    const { project_id } = request.params as { project_id: string };
    const stats = await getProjectStats(project_id);
    return reply.status(200).send(stats);
  });
}
