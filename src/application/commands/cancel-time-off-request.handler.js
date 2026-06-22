import { Logger } from '../../common/logger.js';
import { TimeOffRequestRepository } from '../../infrastructure/database/repositories/time-off-request.repository.js';
import { BalanceRepository } from '../../infrastructure/database/repositories/balance.repository.js';
import { AuditLogRepository } from '../../infrastructure/database/repositories/audit-log.repository.js';
import { OutboxEventRepository } from '../../infrastructure/database/repositories/outbox-event.repository.js';
import { HcmClient } from '../../integrations/hcm-client/hcm.client.js';
import { getSequelize } from '../../infrastructure/database/config.js';
import { TIME_OFF_REQUEST_STATUS, AUDIT_ACTION, EVENT_TYPE } from '../../common/constants.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * CancelTimeOffRequestHandler
 *
 * Flow:
 * 1. Validate request exists and is in cancellable state
 * 2. Release reserved balance if PENDING
 * 3. Attempt to notify HCM of cancellation
 * 4. Update request status to CANCELLED
 * 5. Publish domain event
 * 6. Log audit trail
 */
export class CancelTimeOffRequestHandler {
  constructor(dependencies = {}) {
    this.logger = new Logger('CancelTimeOffRequestHandler');
    this.requestRepo = dependencies.requestRepo || new TimeOffRequestRepository();
    this.balanceRepo = dependencies.balanceRepo || new BalanceRepository();
    this.auditRepo = dependencies.auditRepo || new AuditLogRepository();
    this.outboxRepo = dependencies.outboxRepo || new OutboxEventRepository();
    this.hcmClient = dependencies.hcmClient || new HcmClient();
    this.sequelize = dependencies.sequelize || getSequelize();
  }

  async execute(command) {
    const correlationId = uuidv4();
    this.logger.debug('Starting CancelTimeOffRequest', { correlationId, requestId: command.requestId });

    try {
      // Step 1: Validate request
      const request = await this.requestRepo.findById(command.requestId);
      if (!request) {
        throw { code: 'NOT_FOUND', message: 'Request not found' };
      }

      const cancellableStatuses = [TIME_OFF_REQUEST_STATUS.PENDING, TIME_OFF_REQUEST_STATUS.APPROVED];
      if (!cancellableStatuses.includes(request.status)) {
        throw {
          code: 'INVALID_STATE',
          message: `Cannot cancel request in ${request.status} status`,
        };
      }

      if (request.status === TIME_OFF_REQUEST_STATUS.APPROVED) {
        try {
          await this.hcmClient.applyLeave(
            request.employeeId,
            request.locationId,
            request.leaveTypeId,
            -request.days,
            request.id,
          );
        } catch (hcmError) {
          this.logger.warn('HCM cancellation notification failed', hcmError);
        }
      }

      return await this.sequelize.transaction(async (transaction) => {
      const options = { transaction };
      const currentRequest = await this.requestRepo.findById(command.requestId, options);
      if (!currentRequest || !cancellableStatuses.includes(currentRequest.status)) {
        throw {
          code: 'CONCURRENT_MODIFICATION',
          message: 'Request is no longer cancellable',
        };
      }

      // Step 2: Handle balance based on current status
      const balance = await this.balanceRepo.findByEmployeeLocationLeaveType(
        currentRequest.employeeId,
        currentRequest.locationId,
        currentRequest.leaveTypeId,
        options,
      );

      if (!balance) {
        throw { code: 'INVALID_STATE', message: 'Balance not found' };
      }

      if (currentRequest.status === TIME_OFF_REQUEST_STATUS.PENDING) {
        // Release reserved balance
        await this.balanceRepo.releaseReservedBalance(
          balance.id,
          currentRequest.days,
          balance.version,
          options,
        );
      } else if (currentRequest.status === TIME_OFF_REQUEST_STATUS.APPROVED) {
        // Move back from used to available
        await this.balanceRepo.releaseUsedBalance(
          balance.id,
          currentRequest.days,
          balance.version,
          options,
        );
      }

      // Step 3: Update status to CANCELLED
      const updated = await this.requestRepo.transitionStatus(
        command.requestId,
        currentRequest.status,
        TIME_OFF_REQUEST_STATUS.CANCELLED,
        {},
        options,
      );

      // Step 4: Publish domain event
      await this.outboxRepo.createEvent({
        eventType: EVENT_TYPE.TIME_OFF_CANCELLED,
        aggregateId: request.id,
        aggregateType: 'TimeOffRequest',
        payload: {
          requestId: request.id,
          employeeId: request.employeeId,
          previousStatus: currentRequest.status,
          status: TIME_OFF_REQUEST_STATUS.CANCELLED,
        },
      }, options);

      // Step 5: Log audit
      await this.auditRepo.log({
        entityType: 'TimeOffRequest',
        entityId: command.requestId,
        action: AUDIT_ACTION.CANCEL,
        actor: command.userId,
        oldValue: { status: currentRequest.status },
        newValue: { status: TIME_OFF_REQUEST_STATUS.CANCELLED },
        correlationId,
      }, options);

      this.logger.log('✅ TimeOffRequest cancelled successfully', { requestId: command.requestId, correlationId });
      return {
        id: updated.id,
        status: updated.status,
      };
      });
    } catch (error) {
      this.logger.error('CancelTimeOffRequest failed', error);
      throw error;
    }
  }
}
