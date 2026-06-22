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
 * ApproveTimeOffRequestHandler
 *
 * Flow:
 * 1. Validate request exists and is in PENDING state
 * 2. Revalidate balance (defensive)
 * 3. Call HCM to apply leave
 * 4. Update request status to APPROVED
 * 5. Publish domain event
 * 6. Log audit trail
 */
export class ApproveTimeOffRequestHandler {
  constructor(dependencies = {}) {
    this.logger = new Logger('ApproveTimeOffRequestHandler');
    this.requestRepo = dependencies.requestRepo || new TimeOffRequestRepository();
    this.balanceRepo = dependencies.balanceRepo || new BalanceRepository();
    this.auditRepo = dependencies.auditRepo || new AuditLogRepository();
    this.outboxRepo = dependencies.outboxRepo || new OutboxEventRepository();
    this.hcmClient = dependencies.hcmClient || new HcmClient();
    this.sequelize = dependencies.sequelize || getSequelize();
  }

  async execute(command) {
    const correlationId = uuidv4();
    this.logger.debug('Starting ApproveTimeOffRequest', { correlationId, requestId: command.requestId });

    try {
      // Step 1: Validate request
      const request = await this.requestRepo.findById(command.requestId);
      if (!request) {
        throw { code: 'NOT_FOUND', message: 'Request not found' };
      }

      if (request.status !== TIME_OFF_REQUEST_STATUS.PENDING) {
        throw {
          code: 'INVALID_STATE',
          message: `Cannot approve request in ${request.status} status`,
        };
      }

      // Step 2: Revalidate balance
      const balance = await this.balanceRepo.findByEmployeeLocationLeaveType(
        request.employeeId,
        request.locationId,
        request.leaveTypeId,
      );

      if (!balance || balance.reservedBalance < request.days) {
        throw { code: 'INVALID_STATE', message: 'Balance reservation mismatch' };
      }

      // Step 3: Try to apply leave with HCM
      let hcmResult;
      try {
        hcmResult = await this.hcmClient.applyLeave(
          request.employeeId,
          request.locationId,
          request.leaveTypeId,
          request.days,
          request.id,
        );
      } catch (hcmError) {
        this.logger.warn('HCM apply-leave failed', hcmError);
        // Mark as sync failed but continue
        await this.requestRepo.updateStatus(command.requestId, TIME_OFF_REQUEST_STATUS.SYNC_FAILED);
        throw hcmError;
      }

      return await this.sequelize.transaction(async (transaction) => {
      const options = { transaction };
      const currentRequest = await this.requestRepo.findById(command.requestId, options);
      const currentBalance = await this.balanceRepo.findByEmployeeLocationLeaveType(
        currentRequest.employeeId,
        currentRequest.locationId,
        currentRequest.leaveTypeId,
        options,
      );

      // Step 4: Update status to APPROVED
      const updated = await this.requestRepo.transitionStatus(
        command.requestId,
        TIME_OFF_REQUEST_STATUS.PENDING,
        TIME_OFF_REQUEST_STATUS.APPROVED,
        {
        approverId: command.approverId,
        notes: command.notes,
        },
        options,
      );

      // Update the used balance (move from reserved to used)
      await this.balanceRepo.consumeReservedBalance(
        currentBalance.id,
        currentRequest.days,
        currentBalance.version,
        options,
      );

      // Step 5: Publish domain event
      await this.outboxRepo.createEvent({
        eventType: EVENT_TYPE.TIME_OFF_APPROVED,
        aggregateId: request.id,
        aggregateType: 'TimeOffRequest',
        payload: {
          requestId: request.id,
          employeeId: request.employeeId,
          approverId: command.approverId,
          status: TIME_OFF_REQUEST_STATUS.APPROVED,
          hcmTransactionId: hcmResult.transactionId,
        },
      }, options);

      // Step 6: Log audit
      await this.auditRepo.log({
        entityType: 'TimeOffRequest',
        entityId: command.requestId,
        action: AUDIT_ACTION.APPROVE,
        actor: command.approverId,
        oldValue: { status: TIME_OFF_REQUEST_STATUS.PENDING },
        newValue: { status: TIME_OFF_REQUEST_STATUS.APPROVED },
        correlationId,
      }, options);

      this.logger.log('✅ TimeOffRequest approved successfully', { requestId: command.requestId, correlationId });
      return {
        id: updated.id,
        status: updated.status,
      };
      });
    } catch (error) {
      this.logger.error('ApproveTimeOffRequest failed', error);
      throw error;
    }
  }
}
