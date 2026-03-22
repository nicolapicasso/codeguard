import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'node:crypto';

/**
 * Derive a per-batch encryption key using HKDF-like construction.
 * Key = HMAC-SHA256(masterKey, batchId) → 32 bytes for AES-256.
 */
function deriveKey(masterKey: string, batchId: string): Buffer {
  return Buffer.from(
    createHmac('sha256', masterKey).update(batchId).digest(),
  );
}

/**
 * Encrypt a code with AES-256-GCM using a per-batch derived key.
 * Returns: iv:authTag:ciphertext (all hex-encoded, colon-separated).
 */
export function encryptCode(plainCode: string, masterKey: string, batchId: string): string {
  const key = deriveKey(masterKey, batchId);
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plainCode, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a code encrypted with encryptCode.
 */
export function decryptCode(encryptedData: string, masterKey: string, batchId: string): string {
  const key = deriveKey(masterKey, batchId);
  const [ivHex, authTagHex, ciphertext] = encryptedData.split(':');

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
