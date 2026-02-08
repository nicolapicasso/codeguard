import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { hmacSha256 } from '../../utils/crypto.js';
import { config } from '../../config/index.js';

/**
 * Validation API auth: API Key + HMAC-SHA256 signature verification.
 */
export async function verifyApiKey(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string | undefined;
  const signature = request.headers['x-signature'] as string | undefined;
  const timestamp = request.headers['x-timestamp'] as string | undefined;

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

  // Verify HMAC signature
  const body = typeof request.body === 'string'
    ? request.body
    : JSON.stringify(request.body || '');
  const expectedSignature = hmacSha256(body, tenant.apiSecret);

  if (signature !== expectedSignature) {
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
