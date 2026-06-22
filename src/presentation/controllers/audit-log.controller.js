import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditLogRepository } from '../../infrastructure/database/repositories/audit-log.repository.js';
import { CurrentUser } from '../../common/decorators/jwt-auth.js';
import { USER_ROLE } from '../../common/constants.js';
import { Logger } from '../../common/logger.js';

const logger = new Logger('AuditLogController');

export class AuditLogController {
  constructor() {
    this.auditRepo = null;
  }

  getAuditRepository() {
    this.auditRepo ??= new AuditLogRepository();
    return this.auditRepo;
  }

  async getAll(query, user) {
    logger.debug('GET /api/audit-logs', { userId: user.userId });

    if (user.role !== USER_ROLE.ADMIN) {
      throw { code: 'FORBIDDEN', message: 'Only admins can view audit logs' };
    }

    const filters = {};

    if (query.entityType) {
      filters.entityType = query.entityType;
    }

    if (query.action) {
      filters.action = query.action;
    }

    if (query.actor) {
      filters.actor = query.actor;
    }

    return await this.getAuditRepository().findAll(filters, {
      limit: parseInt(query.limit || '100', 10),
      offset: parseInt(query.offset || '0', 10),
    });
  }

  async getByCorrelationId(correlationId, user) {
    logger.debug('GET /api/audit-logs/correlation-id/:correlationId', { correlationId, userId: user.userId });

    if (user.role !== USER_ROLE.ADMIN) {
      throw { code: 'FORBIDDEN', message: 'Only admins can view audit logs' };
    }

    return await this.getAuditRepository().findByCorrelationId(correlationId);
  }

  async getByEntity(entityType, entityId, user) {
    logger.debug('GET /api/audit-logs/entity/:entityType/:entityId', { entityType, entityId, userId: user.userId });

    if (user.role !== USER_ROLE.ADMIN) {
      throw { code: 'FORBIDDEN', message: 'Only admins can view audit logs' };
    }

    return await this.getAuditRepository().findByEntity(entityType, entityId);
  }
}

Controller('api/audit-logs')(AuditLogController);
ApiTags('Audit Logs')(AuditLogController);
ApiBearerAuth()(AuditLogController);

const auditGetAll = Object.getOwnPropertyDescriptor(AuditLogController.prototype, 'getAll');
Get()(AuditLogController.prototype, 'getAll', auditGetAll);
ApiOperation({ summary: 'Get audit logs (Admin only)' })(AuditLogController.prototype, 'getAll', auditGetAll);
Query()(AuditLogController.prototype, 'getAll', 0);
CurrentUser()(AuditLogController.prototype, 'getAll', 1);

const auditByCorrelation = Object.getOwnPropertyDescriptor(AuditLogController.prototype, 'getByCorrelationId');
Get('correlation-id/:correlationId')(AuditLogController.prototype, 'getByCorrelationId', auditByCorrelation);
ApiOperation({ summary: 'Get audit logs by correlation ID' })(AuditLogController.prototype, 'getByCorrelationId', auditByCorrelation);
Param('correlationId')(AuditLogController.prototype, 'getByCorrelationId', 0);
CurrentUser()(AuditLogController.prototype, 'getByCorrelationId', 1);

const auditByEntity = Object.getOwnPropertyDescriptor(AuditLogController.prototype, 'getByEntity');
Get('entity/:entityType/:entityId')(AuditLogController.prototype, 'getByEntity', auditByEntity);
ApiOperation({ summary: 'Get audit logs for a specific entity' })(AuditLogController.prototype, 'getByEntity', auditByEntity);
Param('entityType')(AuditLogController.prototype, 'getByEntity', 0);
Param('entityId')(AuditLogController.prototype, 'getByEntity', 1);
CurrentUser()(AuditLogController.prototype, 'getByEntity', 2);
