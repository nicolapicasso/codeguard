import { createHash, createHmac, randomBytes, createSecretKey } from 'node:crypto';

export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * HMAC-SHA256 using KeyObject for secure secret handling.
 */
export function hmacSha256(data: string, secret: string): string {
  const key = createSecretKey(Buffer.from(secret, 'utf8'));
  return createHmac('sha256', key).update(data).digest('hex');
}

/**
 * HMAC-keyed hash for code storage.
 *
 * SECURITY: Instead of plain SHA-256 (vulnerable to rainbow tables if codes
 * have low entropy), we use HMAC-SHA256 keyed by a server pepper.
 * Even if the DB is compromised, codes cannot be reversed without the pepper.
 *
 * @param code - The normalized code to hash
 * @param pepper - Server-side secret (CODE_HASH_PEPPER env var)
 */
export function codeHash(code: string, pepper: string): string {
  return hmacSha256(code, pepper);
}

export function generateApiKey(): string {
  return `cg_${randomBytes(24).toString('hex')}`;
}

export function generateApiSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Encode a hex string as BASE32 (RFC 4648, uppercase, no padding).
 *
 * Used for HMAC TAG segments: the fabricant generates HMAC-SHA256,
 * then encodes the result as BASE32 before truncating to segment length.
 * BASE32 uses A-Z and 2-7, which avoids ambiguous characters (0/O, 1/I/L)
 * and is case-insensitive — ideal for printed codes.
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function hexToBase32(hex: string): string {
  const bytes = Buffer.from(hex, 'hex');
  let bits = '';
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0');
  }

  let result = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    const chunk = parseInt(bits.substring(i, i + 5), 2);
    result += BASE32_ALPHABET[chunk];
  }

  return result;
}

/**
 * Compute HMAC-SHA256 and return result as BASE32 (truncated to given length).
 */
export function hmacSha256Base32(data: string, secret: string, truncateLength?: number): string {
  const fullHmac = hmacSha256(data, secret);
  const base32 = hexToBase32(fullHmac);
  return truncateLength ? base32.substring(0, truncateLength) : base32;
}
