import type { CodeRule, Charset } from '@prisma/client';
import type { ValidationFailure } from '../../types/validation.js';

const CHARSET_PATTERNS: Record<Charset, RegExp> = {
  NUMERIC: /^[0-9]+$/,
  ALPHA_UPPER: /^[A-Z]+$/,
  ALPHA_LOWER: /^[a-z]+$/,
  ALPHANUMERIC: /^[A-Za-z0-9]+$/,
  CUSTOM: /^.+$/,
};

/**
 * Phase 2 — Structure Validation
 * Checks total length, charset, and prefix.
 */
export function validateStructure(
  normalizedCode: string,
  rule: CodeRule,
): ValidationFailure | null {
  if (normalizedCode.length !== rule.totalLength) {
    return {
      status: 'KO',
      errorCode: 'INVALID_STRUCTURE',
      errorMessage: `Expected length ${rule.totalLength}, got ${normalizedCode.length}`,
      details: { expected: rule.totalLength, actual: normalizedCode.length },
    };
  }

  if (rule.charset === 'CUSTOM' && rule.customCharset) {
    const escaped = rule.customCharset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^[${escaped}]+$`);
    if (!pattern.test(normalizedCode)) {
      return {
        status: 'KO',
        errorCode: 'INVALID_STRUCTURE',
        errorMessage: `Code contains characters outside the custom charset`,
      };
    }
  } else {
    const pattern = CHARSET_PATTERNS[rule.charset];
    if (!pattern.test(normalizedCode)) {
      return {
        status: 'KO',
        errorCode: 'INVALID_STRUCTURE',
        errorMessage: `Code contains characters outside the ${rule.charset} charset`,
      };
    }
  }

  if (rule.prefix && !normalizedCode.startsWith(rule.prefix)) {
    return {
      status: 'KO',
      errorCode: 'INVALID_STRUCTURE',
      errorMessage: `Code does not start with expected prefix "${rule.prefix}"`,
      details: { expectedPrefix: rule.prefix },
    };
  }

  return null;
}
