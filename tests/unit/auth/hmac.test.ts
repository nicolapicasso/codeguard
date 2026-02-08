import { describe, it, expect } from 'vitest';
import { signRequest, verifySignature } from '../../../src/modules/auth/hmac.js';

describe('HMAC auth', () => {
  const secret = 'test-secret-key-1234567890abcdef';

  it('generates consistent signatures', () => {
    const body = JSON.stringify({ code: 'ABC123', project_id: 'test' });
    const sig1 = signRequest(body, secret);
    const sig2 = signRequest(body, secret);
    expect(sig1).toBe(sig2);
  });

  it('verifies a correct signature', () => {
    const body = JSON.stringify({ code: 'ABC123' });
    const signature = signRequest(body, secret);
    expect(verifySignature(body, secret, signature)).toBe(true);
  });

  it('rejects a wrong signature', () => {
    const body = JSON.stringify({ code: 'ABC123' });
    const signature = signRequest(body, secret);
    expect(verifySignature(body, secret, signature + 'x')).toBe(false);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify({ code: 'ABC123' });
    const signature = signRequest(body, secret);
    const tampered = JSON.stringify({ code: 'XYZ999' });
    expect(verifySignature(tampered, secret, signature)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const body = JSON.stringify({ code: 'ABC123' });
    const signature = signRequest(body, secret);
    expect(verifySignature(body, 'wrong-secret', signature)).toBe(false);
  });
});
