/**
 * Security linter for CodeRule configurations.
 *
 * Prevents operators from creating rules with dangerously low entropy,
 * weak structures, or configurations that would be easy to brute-force.
 *
 * Two severity levels:
 *   ERROR   — blocks rule creation (critical security issues)
 *   WARNING — allows creation but surfaces risk to the operator
 *
 * Works in tandem with security-levels.ts to classify and communicate risk.
 */

import { computeSecurityLevel, type SecurityLevel } from './security-levels.js';

export interface LintResult {
  level: 'error' | 'warning';
  code: string;
  message: string;
}

export interface LintReport {
  results: LintResult[];
  security: SecurityLevel;
  estimatedEntropy: number;
}

export function lintCodeRule(data: {
  totalLength: number;
  charset: string;
  hasCheckDigit: boolean;
  structureDef: { segments?: Array<{ type: string; length: number; values?: string[]; value?: string }> };
  fabricantSecret?: string | null;
  allowedCountries?: string[];
  maxRedemptions?: number;
}): LintReport {
  const results: LintResult[] = [];
  const segments = data.structureDef?.segments || [];
  const hasHmac = segments.some((s) => s.type === 'hmac');
  const hmacSegment = segments.find((s) => s.type === 'hmac');

  // ── ERRORS (block creation) ─────────────────────────────────────────

  // 1. Minimum total length
  if (data.totalLength < 8) {
    results.push({
      level: 'error',
      code: 'TOO_SHORT',
      message: `Total length ${data.totalLength} is too short. Minimum: 8 characters.`,
    });
  }

  // 2. Ridiculously low entropy
  const entropy = estimateEntropy(data);
  if (entropy < 20) {
    results.push({
      level: 'error',
      code: 'LOW_ENTROPY_CRITICAL',
      message: `Estimated entropy is only ~${entropy} bits. Minimum: 20 bits. Add more random/alphanumeric segments.`,
    });
  }

  // 3. HMAC segment defined but no secret — broken config
  if (hasHmac && !data.fabricantSecret) {
    results.push({
      level: 'error',
      code: 'HMAC_NO_SECRET',
      message: 'HMAC segment defined but no fabricant_secret provided. Codes cannot be verified.',
    });
  }

  // ── WARNINGS (allow but surface risk) ───────────────────────────────

  // 4. Low entropy (but not critical)
  if (entropy >= 20 && entropy < 30) {
    results.push({
      level: 'warning',
      code: 'LOW_ENTROPY',
      message: `Estimated entropy is ~${entropy} bits. Consider adding more random segments for better security.`,
    });
  }

  // 5. Too many predictable segments
  const fixedCount = segments.filter((s) => s.type === 'fixed' || s.type === 'date').length;
  const totalSegments = segments.length;
  if (totalSegments > 0 && fixedCount / totalSegments > 0.6) {
    results.push({
      level: 'warning',
      code: 'PREDICTABLE_STRUCTURE',
      message: `${fixedCount} of ${totalSegments} segments are fixed/date (predictable). Add more random segments.`,
    });
  }

  // 6. No check digit AND no HMAC
  if (!data.hasCheckDigit && !hasHmac) {
    results.push({
      level: 'warning',
      code: 'NO_INTEGRITY',
      message: 'No check digit and no HMAC authenticator. Code has no integrity verification.',
    });
  }

  // 7. No HMAC (strongest recommendation)
  if (!hasHmac) {
    results.push({
      level: 'warning',
      code: 'NO_HMAC',
      message: 'No HMAC authenticator segment. Codes can be forged by anyone who understands the structure.',
    });
  }

  // 8. HMAC TAG too short (threshold: 8 chars recommended for BASE32)
  if (hmacSegment && hmacSegment.length < 8) {
    results.push({
      level: 'warning',
      code: 'HMAC_TAG_SHORT',
      message: `HMAC TAG is only ${hmacSegment.length} chars. Recommended: at least 8 for adequate security (${hmacSegment.length} chars = ~${Math.floor(hmacSegment.length * 5)} bits of BASE32 entropy).`,
    });
  }

  // ── Compute security level ──────────────────────────────────────────
  const security = computeSecurityLevel({
    hasCheckDigit: data.hasCheckDigit,
    structureDef: data.structureDef,
    fabricantSecret: data.fabricantSecret,
    allowedCountries: data.allowedCountries,
    maxRedemptions: data.maxRedemptions,
    estimatedEntropy: entropy,
  });

  return { results, security, estimatedEntropy: entropy };
}

/**
 * Estimate effective entropy bits based on segment types and lengths.
 */
function estimateEntropy(data: {
  charset: string;
  structureDef: { segments?: Array<{ type: string; length: number; values?: string[] }> };
}): number {
  const segments = data.structureDef?.segments || [];
  let totalBits = 0;

  for (const seg of segments) {
    switch (seg.type) {
      case 'fixed':
      case 'check':
      case 'hmac':
        // Deterministic — 0 entropy
        break;
      case 'numeric':
        totalBits += seg.length * Math.log2(10); // ~3.32 bits/digit
        break;
      case 'alpha':
        totalBits += seg.length * Math.log2(26); // ~4.7 bits/char
        break;
      case 'alphanumeric':
        totalBits += seg.length * Math.log2(36); // ~5.17 bits/char
        break;
      case 'enum':
        if (seg.values && seg.values.length > 1) {
          totalBits += Math.log2(seg.values.length);
        }
        break;
      case 'date':
        totalBits += 12; // ~365 * ~10 years
        break;
    }
  }

  return Math.floor(totalBits);
}
