import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BalanceRepository } from '../../infrastructure/database/repositories/balance.repository.js';
import { AuditLogRepository } from '../../infrastructure/database/repositories/audit-log.repository.js';
import { OutboxEventRepository } from '../../infrastructure/database/repositories/outbox-event.repository.js';
import { GetReconciliationReportQuery } from '../../application/queries/index.js';
import { CurrentUser } from '../../common/decorators/jwt-auth.js';
import { USER_ROLE } from '../../common/constants.js';
import { Logger } from '../../common/logger.js';

const logger = new Logger('ReconciliationController');

export class ReconciliationController {
  constructor() {
    this.balanceRepo = null;
    this.auditRepo = null;
    this.outboxRepo = null;
  }

  getRepositories() {
    this.balanceRepo ??= new BalanceRepository();
    this.auditRepo ??= new AuditLogRepository();
    this.outboxRepo ??= new OutboxEventRepository();

    return {
      balanceRepo: this.balanceRepo,
      auditRepo: this.auditRepo,
      outboxRepo: this.outboxRepo,
    };
  }

  async getReport(user) {
    logger.debug('GET /api/reconciliation', { userId: user.userId });

    if (user.role !== USER_ROLE.ADMIN) {
      throw { code: 'FORBIDDEN', message: 'Only admins can view reconciliation reports' };
    }

    const getQuery = new GetReconciliationReportQuery();
    const { balanceRepo, auditRepo, outboxRepo } = this.getRepositories();
    return await getQuery.execute(balanceRepo, auditRepo, outboxRepo);
  }
}

Controller('api/reconciliation')(ReconciliationController);
ApiTags('Reconciliation')(ReconciliationController);
ApiBearerAuth()(ReconciliationController);

const reportDescriptor = Object.getOwnPropertyDescriptor(ReconciliationController.prototype, 'getReport');
Get()(ReconciliationController.prototype, 'getReport', reportDescriptor);
ApiOperation({ summary: 'Get reconciliation report (Admin only)' })(ReconciliationController.prototype, 'getReport', reportDescriptor);
CurrentUser()(ReconciliationController.prototype, 'getReport', 0);
