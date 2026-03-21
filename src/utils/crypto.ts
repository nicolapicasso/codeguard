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
