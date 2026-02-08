/**
 * MOD10 — Simple digit sum modulo 10.
 */
export function mod10Calculate(input: string): string {
  const sum = input.split('').reduce((acc, ch) => acc + parseInt(ch, 10), 0);
  return (sum % 10).toString();
}

export function mod10Validate(input: string, checkDigit: string): boolean {
  return mod10Calculate(input) === checkDigit;
}
