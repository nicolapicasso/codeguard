import { describe, it, expect } from 'vitest';
import { validateGeoFencing } from '../../../src/modules/validation/geo-fencing.js';

function makeRule(allowedCountries: string[] = []) {
  return {
    id: 'rule-1',
    projectId: 'proj-1',
    name: 'Test Rule',
    skuReference: null,
    generationMode: 'EXTERNAL' as const,
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
    fabricantSecret: null,
    allowedCountries,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeTenant(bannedCountries: string[] = []) {
  return {
    id: 'tenant-1',
    owTenantId: 'ow-1',
    name: 'Test Tenant',
    apiKey: 'key',
    apiSecret: 'secret',
    isActive: true,
    webhookUrl: null,
    bannedCountries,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('Geo-fencing', () => {
  it('should pass when no countries are configured', () => {
    const result = validateGeoFencing({ codeRule: makeRule([]), tenant: makeTenant(), clientCountry: 'ES' });
    expect(result.error).toBeNull();
  });

  it('should pass when no countries configured and no country sent', () => {
    const result = validateGeoFencing({ codeRule: makeRule([]), tenant: makeTenant() });
    expect(result.error).toBeNull();
  });

  it('should pass when country is in allowed list', () => {
    const result = validateGeoFencing({ codeRule: makeRule(['ES', 'MX', 'AR']), tenant: makeTenant(), clientCountry: 'ES' });
    expect(result.error).toBeNull();
  });

  it('should pass with case-insensitive country', () => {
    const result = validateGeoFencing({ codeRule: makeRule(['ES', 'MX']), tenant: makeTenant(), clientCountry: 'es' });
    expect(result.error).toBeNull();
  });

  it('should block when country is not in allowed list', () => {
    const result = validateGeoFencing({ codeRule: makeRule(['ES', 'MX']), tenant: makeTenant(), clientCountry: 'US' });
    expect(result.error).not.toBeNull();
    expect(result.error!.errorCode).toBe('GEO_BLOCKED');
  });

  it('should allow when countries are configured but none sent (permissive mode)', () => {
    const result = validateGeoFencing({ codeRule: makeRule(['ES', 'MX']), tenant: makeTenant() });
    // In permissive mode (default), undetectable country is allowed through
    expect(result.error).toBeNull();
  });
});
