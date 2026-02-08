import { describe, it, expect } from 'vitest';
import { sha256, hmacSha256, generateApiKey, generateApiSecret } from '../../../src/utils/crypto.js';

describe('crypto utils', () => {
  it('sha256 produces consistent 64-char hex', () => {
    const hash = sha256('hello');
    expect(hash).toHaveLength(64);
    expect(sha256('hello')).toBe(hash);
  });

  it('sha256 produces different hashes for different inputs', () => {
    expect(sha256('hello')).not.toBe(sha256('world'));
  });

  it('hmacSha256 produces consistent output', () => {
    const mac = hmacSha256('data', 'secret');
    expect(mac).toHaveLength(64);
    expect(hmacSha256('data', 'secret')).toBe(mac);
  });

  it('hmacSha256 differs with different secrets', () => {
    expect(hmacSha256('data', 'secret1')).not.toBe(hmacSha256('data', 'secret2'));
  });

  it('generateApiKey starts with cg_ prefix', () => {
    const key = generateApiKey();
    expect(key.startsWith('cg_')).toBe(true);
    expect(key.length).toBeGreaterThan(10);
  });

  it('generateApiSecret produces 64-char hex', () => {
    const secret = generateApiSecret();
    expect(secret).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(secret)).toBe(true);
  });

  it('generates unique keys each time', () => {
    const keys = new Set(Array.from({ length: 10 }, () => generateApiKey()));
    expect(keys.size).toBe(10);
  });
});
