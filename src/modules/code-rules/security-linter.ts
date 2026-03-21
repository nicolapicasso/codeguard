/**
 * Security linter for CodeRule configurations.
 *
 * Calculates a Security Level (0-3) for each rule and determines
 * whether it is safe for production use. Also returns warnings/errors
 * for weak configurations.
 *
 * Security Levels:
 *   0 — OPEN:          No integrity checks, no authentication
 *   1 — CONTROLLED:    Has check digit OR entropy >= 30, but no HMAC
 *   2 — AUTHENTICATED: Has HMAC authenticator with fabricant secret
 *   3 — PROTECTED:     HMAC >= 8 chars + check digit + entropy >= 40 bits
 */

export type SecurityLevel = 0 | 1 | 2 | 3;

export const SECURITY_LEVEL_NAMES: Record<SecurityLevel, string> = {
  0: 'OPEN',
  1: 'CONTROLLED',
  2: 'AUTHENTICATED',
  3: 'PROTECTED',
};

export const SECURITY_LEVEL_COLORS: Record<SecurityLevel, 'red' | 'yellow' | 'green'> = {
  0: 'red',
  1: 'yellow',
  2: 'yellow',
  3: 'green',
};

export interface LintResult {
  level: 'error' | 'warning';
  message: string;
}

export interface SecurityAssessment {
  security_level: SecurityLevel;
  security_level_name: string;
  security_level_color: 'red' | 'yellow' | 'green';
  is_production_safe: boolean;
  entropy_bits: number;
  lint_results: LintResult[];
  lint_errors: string[];
  lint_warnings: string[];
}

export interface LintInput {
  totalLength: number;
  charset: string;
  hasCheckDigit: boolean;
  structureDef: { segments?: Array<{ type: string; length: number; values?: string[]; value?: string }> };
  fabricantSecret?: string | null;
}

/**
 * Full security assessment: calculates level, is_production_safe, and lint results.
 */
export function assessSecurity(data: LintInput): SecurityAssessment {
  const lintResults = lintCodeRule(data);
  const entropy = estimateEntropy(data);
  const securityLevel = calculateSecurityLevel(data, entropy);

  const lintErrors = lintResults.filter((r) => r.level === 'error').map((e) => e.message);
  const lintWarnings = lintResults.filter((r) => r.level === 'warning').map((w) => w.message);

  // is_production_safe: level >= 2 (has HMAC) AND no lint errors AND entropy >= 30
  const isProductionSafe = securityLevel >= 2 && lintErrors.length === 0 && entropy >= 30;

  return {
    security_level: securityLevel,
    security_level_name: SECURITY_LEVEL_NAMES[securityLevel],
    security_level_color: SECURITY_LEVEL_COLORS[securityLevel],
    is_production_safe: isProductionSafe,
    entropy_bits: entropy,
    lint_results: lintResults,
    lint_errors: lintErrors,
    lint_warnings: lintWarnings,
  };
}

/**
 * Calculate the Security Level (0-3) based on rule configuration.
 */
export function calculateSecurityLevel(data: LintInput, entropy?: number): SecurityLevel {
  const segments = data.structureDef?.segments || [];
  const hasHmac = segments.some((s) => s.type === 'hmac');
  const hmacSegment = segments.find((s) => s.type === 'hmac');
  const effectiveEntropy = entropy ?? estimateEntropy(data);

  // Level 3 — PROTECTED: HMAC >= 8 chars + check digit + entropy >= 40
  if (
    hasHmac &&
    data.fabricantSecret &&
    hmacSegment &&
    hmacSegment.length >= 8 &&
    data.hasCheckDigit &&
    effectiveEntropy >= 40
  ) {
    return 3;
  }

  // Level 2 — AUTHENTICATED: Has HMAC with fabricant secret
  if (hasHmac && data.fabricantSecret) {
    return 2;
  }

  // Level 1 — CONTROLLED: Has check digit OR entropy >= 30
  if (data.hasCheckDigit || effectiveEntropy >= 30) {
    return 1;
  }

  // Level 0 — OPEN
  return 0;
}

export function lintCodeRule(data: LintInput): LintResult[] {
  const results: LintResult[] = [];

  // 1. Minimum total length
  if (data.totalLength < 8) {
    results.push({
      level: 'error',
      message: `Total length ${data.totalLength} is too short. Minimum recommended: 8 characters.`,
    });
  }

  // 2. Estimate effective entropy
  const entropy = estimateEntropy(data);
  if (entropy < 20) {
    results.push({
      level: 'error',
      message: `Estimated entropy is only ~${entropy} bits. Minimum recommended: 20 bits. Add more random/alphanumeric segments.`,
    });
  } else if (entropy < 30) {
    results.push({
      level: 'warning',
      message: `Estimated entropy is ~${entropy} bits. Consider adding more random segments for better security.`,
    });
  }

  // 3. Too many fixed/predictable segments
  const segments = data.structureDef?.segments || [];
  const fixedCount = segments.filter((s) => s.type === 'fixed' || s.type === 'date').length;
  const totalSegments = segments.length;
  if (totalSegments > 0 && fixedCount / totalSegments > 0.6) {
    results.push({
      level: 'warning',
      message: `${fixedCount} of ${totalSegments} segments are fixed/date (predictable). Add more random segments.`,
    });
  }

  // 4. No check digit AND no HMAC authenticator
  const hasHmac = segments.some((s) => s.type === 'hmac');
  if (!data.hasCheckDigit && !hasHmac) {
    results.push({
      level: 'warning',
      message: 'No check digit and no HMAC authenticator. Code has no integrity verification.',
    });
  }

  // 5. HMAC authenticator recommended but missing
  if (!hasHmac) {
    results.push({
      level: 'warning',
      message: 'No HMAC authenticator segment. Without it, codes can be forged by anyone who understands the structure.',
    });
  }

  // 6. HMAC segment without fabricant secret
  if (hasHmac && !data.fabricantSecret) {
    results.push({
      level: 'error',
      message: 'HMAC segment defined but no fabricant_secret provided. Codes cannot be verified.',
    });
  }

  // 7. HMAC segment too short (< 8 chars for BASE32 encoding)
  const hmacSegment = segments.find((s) => s.type === 'hmac');
  if (hmacSegment && hmacSegment.length < 8) {
    results.push({
      level: 'warning',
      message: `HMAC authenticator segment is only ${hmacSegment.length} chars. Recommended: at least 8 for adequate security with BASE32 encoding.`,
    });
  }

  return results;
}

/**
 * Estimate effective entropy bits based on segment types and lengths.
 */
export function estimateEntropy(data: {
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
        // These are deterministic — 0 entropy
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
        // ~365 days/year * ~10 years ≈ 12 bits
        totalBits += 12;
        break;
    }
  }

  return Math.floor(totalBits);
}
