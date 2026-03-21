import type { CodeRule } from '@prisma/client';

/**
 * Phase 1 — Normalization
 * Removes separators, applies case transformation, trims whitespace.
 *
 * SECURITY: Applies Unicode NFKC normalization to prevent homoglyph attacks
 * (e.g., Cyrillic 'А' vs Latin 'A') and filters to ASCII-only to eliminate
 * ambiguous characters before any validation occurs.
 */
export function normalize(rawCode: string, rule: CodeRule): string {
  // 1. Trim whitespace
  let code = rawCode.trim();

  // 2. Unicode NFKC normalization — collapses visually similar characters
  //    e.g., fullwidth 'Ａ' → 'A', Cyrillic 'А' stays 'А' but ASCII filter catches it
  code = code.normalize('NFKC');

  // 3. Strip non-ASCII characters (homoglyph protection)
  //    Only allow printable ASCII: space (0x20) through tilde (0x7E)
  code = code.replace(/[^\x20-\x7E]/g, '');

  // 4. Remove separators
  if (rule.separator) {
    const escaped = rule.separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    code = code.replace(new RegExp(escaped, 'g'), '');
  }

  // 5. Case conversion
  if (!rule.caseSensitive) {
    code = code.toUpperCase();
  }

  return code;
}
