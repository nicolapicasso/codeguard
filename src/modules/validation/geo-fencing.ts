import type { CodeRule } from '@prisma/client';
import type { ValidationFailure } from '../../types/validation.js';

/**
 * Validates geo-fencing restrictions.
 * If a code rule has allowedCountries configured, the request must include
 * a country code that matches one of the allowed countries.
 */
export function validateGeoFencing(
  codeRule: CodeRule,
  country?: string,
): ValidationFailure | null {
  const ruleData = codeRule as CodeRule & { allowedCountries?: string[] };
  const allowedCountries = ruleData.allowedCountries;

  if (!allowedCountries || allowedCountries.length === 0) {
    return null; // No geo-fencing configured
  }

  if (!country) {
    return {
      status: 'KO',
      errorCode: 'GEO_BLOCKED',
      errorMessage: 'Country is required for this code rule',
    };
  }

  const normalizedCountry = country.toUpperCase().trim();
  if (!allowedCountries.includes(normalizedCountry)) {
    return {
      status: 'KO',
      errorCode: 'GEO_BLOCKED',
      errorMessage: 'This code cannot be redeemed from your country',
    };
  }

  return null;
}
