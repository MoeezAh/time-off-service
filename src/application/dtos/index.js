function ensureObject(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw { code: 'VALIDATION_ERROR', message: 'Request body must be an object' };
  }
}

function requireString(payload, field) {
  const value = payload[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw { code: 'VALIDATION_ERROR', message: `${field} is required` };
  }
  return value.trim();
}

function optionalString(payload, field) {
  const value = payload[field];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw { code: 'VALIDATION_ERROR', message: `${field} must be a string` };
  }
  return value.trim();
}

function requireNumber(payload, field, minimum) {
  const value = Number(payload[field]);
  if (!Number.isFinite(value) || value < minimum) {
    throw { code: 'VALIDATION_ERROR', message: `${field} must be at least ${minimum}` };
  }
  return value;
}

function requireDateString(payload, field) {
  const value = requireString(payload, field);
  if (Number.isNaN(Date.parse(value))) {
    throw { code: 'VALIDATION_ERROR', message: `${field} must be a valid date` };
  }
  return value;
}

export function validateCreateTimeOffRequest(payload) {
  ensureObject(payload);

  return {
    employeeId: requireString(payload, 'employeeId'),
    locationId: requireString(payload, 'locationId'),
    leaveTypeId: requireString(payload, 'leaveTypeId'),
    startDate: requireDateString(payload, 'startDate'),
    endDate: requireDateString(payload, 'endDate'),
    days: requireNumber(payload, 'days', 0.5),
    reason: optionalString(payload, 'reason'),
    idempotencyKey: optionalString(payload, 'idempotencyKey'),
  };
}

export function validateApproval(payload = {}) {
  ensureObject(payload);

  return {
    notes: optionalString(payload, 'notes'),
  };
}

export function validateRejection(payload) {
  ensureObject(payload);

  return {
    reason: requireString(payload, 'reason'),
  };
}

export function validateSyncBalances(payload) {
  ensureObject(payload);
  if (!Array.isArray(payload.balances)) {
    throw { code: 'VALIDATION_ERROR', message: 'balances must be an array' };
  }

  const balances = payload.balances.map((balance, index) => {
    try {
      ensureObject(balance);
      return {
        employeeId: requireString(balance, 'employeeId'),
        locationId: requireString(balance, 'locationId'),
        leaveTypeId: requireString(balance, 'leaveTypeId'),
        balance: requireNumber(
          { balance: balance.balance ?? balance.availableBalance },
          'balance',
          0,
        ),
      };
    } catch (error) {
      throw {
        code: 'VALIDATION_ERROR',
        message: `balances[${index}]: ${error.message}`,
      };
    }
  });

  return { balances };
}

export function validateCreateBalance(payload) {
  ensureObject(payload);

  return {
    employeeId: requireString(payload, 'employeeId'),
    locationId: requireString(payload, 'locationId'),
    leaveTypeId: requireString(payload, 'leaveTypeId'),
    availableBalance: requireNumber(payload, 'availableBalance', 0),
    reservedBalance: payload.reservedBalance === undefined ? 0 : requireNumber(payload, 'reservedBalance', 0),
    usedBalance: payload.usedBalance === undefined ? 0 : requireNumber(payload, 'usedBalance', 0),
  };
}
