import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { setupDatabase, getModels } from '../../src/infrastructure/database/database.module.js';
import { closeDatabase, getSequelize } from '../../src/infrastructure/database/config.js';
import { BalanceRepository } from '../../src/infrastructure/database/repositories/balance.repository.js';
import { TimeOffRequestRepository } from '../../src/infrastructure/database/repositories/time-off-request.repository.js';
import { AuditLogRepository } from '../../src/infrastructure/database/repositories/audit-log.repository.js';
import { OutboxEventRepository } from '../../src/infrastructure/database/repositories/outbox-event.repository.js';
import { IdempotencyKeyRepository } from '../../src/infrastructure/database/repositories/idempotency-key.repository.js';
import { CreateTimeOffRequestHandler } from '../../src/application/commands/create-time-off-request.handler.js';
import { RejectTimeOffRequestHandler } from '../../src/application/commands/reject-time-off-request.handler.js';
import { ApproveTimeOffRequestHandler } from '../../src/application/commands/approve-time-off-request.handler.js';
import { CancelTimeOffRequestHandler } from '../../src/application/commands/cancel-time-off-request.handler.js';
import { SyncBalancesFromHcmHandler } from '../../src/application/commands/sync-balances-from-hcm.handler.js';

describe('Application integration with SQLite', () => {
  let sequelize;
  let ids;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'sqlite://:memory:';
    process.env.NODE_ENV = 'test';
    await setupDatabase();
    sequelize = getSequelize();
  });

  beforeEach(async () => {
    await sequelize.sync({ force: true });
    ids = {
      employeeId: uuidv4(),
      managerId: uuidv4(),
      locationId: uuidv4(),
      leaveTypeId: uuidv4(),
      balanceId: uuidv4(),
    };

    const { Employee, Location, LeaveType, Balance } = getModels();
    await Employee.bulkCreate([
      { id: ids.employeeId, name: 'Employee', email: 'employee@example.test' },
      { id: ids.managerId, name: 'Manager', email: 'manager@example.test' },
    ]);
    await Location.create({ id: ids.locationId, code: 'PK-LHR', name: 'Lahore' });
    await LeaveType.create({ id: ids.leaveTypeId, code: 'ANNUAL', name: 'Annual' });
    await Balance.create({
      id: ids.balanceId,
      employeeId: ids.employeeId,
      locationId: ids.locationId,
      leaveTypeId: ids.leaveTypeId,
      availableBalance: 10,
      reservedBalance: 0,
      usedBalance: 0,
      version: 0,
    });
  });

  afterAll(async () => {
    await closeDatabase();
    delete global.db;
  });

  function createDependencies(overrides = {}) {
    return {
      balanceRepo: new BalanceRepository(),
      requestRepo: new TimeOffRequestRepository(),
      auditRepo: new AuditLogRepository(),
      outboxRepo: new OutboxEventRepository(),
      idempotencyRepo: new IdempotencyKeyRepository(),
      hcmClient: {
        validateBalance: async () => ({ valid: true }),
        applyLeave: async () => ({ success: true, transactionId: uuidv4() }),
      },
      sequelize,
      ...overrides,
    };
  }

  function createCommand(overrides = {}) {
    return {
      employeeId: ids.employeeId,
      locationId: ids.locationId,
      leaveTypeId: ids.leaveTypeId,
      startDate: '2026-07-01',
      endDate: '2026-07-02',
      days: 2,
      reason: 'Vacation',
      idempotencyKey: uuidv4(),
      ...overrides,
    };
  }

  it('atomically reserves a balance and rejects stale versions', async () => {
    const repository = new BalanceRepository();
    const reserved = await repository.reserveBalance(ids.balanceId, 2, 0);

    expect(Number(reserved.availableBalance)).toBe(8);
    expect(Number(reserved.reservedBalance)).toBe(2);
    expect(reserved.version).toBe(1);
    await expect(repository.reserveBalance(ids.balanceId, 2, 0)).rejects.toThrow(
      'CONCURRENT_MODIFICATION',
    );
  });

  it('creates an auditable, idempotent request in one transaction', async () => {
    const handler = new CreateTimeOffRequestHandler(createDependencies());
    const command = createCommand();

    const first = await handler.execute(command);
    const second = await handler.execute(command);

    expect(second).toEqual(first);
    expect(await getModels().TimeOffRequest.count()).toBe(1);
    expect(await getModels().AuditLog.count()).toBe(1);
    expect(await getModels().OutboxEvent.count()).toBe(1);
    expect(await getModels().IdempotencyKey.count()).toBe(1);

    const balance = await getModels().Balance.findByPk(ids.balanceId);
    expect(Number(balance.availableBalance)).toBe(8);
    expect(Number(balance.reservedBalance)).toBe(2);
  });

  it('rolls back reservation and request when an outbox write fails', async () => {
    const outboxRepo = {
      createEvent: async () => {
        throw new Error('OUTBOX_FAILURE');
      },
    };
    const handler = new CreateTimeOffRequestHandler(createDependencies({ outboxRepo }));

    await expect(handler.execute(createCommand())).rejects.toThrow('OUTBOX_FAILURE');

    const balance = await getModels().Balance.findByPk(ids.balanceId);
    expect(Number(balance.availableBalance)).toBe(10);
    expect(Number(balance.reservedBalance)).toBe(0);
    expect(await getModels().TimeOffRequest.count()).toBe(0);
    expect(await getModels().AuditLog.count()).toBe(0);
    expect(await getModels().IdempotencyKey.count()).toBe(0);
  });

  it('rejects a pending request and releases its reservation atomically', async () => {
    const dependencies = createDependencies();
    const created = await new CreateTimeOffRequestHandler(dependencies).execute(createCommand());
    const result = await new RejectTimeOffRequestHandler(dependencies).execute({
      requestId: created.id,
      rejecterId: ids.managerId,
      reason: 'Coverage unavailable',
    });

    expect(result.status).toBe('REJECTED');
    const balance = await getModels().Balance.findByPk(ids.balanceId);
    expect(Number(balance.availableBalance)).toBe(10);
    expect(Number(balance.reservedBalance)).toBe(0);
    expect(await getModels().AuditLog.count()).toBe(2);
    expect(await getModels().OutboxEvent.count()).toBe(2);
  });

  it('approves a request and moves reserved balance to used balance', async () => {
    const dependencies = createDependencies();
    const created = await new CreateTimeOffRequestHandler(dependencies).execute(createCommand());
    const result = await new ApproveTimeOffRequestHandler(dependencies).execute({
      requestId: created.id,
      approverId: ids.managerId,
      notes: 'Approved',
    });

    expect(result.status).toBe('APPROVED');
    const balance = await getModels().Balance.findByPk(ids.balanceId);
    expect(Number(balance.availableBalance)).toBe(8);
    expect(Number(balance.reservedBalance)).toBe(0);
    expect(Number(balance.usedBalance)).toBe(2);
  });

  it('cancels an approved request and restores used balance', async () => {
    const dependencies = createDependencies();
    const created = await new CreateTimeOffRequestHandler(dependencies).execute(createCommand());
    await new ApproveTimeOffRequestHandler(dependencies).execute({
      requestId: created.id,
      approverId: ids.managerId,
    });
    const result = await new CancelTimeOffRequestHandler(dependencies).execute({
      requestId: created.id,
      userId: ids.employeeId,
    });

    expect(result.status).toBe('CANCELLED');
    const balance = await getModels().Balance.findByPk(ids.balanceId);
    expect(Number(balance.availableBalance)).toBe(10);
    expect(Number(balance.reservedBalance)).toBe(0);
    expect(Number(balance.usedBalance)).toBe(0);
  });

  it('reconciles the local snapshot from an HCM corpus', async () => {
    const dependencies = createDependencies();
    const handler = new SyncBalancesFromHcmHandler(dependencies);
    const report = await handler.execute({
      balances: [
        {
          employeeId: ids.employeeId,
          locationId: ids.locationId,
          leaveTypeId: ids.leaveTypeId,
          balance: 20,
        },
      ],
    });

    expect(report.status).toBe('SUCCESS');
    expect(report.updates).toEqual([ids.balanceId]);
    expect(report.drifts[0].type).toBe('BALANCE_MISMATCH');
    const balance = await getModels().Balance.findByPk(ids.balanceId);
    expect(Number(balance.availableBalance)).toBe(20);
    expect(balance.version).toBe(1);
    expect(balance.syncStatus).toBe('SYNCED');
  });
});
