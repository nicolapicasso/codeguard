import type { FastifyInstance } from 'fastify';
import type { Charset, CheckAlgorithm, CheckDigitPos } from '@prisma/client';
import { verifyJwt } from '../auth/jwt.js';
import { createCodeRule, listCodeRules, getCodeRule, updateCodeRule, deleteCodeRule } from './service.js';
import { runPipeline } from '../validation/pipeline.js';
import { createCodeRuleSchema, updateCodeRuleSchema, testCodeSchema } from './schemas.js';
import { lintCodeRule } from './security-linter.js';
import { computeSecurityLevel } from './security-levels.js';

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
      fabricant_secret?: string;
      allowed_countries?: string[];
    };

    // Security linter: check for weak configurations and compute security level
    const lintReport = lintCodeRule({
      totalLength: body.total_length,
      charset: body.charset,
      hasCheckDigit: body.has_check_digit,
      structureDef: body.structure_def as any,
      fabricantSecret: body.fabricant_secret,
      allowedCountries: body.allowed_countries,
      maxRedemptions: body.max_redemptions,
    });

    const lintErrors = lintReport.results.filter((r) => r.level === 'error');
    if (lintErrors.length > 0) {
      return reply.status(400).send({
        status: 'KO',
        error_code: 'INSECURE_RULE',
        error_message: 'Rule configuration has security issues that must be resolved',
        errors: lintErrors.map((e) => ({ code: e.code, message: e.message })),
        security: lintReport.security,
      });
    }

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
      fabricantSecret: body.fabricant_secret,
      allowedCountries: body.allowed_countries,
    });

    const lintWarnings = lintReport.results.filter((r) => r.level === 'warning');
    const response: any = {
      ...rule,
      security_level: lintReport.security.code,
      security_level_numeric: lintReport.security.level,
      security_label: lintReport.security.label,
      is_production_safe: lintReport.security.is_production_safe,
    };
    if (lintWarnings.length > 0) {
      response.security_warnings = lintWarnings.map((w) => ({
        code: w.code,
        message: w.message,
      }));
    }

    return reply.status(201).send(response);
  });

  app.get('/api/admin/projects/:project_id/rules', async (request, reply) => {
    const { project_id } = request.params as { project_id: string };
    const rules = await listCodeRules(project_id);

    // Enrich each rule with its security level
    const enriched = rules.map((rule: any) => {
      const security = computeSecurityLevel({
        hasCheckDigit: rule.hasCheckDigit,
        structureDef: rule.structureDef as any,
        fabricantSecret: rule.fabricantSecret,
        allowedCountries: rule.allowedCountries,
        maxRedemptions: rule.maxRedemptions,
      });
      return {
        ...rule,
        security_level: security.code,
        security_level_numeric: security.level,
        security_label: security.label,
        is_production_safe: security.is_production_safe,
      };
    });

    return reply.status(200).send(enriched);
  });

  app.get('/api/admin/rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const rule = await getCodeRule(id);
    if (!rule) {
      return reply.status(404).send({ status: 'KO', error_code: 'NOT_FOUND', error_message: 'Code rule not found' });
    }

    // Compute security level for the existing rule
    const security = computeSecurityLevel({
      hasCheckDigit: rule.hasCheckDigit,
      structureDef: rule.structureDef as any,
      fabricantSecret: (rule as any).fabricantSecret,
      allowedCountries: (rule as any).allowedCountries,
      maxRedemptions: rule.maxRedemptions,
    });

    return reply.status(200).send({
      ...rule,
      security_level: security.code,
      security_level_numeric: security.level,
      security_label: security.label,
      is_production_safe: security.is_production_safe,
      security_warnings: security.warnings.length > 0 ? security.warnings : undefined,
    });
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

  app.delete('/api/admin/rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const rule = await getCodeRule(id);
    if (!rule) {
      return reply.status(404).send({ status: 'KO', error_code: 'NOT_FOUND', error_message: 'Code rule not found' });
    }
    await deleteCodeRule(id);
    return reply.status(204).send();
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
