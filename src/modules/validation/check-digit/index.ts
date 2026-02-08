import type { CheckAlgorithm } from '@prisma/client';
import { luhnCalculate, luhnValidate } from './luhn.js';
import { mod10Calculate, mod10Validate } from './mod10.js';
import { mod11Calculate, mod11Validate } from './mod11.js';
import { mod97Calculate, mod97Validate } from './mod97.js';
import { verhoeffCalculate, verhoeffValidate } from './verhoeff.js';
import { dammCalculate, dammValidate } from './damm.js';
import { customValidate } from './custom.js';

export interface CheckDigitValidator {
  validate(input: string, checkDigit: string): boolean | Promise<boolean>;
  calculate(input: string): string | Promise<string>;
}

const validators: Record<Exclude<CheckAlgorithm, 'CUSTOM'>, CheckDigitValidator> = {
  LUHN: { validate: luhnValidate, calculate: luhnCalculate },
  MOD10: { validate: mod10Validate, calculate: mod10Calculate },
  MOD11: { validate: mod11Validate, calculate: mod11Calculate },
  MOD97: { validate: mod97Validate, calculate: mod97Calculate },
  VERHOEFF: { validate: verhoeffValidate, calculate: verhoeffCalculate },
  DAMM: { validate: dammValidate, calculate: dammCalculate },
};

export function getValidator(algorithm: CheckAlgorithm): CheckDigitValidator | null {
  if (algorithm === 'CUSTOM') return null;
  return validators[algorithm] || null;
}

export async function validateCheckDigit(
  algorithm: CheckAlgorithm,
  input: string,
  checkDigit: string,
  customFunction?: string | null,
): Promise<boolean> {
  if (algorithm === 'CUSTOM' && customFunction) {
    return customValidate(input, checkDigit, customFunction);
  }

  const validator = getValidator(algorithm);
  if (!validator) return false;

  return validator.validate(input, checkDigit);
}
