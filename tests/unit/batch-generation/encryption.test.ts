import { describe, it, expect } from 'vitest';
import { encryptCode, decryptCode } from '../../../src/utils/encryption.js';

describe('code encryption', () => {
  const masterKey = 'test-master-encryption-key';
  const batchId = 'batch-uuid-123';

  it('encrypts and decrypts code correctly', () => {
    const plainCode = 'TST42K7M3P9';
    const encrypted = encryptCode(plainCode, masterKey, batchId);
    const decrypted = decryptCode(encrypted, masterKey, batchId);

    expect(decrypted).toBe(plainCode);
  });

  it('produces different ciphertext for same plaintext (random IV)', () => {
    const plainCode = 'SAME_CODE_123';
    const enc1 = encryptCode(plainCode, masterKey, batchId);
    const enc2 = encryptCode(plainCode, masterKey, batchId);

    // Different IVs → different ciphertext
    expect(enc1).not.toBe(enc2);

    // Both decrypt to same value
    expect(decryptCode(enc1, masterKey, batchId)).toBe(plainCode);
    expect(decryptCode(enc2, masterKey, batchId)).toBe(plainCode);
  });

  it('uses per-batch key derivation', () => {
    const plainCode = 'CODE_ABC';
    const enc1 = encryptCode(plainCode, masterKey, 'batch-1');
    const enc2 = encryptCode(plainCode, masterKey, 'batch-2');

    // Decrypt with correct batch ID works
    expect(decryptCode(enc1, masterKey, 'batch-1')).toBe(plainCode);
    expect(decryptCode(enc2, masterKey, 'batch-2')).toBe(plainCode);

    // Decrypt with wrong batch ID fails
    expect(() => decryptCode(enc1, masterKey, 'batch-2')).toThrow();
  });

  it('fails with wrong master key', () => {
    const plainCode = 'SECRET_CODE';
    const encrypted = encryptCode(plainCode, masterKey, batchId);

    expect(() => decryptCode(encrypted, 'wrong-key', batchId)).toThrow();
  });

  it('encrypted format is iv:authTag:ciphertext', () => {
    const encrypted = encryptCode('TEST', masterKey, batchId);
    const parts = encrypted.split(':');
    expect(parts.length).toBe(3);

    // IV = 12 bytes = 24 hex chars
    expect(parts[0].length).toBe(24);
    // Auth tag = 16 bytes = 32 hex chars
    expect(parts[1].length).toBe(32);
    // Ciphertext is non-empty
    expect(parts[2].length).toBeGreaterThan(0);
  });
});
