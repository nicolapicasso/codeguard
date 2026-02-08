import type { FastifyInstance } from 'fastify';
import { verifyJwt } from '../auth/jwt.js';
import { createProject, listProjects, getProject, updateProject, deleteProject } from './service.js';
import { createProjectSchema, updateProjectSchema } from './schemas.js';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', verifyJwt);

  app.post('/api/admin/tenants/:tenant_id/projects', {
    schema: { body: createProjectSchema },
  }, async (request, reply) => {
    const { tenant_id } = request.params as { tenant_id: string };
    const body = request.body as {
      name: string;
      description?: string;
      starts_at?: string;
      ends_at?: string;
      metadata?: Record<string, unknown>;
    };
    const project = await createProject(tenant_id, {
      name: body.name,
      description: body.description,
      startsAt: body.starts_at,
      endsAt: body.ends_at,
      metadata: body.metadata,
    });
    return reply.status(201).send(project);
  });

  app.get('/api/admin/tenants/:tenant_id/projects', async (request, reply) => {
    const { tenant_id } = request.params as { tenant_id: string };
    const projects = await listProjects(tenant_id);
    return reply.status(200).send(projects);
  });

  app.get('/api/admin/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await getProject(id);
    if (!project) {
      return reply.status(404).send({ status: 'KO', error_code: 'NOT_FOUND', error_message: 'Project not found' });
    }
    return reply.status(200).send(project);
  });

  app.put('/api/admin/projects/:id', {
    schema: { body: updateProjectSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      description?: string;
      starts_at?: string;
      ends_at?: string;
      is_active?: boolean;
      metadata?: Record<string, unknown>;
    };
    const project = await updateProject(id, {
      name: body.name,
      description: body.description,
      startsAt: body.starts_at,
      endsAt: body.ends_at,
      isActive: body.is_active,
      metadata: body.metadata,
    });
    return reply.status(200).send(project);
  });

  app.delete('/api/admin/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await deleteProject(id);
    return reply.status(204).send();
  });
}
