import type { CodeRule, Project } from '@prisma/client';
import type { Segment } from './structure-def.js';

export type ValidationErrorCode =
  | 'INVALID_STRUCTURE'
  | 'INVALID_SEGMENT'
  | 'INVALID_CHECK_DIGIT'
  | 'NO_MATCHING_RULE'
  | 'ALREADY_REDEEMED'
  | 'PROJECT_INACTIVE'
  | 'PROJECT_EXPIRED'
  | 'RULE_INACTIVE'
  | 'RATE_LIMITED'
  | 'AUTH_FAILED';

export interface ValidationSuccess {
  status: 'OK';
  code: string;
  codeNormalized: string;
  project: { id: string; name: string };
  codeRule: { id: string; name: string };
  productInfo: unknown;
  campaignInfo: unknown;
  redeemedAt: string;
  redemptionId: string;
}

export interface ValidationFailure {
  status: 'KO';
  errorCode: ValidationErrorCode;
  errorMessage: string;
  details?: Record<string, unknown>;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

export interface PipelineContext {
  rawCode: string;
  normalizedCode: string;
  projectId: string;
  owUserId?: string;
  owTransactionId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  project?: Project;
  codeRule?: CodeRule;
  parsedSegments?: Map<string, string>;
}
