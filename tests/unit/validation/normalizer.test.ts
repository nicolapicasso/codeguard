import { describe, it, expect } from 'vitest';
import { normalize } from '../../../src/modules/validation/normalizer.js';

function makeRule(overrides: Partial<Parameters<typeof normalize>[1]> = {}) {
  return {
    id: 'rule-1',
    projectId: 'proj-1',
    name: 'Test Rule',
    skuReference: null,
    totalLength: 15,
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

describe('normalizer', () => {
  it('trims whitespace', () => {
    const rule = makeRule();
    expect(normalize('  ABC123  ', rule)).toBe('ABC123');
  });

  it('removes separators', () => {
    const rule = makeRule({ separator: '-' });
    expect(normalize('DN-2026-ABCD', rule)).toBe('DN2026ABCD');
  });

  it('converts to uppercase when case insensitive', () => {
    const rule = makeRule({ caseSensitive: false });
    expect(normalize('abcDEF', rule)).toBe('ABCDEF');
  });

  it('preserves case when case sensitive', () => {
    const rule = makeRule({ caseSensitive: true });
    expect(normalize('abcDEF', rule)).toBe('abcDEF');
  });

  it('handles combined normalization', () => {
    const rule = makeRule({ separator: '-', caseSensitive: false });
    expect(normalize('  dn-2026-abcd  ', rule)).toBe('DN2026ABCD');
  });
});
