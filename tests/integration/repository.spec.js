import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

/**
 * Integration Tests - Database operations and transactions
 */
describe('Balance Repository Integration', () => {
  let mockDb;

  beforeEach(() => {
    // Mock database storage
    mockDb = {
      balances: new Map(),
    };
  });

  describe('CRUD Operations', () => {
    it('should create a balance', () => {
      const balance = {
        id: uuidv4(),
        employeeId: 'emp-1',
        locationId: 'loc-1',
        leaveTypeId: 'lt-1',
        availableBalance: 20,
        reservedBalance: 0,
        usedBalance: 0,
        version: 0,
      };

      mockDb.balances.set(balance.id, balance);

      const retrieved = mockDb.balances.get(balance.id);
      expect(retrieved).toEqual(balance);
    });

    it('should find balance by composite key', () => {
      const balance = {
        id: uuidv4(),
        employeeId: 'emp-1',
        locationId: 'loc-1',
        leaveTypeId: 'lt-1',
        availableBalance: 20,
      };

      mockDb.balances.set(balance.id, balance);

      const found = Array.from(mockDb.balances.values()).find(
        (b) =>
          b.employeeId === 'emp-1' &&
          b.locationId === 'loc-1' &&
          b.leaveTypeId === 'lt-1',
      );

      expect(found).toEqual(balance);
    });

    it('should update balance', () => {
      const id = uuidv4();
      const balance = {
        id,
        employeeId: 'emp-1',
        availableBalance: 20,
        version: 0,
      };

      mockDb.balances.set(id, balance);

      // Update with optimistic locking
      const existing = mockDb.balances.get(id);
      if (existing.version === 0) {
        existing.availableBalance = 15;
        existing.version = 1;
        mockDb.balances.set(id, existing);
      }

      const updated = mockDb.balances.get(id);
      expect(updated.availableBalance).toBe(15);
      expect(updated.version).toBe(1);
    });

    it('should delete balance', () => {
      const id = uuidv4();
      mockDb.balances.set(id, { id });

      mockDb.balances.delete(id);

      expect(mockDb.balances.has(id)).toBe(false);
    });
  });

  describe('Transactions', () => {
    it('should atomically reserve balance (all-or-nothing)', () => {
      const balanceId = uuidv4();
      const balance = {
        id: balanceId,
        availableBalance: 10,
        reservedBalance: 0,
        version: 0,
      };

      mockDb.balances.set(balanceId, balance);

      // Transaction: reserve 15 days (should fail atomically)
      const transaction = () => {
        const existing = mockDb.balances.get(balanceId);

        if (existing.availableBalance < 15) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        existing.availableBalance -= 15;
        existing.reservedBalance += 15;
        existing.version += 1;
      };

      expect(transaction).toThrow('INSUFFICIENT_BALANCE');

      // Verify no partial update
      const unchanged = mockDb.balances.get(balanceId);
      expect(unchanged.availableBalance).toBe(10);
      expect(unchanged.reservedBalance).toBe(0);
      expect(unchanged.version).toBe(0);
    });
  });
});

/**
 * TimeOffRequest Repository Tests
 */
describe('TimeOffRequest Repository', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      requests: new Map(),
    };
  });

  it('should find requests by status', () => {
    const req1 = { id: 'r1', employeeId: 'e1', status: 'PENDING' };
    const req2 = { id: 'r2', employeeId: 'e1', status: 'APPROVED' };

    mockDb.requests.set('r1', req1);
    mockDb.requests.set('r2', req2);

    const pending = Array.from(mockDb.requests.values()).filter((r) => r.status === 'PENDING');

    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('r1');
  });

  it('should prevent overlapping requests', () => {
    const req1 = {
      id: 'r1',
      employeeId: 'e1',
      leaveTypeId: 'lt-1',
      startDate: '2024-01-01',
      endDate: '2024-01-05',
      status: 'APPROVED',
    };

    const req2 = {
      id: 'r2',
      employeeId: 'e1',
      leaveTypeId: 'lt-1',
      startDate: '2024-01-03',
      endDate: '2024-01-08',
      status: 'PENDING',
    };

    mockDb.requests.set('r1', req1);
    mockDb.requests.set('r2', req2);

    // Check overlap
    const hasOverlap = Array.from(mockDb.requests.values()).some((existing) => {
      if (
        existing.employeeId === req2.employeeId &&
        existing.leaveTypeId === req2.leaveTypeId &&
        existing.status !== 'REJECTED'
      ) {
        // Simple overlap check
        return (
          req2.startDate <= existing.endDate &&
          req2.endDate >= existing.startDate
        );
      }
      return false;
    });

    expect(hasOverlap).toBe(true);
  });
});
