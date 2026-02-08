import type { FastifyInstance } from 'fastify';
import type { Charset, CheckAlgorithm, CheckDigitPos } from '@prisma/client';
import { verifyJwt } from '../auth/jwt.js';
import { createCodeRule, listCodeRules, getCodeRule, updateCodeRule } from './service.js';
import { runPipeline } from '../validation/pipeline.js';
import { createCodeRuleSchema, updateCodeRuleSchema, testCodeSchema } from './schemas.js';

export async function codeRuleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', verifyJwt);

  app.post('/api/admin/projects/:project_id/rules', {
    schema: { body: createCodeRuleSchema },
  }, async (request, reply) => {
    const { project_id } = request.params as { project_id: string };
    const body = request.body as {
      name: string;
      sku_reference?: string;
      total_length: number;
      charset: Charset;
      custom_charset?: string;
      has_check_digit: boolean;
      check_algorithm?: CheckAlgorithm;
      check_digit_position?: CheckDigitPos;
      structure_def: Record<string, unknown>;
      separator?: string;
      case_sensitive?: boolean;
      prefix?: string;
      max_redemptions?: number;
      product_info?: Record<string, unknown>;
      campaign_info?: Record<string, unknown>;
      points_value?: number;
      custom_check_function?: string;
      allowed_countries?: string[];
    };

    const rule = await createCodeRule(project_id, {
      name: body.name,
      skuReference: body.sku_reference,
      totalLength: body.total_length,
      charset: body.charset,
      customCharset: body.custom_charset,
      hasCheckDigit: body.has_check_digit,
      checkAlgorithm: body.check_algorithm,
      checkDigitPosition: body.check_digit_position,
      structureDef: body.structure_def,
      separator: body.separator,
      caseSensitive: body.case_sensitive,
      prefix: body.prefix,
      maxRedemptions: body.max_redemptions,
      productInfo: body.product_info,
      campaignInfo: body.campaign_info,
      pointsValue: body.points_value,
      customCheckFunction: body.custom_check_function,
      allowedCountries: body.allowed_countries,
    });

    return reply.status(201).send(rule);
  });

  app.get('/api/admin/projects/:project_id/rules', async (request, reply) => {
    const { project_id } = request.params as { project_id: string };
    const rules = await listCodeRules(project_id);
    return reply.status(200).send(rules);
  });

  app.get('/api/admin/rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const rule = await getCodeRule(id);
    if (!rule) {
      return reply.status(404).send({ status: 'KO', error_code: 'NOT_FOUND', error_message: 'Code rule not found' });
    }
    return reply.status(200).send(rule);
  });

  app.put('/api/admin/rules/:id', {
    schema: { body: updateCodeRuleSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      sku_reference?: string;
      is_active?: boolean;
      max_redemptions?: number;
      product_info?: Record<string, unknown>;
      campaign_info?: Record<string, unknown>;
      points_value?: number;
      allowed_countries?: string[];
    };
    const rule = await updateCodeRule(id, {
      name: body.name,
      skuReference: body.sku_reference,
      isActive: body.is_active,
      maxRedemptions: body.max_redemptions,
      productInfo: body.product_info,
      campaignInfo: body.campaign_info,
      pointsValue: body.points_value,
      allowedCountries: body.allowed_countries,
    });
    return reply.status(200).send(rule);
  });

  // POST /api/admin/rules/:id/test — Test code against rule (no registration)
  app.post('/api/admin/rules/:id/test', {
    schema: { body: testCodeSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { code } = request.body as { code: string };

    const rule = await getCodeRule(id);
    if (!rule) {
      return reply.status(404).send({ status: 'KO', error_code: 'NOT_FOUND', error_message: 'Code rule not found' });
    }

    const result = await runPipeline({
      code,
      projectId: rule.projectId,
      dryRun: true,
    });

    return reply.status(200).send(result);
  });
}
