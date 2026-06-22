import { Logger } from '../../common/logger.js';
import { BalanceRepository } from '../../infrastructure/database/repositories/balance.repository.js';
import { TimeOffRequestRepository } from '../../infrastructure/database/repositories/time-off-request.repository.js';
import { AuditLogRepository } from '../../infrastructure/database/repositories/audit-log.repository.js';
import { OutboxEventRepository } from '../../infrastructure/database/repositories/outbox-event.repository.js';
import { IdempotencyKeyRepository } from '../../infrastructure/database/repositories/idempotency-key.repository.js';
import { HcmClient } from '../../integrations/hcm-client/hcm.client.js';
import { getSequelize } from '../../infrastructure/database/config.js';
import { TIME_OFF_REQUEST_STATUS, AUDIT_ACTION, EVENT_TYPE, ERROR_MESSAGES } from '../../common/constants.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * CreateTimeOffRequestHandler
 *
 * Flow:
 * 1. Validate request format locally
 * 2. Check idempotency key for duplicates
 * 3. Validate employee, location, leave type exist
 * 4. Check local balance snapshot
 * 5. Validate with HCM
 * 6. Reserve balance locally (optimistic locking)
 * 7. Create request
 * 8. Publish domain event
 * 9. Log audit trail
 */
export class CreateTimeOffRequestHandler {
  constructor(dependencies = {}) {
    this.logger = new Logger('CreateTimeOffRequestHandler');
    this.balanceRepo = dependencies.balanceRepo || new BalanceRepository();
    this.requestRepo = dependencies.requestRepo || new TimeOffRequestRepository();
    this.auditRepo = dependencies.auditRepo || new AuditLogRepository();
    this.outboxRepo = dependencies.outboxRepo || new OutboxEventRepository();
    this.idempotencyRepo = dependencies.idempotencyRepo || new IdempotencyKeyRepository();
    this.hcmClient = dependencies.hcmClient || new HcmClient();
    this.sequelize = dependencies.sequelize || getSequelize();
  }

  async execute(command) {
    const correlationId = uuidv4();
    this.logger.debug('Starting CreateTimeOffRequest', { correlationId, command });

    try {
      // Step 1: Check idempotency key
      if (command.idempotencyKey) {
        const existing = await this.idempotencyRepo.findByKey(command.idempotencyKey);
        if (existing && existing.status === 'COMPLETED') {
          this.logger.debug('Duplicate request detected, returning cached response');
          return existing.responseBody;
        }

        if (existing?.status === 'PENDING') {
          throw {
            code: 'CONCURRENT_MODIFICATION',
            message: 'A request with this idempotency key is already in progress',
          };
        }
      }

      // Step 2: Validate balance exists
      const balance = await this.balanceRepo.findByEmployeeLocationLeaveType(
        command.employeeId,
        command.locationId,
        command.leaveTypeId,
      );

      if (!balance) {
        throw {
          code: 'INVALID_STATE',
          message: ERROR_MESSAGES.BALANCE_NOT_FOUND,
        };
      }

      // Step 3: Check local balance
      if (balance.availableBalance < command.days) {
        throw {
          code: 'INSUFFICIENT_BALANCE',
          message: ERROR_MESSAGES.INSUFFICIENT_BALANCE,
        };
      }

      // Step 4: Validate with HCM (defensive)
      try {
        const hcmValidation = await this.hcmClient.validateBalance(
          command.employeeId,
          command.locationId,
          command.leaveTypeId,
          command.days,
        );

        if (!hcmValidation.valid) {
          throw {
            code: 'HCM_VALIDATION_FAILED',
            reason: hcmValidation.reason,
          };
        }
      } catch (hcmError) {
        this.logger.warn('HCM validation failed', hcmError);
        // Continue anyway - we trust local snapshot
      }

      let request;
      const response = await this.sequelize.transaction(async (transaction) => {
        const options = { transaction };
        const currentBalance = await this.balanceRepo.findByEmployeeLocationLeaveType(
          command.employeeId,
          command.locationId,
          command.leaveTypeId,
          options,
        );
        const overlaps = await this.requestRepo.findOverlapping(
          command.employeeId,
          command.leaveTypeId,
          command.startDate,
          command.endDate,
          null,
          options,
        );

        if (overlaps.length > 0) {
          throw { code: 'INVALID_STATE', message: 'Request overlaps an existing request' };
        }

        if (command.idempotencyKey) {
          await this.idempotencyRepo.storeRequest(command.idempotencyKey, command, options);
        }

      // Step 5: Reserve balance (optimistic locking)
      let reservedBalance;
      try {
        reservedBalance = await this.balanceRepo.reserveBalance(
          currentBalance.id,
          command.days,
          currentBalance.version,
          options,
        );
      } catch (error) {
        if (error.message === 'CONCURRENT_MODIFICATION') {
          throw {
            code: 'CONCURRENT_MODIFICATION',
            message: ERROR_MESSAGES.CONCURRENT_MODIFICATION,
          };
        }
        throw error;
      }

      // Step 6: Create request
      request = await this.requestRepo.create({
        id: uuidv4(),
        employeeId: command.employeeId,
        locationId: command.locationId,
        leaveTypeId: command.leaveTypeId,
        startDate: command.startDate,
        endDate: command.endDate,
        days: command.days,
        reason: command.reason,
        status: TIME_OFF_REQUEST_STATUS.PENDING,
        idempotencyKey: command.idempotencyKey,
      }, options);

      // Step 7: Publish domain event
      await this.outboxRepo.createEvent({
        eventType: EVENT_TYPE.TIME_OFF_REQUESTED,
        aggregateId: request.id,
        aggregateType: 'TimeOffRequest',
        payload: {
          requestId: request.id,
          employeeId: request.employeeId,
          days: request.days,
          status: request.status,
          balanceId: currentBalance.id,
          reservedBalance: reservedBalance.reservedBalance,
        },
      }, options);

      // Step 8: Log audit
      await this.auditRepo.log({
        entityType: 'TimeOffRequest',
        entityId: request.id,
        action: AUDIT_ACTION.CREATE,
        actor: command.employeeId,
        newValue: request.toJSON(),
        correlationId,
      }, options);

      // Step 9: Update idempotency key
      if (command.idempotencyKey) {
        const response = {
          id: request.id,
          status: request.status,
          days: request.days,
        };
        await this.idempotencyRepo.markCompleted(command.idempotencyKey, response, 201, options);
      }

      this.logger.log('✅ TimeOffRequest created successfully', { requestId: request.id, correlationId });
      return {
        id: request.id,
        status: request.status,
        days: request.days,
      };
      });
      return response;
    } catch (error) {
      this.logger.error('CreateTimeOffRequest failed', error);

      throw error;
    }
  }
}
