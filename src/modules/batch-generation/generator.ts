import { randomInt, randomBytes } from 'node:crypto';
import type { CodeRule, CheckAlgorithm } from '@prisma/client';
import type { StructureDefinition, Segment } from '../../types/structure-def.js';
import { hmacSha256Base32 } from '../../utils/crypto.js';
import { getValidator } from '../validation/check-digit/index.js';

/**
 * Generate a single code according to the rule's structureDef.
 *
 * Two-pass strategy:
 *   Pass 1: Generate base segments (fixed, numeric, alpha, alphanumeric, enum, date)
 *   Pass 2: Generate derived segments (hmac, check) using values from pass 1
 */
export async function generateCode(
  codeRule: CodeRule,
  batchCreatedAt: Date,
): Promise<string> {
  const structureDef = codeRule.structureDef as unknown as StructureDefinition;
  const segments = structureDef.segments;
  const values = new Map<string, string>();

  // Pass 1: base segments
  for (const segment of segments) {
    if (segment.type === 'hmac' || segment.type === 'check') continue;
    values.set(segment.name, generateBaseSegment(segment, batchCreatedAt));
  }

  // Pass 2: derived segments (hmac first, then check — check may depend on hmac)
  for (const segment of segments) {
    if (segment.type === 'hmac') {
      const dataPayload = segment.appliesTo
        .map((name) => values.get(name) || '')
        .join('');
      const fabricantSecret = codeRule.fabricantSecret;
      if (!fabricantSecret) {
        throw new Error(`MANAGED rule ${codeRule.id} requires fabricantSecret for HMAC segment`);
      }
      const tag = hmacSha256Base32(dataPayload, fabricantSecret, segment.length);
      values.set(segment.name, tag);
    }
  }

  for (const segment of segments) {
    if (segment.type === 'check') {
      const dataSegments = segment.appliesTo
        .map((name) => values.get(name) || '')
        .join('');
      const checkValue = await calculateCheckDigit(
        codeRule.checkAlgorithm!,
        dataSegments,
      );
      // Pad or truncate to segment length
      values.set(segment.name, checkValue.substring(0, segment.length));
    }
  }

  // Assemble code in segment order
  const parts: string[] = [];
  for (const segment of segments) {
    parts.push(values.get(segment.name) || '');
  }

  // Add prefix if defined
  const prefix = codeRule.prefix || '';
  return prefix + parts.join('');
}

function generateBaseSegment(segment: Segment, batchCreatedAt: Date): string {
  switch (segment.type) {
    case 'fixed':
      return segment.value;

    case 'numeric': {
      const min = segment.min ?? 0;
      const max = segment.max ?? Math.pow(10, segment.length) - 1;
      const num = randomInt(min, max + 1);
      return num.toString().padStart(segment.length, '0');
    }

    case 'alpha': {
      const caseType = segment.case || 'upper';
      let charset: string;
      if (caseType === 'upper') charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      else if (caseType === 'lower') charset = 'abcdefghijklmnopqrstuvwxyz';
      else charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
      return randomString(segment.length, charset);
    }

    case 'alphanumeric':
      return randomString(segment.length, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');

    case 'enum': {
      const idx = randomInt(0, segment.values.length);
      return segment.values[idx].padEnd(segment.length, ' ').substring(0, segment.length);
    }

    case 'date':
      return formatDate(batchCreatedAt, segment.format, segment.length);

    default:
      return '';
  }
}

/**
 * Generate a cryptographically random string from the given charset.
 */
function randomString(length: number, charset: string): string {
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

function formatDate(date: Date, format: string, length: number): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();

  switch (format) {
    case 'YYYYMMDD':
      return `${y}${m.toString().padStart(2, '0')}${d.toString().padStart(2, '0')}`;
    case 'YYMMDD':
      return `${(y % 100).toString().padStart(2, '0')}${m.toString().padStart(2, '0')}${d.toString().padStart(2, '0')}`;
    case 'YYDDD': {
      const start = new Date(y, 0, 1);
      const diff = date.getTime() - start.getTime();
      const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
      return `${(y % 100).toString().padStart(2, '0')}${dayOfYear.toString().padStart(3, '0')}`;
    }
    default:
      return date.toISOString().replace(/\D/g, '').substring(0, length);
  }
}

async function calculateCheckDigit(algorithm: CheckAlgorithm, data: string): Promise<string> {
  const validator = getValidator(algorithm);
  if (!validator) {
    throw new Error(`Unsupported check algorithm: ${algorithm}`);
  }
  return validator.calculate(data);
}
