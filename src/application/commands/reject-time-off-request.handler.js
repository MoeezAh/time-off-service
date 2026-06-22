import { Logger } from '../../common/logger.js';
import { TimeOffRequestRepository } from '../../infrastructure/database/repositories/time-off-request.repository.js';
import { BalanceRepository } from '../../infrastructure/database/repositories/balance.repository.js';
import { AuditLogRepository } from '../../infrastructure/database/repositories/audit-log.repository.js';
import { OutboxEventRepository } from '../../infrastructure/database/repositories/outbox-event.repository.js';
import { TIME_OFF_REQUEST_STATUS, AUDIT_ACTION, EVENT_TYPE } from '../../common/constants.js';
import { v4 as uuidv4 } from 'uuid';
import { getSequelize } from '../../infrastructure/database/config.js';

/**
 * RejectTimeOffRequestHandler
 *
 * Flow:
 * 1. Validate request exists and is in PENDING state
 * 2. Release reserved balance
 * 3. Update request status to REJECTED
 * 4. Publish domain event
 * 5. Log audit trail
 */
export class RejectTimeOffRequestHandler {
  constructor(dependencies = {}) {
    this.logger = new Logger('RejectTimeOffRequestHandler');
    this.requestRepo = dependencies.requestRepo || new TimeOffRequestRepository();
    this.balanceRepo = dependencies.balanceRepo || new BalanceRepository();
    this.auditRepo = dependencies.auditRepo || new AuditLogRepository();
    this.outboxRepo = dependencies.outboxRepo || new OutboxEventRepository();
    this.sequelize = dependencies.sequelize || getSequelize();
  }

  async execute(command) {
    const correlationId = uuidv4();
    this.logger.debug('Starting RejectTimeOffRequest', { correlationId, requestId: command.requestId });

    try {
      // Step 1: Validate request
      const request = await this.requestRepo.findById(command.requestId);
      if (!request) {
        throw { code: 'NOT_FOUND', message: 'Request not found' };
      }

      if (request.status !== TIME_OFF_REQUEST_STATUS.PENDING) {
        throw {
          code: 'INVALID_STATE',
          message: `Cannot reject request in ${request.status} status`,
        };
      }

      return await this.sequelize.transaction(async (transaction) => {
      const options = { transaction };
      const currentRequest = await this.requestRepo.findById(command.requestId, options);

      // Step 2: Release reserved balance
      const balance = await this.balanceRepo.findByEmployeeLocationLeaveType(
        currentRequest.employeeId,
        currentRequest.locationId,
        currentRequest.leaveTypeId,
        options,
      );

      if (!balance) {
        throw { code: 'INVALID_STATE', message: 'Balance not found' };
      }

      await this.balanceRepo.releaseReservedBalance(
        balance.id,
        currentRequest.days,
        balance.version,
        options,
      );

      // Step 3: Update status to REJECTED
      const updated = await this.requestRepo.transitionStatus(
        command.requestId,
        TIME_OFF_REQUEST_STATUS.PENDING,
        TIME_OFF_REQUEST_STATUS.REJECTED,
        { reason: command.reason },
        options,
      );

      // Step 4: Publish domain event
      await this.outboxRepo.createEvent({
        eventType: EVENT_TYPE.TIME_OFF_REJECTED,
        aggregateId: request.id,
        aggregateType: 'TimeOffRequest',
        payload: {
          requestId: request.id,
          employeeId: request.employeeId,
          reason: command.reason,
          status: TIME_OFF_REQUEST_STATUS.REJECTED,
        },
      }, options);

      // Step 5: Log audit
      await this.auditRepo.log({
        entityType: 'TimeOffRequest',
        entityId: command.requestId,
        action: AUDIT_ACTION.REJECT,
        actor: command.rejecterId,
        oldValue: { status: TIME_OFF_REQUEST_STATUS.PENDING },
        newValue: { status: TIME_OFF_REQUEST_STATUS.REJECTED, reason: command.reason },
        correlationId,
      }, options);

      this.logger.log('✅ TimeOffRequest rejected successfully', { requestId: command.requestId, correlationId });
      return {
        id: updated.id,
        status: updated.status,
      };
      });
    } catch (error) {
      this.logger.error('RejectTimeOffRequest failed', error);
      throw error;
    }
  }
}
