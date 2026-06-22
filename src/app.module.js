import { Module } from '@nestjs/common';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { HealthController } from './presentation/controllers/health.controller.js';
import { TimeOffRequestController } from './presentation/controllers/time-off-request.controller.js';
import { BalanceController } from './presentation/controllers/balance.controller.js';
import { ReconciliationController } from './presentation/controllers/reconciliation.controller.js';
import { AuditLogController } from './presentation/controllers/audit-log.controller.js';

export class AppModule {}

Module({
  imports: [DatabaseModule],
  controllers: [
    HealthController,
    TimeOffRequestController,
    BalanceController,
    ReconciliationController,
    AuditLogController,
  ],
})(AppModule);
