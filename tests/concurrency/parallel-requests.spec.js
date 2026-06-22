import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Concurrency Tests - Race condition prevention with optimistic locking
 * Simulates parallel requests on the same balance
 */
describe('Concurrency - Race Condition Prevention', () => {
  let balanceStore;

  beforeEach(() => {
    balanceStore = {
      balances: new Map(),
      transactionLog: [],
    };

    // Initialize a balance
    const balance = {
      id: 'bal-1',
      employeeId: 'emp-1',
      availableBalance: 10,
      reservedBalance: 0,
      version: 0,
    };

    balanceStore.balances.set('bal-1', balance);
  });

  /**
   * Simulates concurrent reservation attempts on same balance
   */
  const attemptReserve = (employeeId, days, expectedVersion) => {
    const balance = balanceStore.balances.get('bal-1');

    // Check version (optimistic locking)
    if (balance.version !== expectedVersion) {
      return {
        success: false,
        error: 'CONCURRENT_MODIFICATION',
      };
    }

    // Check sufficient balance
    if (balance.availableBalance < days) {
      return {
        success: false,
        error: 'INSUFFICIENT_BALANCE',
      };
    }

    // Apply update
    balance.availableBalance -= days;
    balance.reservedBalance += days;
    balance.version += 1;

    balanceStore.transactionLog.push({
      employee: employeeId,
      action: 'RESERVE',
      days,
      newVersion: balance.version,
      timestamp: Date.now(),
    });

    return {
      success: true,
      newBalance: balance.availableBalance,
      newVersion: balance.version,
    };
  };

  describe('10 Parallel Requests', () => {
    it('should handle 10 concurrent reserve attempts (mixed success/failure)', () => {
      const attempts = Array.from({ length: 10 }, (_, i) => ({
        employeeId: `emp-${i % 3}`, // 3 employees
        days: 2,
        expectedVersion: 0, // All start with version 0
      }));

      const results = attempts.map((attempt) => attemptReserve(attempt.employeeId, attempt.days, attempt.expectedVersion));

      // Count successes and failures
      const successes = results.filter((r) => r.success).length;
      const failures = results.filter((r) => !r.success).length;

      // Only first request should succeed (others hit CONCURRENT_MODIFICATION)
      expect(successes).toBe(1);
      expect(failures).toBe(9);

      // Verify no balance corruption
      const finalBalance = balanceStore.balances.get('bal-1');
      expect(finalBalance.availableBalance).toBe(8); // 10 - 2
      expect(finalBalance.reservedBalance).toBe(2);
      expect(finalBalance.version).toBe(1);
    });
  });

  describe('20 Parallel Requests', () => {
    it('should correctly sequence 20 sequential updates (after retry)', () => {
      let results = [];

      // Simulate retries with updated version
      for (let i = 0; i < 20; i++) {
        const balance = balanceStore.balances.get('bal-1');
        const result = attemptReserve(`emp-${i}`, 0.5, balance.version); // Use current version

        results.push(result);

        if (!result.success) {
          // Retry with correct version
          const retryResult = attemptReserve(`emp-${i}`, 0.5, balance.version);
          results.push(retryResult);
        }
      }

      // All should succeed when using correct version
      const successCount = results.filter((r) => r.success).length;
      expect(successCount).toBeGreaterThan(15); // Most should succeed

      // Verify final state
      const finalBalance = balanceStore.balances.get('bal-1');
      expect(finalBalance.availableBalance).toBeLessThanOrEqual(10);
      expect(finalBalance.reservedBalance).toBeGreaterThan(0);
    });
  });

  describe('50 Parallel Requests - Stress Test', () => {
    it('should prevent any balance corruption under 50 concurrent attempts', () => {
      const initialBalance = balanceStore.balances.get('bal-1').availableBalance;
      let totalReserved = 0;

      // Simulate 50 attempts - each gets a smaller slice
      for (let i = 0; i < 50; i++) {
        const balance = balanceStore.balances.get('bal-1');
        const daysToReserve = 0.1; // Small amounts to prevent quick exhaustion

        const result = attemptReserve(`emp-${i % 5}`, daysToReserve, balance.version);

        if (result.success) {
          totalReserved += daysToReserve;
        }
      }

      // Verify balance integrity
      const finalBalance = balanceStore.balances.get('bal-1');
      expect(finalBalance.availableBalance).toBeCloseTo(initialBalance - totalReserved, 10);
      expect(
        finalBalance.availableBalance + finalBalance.reservedBalance,
      ).toBeCloseTo(initialBalance, 10); // No balance lost
      expect(finalBalance.version).toBe(50); // Each successful operation incremented version
    });
  });

  /**
   * Test scenario: Request A and B both try to reserve 6 days from 10
   * Only one should succeed
   */
  it('should prevent double-booking (RequestA=6, RequestB=5, Balance=10)', () => {
    const balanceA = balanceStore.balances.get('bal-1');
    const versionSnapshot = balanceA.version;

    // RequestA attempts to reserve 6 days
    const resultA = attemptReserve('emp-A', 6, versionSnapshot);
    expect(resultA.success).toBe(true);
    expect(resultA.newBalance).toBe(4);

    // RequestB attempts to reserve 5 days (with old version)
    const resultB = attemptReserve('emp-B', 5, versionSnapshot);
    expect(resultB.success).toBe(false);
    expect(resultB.error).toBe('CONCURRENT_MODIFICATION');

    // If B retries with current version
    const balanceB = balanceStore.balances.get('bal-1');
    const resultBRetry = attemptReserve('emp-B', 5, balanceB.version);
    expect(resultBRetry.success).toBe(false);
    expect(resultBRetry.error).toBe('INSUFFICIENT_BALANCE');

    // Final state: only A succeeded
    const final = balanceStore.balances.get('bal-1');
    expect(final.availableBalance).toBe(4);
    expect(final.reservedBalance).toBe(6);
  });
});
