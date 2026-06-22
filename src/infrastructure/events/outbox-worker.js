import { Logger } from '../../common/logger.js';
import { OutboxEventRepository } from '../database/repositories/outbox-event.repository.js';
import { EVENT_TYPE } from '../../common/constants.js';

const logger = new Logger('OutboxEventWorker');

/**
 * OutboxEventWorker - processes domain events from the outbox table
 * Ensures reliable async event publishing with retry logic
 */
export class OutboxEventWorker {
  constructor() {
    this.outboxRepo = new OutboxEventRepository();
    this.isRunning = false;
    this.pollInterval = parseInt(process.env.OUTBOX_POLL_INTERVAL_MS || '1000', 10);
    this.batchSize = parseInt(process.env.OUTBOX_BATCH_SIZE || '10', 10);
    this.eventHandlers = new Map();
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Register handlers for different event types
    this.eventHandlers.set(EVENT_TYPE.TIME_OFF_REQUESTED, this.handleTimeOffRequested.bind(this));
    this.eventHandlers.set(EVENT_TYPE.TIME_OFF_APPROVED, this.handleTimeOffApproved.bind(this));
    this.eventHandlers.set(EVENT_TYPE.TIME_OFF_REJECTED, this.handleTimeOffRejected.bind(this));
    this.eventHandlers.set(EVENT_TYPE.TIME_OFF_CANCELLED, this.handleTimeOffCancelled.bind(this));
    this.eventHandlers.set(EVENT_TYPE.BALANCE_SYNCED, this.handleBalanceSynced.bind(this));
    this.eventHandlers.set(EVENT_TYPE.BALANCE_DRIFT_DETECTED, this.handleBalanceDriftDetected.bind(this));
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Worker already running');
      return;
    }

    this.isRunning = true;
    logger.log('✅ Starting OutboxEventWorker');

    while (this.isRunning) {
      try {
        await this.processBatch();
      } catch (error) {
        logger.error('Error in event processing loop', error);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
    }
  }

  async stop() {
    this.isRunning = false;
    logger.log('🛑 Stopping OutboxEventWorker');
  }

  async processBatch() {
    try {
      const events = await this.outboxRepo.findPending(this.batchSize);

      if (events.length === 0) {
        return; // No events to process
      }

      logger.debug(`Processing ${events.length} pending events`);

      for (const event of events) {
        try {
          await this.processEvent(event);
        } catch (error) {
          logger.error(`Failed to process event ${event.id}`, error);
          await this.outboxRepo.markFailed(event.id, error);
        }
      }
    } catch (error) {
      logger.error('Error processing batch', error);
    }
  }

  async processEvent(event) {
    try {
      // Mark as published
      await this.outboxRepo.markPublished(event.id);

      // Find and execute handler
      const handler = this.eventHandlers.get(event.eventType);
      if (!handler) {
        logger.warn(`No handler registered for event type: ${event.eventType}`);
        await this.outboxRepo.markCompleted(event.id);
        return;
      }

      // Execute handler
      await handler(event);

      // Mark as completed
      await this.outboxRepo.markCompleted(event.id);

      logger.debug(`✅ Event processed: ${event.eventType} (${event.id})`);
    } catch (error) {
      logger.error(`Error processing event ${event.id}`, error);
      throw error;
    }
  }

  // Event handlers
  async handleTimeOffRequested(event) {
    const { requestId, employeeId } = event.payload;
    logger.debug(`TimeOffRequested: ${requestId} by ${employeeId}`);
    // Could send notifications, webhooks, etc.
  }

  async handleTimeOffApproved(event) {
    const { requestId, employeeId, approverId } = event.payload;
    logger.debug(`TimeOffApproved: ${requestId} for ${employeeId} approved by ${approverId}`);
    // Could send notifications to employee
  }

  async handleTimeOffRejected(event) {
    const { requestId, employeeId } = event.payload;
    logger.debug(`TimeOffRejected: ${requestId} for ${employeeId} rejected`);
    // Could send notifications to employee with reason
  }

  async handleTimeOffCancelled(event) {
    const { requestId, employeeId } = event.payload;
    logger.debug(`TimeOffCancelled: ${requestId} for ${employeeId} cancelled`);
    // Could send notifications
  }

  async handleBalanceSynced(event) {
    const { syncId, recordsProcessed } = event.payload;
    logger.debug(`BalanceSynced: ${syncId} processed ${recordsProcessed} records`);
    // Could update sync status dashboard
  }

  async handleBalanceDriftDetected(event) {
    const { driftCount } = event.payload;
    logger.warn(`BalanceDriftDetected: ${driftCount} drifts found`);
    // Could alert admins
  }
}

// Singleton instance
let workerInstance = null;

export function getOutboxEventWorker() {
  if (!workerInstance) {
    workerInstance = new OutboxEventWorker();
  }
  return workerInstance;
}
