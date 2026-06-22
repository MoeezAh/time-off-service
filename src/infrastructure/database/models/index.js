import { DataTypes } from 'sequelize';
import { getSequelize } from '../config.js';

/**
 * Employee model - represents an employee in the system
 */
export function initEmployeeModel() {
  const sequelize = getSequelize();

  const Employee = sequelize.define('Employee', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    externalId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'ID from HCM system',
    },
  }, {
    tableName: 'employees',
    indexes: [
      { fields: ['externalId'] },
      { fields: ['email'] },
    ],
  });

  return Employee;
}

/**
 * Location model - represents a work location
 */
export function initLocationModel() {
  const sequelize = getSequelize();

  const Location = sequelize.define('Location', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: 'e.g., PK-LHR, US-NYC',
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    externalId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'ID from HCM system',
    },
  }, {
    tableName: 'locations',
    indexes: [
      { fields: ['code'] },
      { fields: ['externalId'] },
    ],
  });

  return Location;
}

/**
 * LeaveType model - represents types of leave available
 */
export function initLeaveTypeModel() {
  const sequelize = getSequelize();

  const LeaveType = sequelize.define('LeaveType', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: 'e.g., ANNUAL, SICK, UNPAID',
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    externalId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'ID from HCM system',
    },
  }, {
    tableName: 'leaveTypes',
    indexes: [
      { fields: ['code'] },
      { fields: ['externalId'] },
    ],
  });

  return LeaveType;
}

/**
 * Balance model - represents time-off balance per employee, location, and leave type
 * Includes optimistic locking with version column
 */
export function initBalanceModel() {
  const sequelize = getSequelize();

  const Balance = sequelize.define('Balance', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'employees',
        key: 'id',
      },
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'locations',
        key: 'id',
      },
    },
    leaveTypeId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'leaveTypes',
        key: 'id',
      },
    },
    availableBalance: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    reservedBalance: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    usedBalance: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Optimistic locking version',
    },
    lastSyncedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last time synced with HCM',
    },
    syncStatus: {
      type: DataTypes.ENUM('SYNCED', 'PENDING', 'FAILED'),
      defaultValue: 'SYNCED',
    },
  }, {
    tableName: 'balances',
    indexes: [
      { fields: ['employeeId', 'locationId', 'leaveTypeId'], unique: true },
      { fields: ['employeeId'] },
      { fields: ['syncStatus'] },
      { fields: ['lastSyncedAt'] },
    ],
  });

  return Balance;
}

/**
 * TimeOffRequest model - represents a time-off request
 */
export function initTimeOffRequestModel() {
  const sequelize = getSequelize();

  const TimeOffRequest = sequelize.define('TimeOffRequest', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'employees',
        key: 'id',
      },
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'locations',
        key: 'id',
      },
    },
    leaveTypeId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'leaveTypes',
        key: 'id',
      },
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    days: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0.5,
      },
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'SYNCING', 'SYNC_FAILED'),
      defaultValue: 'PENDING',
    },
    approverId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'employees',
        key: 'id',
      },
      comment: 'Manager who approved the request',
    },
    approvalNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    idempotencyKey: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    hcmRequestId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'ID from HCM system',
    },
  }, {
    tableName: 'timeOffRequests',
    indexes: [
      { fields: ['employeeId', 'status'] },
      { fields: ['status'] },
      { fields: ['startDate', 'endDate'] },
      { fields: ['idempotencyKey'] },
      { fields: ['hcmRequestId'] },
    ],
  });

  return TimeOffRequest;
}

/**
 * AuditLog model - immutable audit trail for all operations
 */
export function initAuditLogModel() {
  const sequelize = getSequelize();

  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    entityType: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'e.g., TimeOffRequest, Balance',
    },
    entityId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'e.g., CREATE, UPDATE, APPROVE, REJECT',
    },
    actor: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'employees',
        key: 'id',
      },
    },
    oldValue: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    newValue: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    correlationId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'For tracing related operations',
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  }, {
    tableName: 'auditLogs',
    timestamps: true,
    updatedAt: false, // Audit logs are immutable
    indexes: [
      { fields: ['entityType', 'entityId'] },
      { fields: ['action'] },
      { fields: ['actor'] },
      { fields: ['correlationId'] },
      { fields: ['createdAt'] },
    ],
  });

  return AuditLog;
}

/**
 * OutboxEvent model - for reliable async event publishing (Outbox Pattern)
 */
export function initOutboxEventModel() {
  const sequelize = getSequelize();

  const OutboxEvent = sequelize.define('OutboxEvent', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    eventType: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'e.g., TimeOffRequested, TimeOffApproved',
    },
    aggregateId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'ID of the entity that triggered the event',
    },
    aggregateType: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'e.g., TimeOffRequest, Balance',
    },
    payload: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'PUBLISHED', 'COMPLETED', 'FAILED'),
      defaultValue: 'PENDING',
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    retryCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  }, {
    tableName: 'outboxEvents',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['status', 'createdAt'] },
      { fields: ['eventType'] },
      { fields: ['aggregateId'] },
    ],
  });

  return OutboxEvent;
}

/**
 * IdempotencyKey model - for idempotent request handling
 */
export function initIdempotencyKeyModel() {
  const sequelize = getSequelize();

  const IdempotencyKey = sequelize.define('IdempotencyKey', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    idempotencyKey: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    requestBody: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    responseBody: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    statusCode: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'COMPLETED', 'FAILED'),
      defaultValue: 'PENDING',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Idempotency key expiration (24 hours)',
    },
  }, {
    tableName: 'idempotencyKeys',
    timestamps: true,
    indexes: [
      { fields: ['idempotencyKey'] },
      { fields: ['expiresAt'] },
    ],
  });

  return IdempotencyKey;
}
