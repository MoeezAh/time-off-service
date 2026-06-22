import { BaseRepository } from './base.repository.js';
import { getModels } from '../database.module.js';
import { Op } from 'sequelize';

/**
 * IdempotencyKeyRepository - manages idempotency for request deduplication
 */
export class IdempotencyKeyRepository extends BaseRepository {
  constructor() {
    super(getModels().IdempotencyKey);
  }

  /**
   * Check if idempotency key already exists and return cached response
   */
  async findByKey(idempotencyKey, options = {}) {
    return this.findOne({ idempotencyKey }, options);
  }

  /**
   * Store idempotency key with request details
   */
  async storeRequest(idempotencyKey, requestBody, options = {}) {
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      return await this.create({
        idempotencyKey,
        requestBody,
        status: 'PENDING',
        expiresAt,
      }, options);
    } catch (error) {
      this.logger.error('Failed to store idempotency key', error);
      throw error;
    }
  }

  /**
   * Mark idempotency key as completed with response
   */
  async markCompleted(idempotencyKey, responseBody, statusCode, options = {}) {
    try {
      const existing = await this.findByKey(idempotencyKey, options);
      if (!existing) {
        throw new Error('Idempotency key not found');
      }

      return this.update(existing.id, {
        status: 'COMPLETED',
        responseBody,
        statusCode,
      }, options);
    } catch (error) {
      this.logger.error('Failed to mark idempotency key as completed', error);
      throw error;
    }
  }

  /**
   * Mark idempotency key as failed
   */
  async markFailed(idempotencyKey, options = {}) {
    try {
      const existing = await this.findByKey(idempotencyKey, options);
      if (!existing) {
        throw new Error('Idempotency key not found');
      }

      return this.update(existing.id, { status: 'FAILED' }, options);
    } catch (error) {
      this.logger.error('Failed to mark idempotency key as failed', error);
      throw error;
    }
  }

  /**
   * Clean up expired idempotency keys (older than 24 hours)
   */
  async cleanupExpired() {
    try {
      const result = await this.model.destroy({
        where: {
          expiresAt: { [Op.lt]: new Date() },
        },
      });
      this.logger.debug(`Cleaned up ${result} expired idempotency keys`);
      return result;
    } catch (error) {
      this.logger.error('Failed to cleanup expired idempotency keys', error);
      throw error;
    }
  }
}
