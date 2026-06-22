import { Logger } from '../../common/logger.js';

/**
 * Queries for reading data
 * Each query is a simple function that returns data
 */

export class GetBalancesQuery {
  async execute(balanceRepo, filters = {}) {
    const logger = new Logger('GetBalancesQuery');
    try {
      const balances = await balanceRepo.findAll(filters);
      return balances;
    } catch (error) {
      logger.error('GetBalancesQuery failed', error);
      throw error;
    }
  }
}

export class GetBalanceByIdQuery {
  async execute(balanceRepo, balanceId) {
    const logger = new Logger('GetBalanceByIdQuery');
    try {
      const balance = await balanceRepo.findById(balanceId);
      if (!balance) {
        throw { code: 'NOT_FOUND', message: 'Balance not found' };
      }
      return balance;
    } catch (error) {
      logger.error('GetBalanceByIdQuery failed', error);
      throw error;
    }
  }
}

export class GetTimeOffRequestsQuery {
  async execute(requestRepo, filters = {}) {
    const logger = new Logger('GetTimeOffRequestsQuery');
    try {
      const requests = await requestRepo.findAll(filters);
      return requests;
    } catch (error) {
      logger.error('GetTimeOffRequestsQuery failed', error);
      throw error;
    }
  }
}

export class GetTimeOffRequestByIdQuery {
  async execute(requestRepo, requestId) {
    const logger = new Logger('GetTimeOffRequestByIdQuery');
    try {
      const request = await requestRepo.findById(requestId);
      if (!request) {
        throw { code: 'NOT_FOUND', message: 'Request not found' };
      }
      return request;
    } catch (error) {
      logger.error('GetTimeOffRequestByIdQuery failed', error);
      throw error;
    }
  }
}

export class GetAuditLogQuery {
  async execute(auditRepo, entityType, entityId) {
    const logger = new Logger('GetAuditLogQuery');
    try {
      const logs = await auditRepo.findByEntity(entityType, entityId);
      return logs;
    } catch (error) {
      logger.error('GetAuditLogQuery failed', error);
      throw error;
    }
  }
}

export class GetReconciliationReportQuery {
  async execute(balanceRepo, auditRepo, outboxRepo) {
    const logger = new Logger('GetReconciliationReportQuery');
    try {
      const report = {
        timestamp: new Date(),
        totalBalances: 0,
        pendingSyncCount: 0,
        failedSyncCount: 0,
        recentDrifts: [],
      };

      const balances = await balanceRepo.findAll({});
      report.totalBalances = balances.length;

      const pendingSync = balances.filter((b) => b.syncStatus === 'PENDING');
      report.pendingSyncCount = pendingSync.length;

      const failedSync = balances.filter((b) => b.syncStatus === 'FAILED');
      report.failedSyncCount = failedSync.length;

      // Get recent drift events
      const driftEvents = await outboxRepo.findByType('BALANCE_DRIFT_DETECTED', { limit: 10 });
      report.recentDrifts = driftEvents.map((e) => ({
        eventId: e.id,
        payload: e.payload,
        createdAt: e.createdAt,
      }));

      return report;
    } catch (error) {
      logger.error('GetReconciliationReportQuery failed', error);
      throw error;
    }
  }
}
