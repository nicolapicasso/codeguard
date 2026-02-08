import type { CodeRule, Prisma } from '@prisma/client';
import type { ValidationFailure } from '../../types/validation.js';
import { sha256 } from '../../utils/crypto.js';
import { prisma } from '../../utils/prisma.js';
import { getRedlock } from '../../utils/redis.js';
import { config } from '../../config/index.js';

export interface UniquenessResult {
  error: ValidationFailure | null;
  redemptionId?: string;
  redeemedAt?: Date;
}

/**
 * Phase 6 — Uniqueness (Atomic Operation)
 * Hash the code, acquire Redis lock, INSERT ... ON CONFLICT DO NOTHING.
 */
export async function validateUniqueness(
  normalizedCode: string,
  codeRule: CodeRule,
  owUserId?: string,
  owTransactionId?: string,
  ipAddress?: string,
  metadata?: Record<string, unknown>,
): Promise<UniquenessResult> {
  const codeHash = sha256(normalizedCode);
  const lockKey = `codeguard:lock:${codeRule.id}:${codeHash}`;
  const redlock = getRedlock();

  let lock;
  try {
    lock = await redlock.acquire([lockKey], 5000);
  } catch {
    return {
      error: {
        status: 'KO',
        errorCode: 'ALREADY_REDEEMED',
        errorMessage: 'Could not acquire lock — possible concurrent redemption',
      },
    };
  }

  try {
    // Check if already redeemed
    const existing = await prisma.redeemedCode.findUnique({
      where: {
        codeRuleId_codeHash: { codeRuleId: codeRule.id, codeHash },
      },
    });

    if (existing) {
      // Check if multi-redemption is allowed
      if (existing.redemptionCount >= codeRule.maxRedemptions) {
        return {
          error: {
            status: 'KO',
            errorCode: 'ALREADY_REDEEMED',
            errorMessage: 'This code has already been redeemed',
            details: { redeemed_at: existing.redeemedAt.toISOString() },
          },
        };
      }

      // Increment redemption count
      const updated = await prisma.redeemedCode.update({
        where: { id: existing.id },
        data: { redemptionCount: { increment: 1 } },
      });

      return {
        error: null,
        redemptionId: updated.id,
        redeemedAt: updated.redeemedAt,
      };
    }

    // Insert new redeemed code
    const redeemed = await prisma.redeemedCode.create({
      data: {
        codeRuleId: codeRule.id,
        codeHash,
        codePlain: config.storePlainCodes ? normalizedCode : null,
        owUserId,
        owTransactionId,
        ipAddress,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    });

    return {
      error: null,
      redemptionId: redeemed.id,
      redeemedAt: redeemed.redeemedAt,
    };
  } finally {
    await lock.release();
  }
}
