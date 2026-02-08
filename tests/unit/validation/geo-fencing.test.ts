import { describe, it, expect } from 'vitest';
import { validateGeoFencing } from '../../../src/modules/validation/geo-fencing.js';

function makeRule(allowedCountries: string[] = []) {
  return {
    id: 'rule-1',
    projectId: 'proj-1',
    name: 'Test Rule',
    skuReference: null,
    totalLength: 10,
    charset: 'NUMERIC' as const,
    customCharset: null,
    hasCheckDigit: false,
    checkAlgorithm: null,
    checkDigitPosition: null,
    structureDef: { segments: [] },
    separator: null,
    caseSensitive: false,
    prefix: null,
    maxRedemptions: 1,
    productInfo: null,
    campaignInfo: null,
    pointsValue: null,
    customCheckFunction: null,
    allowedCountries,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('Geo-fencing', () => {
  it('should pass when no countries are configured', () => {
    const result = validateGeoFencing(makeRule([]), 'ES');
    expect(result).toBeNull();
  });

  it('should pass when no countries configured and no country sent', () => {
    const result = validateGeoFencing(makeRule([]), undefined);
    expect(result).toBeNull();
  });

  it('should pass when country is in allowed list', () => {
    const result = validateGeoFencing(makeRule(['ES', 'MX', 'AR']), 'ES');
    expect(result).toBeNull();
  });

  it('should pass with case-insensitive country', () => {
    const result = validateGeoFencing(makeRule(['ES', 'MX']), 'es');
    expect(result).toBeNull();
  });

  it('should block when country is not in allowed list', () => {
    const result = validateGeoFencing(makeRule(['ES', 'MX']), 'US');
    expect(result).not.toBeNull();
    expect(result!.errorCode).toBe('GEO_BLOCKED');
  });

  it('should block when countries are configured but none sent', () => {
    const result = validateGeoFencing(makeRule(['ES', 'MX']), undefined);
    expect(result).not.toBeNull();
    expect(result!.errorCode).toBe('GEO_BLOCKED');
  });
});
