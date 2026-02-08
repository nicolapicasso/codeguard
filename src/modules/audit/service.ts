import { logger } from '../../utils/logger.js';

export interface AuditEntry {
  action: string;
  entity: string;
  entityId: string;
  userId?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Audit logging — Phase 2 will add persistence.
 * For now, logs structured JSON via pino.
 */
export function logAudit(entry: Omit<AuditEntry, 'timestamp'>): void {
  logger.info({ audit: { ...entry, timestamp: new Date().toISOString() } }, `Audit: ${entry.action} ${entry.entity}`);
}
