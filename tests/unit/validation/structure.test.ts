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
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('structure validation', () => {
  it('passes valid code', () => {
    const rule = makeRule({ totalLength: 10, charset: 'ALPHANUMERIC' });
    expect(validateStructure('ABCD123456', rule)).toBeNull();
  });

  it('fails on wrong length', () => {
    const rule = makeRule({ totalLength: 10 });
    const result = validateStructure('SHORT', rule);
    expect(result).not.toBeNull();
    expect(result!.errorCode).toBe('INVALID_STRUCTURE');
  });

  it('fails on invalid charset (numeric only)', () => {
    const rule = makeRule({ totalLength: 5, charset: 'NUMERIC' });
    const result = validateStructure('ABC12', rule);
    expect(result).not.toBeNull();
    expect(result!.errorCode).toBe('INVALID_STRUCTURE');
  });

  it('passes numeric charset', () => {
    const rule = makeRule({ totalLength: 5, charset: 'NUMERIC' });
    expect(validateStructure('12345', rule)).toBeNull();
  });

  it('fails on wrong prefix', () => {
    const rule = makeRule({ totalLength: 10, charset: 'ALPHANUMERIC', prefix: 'DN' });
    const result = validateStructure('XX12345678', rule);
    expect(result).not.toBeNull();
    expect(result!.errorCode).toBe('INVALID_STRUCTURE');
  });

  it('passes correct prefix', () => {
    const rule = makeRule({ totalLength: 10, charset: 'ALPHANUMERIC', prefix: 'DN' });
    expect(validateStructure('DN12345678', rule)).toBeNull();
  });
});
