import type { Charset, CheckAlgorithm, CheckDigitPos, Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma.js';
import { invalidateProjectCache } from '../../utils/cache.js';

export interface CreateCodeRuleInput {
  name: string;
  skuReference?: string;
  totalLength: number;
  charset: Charset;
  customCharset?: string;
  hasCheckDigit: boolean;
  checkAlgorithm?: CheckAlgorithm;
  checkDigitPosition?: CheckDigitPos;
  structureDef: Record<string, unknown>;
  separator?: string;
  caseSensitive?: boolean;
  prefix?: string;
  maxRedemptions?: number;
  productInfo?: Record<string, unknown>;
  campaignInfo?: Record<string, unknown>;
  pointsValue?: number;
  customCheckFunction?: string;
  allowedCountries?: string[];
}

export async function createCodeRule(projectId: string, data: CreateCodeRuleInput) {
  await invalidateProjectCache(projectId);
  return prisma.codeRule.create({
    data: {
      projectId,
      name: data.name,
      skuReference: data.skuReference,
      totalLength: data.totalLength,
      charset: data.charset,
      customCharset: data.customCharset,
      hasCheckDigit: data.hasCheckDigit,
      checkAlgorithm: data.checkAlgorithm,
      checkDigitPosition: data.checkDigitPosition,
      structureDef: data.structureDef as Prisma.InputJsonValue,
      separator: data.separator,
      caseSensitive: data.caseSensitive ?? false,
      prefix: data.prefix,
      maxRedemptions: data.maxRedemptions ?? 1,
      productInfo: data.productInfo as Prisma.InputJsonValue | undefined,
      campaignInfo: data.campaignInfo as Prisma.InputJsonValue | undefined,
      pointsValue: data.pointsValue,
      customCheckFunction: data.customCheckFunction,
      allowedCountries: data.allowedCountries ?? [],
    },
  });
}

export async function listCodeRules(projectId: string) {
  return prisma.codeRule.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { redeemedCodes: true } } },
  });
}

export async function getCodeRule(id: string) {
  return prisma.codeRule.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true, tenantId: true } },
      _count: { select: { redeemedCodes: true } },
    },
  });
}

export async function updateCodeRule(id: string, data: {
  name?: string;
  skuReference?: string;
  isActive?: boolean;
  maxRedemptions?: number;
  productInfo?: Record<string, unknown>;
  campaignInfo?: Record<string, unknown>;
  pointsValue?: number;
  allowedCountries?: string[];
}) {
  const rule = await prisma.codeRule.update({
    where: { id },
    data: {
      name: data.name,
      skuReference: data.skuReference,
      isActive: data.isActive,
      maxRedemptions: data.maxRedemptions,
      productInfo: data.productInfo as Prisma.InputJsonValue | undefined,
      campaignInfo: data.campaignInfo as Prisma.InputJsonValue | undefined,
      pointsValue: data.pointsValue,
      allowedCountries: data.allowedCountries,
    },
  });
  await invalidateProjectCache(rule.projectId);
  return rule;
}
