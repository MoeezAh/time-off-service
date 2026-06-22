import { BaseRepository } from './base.repository.js';
import { getModels } from '../database.module.js';
import { Op, literal } from 'sequelize';

/**
 * BalanceRepository - handles balance-specific operations
 * Includes optimistic locking for concurrency control
 */
export class BalanceRepository extends BaseRepository {
  constructor() {
    super(getModels().Balance);
  }

  /**
   * Find balance by employee, location, and leave type
   */
  async findByEmployeeLocationLeaveType(employeeId, locationId, leaveTypeId, options = {}) {
    return this.findOne({
      employeeId,
      locationId,
      leaveTypeId,
    }, options);
  }

  /**
   * Get all balances for an employee
   */
  async findByEmployee(employeeId, options = {}) {
    return this.findAll({ employeeId }, options);
  }

  /**
   * Get all balances for a location
   */
  async findByLocation(locationId, options = {}) {
    return this.findAll({ locationId }, options);
  }

  /**
   * Update balance with optimistic locking
   * Throws if version doesn't match (concurrent modification)
   */
  async updateWithLocking(balanceId, data, expectedVersion, options = {}) {
    try {
      const [affectedRows] = await this.model.update(
        {
        ...data,
          version: literal('version + 1'),
        },
        {
          ...options,
          where: {
            id: balanceId,
            version: expectedVersion,
          },
        },
      );

      if (affectedRows !== 1) {
        const current = await this.findById(balanceId, options);
        throw new Error(current ? 'CONCURRENT_MODIFICATION' : 'Balance not found');
      }

      return this.findById(balanceId, options);
    } catch (error) {
      this.logger.error(`updateWithLocking failed for ${balanceId}`, error);
      throw error;
    }
  }

  /**
   * Reserve balance (increase reserved, decrease available)
   */
  async reserveBalance(balanceId, days, expectedVersion, options = {}) {
    try {
      const requestedDays = Number(days);
      if (!Number.isFinite(requestedDays) || requestedDays <= 0) {
        throw new Error('INVALID_DAYS');
      }

      const [affectedRows] = await this.model.update(
        {
          availableBalance: literal(`availableBalance - ${requestedDays}`),
          reservedBalance: literal(`reservedBalance + ${requestedDays}`),
          version: literal('version + 1'),
        },
        {
          ...options,
          where: {
            id: balanceId,
            version: expectedVersion,
            availableBalance: { [Op.gte]: requestedDays },
          },
        },
      );

      if (affectedRows !== 1) {
        const current = await this.findById(balanceId, options);
        if (!current) {
          throw new Error('Balance not found');
        }
        if (current.version !== expectedVersion) {
          throw new Error('CONCURRENT_MODIFICATION');
        }
        throw new Error('INSUFFICIENT_BALANCE');
      }

      return this.findById(balanceId, options);
    } catch (error) {
      this.logger.error(`reserveBalance failed for ${balanceId}`, error);
      throw error;
    }
  }

  /**
   * Release reserved balance (decrease reserved, increase available)
   */
  async releaseReservedBalance(balanceId, days, expectedVersion, options = {}) {
    try {
      const requestedDays = Number(days);
      if (!Number.isFinite(requestedDays) || requestedDays <= 0) {
        throw new Error('INVALID_DAYS');
      }

      const [affectedRows] = await this.model.update(
        {
          availableBalance: literal(`availableBalance + ${requestedDays}`),
          reservedBalance: literal(`reservedBalance - ${requestedDays}`),
          version: literal('version + 1'),
        },
        {
          ...options,
          where: {
            id: balanceId,
            version: expectedVersion,
            reservedBalance: { [Op.gte]: requestedDays },
          },
        },
      );

      if (affectedRows !== 1) {
        const current = await this.findById(balanceId, options);
        if (!current) {
          throw new Error('Balance not found');
        }
        if (current.version !== expectedVersion) {
          throw new Error('CONCURRENT_MODIFICATION');
        }
        throw new Error('Invalid reservation to release');
      }

      return this.findById(balanceId, options);
    } catch (error) {
      this.logger.error(`releaseReservedBalance failed for ${balanceId}`, error);
      throw error;
    }
  }

  async consumeReservedBalance(balanceId, days, expectedVersion, options = {}) {
    return this.moveBalance(
      balanceId,
      days,
      expectedVersion,
      'reservedBalance',
      'usedBalance',
      options,
    );
  }

  async releaseUsedBalance(balanceId, days, expectedVersion, options = {}) {
    return this.moveBalance(
      balanceId,
      days,
      expectedVersion,
      'usedBalance',
      'availableBalance',
      options,
    );
  }

  async moveBalance(balanceId, days, expectedVersion, sourceColumn, targetColumn, options = {}) {
    const requestedDays = Number(days);
    if (!Number.isFinite(requestedDays) || requestedDays <= 0) {
      throw new Error('INVALID_DAYS');
    }

    const [affectedRows] = await this.model.update(
      {
        [sourceColumn]: literal(`${sourceColumn} - ${requestedDays}`),
        [targetColumn]: literal(`${targetColumn} + ${requestedDays}`),
        version: literal('version + 1'),
      },
      {
        ...options,
        where: {
          id: balanceId,
          version: expectedVersion,
          [sourceColumn]: { [Op.gte]: requestedDays },
        },
      },
    );

    if (affectedRows !== 1) {
      const current = await this.findById(balanceId, options);
      if (!current) {
        throw new Error('Balance not found');
      }
      if (current.version !== expectedVersion) {
        throw new Error('CONCURRENT_MODIFICATION');
      }
      throw new Error('INSUFFICIENT_BALANCE');
    }

    return this.findById(balanceId, options);
  }

  /**
   * Mark balance for syncing
   */
  async markForSync(balanceId) {
    return this.update(balanceId, {
      syncStatus: 'PENDING',
    });
  }

  /**
   * Mark balance as synced
   */
  async markSynced(balanceId) {
    return this.update(balanceId, {
      syncStatus: 'SYNCED',
      lastSyncedAt: new Date(),
    });
  }

  /**
   * Get all balances needing sync
   */
  async findPendingSync(options = {}) {
    return this.findAll({ syncStatus: 'PENDING' }, options);
  }
}
