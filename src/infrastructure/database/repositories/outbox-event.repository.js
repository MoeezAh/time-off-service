import { BaseRepository } from './base.repository.js';
import { getModels } from '../database.module.js';

/**
 * OutboxEventRepository - manages the outbox for reliable event publishing
 */
export class OutboxEventRepository extends BaseRepository {
  constructor() {
    super(getModels().OutboxEvent);
  }

  /**
   * Create and store a domain event
   */
  async createEvent(eventData, options = {}) {
    try {
      return await this.create({
        eventType: eventData.eventType,
        aggregateId: eventData.aggregateId,
        aggregateType: eventData.aggregateType,
        payload: eventData.payload,
        status: 'PENDING',
      }, options);
    } catch (error) {
      this.logger.error('Failed to create event', error);
      throw error;
    }
  }

  /**
   * Get pending events for processing
   */
  async findPending(limit = 100) {
    return this.findAll(
      { status: 'PENDING' },
      {
        limit,
        order: [['createdAt', 'ASC']],
      },
    );
  }

  /**
   * Mark event as published
   */
  async markPublished(eventId) {
    return this.update(eventId, {
      status: 'PUBLISHED',
      processedAt: new Date(),
    });
  }

  /**
   * Mark event as completed
   */
  async markCompleted(eventId) {
    return this.update(eventId, {
      status: 'COMPLETED',
    });
  }

  /**
   * Mark event as failed
   */
  async markFailed(eventId, error) {
    const event = await this.findById(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    return this.update(eventId, {
      status: 'FAILED',
      error: error.message,
      retryCount: (event.retryCount || 0) + 1,
    });
  }

  /**
   * Get events by type
   */
  async findByType(eventType, options = {}) {
    return this.findAll({ eventType }, options);
  }

  /**
   * Get events by aggregate
   */
  async findByAggregate(aggregateId, options = {}) {
    return this.findAll({ aggregateId }, options);
  }
}
