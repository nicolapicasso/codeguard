import { hmacSha256 } from '../../utils/crypto.js';

/**
 * Generate HMAC-SHA256 signature for a request body.
 * Used by clients to sign their requests.
 */
export function signRequest(body: string, secret: string): string {
  return hmacSha256(body, secret);
}

/**
 * Verify HMAC-SHA256 signature.
 */
export function verifySignature(body: string, secret: string, signature: string): boolean {
  const expected = hmacSha256(body, secret);
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}
