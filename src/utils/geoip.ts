import geoip from 'geoip-lite';
import { logger } from './logger.js';

export interface GeoLookupResult {
  country: string | null;  // ISO 3166-1 alpha-2 (e.g., "ES", "US", "MX")
  region: string | null;
  city: string | null;
  ll: [number, number] | null;  // [latitude, longitude]
}

/**
 * Looks up the geographic location of an IP address.
 * Returns null fields if the IP cannot be geolocated (e.g., private IPs, localhost).
 */
export function lookupIp(ip: string): GeoLookupResult {
  // Strip IPv6 prefix for IPv4-mapped addresses (e.g., "::ffff:127.0.0.1")
  const cleanIp = ip.replace(/^::ffff:/, '');

  // Skip private/local IPs
  if (isPrivateIp(cleanIp)) {
    return { country: null, region: null, city: null, ll: null };
  }

  try {
    const geo = geoip.lookup(cleanIp);
    if (!geo) {
      logger.debug({ ip: cleanIp }, 'GeoIP lookup returned no result');
      return { country: null, region: null, city: null, ll: null };
    }

    return {
      country: geo.country || null,
      region: geo.region || null,
      city: geo.city || null,
      ll: geo.ll || null,
    };
  } catch (err) {
    logger.warn({ ip: cleanIp, err }, 'GeoIP lookup failed');
    return { country: null, region: null, city: null, ll: null };
  }
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === 'localhost' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}
