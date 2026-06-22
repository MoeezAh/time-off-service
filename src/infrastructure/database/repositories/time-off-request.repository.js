import { BaseRepository } from './base.repository.js';
import { getModels } from '../database.module.js';
import { TIME_OFF_REQUEST_STATUS } from '../../../common/constants.js';
import { Op } from 'sequelize';

/**
 * TimeOffRequestRepository - handles time-off request operations
 */
export class TimeOffRequestRepository extends BaseRepository {
  constructor() {
    super(getModels().TimeOffRequest);
  }

  /**
   * Find request by idempotency key
   */
  async findByIdempotencyKey(idempotencyKey) {
    return this.findOne({ idempotencyKey });
  }

  /**
   * Get all requests for an employee with status filter
   */
  async findByEmployee(employeeId, status = null, options = {}) {
    const where = { employeeId };
    if (status) {
      where.status = status;
    }
    return this.findAll(where, options);
  }

  /**
   * Get pending requests for approval
   */
  async findPendingRequests(options = {}) {
    return this.findAll({ status: TIME_OFF_REQUEST_STATUS.PENDING }, options);
  }

  /**
   * Get requests in date range
   */
  async findByDateRange(startDate, endDate, employeeId = null, options = {}) {
    const where = {
      startDate: { [Op.gte]: startDate },
      endDate: { [Op.lte]: endDate },
    };

    if (employeeId) {
      where.employeeId = employeeId;
    }

    return this.findAll(where, options);
  }

  /**
   * Get overlapping requests to check for conflicts
   */
  async findOverlapping(employeeId, leaveTypeId, startDate, endDate, excludeId = null, options = {}) {
    const where = {
      employeeId,
      leaveTypeId,
      status: {
        [Op.in]: [TIME_OFF_REQUEST_STATUS.PENDING, TIME_OFF_REQUEST_STATUS.APPROVED],
      },
      startDate: { [Op.lte]: endDate },
      endDate: { [Op.gte]: startDate },
    };

    if (excludeId) {
      where.id = { [Op.ne]: excludeId };
    }

    return this.findAll(where, options);
  }

  /**
   * Update request status
   */
  async updateStatus(id, status, metadata = {}, options = {}) {
    const data = { status };

    if (status === TIME_OFF_REQUEST_STATUS.APPROVED) {
      data.approverId = metadata.approverId;
      data.approvalNotes = metadata.notes;
    } else if (status === TIME_OFF_REQUEST_STATUS.REJECTED) {
      data.rejectionReason = metadata.reason;
    }

    return this.update(id, data, options);
  }

  async transitionStatus(id, expectedStatus, status, metadata = {}, options = {}) {
    const data = { status };

    if (status === TIME_OFF_REQUEST_STATUS.APPROVED) {
      data.approverId = metadata.approverId;
      data.approvalNotes = metadata.notes;
    } else if (status === TIME_OFF_REQUEST_STATUS.REJECTED) {
      data.rejectionReason = metadata.reason;
    }

    const [affectedRows] = await this.model.update(data, {
      ...options,
      where: { id, status: expectedStatus },
    });

    if (affectedRows !== 1) {
      const current = await this.findById(id, options);
      if (!current) {
        throw { code: 'NOT_FOUND', message: 'Request not found' };
      }
      throw {
        code: 'CONCURRENT_MODIFICATION',
        message: `Request status changed from ${expectedStatus} to ${current.status}`,
      };
    }

    return this.findById(id, options);
  }

  /**
   * Count requests by status
   */
  async countByStatus(employeeId, status) {
    return this.count({
      employeeId,
      status,
    });
  }

  /**
   * Get requests syncing with HCM
   */
  async findSyncingRequests(options = {}) {
    return this.findAll({ status: TIME_OFF_REQUEST_STATUS.SYNCING }, options);
  }
}
