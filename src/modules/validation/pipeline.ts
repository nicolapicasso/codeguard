import type { CodeRule, Project } from '@prisma/client';
import type { ValidationResult, PipelineContext } from '../../types/validation.js';
import type { StructureDefinition, CheckSegment } from '../../types/structure-def.js';
import { normalize } from './normalizer.js';
import { validateStructure } from './structure.js';
import { validateSegments } from './segments.js';
import { validateCheckDigit } from './check-digit/index.js';
import { validateVigency } from './vigency.js';
import { validateUniqueness } from './uniqueness.js';
import { getCachedProjectWithRules } from '../../utils/cache.js';

export interface ValidateInput {
  code: string;
  projectId: string;
  owUserId?: string;
  owTransactionId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  dryRun?: boolean;
}

/**
 * Main validation pipeline — orchestrates all 6 phases.
 * If dryRun is true, skips Phase 6 (uniqueness/redemption).
 */
export async function runPipeline(input: ValidateInput): Promise<ValidationResult> {
  // Load project with its code rules (cached in Redis, TTL 5 min)
  const project = await getCachedProjectWithRules(input.projectId);

  if (!project) {
    return {
      status: 'KO',
      errorCode: 'NO_MATCHING_RULE',
      errorMessage: 'Project not found',
    };
  }

  // Try each active code rule until one matches
  for (const codeRule of project.codeRules) {
    const result = await tryRule(input, project, codeRule);
    if (result) return result;
  }

  return {
    status: 'KO',
    errorCode: 'NO_MATCHING_RULE',
    errorMessage: 'No code rule matches the provided code',
  };
}

async function tryRule(
  input: ValidateInput,
  project: Project,
  codeRule: CodeRule,
): Promise<ValidationResult | null> {
  // Phase 1: Normalize
  const normalizedCode = normalize(input.code, codeRule);

  // Phase 2: Structure
  const structureError = validateStructure(normalizedCode, codeRule);
  if (structureError) return null; // Not this rule, try next

  // Phase 3: Segments
  const structureDef = codeRule.structureDef as unknown as StructureDefinition;
  const { error: segmentError, parsedSegments } = validateSegments(normalizedCode, structureDef);
  if (segmentError) return null; // Not this rule, try next

  // Phase 4: Check digit
  if (codeRule.hasCheckDigit && codeRule.checkAlgorithm) {
    const checkSegment = structureDef.segments.find(
      (s): s is CheckSegment => s.type === 'check',
    );

    if (checkSegment) {
      const dataSegments = checkSegment.appliesTo
        .map((name) => parsedSegments.get(name) || '')
        .join('');
      const checkValue = parsedSegments.get(checkSegment.name) || '';

      const isValid = await validateCheckDigit(
        codeRule.checkAlgorithm,
        dataSegments,
        checkValue,
        codeRule.customCheckFunction,
      );

      if (!isValid) {
        return {
          status: 'KO',
          errorCode: 'INVALID_CHECK_DIGIT',
          errorMessage: 'Check digit verification failed',
        };
      }
    }
  }

  // Phase 5: Vigency
  const vigencyError = validateVigency(project, codeRule);
  if (vigencyError) return vigencyError;

  // Phase 6: Uniqueness (skip if dry run)
  if (!input.dryRun) {
    const uniquenessResult = await validateUniqueness(
      normalizedCode,
      codeRule,
      input.owUserId,
      input.owTransactionId,
      input.ipAddress,
      input.metadata,
    );

    if (uniquenessResult.error) return uniquenessResult.error;

    return {
      status: 'OK',
      code: input.code,
      codeNormalized: normalizedCode,
      project: { id: project.id, name: project.name },
      codeRule: { id: codeRule.id, name: codeRule.name },
      productInfo: codeRule.productInfo,
      campaignInfo: codeRule.campaignInfo,
      redeemedAt: uniquenessResult.redeemedAt!.toISOString(),
      redemptionId: uniquenessResult.redemptionId!,
    };
  }

  // Dry run success
  return {
    status: 'OK',
    code: input.code,
    codeNormalized: normalizedCode,
    project: { id: project.id, name: project.name },
    codeRule: { id: codeRule.id, name: codeRule.name },
    productInfo: codeRule.productInfo,
    campaignInfo: codeRule.campaignInfo,
    redeemedAt: new Date().toISOString(),
    redemptionId: 'dry-run',
  };
}
