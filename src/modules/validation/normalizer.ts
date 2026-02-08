import type { CodeRule } from '@prisma/client';

/**
 * Phase 1 — Normalization
 * Removes separators, applies case transformation, trims whitespace.
 */
export function normalize(rawCode: string, rule: CodeRule): string {
  let code = rawCode.trim();

  if (rule.separator) {
    const escaped = rule.separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    code = code.replace(new RegExp(escaped, 'g'), '');
  }

  if (!rule.caseSensitive) {
    code = code.toUpperCase();
  }

  return code;
}
