import type { FastifyInstance } from 'fastify';
import { verifyApiKey } from '../auth/api-key.js';
import { runPipeline } from './pipeline.js';
import { prisma } from '../../utils/prisma.js';
import { registerUserRateLimiter } from '../../middleware/rate-limiter.js';
import { validateRequestSchema, validateCheckQuerySchema, listCodesQuerySchema } from './schemas.js';

export async function validationRoutes(app: FastifyInstance): Promise<void> {
  // All validation routes require API Key auth
  app.addHook('onRequest', verifyApiKey);

  // Per-user rate limiting for validation endpoints
  await registerUserRateLimiter(app);

  // POST /api/v1/validate — Validate and redeem a code
  app.post('/api/v1/validate', {
    schema: { body: validateRequestSchema },
  }, async (request, reply) => {
    const body = request.body as {
      code: string;
      project_id: string;
      ow_user_id?: string;
      ow_transaction_id?: string;
      country?: string;
      metadata?: Record<string, unknown>;
    };

    const sandboxHeader = request.headers['x-sandbox'];
    const isSandbox = sandboxHeader === 'true' || sandboxHeader === '1';

    const result = await runPipeline({
      code: body.code,
      projectId: body.project_id,
      owUserId: body.ow_user_id,
      owTransactionId: body.ow_transaction_id,
      ipAddress: request.ip,
      country: body.country,
      metadata: body.metadata,
      sandbox: isSandbox,
    });

    if (result.status === 'KO') {
      const statusMap: Record<string, number> = {
        INVALID_STRUCTURE: 400,
        INVALID_SEGMENT: 400,
        INVALID_CHECK_DIGIT: 400,
        NO_MATCHING_RULE: 404,
        ALREADY_REDEEMED: 409,
        PROJECT_INACTIVE: 403,
        PROJECT_EXPIRED: 403,
        RULE_INACTIVE: 403,
        GEO_BLOCKED: 403,
      };
      const httpStatus = statusMap[result.errorCode] || 400;
      return reply.status(httpStatus).send({
        status: 'KO',
        error_code: result.errorCode,
        error_message: result.errorMessage,
        details: result.details,
      });
    }

    const response: Record<string, unknown> = {
      status: 'OK',
      code: result.code,
      code_normalized: result.codeNormalized,
      project: result.project,
      code_rule: result.codeRule,
      product_info: result.productInfo,
      campaign_info: result.campaignInfo,
      redeemed_at: result.redeemedAt,
      redemption_id: result.redemptionId,
    };
    if (result.sandbox) {
      response.sandbox = true;
    }

    return reply.status(200).send(response);
  });

  // GET /api/v1/validate/check — Pre-validate without redeeming
  app.get('/api/v1/validate/check', {
    schema: { querystring: validateCheckQuerySchema },
  }, async (request, reply) => {
    const query = request.query as { code: string; project_id: string };

    const result = await runPipeline({
      code: query.code,
      projectId: query.project_id,
      dryRun: true,
    });

    if (result.status === 'KO') {
      const statusMap: Record<string, number> = {
        INVALID_STRUCTURE: 400,
        INVALID_SEGMENT: 400,
        INVALID_CHECK_DIGIT: 400,
        NO_MATCHING_RULE: 404,
        PROJECT_INACTIVE: 403,
        PROJECT_EXPIRED: 403,
        RULE_INACTIVE: 403,
        GEO_BLOCKED: 403,
      };
      const httpStatus = statusMap[result.errorCode] || 400;
      return reply.status(httpStatus).send({
        status: 'KO',
        error_code: result.errorCode,
        error_message: result.errorMessage,
        details: result.details,
      });
    }

    return reply.status(200).send({
      status: 'OK',
      code: result.code,
      code_normalized: result.codeNormalized,
      project: result.project,
      code_rule: result.codeRule,
      product_info: result.productInfo,
      campaign_info: result.campaignInfo,
    });
  });

  // GET /api/v1/codes/:redemption_id — Get a specific redemption
  app.get('/api/v1/codes/:redemption_id', async (request, reply) => {
    const { redemption_id } = request.params as { redemption_id: string };

    const redeemed = await prisma.redeemedCode.findUnique({
      where: { id: redemption_id },
      include: { codeRule: { include: { project: true } } },
    });

    if (!redeemed) {
      return reply.status(404).send({
        status: 'KO',
        error_code: 'NOT_FOUND',
        error_message: 'Redemption not found',
      });
    }

    return reply.status(200).send({
      id: redeemed.id,
      code_hash: redeemed.codeHash,
      code_rule: { id: redeemed.codeRule.id, name: redeemed.codeRule.name },
      project: { id: redeemed.codeRule.project.id, name: redeemed.codeRule.project.name },
      ow_user_id: redeemed.owUserId,
      ow_transaction_id: redeemed.owTransactionId,
      redemption_count: redeemed.redemptionCount,
      redeemed_at: redeemed.redeemedAt.toISOString(),
    });
  });

  // GET /api/v1/codes — List redemptions with filters
  app.get('/api/v1/codes', {
    schema: { querystring: listCodesQuerySchema },
  }, async (request, reply) => {
    const query = request.query as {
      project_id?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    };

    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.project_id) {
      where.codeRule = { projectId: query.project_id };
    }
    if (query.from || query.to) {
      where.redeemedAt = {};
      if (query.from) where.redeemedAt.gte = new Date(query.from);
      if (query.to) where.redeemedAt.lte = new Date(query.to);
    }

    const [data, total] = await Promise.all([
      prisma.redeemedCode.findMany({
        where,
        skip,
        take: limit,
        orderBy: { redeemedAt: 'desc' },
        include: { codeRule: { select: { id: true, name: true, projectId: true } } },
      }),
      prisma.redeemedCode.count({ where }),
    ]);

    return reply.status(200).send({
      data: data.map((r) => ({
        id: r.id,
        code_hash: r.codeHash,
        code_rule_id: r.codeRuleId,
        code_rule_name: r.codeRule.name,
        ow_user_id: r.owUserId,
        redemption_count: r.redemptionCount,
        redeemed_at: r.redeemedAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });
}
