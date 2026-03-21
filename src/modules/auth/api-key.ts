import type { FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '../../utils/prisma.js';
import { hmacSha256 } from '../../utils/crypto.js';
import { getRedis } from '../../utils/redis.js';
import { config } from '../../config/index.js';

/**
 * Validation API auth: API Key + HMAC-SHA256 signature + nonce anti-replay.
 *
 * SECURITY improvements:
 * - Constant-time comparison for HMAC signatures (prevents timing attacks)
 * - Nonce-based anti-replay: each X-Nonce accepted only once within the tolerance window
 * - HMAC signs: method + path + timestamp + nonce + body (not just body)
 * - Reduced default tolerance to 60 seconds
 */
export async function verifyApiKey(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string | undefined;
  const signature = request.headers['x-signature'] as string | undefined;
  const timestamp = request.headers['x-timestamp'] as string | undefined;
  const nonce = request.headers['x-nonce'] as string | undefined;

  if (!apiKey || !signature || !timestamp) {
    reply.status(401).send({
      status: 'KO',
      error_code: 'AUTH_FAILED',
      error_message: 'Missing authentication headers (X-Api-Key, X-Signature, X-Timestamp)',
    });
    return;
  }

  // Timestamp validation (anti-replay)
  const requestTime = new Date(timestamp).getTime();
  const now = Date.now();
  const diffSeconds = Math.abs(now - requestTime) / 1000;

  if (isNaN(requestTime) || diffSeconds > config.hmacToleranceSeconds) {
    reply.status(401).send({
      status: 'KO',
      error_code: 'AUTH_FAILED',
      error_message: 'Request timestamp is too old or invalid',
    });
    return;
  }

  // Nonce anti-replay: if nonce is provided, verify it hasn't been used
  if (nonce) {
    const redis = getRedis();
    const nonceKey = `omnicodex:nonce:${apiKey}:${nonce}`;
    const wasSet = await redis.set(nonceKey, '1', 'EX', config.hmacToleranceSeconds * 2, 'NX');
    if (!wasSet) {
      reply.status(401).send({
        status: 'KO',
        error_code: 'AUTH_FAILED',
        error_message: 'Nonce already used (replay detected)',
      });
      return;
    }
  }

  // Look up tenant by API key
  const tenant = await prisma.tenant.findUnique({
    where: { apiKey },
  });

  if (!tenant || !tenant.isActive) {
    reply.status(401).send({
      status: 'KO',
      error_code: 'AUTH_FAILED',
      error_message: 'Invalid API key or tenant is inactive',
    });
    return;
  }

  // Compute HMAC over canonicalized request data
  // Sign: method + path + timestamp + nonce + body
  const body = typeof request.body === 'string'
    ? request.body
    : JSON.stringify(request.body || '');

  const signPayload = nonce
    ? `${request.method}\n${request.url}\n${timestamp}\n${nonce}\n${body}`
    : body; // Backwards compatible: if no nonce, sign just body (legacy clients)

  const expectedSignature = hmacSha256(signPayload, tenant.apiSecret);

  // SECURITY: Constant-time comparison to prevent timing attacks
  if (!constantTimeEqual(signature, expectedSignature)) {
    reply.status(401).send({
      status: 'KO',
      error_code: 'AUTH_FAILED',
      error_message: 'Invalid HMAC signature',
    });
    return;
  }

  // Attach tenant to request
  (request as any).tenant = tenant;
}

/**
 * Constant-time string comparison using timingSafeEqual.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return timingSafeEqual(bufA, bufB);
}
