/**
 * MOD11 — Weighted modulo 11.
 * Weights cycle: 2, 3, 4, 5, 6, 7, ... from rightmost digit.
 * If remainder is 0 → '0', if 1 → '0' (or 'X' in some variants).
 */
export function mod11Calculate(input: string): string {
  const digits = input.split('').map(Number).reverse();
  let sum = 0;
  let weight = 2;

  for (const d of digits) {
    sum += d * weight;
    weight++;
    if (weight > 7) weight = 2;
  }

  const remainder = sum % 11;
  if (remainder === 0) return '0';
  if (remainder === 1) return '0';
  return (11 - remainder).toString();
}

export function mod11Validate(input: string, checkDigit: string): boolean {
  return mod11Calculate(input) === checkDigit;
}
