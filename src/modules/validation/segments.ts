import type { ValidationFailure } from '../../types/validation.js';
import type { StructureDefinition, Segment, HmacSegment } from '../../types/structure-def.js';
import { hmacSha256, hmacSha256Base32 } from '../../utils/crypto.js';

/**
 * Phase 3 — Segment Validation
 * Decompose the code according to structureDef and validate each segment.
 */
export function validateSegments(
  normalizedCode: string,
  structureDef: StructureDefinition,
  fabricantSecret?: string | null,
): { error: ValidationFailure | null; parsedSegments: Map<string, string> } {
  const parsedSegments = new Map<string, string>();
  let offset = 0;

  // First pass: parse all segments
  for (const segment of structureDef.segments) {
    if (offset + segment.length > normalizedCode.length) {
      return {
        error: {
          status: 'KO',
          errorCode: 'INVALID_SEGMENT',
          errorMessage: `Segment "${segment.name}" exceeds code length at offset ${offset}`,
        },
        parsedSegments,
      };
    }

    const value = normalizedCode.substring(offset, offset + segment.length);
    parsedSegments.set(segment.name, value);

    // Skip HMAC segments in single-segment validation (validated below)
    if (segment.type !== 'hmac') {
      const segmentError = validateSingleSegment(value, segment);
      if (segmentError) {
        return { error: segmentError, parsedSegments };
      }
    }

    offset += segment.length;
  }

  // Second pass: validate HMAC authenticator segments
  for (const segment of structureDef.segments) {
    if (segment.type === 'hmac') {
      const hmacSeg = segment as HmacSegment;
      const hmacError = validateHmacSegment(parsedSegments, hmacSeg, fabricantSecret);
      if (hmacError) {
        return { error: hmacError, parsedSegments };
      }
    }
  }

  return { error: null, parsedSegments };
}

/**
 * Validate HMAC authenticator segment (TAG).
 *
 * The fabricant generates: HMAC-SHA256(payload_segments_joined, fabricantSecret)
 * Then encodes as BASE32 (RFC 4648) and truncates to the segment length.
 * BASE32 uses A-Z and 2-7 — avoids ambiguous characters (0/O, 1/I/L),
 * is case-insensitive, and works well for printed codes.
 *
 * For backward compatibility, if BASE32 match fails, falls back to
 * uppercase HEX comparison (legacy encoding).
 */
function validateHmacSegment(
  parsedSegments: Map<string, string>,
  segment: HmacSegment,
  fabricantSecret?: string | null,
): ValidationFailure | null {
  if (!fabricantSecret) {
    return {
      status: 'KO',
      errorCode: 'INVALID_CODE',
      errorMessage: 'Code rule requires HMAC authenticator but no fabricant secret is configured',
    };
  }

  // Join the payload segments that the HMAC covers
  const dataPayload = segment.appliesTo
    .map((name) => parsedSegments.get(name) || '')
    .join('');

  const actualValue = (parsedSegments.get(segment.name) || '').toUpperCase();

  // Primary: BASE32 encoding (new standard)
  const base32Tag = hmacSha256Base32(dataPayload, fabricantSecret, segment.length);
  if (actualValue === base32Tag) {
    return null;
  }

  // Fallback: legacy HEX encoding (backward compatibility)
  const fullHmacHex = hmacSha256(dataPayload, fabricantSecret).toUpperCase();
  const hexTag = fullHmacHex.substring(0, segment.length);
  if (actualValue === hexTag) {
    return null;
  }

  return {
    status: 'KO',
    errorCode: 'INVALID_CODE',
    errorMessage: 'Code authenticity verification failed',
  };
}

function validateSingleSegment(
  value: string,
  segment: Segment,
): ValidationFailure | null {
  switch (segment.type) {
    case 'fixed':
      if (value !== segment.value) {
        return {
          status: 'KO',
          errorCode: 'INVALID_SEGMENT',
          errorMessage: `Segment "${segment.name}" expected "${segment.value}", got "${value}"`,
          details: { segment: segment.name, expected: segment.value, actual: value },
        };
      }
      break;

    case 'numeric': {
      if (!/^\d+$/.test(value)) {
        return {
          status: 'KO',
          errorCode: 'INVALID_SEGMENT',
          errorMessage: `Segment "${segment.name}" must be numeric`,
          details: { segment: segment.name },
        };
      }
      const num = parseInt(value, 10);
      if (segment.min !== undefined && num < segment.min) {
        return {
          status: 'KO',
          errorCode: 'INVALID_SEGMENT',
          errorMessage: `Segment "${segment.name}" value ${num} is below minimum ${segment.min}`,
          details: { segment: segment.name, value: num, min: segment.min },
        };
      }
      if (segment.max !== undefined && num > segment.max) {
        return {
          status: 'KO',
          errorCode: 'INVALID_SEGMENT',
          errorMessage: `Segment "${segment.name}" value ${num} exceeds maximum ${segment.max}`,
          details: { segment: segment.name, value: num, max: segment.max },
        };
      }
      break;
    }

    case 'alpha': {
      const caseType = segment.case || 'both';
      if (caseType === 'upper' && !/^[A-Z]+$/.test(value)) {
        return {
          status: 'KO',
          errorCode: 'INVALID_SEGMENT',
          errorMessage: `Segment "${segment.name}" must be uppercase alpha`,
          details: { segment: segment.name },
        };
      }
      if (caseType === 'lower' && !/^[a-z]+$/.test(value)) {
        return {
          status: 'KO',
          errorCode: 'INVALID_SEGMENT',
          errorMessage: `Segment "${segment.name}" must be lowercase alpha`,
          details: { segment: segment.name },
        };
      }
      if (!/^[A-Za-z]+$/.test(value)) {
        return {
          status: 'KO',
          errorCode: 'INVALID_SEGMENT',
          errorMessage: `Segment "${segment.name}" must be alpha`,
          details: { segment: segment.name },
        };
      }
      break;
    }

    case 'alphanumeric':
      if (!/^[A-Za-z0-9]+$/.test(value)) {
        return {
          status: 'KO',
          errorCode: 'INVALID_SEGMENT',
          errorMessage: `Segment "${segment.name}" must be alphanumeric`,
          details: { segment: segment.name },
        };
      }
      break;

    case 'enum':
      if (!segment.values.includes(value)) {
        return {
          status: 'KO',
          errorCode: 'INVALID_SEGMENT',
          errorMessage: `Segment "${segment.name}" value "${value}" not in allowed values`,
          details: { segment: segment.name, allowed: segment.values },
        };
      }
      break;

    case 'date': {
      const dateError = validateDateSegment(value, segment.format, segment.name);
      if (dateError) return dateError;
      break;
    }

    case 'check':
      // Check digit validated in Phase 4
      break;
  }

  return null;
}

function validateDateSegment(
  value: string,
  format: string,
  segmentName: string,
): ValidationFailure | null {
  if (!/^\d+$/.test(value)) {
    return {
      status: 'KO',
      errorCode: 'INVALID_SEGMENT',
      errorMessage: `Segment "${segmentName}" date must be numeric`,
      details: { segment: segmentName },
    };
  }

  switch (format) {
    case 'YYYYMMDD': {
      if (value.length !== 8) break;
      const y = parseInt(value.substring(0, 4), 10);
      const m = parseInt(value.substring(4, 6), 10);
      const d = parseInt(value.substring(6, 8), 10);
      const date = new Date(y, m - 1, d);
      if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
        return {
          status: 'KO',
          errorCode: 'INVALID_SEGMENT',
          errorMessage: `Segment "${segmentName}" contains invalid date`,
          details: { segment: segmentName, value },
        };
      }
      break;
    }
    case 'YYMMDD': {
      if (value.length !== 6) break;
      const y2 = 2000 + parseInt(value.substring(0, 2), 10);
      const m2 = parseInt(value.substring(2, 4), 10);
      const d2 = parseInt(value.substring(4, 6), 10);
      const date2 = new Date(y2, m2 - 1, d2);
      if (date2.getFullYear() !== y2 || date2.getMonth() !== m2 - 1 || date2.getDate() !== d2) {
        return {
          status: 'KO',
          errorCode: 'INVALID_SEGMENT',
          errorMessage: `Segment "${segmentName}" contains invalid date`,
          details: { segment: segmentName, value },
        };
      }
      break;
    }
    case 'YYDDD': {
      if (value.length !== 5) break;
      const dayOfYear = parseInt(value.substring(2, 5), 10);
      if (dayOfYear < 1 || dayOfYear > 366) {
        return {
          status: 'KO',
          errorCode: 'INVALID_SEGMENT',
          errorMessage: `Segment "${segmentName}" contains invalid Julian day`,
          details: { segment: segmentName, value },
        };
      }
      break;
    }
  }

  return null;
}
