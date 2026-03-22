import type { BatchStatus, CodeBatch, CodeRule } from '@prisma/client';
import { prisma } from '../../utils/prisma.js';
import { config } from '../../config/index.js';
import { codeHash as computeCodeHash } from '../../utils/crypto.js';
import { encryptCode, decryptCode } from '../../utils/encryption.js';
import { generateCode } from './generator.js';
import { logger } from '../../utils/logger.js';

const CHUNK_SIZE = config.batchChunkSize;
const MAX_RETRIES_PER_CHUNK = 3;

// --- CRUD ---

export interface CreateBatchInput {
  codeRuleId: string;
  batchSize: number;
  label?: string;
  expiresAt?: Date;
  format?: 'PIN' | 'CSV' | 'JSON';
  createdBy?: string;
}

export async function createBatch(input: CreateBatchInput): Promise<CodeBatch> {
  // Validate rule exists and is MANAGED
  const rule = await prisma.codeRule.findUnique({
    where: { id: input.codeRuleId },
    include: { project: true },
  });

  if (!rule) throw new BatchError('RULE_NOT_FOUND', 'Code rule not found', 404);
  if (rule.generationMode !== 'MANAGED') {
    throw new BatchError('INVALID_GENERATION_MODE', 'Rule must have generationMode = MANAGED', 400);
  }
  if (input.batchSize < 1000 || input.batchSize > 1000000) {
    throw new BatchError('BATCH_SIZE_OUT_OF_RANGE', 'batch_size must be between 1,000 and 1,000,000', 400);
  }

  // Check concurrent generating batches for tenant
  const generatingCount = await prisma.codeBatch.count({
    where: {
      codeRule: { project: { tenantId: rule.project.tenantId } },
      status: 'GENERATING',
    },
  });

  if (generatingCount >= config.batchMaxConcurrentPerTenant) {
    throw new BatchError(
      'TOO_MANY_CONCURRENT_BATCHES',
      `Maximum ${config.batchMaxConcurrentPerTenant} concurrent generating batches per tenant`,
      429,
    );
  }

  const batch = await prisma.codeBatch.create({
    data: {
      codeRuleId: input.codeRuleId,
      batchSize: input.batchSize,
      label: input.label,
      expiresAt: input.expiresAt,
      format: input.format || 'PIN',
      createdBy: input.createdBy,
    },
  });

  // Process synchronously if ≤ 10K, otherwise in background
  if (input.batchSize <= 10000) {
    // Run synchronously but don't block the response — await in background
    processBatch(batch.id, rule).catch((err) => {
      logger.error({ err, batchId: batch.id }, 'Batch generation failed');
    });
  } else {
    // For larger batches, also run async (no worker infrastructure needed)
    setImmediate(() => {
      processBatch(batch.id, rule).catch((err) => {
        logger.error({ err, batchId: batch.id }, 'Batch generation failed');
      });
    });
  }

  return batch;
}

export async function getBatch(batchId: string): Promise<CodeBatch | null> {
  return prisma.codeBatch.findUnique({ where: { id: batchId } });
}

export async function getBatchWithRule(batchId: string) {
  return prisma.codeBatch.findUnique({
    where: { id: batchId },
    include: { codeRule: { include: { project: true } } },
  });
}

export async function listBatches(filters: {
  codeRuleId?: string;
  projectId?: string;
  tenantId?: string;
  status?: BatchStatus;
  page?: number;
  limit?: number;
}) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (filters.codeRuleId) where.codeRuleId = filters.codeRuleId;
  if (filters.projectId) where.codeRule = { projectId: filters.projectId };
  if (filters.tenantId) {
    where.codeRule = { ...where.codeRule, project: { tenantId: filters.tenantId } };
  }
  if (filters.status) where.status = filters.status;

  const [data, total] = await Promise.all([
    prisma.codeBatch.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { codeRule: { select: { id: true, name: true, projectId: true } } },
    }),
    prisma.codeBatch.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function cancelBatch(batchId: string): Promise<CodeBatch> {
  const batch = await prisma.codeBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new BatchError('BATCH_NOT_FOUND', 'Batch not found', 404);

  if (batch.status !== 'PENDING' && batch.status !== 'COMPLETED') {
    throw new BatchError(
      'INVALID_BATCH_STATUS',
      `Cannot cancel batch in status ${batch.status}. Only PENDING or COMPLETED batches can be cancelled.`,
      400,
    );
  }

  // Revoke all active issued codes
  await prisma.issuedCode.updateMany({
    where: { batchId, status: 'ACTIVE' },
    data: { status: 'REVOKED' },
  });

  return prisma.codeBatch.update({
    where: { id: batchId },
    data: { status: 'CANCELLED' },
  });
}

export async function sealBatch(batchId: string): Promise<CodeBatch> {
  const batch = await prisma.codeBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new BatchError('BATCH_NOT_FOUND', 'Batch not found', 404);

  if (batch.status !== 'COMPLETED') {
    throw new BatchError(
      'INVALID_BATCH_STATUS',
      `Cannot seal batch in status ${batch.status}. Only COMPLETED batches can be sealed.`,
      400,
    );
  }

  return prisma.codeBatch.update({
    where: { id: batchId },
    data: { status: 'SEALED' },
  });
}

/**
 * Download batch codes — decrypt and return in requested format.
 */
export async function downloadBatchCodes(
  batchId: string,
  format: 'csv' | 'json' = 'csv',
): Promise<{ content: string; contentType: string; filename: string }> {
  const batch = await prisma.codeBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new BatchError('BATCH_NOT_FOUND', 'Batch not found', 404);

  if (batch.status !== 'COMPLETED' && batch.status !== 'SEALED') {
    throw new BatchError(
      'INVALID_BATCH_STATUS',
      `Cannot download batch in status ${batch.status}`,
      400,
    );
  }

  if (batch.expiresAt && batch.expiresAt < new Date()) {
    throw new BatchError('BATCH_EXPIRED', 'Batch has expired', 410);
  }

  // Fetch issued codes in chunks for streaming
  const codes = await prisma.issuedCode.findMany({
    where: { batchId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });

  const masterKey = config.batchEncryptionKey;
  const decryptedCodes = codes.map((ic) => ({
    code: decryptCode(ic.codeEncrypted, masterKey, batchId),
    created_at: ic.createdAt.toISOString(),
  }));

  // Update download count
  await prisma.codeBatch.update({
    where: { id: batchId },
    data: {
      downloadCount: { increment: 1 },
      lastDownloadAt: new Date(),
    },
  });

  if (format === 'json') {
    return {
      content: JSON.stringify({
        batch_id: batchId,
        codes: decryptedCodes.map((c) => c.code),
        total: decryptedCodes.length,
        generated_at: batch.createdAt.toISOString(),
      }, null, 2),
      contentType: 'application/json',
      filename: `batch-${batchId}.json`,
    };
  }

  // CSV format
  const csvLines = ['code,batch_id,created_at'];
  for (const c of decryptedCodes) {
    csvLines.push(`${c.code},${batchId},${c.created_at}`);
  }

  return {
    content: csvLines.join('\n'),
    contentType: 'text/csv',
    filename: `batch-${batchId}.csv`,
  };
}

// --- Core generation processing ---

async function processBatch(batchId: string, codeRule: CodeRule): Promise<void> {
  // Mark as GENERATING
  await prisma.codeBatch.update({
    where: { id: batchId },
    data: { status: 'GENERATING' },
  });

  const batch = await prisma.codeBatch.findUnique({ where: { id: batchId } });
  if (!batch) return;

  const targetCount = batch.batchSize;
  let generated = batch.generatedCount; // Support resume from partial FAILED
  const masterKey = config.batchEncryptionKey;
  const batchCreatedAt = batch.createdAt;

  try {
    while (generated < targetCount) {
      const chunkSize = Math.min(CHUNK_SIZE, targetCount - generated);
      const inserted = await generateChunk(batchId, codeRule, chunkSize, masterKey, batchCreatedAt);
      generated += inserted;

      await prisma.codeBatch.update({
        where: { id: batchId },
        data: { generatedCount: generated },
      });

      // Check if batch was cancelled while generating
      const current = await prisma.codeBatch.findUnique({ where: { id: batchId } });
      if (current?.status === 'CANCELLED') {
        logger.info({ batchId }, 'Batch generation cancelled');
        return;
      }
    }

    await prisma.codeBatch.update({
      where: { id: batchId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        generatedCount: generated,
      },
    });

    logger.info({ batchId, generated }, 'Batch generation completed');
  } catch (err) {
    logger.error({ err, batchId, generated }, 'Batch generation failed');
    await prisma.codeBatch.update({
      where: { id: batchId },
      data: {
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        generatedCount: generated,
      },
    });
  }
}

async function generateChunk(
  batchId: string,
  codeRule: CodeRule,
  chunkSize: number,
  masterKey: string,
  batchCreatedAt: Date,
): Promise<number> {
  let totalInserted = 0;
  let remaining = chunkSize;

  for (let retry = 0; retry < MAX_RETRIES_PER_CHUNK && remaining > 0; retry++) {
    const codes: Array<{ code: string; hash: string; encrypted: string }> = [];
    const seenHashes = new Set<string>();

    for (let i = 0; i < remaining; i++) {
      const code = await generateCode(codeRule, batchCreatedAt);
      const hash = computeCodeHash(code, config.codeHashPepper);

      // Deduplicate within chunk
      if (seenHashes.has(hash)) {
        i--;
        continue;
      }
      seenHashes.add(hash);

      codes.push({
        code,
        hash,
        encrypted: encryptCode(code, masterKey, batchId),
      });
    }

    // Batch INSERT with ON CONFLICT DO NOTHING
    const result = await prisma.$executeRawUnsafe(
      `INSERT INTO issued_codes (id, batch_id, code_hash, code_encrypted, status, created_at)
       SELECT gen_random_uuid(), $1, unnest($2::varchar[]), unnest($3::text[]), 'ACTIVE', now()
       ON CONFLICT (batch_id, code_hash) DO NOTHING`,
      batchId,
      codes.map((c) => c.hash),
      codes.map((c) => c.encrypted),
    );

    const inserted = typeof result === 'number' ? result : codes.length;
    totalInserted += inserted;
    remaining = chunkSize - totalInserted;

    if (remaining <= 0) break;
    // Collisions detected — retry for remaining
    logger.warn({ batchId, collisions: codes.length - inserted, retry }, 'Collisions in chunk, retrying');
  }

  return totalInserted;
}

// --- Error class ---

export class BatchError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = 'BatchError';
  }
}
