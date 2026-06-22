import { getOutboxEventWorker } from './outbox-worker.js';
import { Logger } from '../../common/logger.js';

const logger = new Logger('EventProcessing');

/**
 * Initialize event processing
 * Starts the outbox worker in the background
 */
export async function initializeEventProcessing() {
  const worker = getOutboxEventWorker();
  
  // Start worker in background (not awaiting)
  worker.start().catch((error) => {
    logger.error('Event worker crashed', error);
  });

  // Register shutdown handler
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received, stopping event worker...');
    await worker.stop();
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received, stopping event worker...');
    await worker.stop();
  });

  logger.log('✅ Event processing initialized');
}
