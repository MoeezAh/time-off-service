import { Logger } from '../../common/logger.js';
import { BalanceRepository } from '../../infrastructure/database/repositories/balance.repository.js';
import { AuditLogRepository } from '../../infrastructure/database/repositories/audit-log.repository.js';
import { OutboxEventRepository } from '../../infrastructure/database/repositories/outbox-event.repository.js';
import { AUDIT_ACTION, EVENT_TYPE } from '../../common/constants.js';
import { v4 as uuidv4 } from 'uuid';
import { getSequelize } from '../../infrastructure/database/config.js';

const SYSTEM_ID = '00000000-0000-0000-0000-000000000000';

/**
 * SyncBalancesFromHcmHandler
 *
 * Flow:
 * 1. Fetch complete balance corpus from HCM
 * 2. Compare with local balances
 * 3. Detect drifts and anomalies
 * 4. Update local balances
 * 5. Publish sync events
 * 6. Generate reconciliation report
 */
export class SyncBalancesFromHcmHandler {
  constructor(dependencies = {}) {
    this.logger = new Logger('SyncBalancesFromHcmHandler');
    this.balanceRepo = dependencies.balanceRepo || new BalanceRepository();
    this.auditRepo = dependencies.auditRepo || new AuditLogRepository();
    this.outboxRepo = dependencies.outboxRepo || new OutboxEventRepository();
    this.sequelize = dependencies.sequelize || getSequelize();
  }

  async execute(command) {
    const correlationId = uuidv4();
    this.logger.debug('Starting SyncBalancesFromHcm', { correlationId });

    const syncReport = {
      correlationId,
      startTime: new Date(),
      localBalances: [],
      hcmBalances: command.balances.length,
      drifts: [],
      updates: [],
      errors: [],
    };

    try {
      await this.sequelize.transaction(async (transaction) => {
        const options = { transaction };
        const localBalances = await this.balanceRepo.findAll({}, options);
        syncReport.localBalances = localBalances.length;

        for (const localBalance of localBalances) {
          const hcmBalance = command.balances.find(
            (item) =>
              item.employeeId === localBalance.employeeId &&
              item.locationId === localBalance.locationId &&
              item.leaveTypeId === localBalance.leaveTypeId,
          );

          if (!hcmBalance) {
            syncReport.drifts.push({
              type: 'MISSING_IN_HCM',
              balanceId: localBalance.id,
              employeeId: localBalance.employeeId,
            });
            await this.balanceRepo.update(localBalance.id, { syncStatus: 'FAILED' }, options);
            continue;
          }

          const hcmTotal = Number(hcmBalance.balance ?? hcmBalance.availableBalance);
          if (!Number.isFinite(hcmTotal) || hcmTotal < 0) {
            syncReport.errors.push({
              balanceId: localBalance.id,
              error: 'HCM balance must be a non-negative number',
            });
            continue;
          }

          const reserved = Number(localBalance.reservedBalance);
          const reconciledAvailable = Math.max(0, hcmTotal - reserved);
          if (Number(localBalance.availableBalance) !== reconciledAvailable) {
            syncReport.drifts.push({
              type: 'BALANCE_MISMATCH',
              balanceId: localBalance.id,
              localAvailable: Number(localBalance.availableBalance),
              hcmTotal,
              reconciledAvailable,
            });
          }

          await this.balanceRepo.updateWithLocking(
            localBalance.id,
            {
              availableBalance: reconciledAvailable,
              syncStatus: 'SYNCED',
              lastSyncedAt: new Date(),
            },
            localBalance.version,
            options,
          );
          syncReport.updates.push(localBalance.id);
        }

        for (const hcmBalance of command.balances) {
          const existsLocally = localBalances.some(
            (item) =>
              item.employeeId === hcmBalance.employeeId &&
              item.locationId === hcmBalance.locationId &&
              item.leaveTypeId === hcmBalance.leaveTypeId,
          );
          if (!existsLocally) {
            syncReport.drifts.push({
              type: 'MISSING_LOCALLY',
              employeeId: hcmBalance.employeeId,
              locationId: hcmBalance.locationId,
              leaveTypeId: hcmBalance.leaveTypeId,
            });
          }
        }

      // Step 6: Publish sync event
      await this.outboxRepo.createEvent({
        eventType: EVENT_TYPE.BALANCE_SYNCED,
        aggregateId: SYSTEM_ID,
        aggregateType: 'System',
        payload: {
          syncId: correlationId,
          recordsProcessed: syncReport.updates.length,
          driftCount: syncReport.drifts.length,
          errorCount: syncReport.errors.length,
          correlationId,
        },
      }, options);

      // Step 7: If drifts detected, publish drift event
      if (syncReport.drifts.length > 0) {
        await this.outboxRepo.createEvent({
          eventType: EVENT_TYPE.BALANCE_DRIFT_DETECTED,
          aggregateId: SYSTEM_ID,
          aggregateType: 'System',
          payload: {
            driftCount: syncReport.drifts.length,
            drifts: syncReport.drifts,
            correlationId,
          },
        }, options);
      }

      // Step 8: Audit
      await this.auditRepo.log({
        entityType: 'System',
        entityId: SYSTEM_ID,
        action: AUDIT_ACTION.SYNC,
        newValue: syncReport,
        correlationId,
      }, options);
      });

      syncReport.endTime = new Date();
      syncReport.status = 'SUCCESS';

      this.logger.log('✅ BalanceSync completed successfully', syncReport);
      return syncReport;
    } catch (error) {
      syncReport.endTime = new Date();
      syncReport.status = 'FAILED';
      syncReport.errors.push({
        code: 'SYNC_FAILED',
        message: error.message,
      });

      this.logger.error('SyncBalancesFromHcm failed', error);
      throw error;
    }
  }
}
