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

/**
 * HMAC-SHA256 returning raw bytes (Buffer) for further encoding.
 */
export function hmacSha256Raw(data: string, secret: string): Buffer {
  const key = createSecretKey(Buffer.from(secret, 'utf8'));
  return createHmac('sha256', key).update(data).digest();
}

// ── BASE32 (RFC 4648) ──────────────────────────────────────────────────
// Used for HMAC TAG encoding: more compact than hex (5 bits/char vs 4 bits/char).
// Alphabet: A-Z, 2-7 (no padding, uppercase).

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encode a Buffer to BASE32 string (RFC 4648, no padding).
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Compute HMAC-SHA256 of data, then encode as BASE32 and truncate.
 * Used by fabricants to generate TAG segments and by OmniCodex to verify them.
 *
 * @param data - Payload to authenticate
 * @param secret - Shared secret (fabricantSecret)
 * @param length - Desired output length in BASE32 characters
 * @returns Truncated BASE32-encoded HMAC
 */
export function hmacTagBase32(data: string, secret: string, length: number): string {
  const raw = hmacSha256Raw(data, secret);
  const full = base32Encode(raw);
  return full.substring(0, length);
}

export function generateApiKey(): string {
  return `cg_${randomBytes(24).toString('hex')}`;
}

export function generateApiSecret(): string {
  return randomBytes(32).toString('hex');
}
