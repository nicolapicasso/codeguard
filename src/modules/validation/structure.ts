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
 * Checks prefix, total length (payload only), and charset (payload only).
 * Returns the payload (code without prefix) on success, or an error.
 */
export function validateStructure(
  normalizedCode: string,
  rule: CodeRule,
): { error: ValidationFailure } | { payload: string } {
  // Check prefix first
  if (rule.prefix) {
    const prefix = rule.caseSensitive ? rule.prefix : rule.prefix.toUpperCase();
    if (!normalizedCode.startsWith(prefix)) {
      return {
        error: {
          status: 'KO',
          errorCode: 'INVALID_STRUCTURE',
          errorMessage: `Code does not start with expected prefix "${rule.prefix}"`,
          details: { expectedPrefix: rule.prefix },
        },
      };
    }
  }

  // Strip prefix to get the payload
  const payload = rule.prefix
    ? normalizedCode.slice(rule.caseSensitive ? rule.prefix.length : rule.prefix.toUpperCase().length)
    : normalizedCode;

  // Check length on payload only
  if (payload.length !== rule.totalLength) {
    return {
      error: {
        status: 'KO',
        errorCode: 'INVALID_STRUCTURE',
        errorMessage: `Expected payload length ${rule.totalLength}, got ${payload.length}`,
        details: { expected: rule.totalLength, actual: payload.length },
      },
    };
  }

  // Check charset on payload only
  if (rule.charset === 'CUSTOM' && rule.customCharset) {
    const escaped = rule.customCharset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^[${escaped}]+$`);
    if (!pattern.test(payload)) {
      return {
        error: {
          status: 'KO',
          errorCode: 'INVALID_STRUCTURE',
          errorMessage: `Code contains characters outside the custom charset`,
        },
      };
    }
  } else {
    const pattern = CHARSET_PATTERNS[rule.charset];
    if (!pattern.test(payload)) {
      return {
        error: {
          status: 'KO',
          errorCode: 'INVALID_STRUCTURE',
          errorMessage: `Code contains characters outside the ${rule.charset} charset`,
        },
      };
    }
  }

  return { payload };
}
