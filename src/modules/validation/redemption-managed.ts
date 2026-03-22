import type { CodeRule } from '@prisma/client';
import type { ValidationFailure } from '../../types/validation.js';
import { codeHash as computeCodeHash } from '../../utils/crypto.js';
import { prisma } from '../../utils/prisma.js';
import { getRedlock } from '../../utils/redis.js';
import { config } from '../../config/index.js';
import type { UniquenessResult } from './uniqueness.js';

/**
 * Phase 6 — MANAGED Mode Redemption
 *
 * Instead of INSERT (EXTERNAL mode), this performs a LOOKUP in issued_codes.
 * A code is only valid if it exists in the inventory with status ACTIVE.
 * Codes that match the structure but are not in inventory are rejected.
 */
export async function validateManagedRedemption(
  normalizedCode: string,
  codeRule: CodeRule,
  owUserId?: string,
): Promise<UniquenessResult> {
  const hash = computeCodeHash(normalizedCode, config.codeHashPepper);
  const lockKey = `omnicodex:lock:managed:${hash}`;
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
    // Find the issued code by hash — must belong to a batch of this rule
    const issuedCode = await prisma.issuedCode.findFirst({
      where: {
        codeHash: hash,
        batch: { codeRuleId: codeRule.id },
      },
      include: { batch: true },
    });

    if (!issuedCode) {
      return {
        error: {
          status: 'KO',
          errorCode: 'INVALID_CODE',
          errorMessage: 'Code not found in inventory',
        },
      };
    }

    // Check batch expiration
    if (issuedCode.batch.expiresAt && issuedCode.batch.expiresAt < new Date()) {
      return {
        error: {
          status: 'KO',
          errorCode: 'INVALID_CODE',
          errorMessage: 'Code has expired',
        },
      };
    }

    // Check code status
    switch (issuedCode.status) {
      case 'REDEEMED': {
        // Check if multi-redemption is allowed
        if (issuedCode.redemptionCount >= codeRule.maxRedemptions) {
          return {
            error: {
              status: 'KO',
              errorCode: 'ALREADY_REDEEMED',
              errorMessage: 'This code has already been redeemed',
              details: { redeemed_at: issuedCode.redeemedAt!.toISOString() },
            },
          };
        }

        // Increment redemption count
        const updated = await prisma.issuedCode.update({
          where: { id: issuedCode.id },
          data: { redemptionCount: { increment: 1 } },
        });

        return {
          error: null,
          redemptionId: updated.id,
          redeemedAt: updated.redeemedAt!,
        };
      }

      case 'EXPIRED':
        return {
          error: {
            status: 'KO',
            errorCode: 'INVALID_CODE',
            errorMessage: 'Code has expired',
          },
        };

      case 'REVOKED':
        return {
          error: {
            status: 'KO',
            errorCode: 'INVALID_CODE',
            errorMessage: 'Code has been revoked',
          },
        };

      case 'ACTIVE': {
        // Mark as redeemed
        const redeemed = await prisma.issuedCode.update({
          where: { id: issuedCode.id },
          data: {
            status: 'REDEEMED',
            redeemedAt: new Date(),
            redeemedByUser: owUserId || null,
            redemptionCount: 1,
          },
        });

        return {
          error: null,
          redemptionId: redeemed.id,
          redeemedAt: redeemed.redeemedAt!,
        };
      }

      default:
        return {
          error: {
            status: 'KO',
            errorCode: 'INVALID_CODE',
            errorMessage: 'Invalid code status',
          },
        };
    }
  } finally {
    await lock.release();
  }
}
