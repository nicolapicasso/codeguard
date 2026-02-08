/**
 * MOD97 — ISO 7064, for longer alphanumeric codes.
 * Letters are converted: A=10, B=11, ..., Z=35.
 * Returns 2-digit check string (00-96).
 */
export function mod97Calculate(input: string): string {
  const numeric = input
    .toUpperCase()
    .split('')
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 48 && code <= 57) return ch;
      if (code >= 65 && code <= 90) return (code - 55).toString();
      return '';
    })
    .join('');

  let remainder = BigInt(numeric) % 97n;
  let check = 98n - remainder;
  return check.toString().padStart(2, '0');
}

export function mod97Validate(input: string, checkDigit: string): boolean {
  return mod97Calculate(input) === checkDigit;
}
