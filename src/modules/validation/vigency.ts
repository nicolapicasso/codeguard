import type { Project, CodeRule } from '@prisma/client';
import type { ValidationFailure } from '../../types/validation.js';

/**
 * Phase 5 — Vigency validation
 * Checks project/rule active status and date bounds.
 */
export function validateVigency(
  project: Project,
  codeRule: CodeRule,
): ValidationFailure | null {
  if (!project.isActive) {
    return {
      status: 'KO',
      errorCode: 'PROJECT_INACTIVE',
      errorMessage: 'The project is currently inactive',
    };
  }

  if (!codeRule.isActive) {
    return {
      status: 'KO',
      errorCode: 'RULE_INACTIVE',
      errorMessage: 'The code rule is currently inactive',
    };
  }

  const now = new Date();

  if (project.startsAt && now < project.startsAt) {
    return {
      status: 'KO',
      errorCode: 'PROJECT_EXPIRED',
      errorMessage: 'The project has not started yet',
      details: { startsAt: project.startsAt.toISOString() },
    };
  }

  if (project.endsAt && now > project.endsAt) {
    return {
      status: 'KO',
      errorCode: 'PROJECT_EXPIRED',
      errorMessage: 'The project has expired',
      details: { endsAt: project.endsAt.toISOString() },
    };
  }

  return null;
}
