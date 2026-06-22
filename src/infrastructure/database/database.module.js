import { Module } from '@nestjs/common';
import { initializeDatabase } from './config.js';
import {
  initEmployeeModel,
  initLocationModel,
  initLeaveTypeModel,
  initBalanceModel,
  initTimeOffRequestModel,
  initAuditLogModel,
  initOutboxEventModel,
  initIdempotencyKeyModel,
} from './models/index.js';
import { Logger } from '../../common/logger.js';

const logger = new Logger('DatabaseModule');

export async function setupDatabase() {
  try {
    const sequelize = await initializeDatabase();

    // Initialize all models
    const Employee = initEmployeeModel();
    const Location = initLocationModel();
    const LeaveType = initLeaveTypeModel();
    const Balance = initBalanceModel();
    const TimeOffRequest = initTimeOffRequestModel();
    const AuditLog = initAuditLogModel();
    const OutboxEvent = initOutboxEventModel();
    const IdempotencyKey = initIdempotencyKeyModel();

    // Set up associations
    Employee.hasMany(Balance, { foreignKey: 'employeeId', as: 'balances' });
    Balance.belongsTo(Employee, { foreignKey: 'employeeId', as: 'employee' });

    Balance.belongsTo(Location, { foreignKey: 'locationId', as: 'location' });
    Location.hasMany(Balance, { foreignKey: 'locationId', as: 'balances' });

    Balance.belongsTo(LeaveType, { foreignKey: 'leaveTypeId', as: 'leaveType' });
    LeaveType.hasMany(Balance, { foreignKey: 'leaveTypeId', as: 'balances' });

    TimeOffRequest.belongsTo(Employee, { foreignKey: 'employeeId', as: 'employee' });
    Employee.hasMany(TimeOffRequest, { foreignKey: 'employeeId', as: 'timeOffRequests' });

    TimeOffRequest.belongsTo(Employee, { foreignKey: 'approverId', as: 'approver' });

    TimeOffRequest.belongsTo(Location, { foreignKey: 'locationId', as: 'location' });
    TimeOffRequest.belongsTo(LeaveType, { foreignKey: 'leaveTypeId', as: 'leaveType' });

    AuditLog.belongsTo(Employee, { foreignKey: 'actor', as: 'actorEmployee' });

    // Startup should be non-destructive; schema changes belong in explicit migrations.
    await sequelize.sync();

    logger.log('✅ Database models synced successfully');

    // Export models as singletons
    global.db = {
      Employee,
      Location,
      LeaveType,
      Balance,
      TimeOffRequest,
      AuditLog,
      OutboxEvent,
      IdempotencyKey,
    };

    return global.db;
  } catch (error) {
    logger.error('Failed to setup database', error);
    throw error;
  }
}

export class DatabaseModule {}

Module({
  providers: [
    {
      provide: 'DATABASE',
      useFactory: setupDatabase,
    },
  ],
  exports: ['DATABASE'],
})(DatabaseModule);

export function getModels() {
  if (!global.db) {
    throw new Error('Database not initialized');
  }
  return global.db;
}
