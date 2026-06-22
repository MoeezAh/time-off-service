import { Logger } from '../../common/logger.js';

const logger = new Logger('HcmClient');

/**
 * HCM Client - handles communication with the external HCM system
 * Includes retry logic, error handling, and timeout management
 */
export class HcmClient {
  constructor() {
    this.baseUrl = process.env.HCM_BASE_URL || 'http://localhost:3001';
    this.timeout = parseInt(process.env.HCM_TIMEOUT_MS || '5000', 10);
    this.maxRetries = parseInt(process.env.HCM_MAX_RETRIES || '3', 10);
    this.retryDelay = parseInt(process.env.HCM_RETRY_DELAY_MS || '1000', 10);
  }

  /**
   * Retry logic with exponential backoff
   */
  async retryWithBackoff(fn, retries = 0) {
    try {
      return await fn();
    } catch (error) {
      if (retries < this.maxRetries && this.isRetryable(error)) {
        const delay = this.retryDelay * Math.pow(2, retries);
        logger.debug(`Retrying after ${delay}ms (attempt ${retries + 1}/${this.maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.retryWithBackoff(fn, retries + 1);
      }
      throw error;
    }
  }

  /**
   * Determine if an error is retryable
   */
  isRetryable(error) {
    const status = error.status || error.response?.status;
    if (!status) {
      // Network errors are retryable
      return true;
    }
    // Retry on 5xx and 429 (too many requests)
    return status >= 500 || status === 429;
  }

  /**
   * Make HTTP request with timeout
   */
  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw {
          status: response.status,
          body: await response.json(),
        };
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Get balance from HCM
   */
  async getBalance(employeeId, locationId, leaveTypeId) {
    return this.retryWithBackoff(async () => {
      try {
        const url = `${this.baseUrl}/hcm/balance/${employeeId}/${locationId}/${leaveTypeId}`;
        const result = await this.fetchWithTimeout(url);

        logger.debug(`Balance retrieved: ${employeeId}/${locationId}/${leaveTypeId} = ${result.balance}`);
        return result;
      } catch (error) {
        logger.error('getBalance failed', error);
        throw {
          code: 'HCM_ERROR',
          reason: error.body?.error || 'Failed to get balance',
          status: error.status,
        };
      }
    });
  }

  /**
   * Validate balance with HCM
   */
  async validateBalance(employeeId, locationId, leaveTypeId, days) {
    return this.retryWithBackoff(async () => {
      try {
        const url = `${this.baseUrl}/hcm/validate`;
        const result = await this.fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId,
            locationId,
            leaveTypeId,
            days,
          }),
        });

        logger.debug(`Balance validation: valid=${result.valid}`);
        return result;
      } catch (error) {
        logger.error('validateBalance failed', error);
        throw {
          code: 'HCM_ERROR',
          reason: error.body?.reason || 'Validation failed',
          status: error.status,
        };
      }
    });
  }

  /**
   * Apply leave with HCM
   */
  async applyLeave(employeeId, locationId, leaveTypeId, days, requestId) {
    return this.retryWithBackoff(async () => {
      try {
        const url = `${this.baseUrl}/hcm/apply-leave`;
        const result = await this.fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId,
            locationId,
            leaveTypeId,
            days,
            requestId,
          }),
        });

        if (!result.success) {
          logger.warn(`Leave application failed: ${result.reason}`);
          throw {
            code: 'HCM_ERROR',
            reason: result.reason,
            status: 400,
          };
        }

        logger.debug(`Leave applied: ${requestId}`);
        return result;
      } catch (error) {
        logger.error('applyLeave failed', error);
        throw {
          code: 'HCM_ERROR',
          reason: error.reason || 'Leave application failed',
          status: error.status,
        };
      }
    });
  }

  /**
   * Full sync - send complete balance corpus to HCM for reconciliation
   */
  async fullSync(balances) {
    return this.retryWithBackoff(async () => {
      try {
        const url = `${this.baseUrl}/hcm/full-sync`;
        const result = await this.fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ balances }),
        });

        logger.debug(`Full sync completed: ${result.recordsProcessed} records processed`);
        return result;
      } catch (error) {
        logger.error('fullSync failed', error);
        throw {
          code: 'HCM_SYNC_ERROR',
          reason: 'Full sync failed',
          status: error.status,
        };
      }
    });
  }
}
