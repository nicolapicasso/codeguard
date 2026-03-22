import { describe, it, expect } from 'vitest';
import { generateCode } from '../../../src/modules/batch-generation/generator.js';
import type { CodeRule } from '@prisma/client';

function makeMockRule(overrides: Partial<CodeRule> = {}): CodeRule {
  return {
    id: 'rule-1',
    projectId: 'proj-1',
    name: 'Test Rule',
    skuReference: null,
    generationMode: 'MANAGED',
    totalLength: 12,
    charset: 'ALPHANUMERIC',
    customCharset: null,
    hasCheckDigit: false,
    checkAlgorithm: null,
    checkDigitPosition: null,
    structureDef: {
      segments: [
        { name: 'prefix', type: 'fixed', length: 3, value: 'TST' },
        { name: 'serial', type: 'alphanumeric', length: 6 },
        { name: 'batch', type: 'numeric', length: 3 },
      ],
    },
    separator: null,
    caseSensitive: false,
    prefix: null,
    maxRedemptions: 1,
    productInfo: null,
    campaignInfo: null,
    pointsValue: null,
    customCheckFunction: null,
    fabricantSecret: null,
    allowedCountries: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CodeRule;
}

describe('code generator', () => {
  it('generates codes with correct length for basic segments', async () => {
    const rule = makeMockRule();
    const batchDate = new Date('2026-03-22T10:00:00Z');

    const code = await generateCode(rule, batchDate);

    // prefix (3) + serial (6) + batch (3) = 12
    expect(code.length).toBe(12);
    expect(code.startsWith('TST')).toBe(true);
  });

  it('generates unique codes on successive calls', async () => {
    const rule = makeMockRule();
    const batchDate = new Date('2026-03-22T10:00:00Z');

    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(await generateCode(rule, batchDate));
    }

    // With 6 alphanumeric chars (36^6 = ~2.17 billion), 50 codes should all be unique
    expect(codes.size).toBe(50);
  });

  it('generates numeric segments with correct padding', async () => {
    const rule = makeMockRule({
      structureDef: {
        segments: [
          { name: 'num', type: 'numeric', length: 5 },
        ],
      },
      totalLength: 5,
    });

    const code = await generateCode(rule, new Date());
    expect(code.length).toBe(5);
    expect(/^\d{5}$/.test(code)).toBe(true);
  });

  it('generates date segment in YYYYMMDD format', async () => {
    const rule = makeMockRule({
      structureDef: {
        segments: [
          { name: 'date', type: 'date', length: 8, format: 'YYYYMMDD' },
        ],
      },
      totalLength: 8,
    });

    const batchDate = new Date('2026-03-22T00:00:00Z');
    const code = await generateCode(rule, batchDate);
    expect(code).toBe('20260322');
  });

  it('generates HMAC segment when fabricantSecret is provided', async () => {
    const rule = makeMockRule({
      fabricantSecret: 'test-secret-key',
      structureDef: {
        segments: [
          { name: 'serial', type: 'alphanumeric', length: 6 },
          { name: 'auth', type: 'hmac', length: 6, appliesTo: ['serial'] },
        ],
      },
      totalLength: 12,
    });

    const code = await generateCode(rule, new Date());
    expect(code.length).toBe(12);
  });

  it('generates check digit segment', async () => {
    const rule = makeMockRule({
      hasCheckDigit: true,
      checkAlgorithm: 'LUHN',
      structureDef: {
        segments: [
          { name: 'num', type: 'numeric', length: 5 },
          { name: 'check', type: 'check', length: 1, algorithm: 'luhn', appliesTo: ['num'] },
        ],
      },
      totalLength: 6,
    });

    const code = await generateCode(rule, new Date());
    expect(code.length).toBe(6);
    // The last character should be a valid Luhn check digit
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it('generates fixed segments with exact value', async () => {
    const rule = makeMockRule({
      structureDef: {
        segments: [
          { name: 'prefix', type: 'fixed', length: 4, value: 'OMNI' },
        ],
      },
      totalLength: 4,
    });

    const code = await generateCode(rule, new Date());
    expect(code).toBe('OMNI');
  });

  it('generates enum segments from allowed values', async () => {
    const rule = makeMockRule({
      structureDef: {
        segments: [
          { name: 'type', type: 'enum', length: 2, values: ['AB', 'CD', 'EF'] },
        ],
      },
      totalLength: 2,
    });

    const code = await generateCode(rule, new Date());
    expect(['AB', 'CD', 'EF']).toContain(code);
  });

  it('applies prefix from codeRule', async () => {
    const rule = makeMockRule({
      prefix: 'PRE',
      structureDef: {
        segments: [
          { name: 'serial', type: 'numeric', length: 4 },
        ],
      },
      totalLength: 7, // PRE + 4 digits
    });

    const code = await generateCode(rule, new Date());
    expect(code.startsWith('PRE')).toBe(true);
    expect(code.length).toBe(7);
  });
});
