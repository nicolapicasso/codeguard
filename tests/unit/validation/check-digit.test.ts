import { describe, it, expect } from 'vitest';
import { luhnCalculate, luhnValidate } from '../../../src/modules/validation/check-digit/luhn.js';
import { mod10Calculate, mod10Validate } from '../../../src/modules/validation/check-digit/mod10.js';
import { mod11Calculate, mod11Validate } from '../../../src/modules/validation/check-digit/mod11.js';
import { mod97Calculate, mod97Validate } from '../../../src/modules/validation/check-digit/mod97.js';
import { verhoeffCalculate, verhoeffValidate } from '../../../src/modules/validation/check-digit/verhoeff.js';
import { dammCalculate, dammValidate } from '../../../src/modules/validation/check-digit/damm.js';

describe('Luhn algorithm', () => {
  it('calculates correct check digit', () => {
    // 7992739871 → check digit 3 (standard Luhn test case)
    expect(luhnCalculate('7992739871')).toBe('3');
  });

  it('validates correct check digit', () => {
    expect(luhnValidate('7992739871', '3')).toBe(true);
  });

  it('rejects wrong check digit', () => {
    expect(luhnValidate('7992739871', '5')).toBe(false);
  });

  it('works for simple inputs', () => {
    const check = luhnCalculate('123456789');
    expect(luhnValidate('123456789', check)).toBe(true);
  });
});

describe('MOD10 algorithm', () => {
  it('calculates sum mod 10', () => {
    // 1+2+3 = 6, 6 % 10 = 6
    expect(mod10Calculate('123')).toBe('6');
  });

  it('validates correct check digit', () => {
    expect(mod10Validate('123', '6')).toBe(true);
  });

  it('rejects wrong check digit', () => {
    expect(mod10Validate('123', '5')).toBe(false);
  });

  it('handles larger numbers', () => {
    // 9+8+7+6 = 30, 30 % 10 = 0
    expect(mod10Calculate('9876')).toBe('0');
  });
});

describe('MOD11 algorithm', () => {
  it('calculates weighted mod 11', () => {
    const check = mod11Calculate('12345');
    expect(mod11Validate('12345', check)).toBe(true);
  });

  it('rejects wrong check digit', () => {
    expect(mod11Validate('12345', '9')).toBe(false);
  });
});

describe('MOD97 algorithm', () => {
  it('calculates 2-digit check for numeric input', () => {
    const check = mod97Calculate('123456');
    expect(check.length).toBe(2);
    expect(mod97Validate('123456', check)).toBe(true);
  });

  it('handles alphanumeric input', () => {
    const check = mod97Calculate('ABC123');
    expect(check.length).toBe(2);
    expect(mod97Validate('ABC123', check)).toBe(true);
  });
});

describe('Verhoeff algorithm', () => {
  it('calculates correct check digit', () => {
    // Known: 236 → check digit 3
    expect(verhoeffCalculate('236')).toBe('3');
  });

  it('validates correct check digit', () => {
    expect(verhoeffValidate('236', '3')).toBe(true);
  });

  it('rejects wrong check digit', () => {
    expect(verhoeffValidate('236', '5')).toBe(false);
  });

  it('roundtrips for arbitrary input', () => {
    const check = verhoeffCalculate('123456789');
    expect(verhoeffValidate('123456789', check)).toBe(true);
  });
});

describe('Damm algorithm', () => {
  it('calculates correct check digit', () => {
    // Known: 572 → check digit 4
    expect(dammCalculate('572')).toBe('4');
  });

  it('validates correct check digit', () => {
    expect(dammValidate('572', '4')).toBe(true);
  });

  it('rejects wrong check digit', () => {
    expect(dammValidate('572', '7')).toBe(false);
  });

  it('roundtrips for arbitrary input', () => {
    const check = dammCalculate('987654321');
    expect(dammValidate('987654321', check)).toBe(true);
  });
});
