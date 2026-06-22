import { BaseRepository } from './base.repository.js';
import { getModels } from '../database.module.js';

/**
 * AuditLogRepository - immutable audit trail
 */
export class AuditLogRepository extends BaseRepository {
  constructor() {
    super(getModels().AuditLog);
  }

  /**
   * Get audit trail for an entity
   */
  async findByEntity(entityType, entityId, options = {}) {
    return this.findAll(
      { entityType, entityId },
      {
        ...options,
        order: [['createdAt', 'DESC']],
      },
    );
  }

  /**
   * Get audit trail by actor (employee)
   */
  async findByActor(actor, options = {}) {
    return this.findAll(
      { actor },
      {
        ...options,
        order: [['createdAt', 'DESC']],
      },
    );
  }

  /**
   * Get audit trail by correlation ID (for tracing related operations)
   */
  async findByCorrelationId(correlationId, options = {}) {
    return this.findAll(
      { correlationId },
      {
        ...options,
        order: [['createdAt', 'DESC']],
      },
    );
  }

  /**
   * Log an action (append-only)
   */
  async log(auditEntry, options = {}) {
    try {
      return await this.create({
        entityType: auditEntry.entityType,
        entityId: auditEntry.entityId,
        action: auditEntry.action,
        actor: auditEntry.actor,
        oldValue: auditEntry.oldValue || null,
        newValue: auditEntry.newValue || null,
        correlationId: auditEntry.correlationId,
        metadata: auditEntry.metadata || null,
      }, options);
    } catch (error) {
      this.logger.error('Failed to log audit entry', error);
      throw error;
    }
  }
}
