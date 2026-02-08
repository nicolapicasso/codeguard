import { describe, it, expect } from 'vitest';
import { validateSegments } from '../../../src/modules/validation/segments.js';
import type { StructureDefinition } from '../../../src/types/structure-def.js';

describe('segment validation', () => {
  it('validates fixed segment correctly', () => {
    const structureDef: StructureDefinition = {
      segments: [
        { name: 'prefix', type: 'fixed', length: 2, value: 'DN' },
        { name: 'code', type: 'alphanumeric', length: 3 },
      ],
    };

    const { error } = validateSegments('DNABC', structureDef);
    expect(error).toBeNull();
  });

  it('fails on wrong fixed value', () => {
    const structureDef: StructureDefinition = {
      segments: [
        { name: 'prefix', type: 'fixed', length: 2, value: 'DN' },
        { name: 'code', type: 'alphanumeric', length: 3 },
      ],
    };

    const { error } = validateSegments('XXABC', structureDef);
    expect(error).not.toBeNull();
    expect(error!.errorCode).toBe('INVALID_SEGMENT');
  });

  it('validates numeric segment with min/max', () => {
    const structureDef: StructureDefinition = {
      segments: [
        { name: 'year', type: 'numeric', length: 4, min: 2024, max: 2030 },
      ],
    };

    const { error: ok } = validateSegments('2026', structureDef);
    expect(ok).toBeNull();

    const { error: tooLow } = validateSegments('2020', structureDef);
    expect(tooLow).not.toBeNull();

    const { error: tooHigh } = validateSegments('2035', structureDef);
    expect(tooHigh).not.toBeNull();
  });

  it('validates enum segment', () => {
    const structureDef: StructureDefinition = {
      segments: [
        { name: 'type', type: 'enum', length: 1, values: ['A', 'B', 'C'] },
      ],
    };

    const { error: ok } = validateSegments('A', structureDef);
    expect(ok).toBeNull();

    const { error: invalid } = validateSegments('X', structureDef);
    expect(invalid).not.toBeNull();
  });

  it('validates date segment YYYYMMDD', () => {
    const structureDef: StructureDefinition = {
      segments: [
        { name: 'date', type: 'date', length: 8, format: 'YYYYMMDD' },
      ],
    };

    const { error: ok } = validateSegments('20260208', structureDef);
    expect(ok).toBeNull();

    const { error: invalid } = validateSegments('20261332', structureDef);
    expect(invalid).not.toBeNull();
  });

  it('parses segments into map', () => {
    const structureDef: StructureDefinition = {
      segments: [
        { name: 'prefix', type: 'fixed', length: 2, value: 'DN' },
        { name: 'year', type: 'numeric', length: 4 },
        { name: 'code', type: 'alphanumeric', length: 4 },
      ],
    };

    const { error, parsedSegments } = validateSegments('DN2026ABCD', structureDef);
    expect(error).toBeNull();
    expect(parsedSegments.get('prefix')).toBe('DN');
    expect(parsedSegments.get('year')).toBe('2026');
    expect(parsedSegments.get('code')).toBe('ABCD');
  });

  it('fails when segment exceeds code length', () => {
    const structureDef: StructureDefinition = {
      segments: [
        { name: 'code', type: 'alphanumeric', length: 20 },
      ],
    };

    const { error } = validateSegments('SHORT', structureDef);
    expect(error).not.toBeNull();
    expect(error!.errorCode).toBe('INVALID_SEGMENT');
  });
});
