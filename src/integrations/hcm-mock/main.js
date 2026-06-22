import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(express.json());

// Mock HCM data store
const mockHcmDataStore = {
  balances: new Map(),
  employees: new Map(),
  locations: new Map(),
  leaveTypes: new Map(),
  failureMode: null,
  syncCounter: 0,
};

// Initialize with sample data
function initializeMockData() {
  // Sample employees
  mockHcmDataStore.employees.set('EMP001', {
    id: 'EMP001',
    name: 'John Doe',
  });
  mockHcmDataStore.employees.set('EMP002', {
    id: 'EMP002',
    name: 'Jane Smith',
  });
  mockHcmDataStore.employees.set('EMP003', {
    id: 'EMP003',
    name: 'Ahmed Khan',
  });

  // Sample locations
  mockHcmDataStore.locations.set('LOC-PK-LHR', {
    id: 'LOC-PK-LHR',
    code: 'PK-LHR',
    name: 'Pakistan - Lahore',
  });
  mockHcmDataStore.locations.set('LOC-US-NYC', {
    id: 'LOC-US-NYC',
    code: 'US-NYC',
    name: 'United States - New York',
  });
  mockHcmDataStore.locations.set('LOC-UK-LON', {
    id: 'LOC-UK-LON',
    code: 'UK-LON',
    name: 'United Kingdom - London',
  });

  // Sample leave types
  mockHcmDataStore.leaveTypes.set('LEAVE-ANNUAL', {
    id: 'LEAVE-ANNUAL',
    code: 'ANNUAL',
    name: 'Annual Leave',
  });
  mockHcmDataStore.leaveTypes.set('LEAVE-SICK', {
    id: 'LEAVE-SICK',
    code: 'SICK',
    name: 'Sick Leave',
  });
  mockHcmDataStore.leaveTypes.set('LEAVE-UNPAID', {
    id: 'LEAVE-UNPAID',
    code: 'UNPAID',
    name: 'Unpaid Leave',
  });

  // Initialize sample balances
  const sampleBalances = [
    { employeeId: 'EMP001', locationId: 'LOC-PK-LHR', leaveTypeId: 'LEAVE-ANNUAL', balance: 20 },
    { employeeId: 'EMP001', locationId: 'LOC-PK-LHR', leaveTypeId: 'LEAVE-SICK', balance: 10 },
    { employeeId: 'EMP002', locationId: 'LOC-US-NYC', leaveTypeId: 'LEAVE-ANNUAL', balance: 25 },
    { employeeId: 'EMP003', locationId: 'LOC-PK-LHR', leaveTypeId: 'LEAVE-ANNUAL', balance: 15 },
  ];

  sampleBalances.forEach((b) => {
    const key = `${b.employeeId}-${b.locationId}-${b.leaveTypeId}`;
    mockHcmDataStore.balances.set(key, {
      employeeId: b.employeeId,
      locationId: b.locationId,
      leaveTypeId: b.leaveTypeId,
      balance: b.balance,
      lastUpdated: new Date(),
    });
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'up',
    timestamp: new Date().toISOString(),
  });
});

// Get balance endpoint
app.get('/hcm/balance/:employeeId/:locationId/:leaveTypeId', (req, res) => {
  const { employeeId, locationId, leaveTypeId } = req.params;

  // Check for failure modes
  if (mockHcmDataStore.failureMode === 'TIMEOUT') {
    return res.status(504).json({ error: 'Gateway Timeout' });
  }

  if (mockHcmDataStore.failureMode === 'NOT_FOUND') {
    return res.status(404).json({ error: 'Employee not found' });
  }

  if (mockHcmDataStore.failureMode === 'NETWORK_ERROR') {
    return res.status(500).json({ error: 'Internal Server Error' });
  }

  // Check if employee exists
  if (!mockHcmDataStore.employees.has(employeeId)) {
    return res.status(404).json({ error: 'INVALID_EMPLOYEE' });
  }

  // Check if location exists
  if (!mockHcmDataStore.locations.has(locationId)) {
    return res.status(404).json({ error: 'INVALID_LOCATION' });
  }

  // Check if leave type exists
  if (!mockHcmDataStore.leaveTypes.has(leaveTypeId)) {
    return res.status(404).json({ error: 'INVALID_LEAVE_TYPE' });
  }

  const key = `${employeeId}-${locationId}-${leaveTypeId}`;
  const balance = mockHcmDataStore.balances.get(key);

  if (!balance) {
    return res.status(404).json({ error: 'No balance found' });
  }

  res.json({
    employeeId,
    locationId,
    leaveTypeId,
    balance: balance.balance,
    lastUpdated: balance.lastUpdated,
  });
});

// Validate balance endpoint
app.post('/hcm/validate', (req, res) => {
  const { employeeId, locationId, leaveTypeId, days } = req.body;

  if (!employeeId || !locationId || !leaveTypeId || !days) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!mockHcmDataStore.employees.has(employeeId)) {
    return res.status(400).json({
      valid: false,
      reason: 'INVALID_EMPLOYEE',
    });
  }

  if (!mockHcmDataStore.locations.has(locationId)) {
    return res.status(400).json({
      valid: false,
      reason: 'INVALID_LOCATION',
    });
  }

  if (!mockHcmDataStore.leaveTypes.has(leaveTypeId)) {
    return res.status(400).json({
      valid: false,
      reason: 'INVALID_LEAVE_TYPE',
    });
  }

  const key = `${employeeId}-${locationId}-${leaveTypeId}`;
  const balance = mockHcmDataStore.balances.get(key);

  if (!balance || balance.balance < days) {
    return res.json({
      valid: false,
      reason: 'INSUFFICIENT_BALANCE',
    });
  }

  res.json({ valid: true });
});

// Apply leave endpoint
app.post('/hcm/apply-leave', (req, res) => {
  const { employeeId, locationId, leaveTypeId, days } = req.body;

  if (!employeeId || !locationId || !leaveTypeId || !days) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!mockHcmDataStore.employees.has(employeeId)) {
    return res.json({
      success: false,
      reason: 'INVALID_EMPLOYEE',
    });
  }

  const key = `${employeeId}-${locationId}-${leaveTypeId}`;
  const balance = mockHcmDataStore.balances.get(key);

  if (!balance || balance.balance < days) {
    return res.json({
      success: false,
      reason: 'INSUFFICIENT_BALANCE',
    });
  }

  // Apply the leave
  balance.balance -= days;
  balance.lastUpdated = new Date();

  res.json({
    success: true,
    transactionId: uuidv4(),
    remainingBalance: balance.balance,
  });
});

// Full sync endpoint - accepts complete balance corpus
app.post('/hcm/full-sync', (req, res) => {
  const { balances } = req.body;

  if (!Array.isArray(balances)) {
    return res.status(400).json({ error: 'Invalid balances format' });
  }

  mockHcmDataStore.syncCounter++;

  // Store the balances
  balances.forEach((b) => {
    const key = `${b.employeeId}-${b.locationId}-${b.leaveTypeId}`;
    mockHcmDataStore.balances.set(key, {
      ...b,
      lastUpdated: new Date(),
    });
  });

  res.json({
    success: true,
    syncId: uuidv4(),
    recordsProcessed: balances.length,
    syncTimestamp: new Date(),
  });
});

// Admin endpoint to simulate failures
app.post('/hcm/admin/set-failure-mode', (req, res) => {
  const { mode } = req.body;
  mockHcmDataStore.failureMode = mode;

  res.json({
    message: `Failure mode set to: ${mode}`,
    currentFailureMode: mockHcmDataStore.failureMode,
  });
});

// Admin endpoint to clear failure mode
app.post('/hcm/admin/clear-failure-mode', (req, res) => {
  mockHcmDataStore.failureMode = null;

  res.json({
    message: 'Failure mode cleared',
    currentFailureMode: mockHcmDataStore.failureMode,
  });
});

// Admin endpoint to get current state
app.get('/hcm/admin/state', (req, res) => {
  res.json({
    balancesCount: mockHcmDataStore.balances.size,
    employeesCount: mockHcmDataStore.employees.size,
    locationsCount: mockHcmDataStore.locations.size,
    leaveTypesCount: mockHcmDataStore.leaveTypes.size,
    syncCounter: mockHcmDataStore.syncCounter,
    currentFailureMode: mockHcmDataStore.failureMode,
  });
});

// Initialize mock data
initializeMockData();

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Mock HCM Service running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
