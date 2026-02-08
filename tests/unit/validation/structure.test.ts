import { describe, it, expect } from 'vitest';
import { validateStructure } from '../../../src/modules/validation/structure.js';

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    projectId: 'proj-1',
    name: 'Test Rule',
    skuReference: null,
    totalLength: 10,
    charset: 'ALPHANUMERIC' as const,
    customCharset: null,
    hasCheckDigit: false,
    checkAlgorithm: null,
    checkDigitPosition: null,
    structureDef: {},
    separator: null,
    caseSensitive: false,
    prefix: null,
    maxRedemptions: 1,
    productInfo: null,
    campaignInfo: null,
    pointsValue: null,
    customCheckFunction: null,
    allowedCountries: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('structure validation', () => {
  it('passes valid code and returns payload', () => {
    const rule = makeRule({ totalLength: 10, charset: 'ALPHANUMERIC' });
    const result = validateStructure('ABCD123456', rule);
    expect('payload' in result).toBe(true);
    if ('payload' in result) {
      expect(result.payload).toBe('ABCD123456');
    }
  });

  it('fails on wrong length', () => {
    const rule = makeRule({ totalLength: 10 });
    const result = validateStructure('SHORT', rule);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.errorCode).toBe('INVALID_STRUCTURE');
    }
  });

  it('fails on invalid charset (numeric only)', () => {
    const rule = makeRule({ totalLength: 5, charset: 'NUMERIC' });
    const result = validateStructure('ABC12', rule);
    expect('error' in result).toBe(true);
  });

  it('passes numeric charset', () => {
    const rule = makeRule({ totalLength: 5, charset: 'NUMERIC' });
    const result = validateStructure('12345', rule);
    expect('payload' in result).toBe(true);
  });

  it('fails on wrong prefix', () => {
    const rule = makeRule({ totalLength: 8, charset: 'ALPHANUMERIC', prefix: 'DN' });
    const result = validateStructure('XX12345678', rule);
    expect('error' in result).toBe(true);
  });

  it('passes correct prefix and strips it from payload', () => {
    const rule = makeRule({ totalLength: 8, charset: 'ALPHANUMERIC', prefix: 'DN' });
    const result = validateStructure('DN12345678', rule);
    expect('payload' in result).toBe(true);
    if ('payload' in result) {
      expect(result.payload).toBe('12345678');
    }
  });

  it('validates charset on payload only (prefix excluded)', () => {
    // Prefix "DAN" has letters, but charset is NUMERIC — should pass if payload is numeric
    const rule = makeRule({ totalLength: 4, charset: 'NUMERIC', prefix: 'DAN' });
    const result = validateStructure('DAN4444', rule);
    expect('payload' in result).toBe(true);
    if ('payload' in result) {
      expect(result.payload).toBe('4444');
    }
  });

  it('fails when payload does not match charset after prefix strip', () => {
    const rule = makeRule({ totalLength: 4, charset: 'NUMERIC', prefix: 'DAN' });
    const result = validateStructure('DANABCD', rule);
    expect('error' in result).toBe(true);
  });

  it('validates payload length excludes prefix length', () => {
    // totalLength = 4 segments, prefix = "DAN" (3 chars), full code = "DAN1234" (7 chars)
    const rule = makeRule({ totalLength: 4, charset: 'NUMERIC', prefix: 'DAN' });
    const result = validateStructure('DAN1234', rule);
    expect('payload' in result).toBe(true);

    // Same rule but wrong payload length
    const result2 = validateStructure('DAN12', rule);
    expect('error' in result2).toBe(true);
  });
});
