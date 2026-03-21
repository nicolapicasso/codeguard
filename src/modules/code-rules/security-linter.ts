/**
 * Security linter for CodeRule configurations.
 *
 * Prevents operators from creating rules with dangerously low entropy,
 * weak structures, or configurations that would be easy to brute-force.
 * Returns an array of warning/error messages.
 */

export interface LintResult {
  level: 'error' | 'warning';
  message: string;
}

export function lintCodeRule(data: {
  totalLength: number;
  charset: string;
  hasCheckDigit: boolean;
  structureDef: { segments?: Array<{ type: string; length: number; values?: string[]; value?: string }> };
  fabricantSecret?: string | null;
}): LintResult[] {
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

  // 7. HMAC segment too short
  const hmacSegment = segments.find((s) => s.type === 'hmac');
  if (hmacSegment && hmacSegment.length < 6) {
    results.push({
      level: 'warning',
      message: `HMAC authenticator segment is only ${hmacSegment.length} chars. Recommended: at least 6 for adequate security.`,
    });
  }

  return results;
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
