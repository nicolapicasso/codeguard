import type { CodeRule, Tenant } from '@prisma/client';
import type { ValidationFailure } from '../../types/validation.js';
import { config } from '../../config/index.js';
import { lookupIp } from '../../utils/geoip.js';
import { logger } from '../../utils/logger.js';

export interface GeoFencingInput {
  codeRule: CodeRule;
  tenant: Tenant;
  ipAddress?: string;
  clientCountry?: string;  // Country sent by the client in the request body
}

export interface GeoFencingResult {
  error: ValidationFailure | null;
  detectedCountry: string | null;
}

/**
 * 3-tier geo-fencing validation:
 *
 * Tier 1 — Global banned countries (env var GLOBAL_BANNED_COUNTRIES)
 *   Blocks scanning from sanctioned or restricted countries globally.
 *
 * Tier 2 — Tenant banned countries (tenant.bannedCountries)
 *   Each tenant can ban specific countries from their codes.
 *
 * Tier 3 — Rule allowed countries (codeRule.allowedCountries)
 *   Each code rule can whitelist specific countries.
 *
 * Country detection priority:
 *   1. Auto-detect from IP via GeoIP database (trusted)
 *   2. Fall back to client-provided country (if IP detection fails)
 */
export function validateGeoFencing(input: GeoFencingInput): GeoFencingResult {
  const { codeRule, tenant, ipAddress, clientCountry } = input;

  // Detect country from IP
  let detectedCountry: string | null = null;
  if (ipAddress) {
    const geo = lookupIp(ipAddress);
    detectedCountry = geo.country;
  }

  // Use detected country, fall back to client-provided
  const country = detectedCountry || (clientCountry?.toUpperCase().trim() || null);

  // Check if any geo restrictions are active
  const hasGlobalBans = config.globalBannedCountries.length > 0;
  const hasTenantBans = (tenant as Tenant & { bannedCountries?: string[] }).bannedCountries?.length > 0;
  const ruleData = codeRule as CodeRule & { allowedCountries?: string[] };
  const hasRuleWhitelist = ruleData.allowedCountries && ruleData.allowedCountries.length > 0;
  const hasAnyGeoRestrictions = hasGlobalBans || hasTenantBans || hasRuleWhitelist;

  // If no geo restrictions configured, pass through
  if (!hasAnyGeoRestrictions) {
    return { error: null, detectedCountry };
  }

  // If geo restrictions exist but we can't determine the country
  if (!country) {
    if (config.geoRequireCountry) {
      return {
        error: {
          status: 'KO',
          errorCode: 'GEO_BLOCKED',
          errorMessage: 'Unable to determine your location. Country information is required.',
          details: { reason: 'country_undetectable' },
        },
        detectedCountry: null,
      };
    }
    // If not required, allow through (permissive mode)
    logger.warn({ ipAddress }, 'Geo restrictions active but country could not be determined — allowing request (permissive mode)');
    return { error: null, detectedCountry: null };
  }

  // Tier 1: Global banned countries
  if (hasGlobalBans && config.globalBannedCountries.includes(country)) {
    logger.info({ country, ip: ipAddress }, 'Request blocked by global geo ban');
    return {
      error: {
        status: 'KO',
        errorCode: 'GEO_BLOCKED',
        errorMessage: 'Service is not available in your country',
        details: { tier: 'global', country },
      },
      detectedCountry,
    };
  }

  // Tier 2: Tenant banned countries
  const tenantBannedCountries = (tenant as Tenant & { bannedCountries?: string[] }).bannedCountries || [];
  if (hasTenantBans && tenantBannedCountries.includes(country)) {
    logger.info({ country, ip: ipAddress, tenantId: tenant.id }, 'Request blocked by tenant geo ban');
    return {
      error: {
        status: 'KO',
        errorCode: 'GEO_BLOCKED',
        errorMessage: 'This code cannot be scanned from your country',
        details: { tier: 'tenant', country },
      },
      detectedCountry,
    };
  }

  // Tier 3: Rule allowed countries (whitelist — only specified countries allowed)
  if (hasRuleWhitelist && !ruleData.allowedCountries!.includes(country)) {
    logger.info({ country, ip: ipAddress, ruleId: codeRule.id }, 'Request blocked by rule geo whitelist');
    return {
      error: {
        status: 'KO',
        errorCode: 'GEO_BLOCKED',
        errorMessage: 'This code is not valid in your country',
        details: { tier: 'rule', country },
      },
      detectedCountry,
    };
  }

  return { error: null, detectedCountry };
}
