import { initializeDatabase } from './config.js';
import {
  initEmployeeModel,
  initLocationModel,
  initLeaveTypeModel,
} from './models/index.js';
import { LEAVE_TYPE } from '../../common/constants.js';
import { Logger } from '../../common/logger.js';

const logger = new Logger('DatabaseSeed');

/**
 * Seed database with initial data
 * Usage: node src/infrastructure/database/seed.js
 */
async function seedDatabase() {
  console.log('🌱 Starting database seed...');

  try {
    await initializeDatabase();

    // Initialize models
    const Employee = initEmployeeModel();
    const Location = initLocationModel();
    const LeaveType = initLeaveTypeModel();

    // Create sample employees
    const employees = await Employee.bulkCreate([
      {
        id: 'emp-001',
        name: 'John Doe',
        email: 'john.doe@example.com',
        externalId: 'EMP001',
      },
      {
        id: 'emp-002',
        name: 'Jane Smith',
        email: 'jane.smith@example.com',
        externalId: 'EMP002',
      },
      {
        id: 'emp-003',
        name: 'Ahmed Khan',
        email: 'ahmed.khan@example.com',
        externalId: 'EMP003',
      },
      {
        id: 'emp-004',
        name: 'Sarah Manager',
        email: 'sarah.manager@example.com',
        externalId: 'MGR001',
      },
    ], { ignoreDuplicates: true });

    console.log(`✅ Created ${employees.length} employees`);

    // Create sample locations
    const locations = await Location.bulkCreate([
      {
        id: 'loc-pk',
        code: 'PK-LHR',
        name: 'Pakistan - Lahore',
        externalId: 'LOC-PK-LHR',
      },
      {
        id: 'loc-us',
        code: 'US-NYC',
        name: 'United States - New York',
        externalId: 'LOC-US-NYC',
      },
      {
        id: 'loc-uk',
        code: 'UK-LON',
        name: 'United Kingdom - London',
        externalId: 'LOC-UK-LON',
      },
    ], { ignoreDuplicates: true });

    console.log(`✅ Created ${locations.length} locations`);

    // Create sample leave types
    const leaveTypes = await LeaveType.bulkCreate([
      {
        id: 'lt-annual',
        code: LEAVE_TYPE.ANNUAL,
        name: 'Annual Leave',
        description: 'Paid annual leave',
        externalId: 'LEAVE-ANNUAL',
      },
      {
        id: 'lt-sick',
        code: LEAVE_TYPE.SICK,
        name: 'Sick Leave',
        description: 'Paid sick leave',
        externalId: 'LEAVE-SICK',
      },
      {
        id: 'lt-unpaid',
        code: LEAVE_TYPE.UNPAID,
        name: 'Unpaid Leave',
        description: 'Unpaid leave',
        externalId: 'LEAVE-UNPAID',
      },
    ], { ignoreDuplicates: true });

    console.log(`✅ Created ${leaveTypes.length} leave types`);
    console.log('✅ Database seed completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Seed failed', error);
    process.exit(1);
  }
}

// Run seed when this script is executed directly
seedDatabase().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
