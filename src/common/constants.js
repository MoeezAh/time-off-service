/**
 * @typedef {Object} TimeOffRequest
 * @property {string} PENDING
 * @property {string} APPROVED
 * @property {string} REJECTED
 * @property {string} CANCELLED
 * @property {string} SYNCING
 * @property {string} SYNC_FAILED
 */

/**
 * @typedef {Object} LeaveTypeEnum
 * @property {string} ANNUAL
 * @property {string} SICK
 * @property {string} UNPAID
 */

/**
 * @typedef {Object} EventTypeEnum
 * @property {string} TIME_OFF_REQUESTED
 * @property {string} TIME_OFF_APPROVED
 * @property {string} TIME_OFF_REJECTED
 * @property {string} TIME_OFF_CANCELLED
 * @property {string} BALANCE_SYNCED
 * @property {string} BALANCE_DRIFT_DETECTED
 * @property {string} BALANCE_RESERVED
 * @property {string} BALANCE_RELEASED
 */

export const TIME_OFF_REQUEST_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  SYNCING: 'SYNCING',
  SYNC_FAILED: 'SYNC_FAILED',
};

export const LEAVE_TYPE = {
  ANNUAL: 'ANNUAL',
  SICK: 'SICK',
  UNPAID: 'UNPAID',
};

export const EVENT_TYPE = {
  TIME_OFF_REQUESTED: 'TIME_OFF_REQUESTED',
  TIME_OFF_APPROVED: 'TIME_OFF_APPROVED',
  TIME_OFF_REJECTED: 'TIME_OFF_REJECTED',
  TIME_OFF_CANCELLED: 'TIME_OFF_CANCELLED',
  BALANCE_SYNCED: 'BALANCE_SYNCED',
  BALANCE_DRIFT_DETECTED: 'BALANCE_DRIFT_DETECTED',
  BALANCE_RESERVED: 'BALANCE_RESERVED',
  BALANCE_RELEASED: 'BALANCE_RELEASED',
};

export const USER_ROLE = {
  EMPLOYEE: 'EMPLOYEE',
  MANAGER: 'MANAGER',
  ADMIN: 'ADMIN',
};

export const AUDIT_ACTION = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  CANCEL: 'CANCEL',
  SYNC: 'SYNC',
};

export const ERROR_MESSAGES = {
  INSUFFICIENT_BALANCE: 'Insufficient balance for this request',
  INVALID_EMPLOYEE: 'Employee not found',
  INVALID_LOCATION: 'Location not found',
  INVALID_LEAVE_TYPE: 'Leave type not found',
  INVALID_STATE_TRANSITION: 'Invalid state transition',
  REQUEST_NOT_FOUND: 'Time-off request not found',
  BALANCE_NOT_FOUND: 'Balance not found',
  DUPLICATE_IDEMPOTENCY_KEY: 'Duplicate request with same idempotency key',
  CONCURRENT_MODIFICATION: 'Balance was modified concurrently, please retry',
  HCM_ERROR: 'HCM integration error',
  UNAUTHORIZED: 'Unauthorized',
  FORBIDDEN: 'Forbidden',
};

export const HCM_ERROR_REASONS = {
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INVALID_EMPLOYEE: 'INVALID_EMPLOYEE',
  INVALID_LOCATION: 'INVALID_LOCATION',
  INVALID_LEAVE_TYPE: 'INVALID_LEAVE_TYPE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
};
