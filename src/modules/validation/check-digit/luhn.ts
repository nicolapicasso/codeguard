/**
 * Luhn algorithm — detects single-digit errors and adjacent transpositions.
 * Works on numeric strings.
 */
export function luhnCalculate(input: string): string {
  const digits = input.split('').map(Number).reverse();
  let sum = 0;

  for (let i = 0; i < digits.length; i++) {
    let d = digits[i];
    // Double even positions (0, 2, 4...) because check digit will occupy position 0
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit.toString();
}

export function luhnValidate(input: string, checkDigit: string): boolean {
  return luhnCalculate(input) === checkDigit;
}
