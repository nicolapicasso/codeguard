import type { FastifyInstance } from 'fastify';
import type { BatchStatus } from '@prisma/client';
import { verifyJwt } from '../auth/jwt.js';
import { verifyApiKey } from '../auth/api-key.js';
import {
  createBatch,
  getBatch,
  getBatchWithRule,
  listBatches,
  cancelBatch,
  sealBatch,
  downloadBatchCodes,
  BatchError,
} from './service.js';

function handleBatchError(err: unknown, reply: any) {
  if (err instanceof BatchError) {
    return reply.status(err.httpStatus).send({
      status: 'KO',
      error_code: err.errorCode,
      error_message: err.message,
    });
  }
  throw err;
}

// --- Admin Batch Routes (JWT auth) ---

export async function adminBatchRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', verifyJwt);

  // POST /api/admin/rules/:id/batches — Create batch for a MANAGED rule
  app.post('/api/admin/rules/:id/batches', {
    schema: {
      body: {
        type: 'object',
        required: ['batch_size'],
        properties: {
          batch_size: { type: 'integer', minimum: 1000, maximum: 1000000 },
          label: { type: 'string' },
          expires_at: { type: 'string', format: 'date-time' },
          format: { type: 'string', enum: ['PIN', 'CSV', 'JSON'] },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      batch_size: number;
      label?: string;
      expires_at?: string;
      format?: 'PIN' | 'CSV' | 'JSON';
    };
    const adminUser = (request as any).adminUser;

    try {
      const batch = await createBatch({
        codeRuleId: id,
        batchSize: body.batch_size,
        label: body.label,
        expiresAt: body.expires_at ? new Date(body.expires_at) : undefined,
        format: body.format,
        createdBy: adminUser?.sub || 'admin',
      });

      return reply.status(202).send({
        batch_id: batch.id,
        status: batch.status,
        batch_size: batch.batchSize,
        poll_url: `/api/admin/batches/${batch.id}`,
      });
    } catch (err) {
      return handleBatchError(err, reply);
    }
  });

  // GET /api/admin/batches — List batches
  app.get('/api/admin/batches', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          code_rule_id: { type: 'string' },
          project_id: { type: 'string' },
          status: { type: 'string' },
          page: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
  }, async (request, reply) => {
    const query = request.query as {
      code_rule_id?: string;
      project_id?: string;
      status?: string;
      page?: number;
      limit?: number;
    };

    const result = await listBatches({
      codeRuleId: query.code_rule_id,
      projectId: query.project_id,
      status: query.status as BatchStatus | undefined,
      page: query.page,
      limit: query.limit,
    });

    return reply.status(200).send(result);
  });

  // GET /api/admin/batches/:id — Batch detail
  app.get('/api/admin/batches/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const batch = await getBatchWithRule(id);
    if (!batch) {
      return reply.status(404).send({ status: 'KO', error_code: 'BATCH_NOT_FOUND', error_message: 'Batch not found' });
    }
    return reply.status(200).send(formatBatchResponse(batch));
  });

  // GET /api/admin/batches/:id/download — Download batch codes
  app.get('/api/admin/batches/:id/download', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['csv', 'json'] },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { format } = (request.query as { format?: 'csv' | 'json' });

    try {
      const result = await downloadBatchCodes(id, format || 'csv');
      return reply
        .header('Content-Type', result.contentType)
        .header('Content-Disposition', `attachment; filename="${result.filename}"`)
        .send(result.content);
    } catch (err) {
      return handleBatchError(err, reply);
    }
  });

  // POST /api/admin/batches/:id/cancel
  app.post('/api/admin/batches/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const batch = await cancelBatch(id);
      return reply.status(200).send(formatBatchResponse(batch));
    } catch (err) {
      return handleBatchError(err, reply);
    }
  });

  // POST /api/admin/batches/:id/seal
  app.post('/api/admin/batches/:id/seal', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const batch = await sealBatch(id);
      return reply.status(200).send(formatBatchResponse(batch));
    } catch (err) {
      return handleBatchError(err, reply);
    }
  });
}

// --- Public Batch API (API Key + HMAC auth) ---

export async function publicBatchRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', verifyApiKey);

  // POST /api/v1/batches — Request batch generation
  app.post('/api/v1/batches', {
    schema: {
      body: {
        type: 'object',
        required: ['code_rule_id', 'batch_size'],
        properties: {
          code_rule_id: { type: 'string' },
          batch_size: { type: 'integer', minimum: 1000, maximum: 1000000 },
          label: { type: 'string' },
          expires_at: { type: 'string', format: 'date-time' },
          format: { type: 'string', enum: ['PIN', 'CSV', 'JSON'] },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      code_rule_id: string;
      batch_size: number;
      label?: string;
      expires_at?: string;
      format?: 'PIN' | 'CSV' | 'JSON';
    };

    try {
      const batch = await createBatch({
        codeRuleId: body.code_rule_id,
        batchSize: body.batch_size,
        label: body.label,
        expiresAt: body.expires_at ? new Date(body.expires_at) : undefined,
        format: body.format,
        createdBy: 'api',
      });

      return reply.status(202).send({
        batch_id: batch.id,
        status: batch.status,
        batch_size: batch.batchSize,
        poll_url: `/api/v1/batches/${batch.id}`,
      });
    } catch (err) {
      return handleBatchError(err, reply);
    }
  });

  // GET /api/v1/batches/:id — Poll batch status
  app.get('/api/v1/batches/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = (request as any).tenant;

    const batch = await getBatchWithRule(id);
    if (!batch || batch.codeRule.project.tenantId !== tenant.id) {
      return reply.status(404).send({ status: 'KO', error_code: 'BATCH_NOT_FOUND', error_message: 'Batch not found' });
    }

    return reply.status(200).send({
      batch_id: batch.id,
      status: batch.status,
      batch_size: batch.batchSize,
      generated_count: batch.generatedCount,
      created_at: batch.createdAt.toISOString(),
      completed_at: batch.completedAt?.toISOString() || null,
      download_url: batch.status === 'COMPLETED' ? `/api/v1/batches/${batch.id}/download` : null,
    });
  });

  // GET /api/v1/batches/:id/download — Download codes
  app.get('/api/v1/batches/:id/download', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['csv', 'json'] },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { format } = (request.query as { format?: 'csv' | 'json' });
    const tenant = (request as any).tenant;

    // BOLA check
    const batchWithRule = await getBatchWithRule(id);
    if (!batchWithRule || batchWithRule.codeRule.project.tenantId !== tenant.id) {
      return reply.status(404).send({ status: 'KO', error_code: 'BATCH_NOT_FOUND', error_message: 'Batch not found' });
    }

    try {
      const result = await downloadBatchCodes(id, format || 'csv');
      return reply
        .header('Content-Type', result.contentType)
        .header('Content-Disposition', `attachment; filename="${result.filename}"`)
        .send(result.content);
    } catch (err) {
      return handleBatchError(err, reply);
    }
  });

  // GET /api/v1/batches — List batches (scoped to tenant)
  app.get('/api/v1/batches', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          code_rule_id: { type: 'string' },
          status: { type: 'string' },
          page: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
  }, async (request, reply) => {
    const query = request.query as {
      code_rule_id?: string;
      status?: string;
      page?: number;
      limit?: number;
    };
    const tenant = (request as any).tenant;

    const result = await listBatches({
      codeRuleId: query.code_rule_id,
      tenantId: tenant.id,
      status: query.status as BatchStatus | undefined,
      page: query.page,
      limit: query.limit,
    });

    return reply.status(200).send(result);
  });
}

function formatBatchResponse(batch: any) {
  return {
    batch_id: batch.id,
    code_rule_id: batch.codeRuleId,
    code_rule: batch.codeRule ? { id: batch.codeRule.id, name: batch.codeRule.name } : undefined,
    status: batch.status,
    batch_size: batch.batchSize,
    generated_count: batch.generatedCount,
    format: batch.format,
    label: batch.label,
    expires_at: batch.expiresAt?.toISOString() || null,
    download_count: batch.downloadCount,
    last_download_at: batch.lastDownloadAt?.toISOString() || null,
    error_message: batch.errorMessage,
    created_by: batch.createdBy,
    created_at: batch.createdAt.toISOString(),
    completed_at: batch.completedAt?.toISOString() || null,
  };
}
