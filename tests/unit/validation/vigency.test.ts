import { describe, it, expect } from 'vitest';
import { validateVigency } from '../../../src/modules/validation/vigency.js';
import type { Project, CodeRule } from '@prisma/client';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    tenantId: 'tenant-1',
    name: 'Test Project',
    description: null,
    startsAt: null,
    endsAt: null,
    isActive: true,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCodeRule(overrides: Partial<CodeRule> = {}): CodeRule {
  return {
    id: 'rule-1',
    projectId: 'proj-1',
    name: 'Test Rule',
    skuReference: null,
    totalLength: 15,
    charset: 'ALPHANUMERIC',
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

describe('vigency validation', () => {
  it('passes when project and rule are active with no date bounds', () => {
    const result = validateVigency(makeProject(), makeCodeRule());
    expect(result).toBeNull();
  });

  it('fails when project is inactive', () => {
    const result = validateVigency(makeProject({ isActive: false }), makeCodeRule());
    expect(result).not.toBeNull();
    expect(result!.errorCode).toBe('PROJECT_INACTIVE');
  });

  it('fails when rule is inactive', () => {
    const result = validateVigency(makeProject(), makeCodeRule({ isActive: false }));
    expect(result).not.toBeNull();
    expect(result!.errorCode).toBe('RULE_INACTIVE');
  });

  it('fails when project has not started', () => {
    const future = new Date(Date.now() + 86400000);
    const result = validateVigency(makeProject({ startsAt: future }), makeCodeRule());
    expect(result).not.toBeNull();
    expect(result!.errorCode).toBe('PROJECT_EXPIRED');
  });

  it('fails when project has ended', () => {
    const past = new Date(Date.now() - 86400000);
    const result = validateVigency(makeProject({ endsAt: past }), makeCodeRule());
    expect(result).not.toBeNull();
    expect(result!.errorCode).toBe('PROJECT_EXPIRED');
  });

  it('passes when within date range', () => {
    const past = new Date(Date.now() - 86400000);
    const future = new Date(Date.now() + 86400000);
    const result = validateVigency(
      makeProject({ startsAt: past, endsAt: future }),
      makeCodeRule(),
    );
    expect(result).toBeNull();
  });
});
