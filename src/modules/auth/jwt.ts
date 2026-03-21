import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../../config/index.js';
import { prisma } from '../../utils/prisma.js';

export interface JwtPayload {
  sub: string;
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * Hash a password with SHA-256 + server pepper.
 * For a production system, use bcrypt/scrypt/argon2 instead.
 * We use SHA-256 here to avoid adding native dependencies (bcrypt).
 */
export function hashPassword(password: string): string {
  const pepper = config.jwtSecret; // reuse as pepper, not exposed to client
  return createHash('sha256').update(`${pepper}:${password}`).digest('hex');
}

/**
 * Verify a password against stored hash using constant-time comparison.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const candidateHash = hashPassword(password);
  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Generate a JWT token for authenticated admin users.
 * Token expires in 2 hours (reduced from 8h for security).
 */
export function generateToken(userId: string, role: string = 'admin'): string {
  return jwt.sign({ sub: userId, role }, config.jwtSecret, {
    expiresIn: '2h',
  });
}

/**
 * Authenticate admin user with username + password.
 * Returns JWT token on success, null on failure.
 */
export async function authenticateAdmin(
  username: string,
  password: string,
): Promise<{ token: string; expires_in: string; user: { id: string; username: string; role: string } } | null> {
  const user = await prisma.adminUser.findUnique({ where: { username } });

  if (!user || !user.isActive) return null;

  if (!verifyPassword(password, user.passwordHash)) return null;

  const token = generateToken(user.id, user.role);
  return {
    token,
    expires_in: '2h',
    user: { id: user.id, username: user.username, role: user.role },
  };
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

  const token = authHeader.substring(7).trim();
  if (!token) {
    reply.status(401).send({
      status: 'KO',
      error_code: 'AUTH_FAILED',
      error_message: 'Empty token',
    });
    return;
  }

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
