import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';

export interface JwtPayload {
  sub: string;
  role: 'admin';
  iat?: number;
  exp?: number;
}

/**
 * Generate a JWT token for admin users.
 */
export function generateToken(userId: string): string {
  return jwt.sign({ sub: userId, role: 'admin' }, config.jwtSecret, {
    expiresIn: '8h',
  });
}

/**
 * Verify JWT token — Admin API authentication.
 */
export async function verifyJwt(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({
      status: 'KO',
      error_code: 'AUTH_FAILED',
      error_message: 'Missing or invalid Authorization header',
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    (request as any).adminUser = payload;
  } catch {
    reply.status(401).send({
      status: 'KO',
      error_code: 'AUTH_FAILED',
      error_message: 'Invalid or expired token',
    });
  }
}
