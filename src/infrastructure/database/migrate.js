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

/**
 * Database migration runner
 * Usage: node src/infrastructure/database/migrate.js
 */
async function runMigrations() {
  console.log('🔄 Starting database migrations...');

  try {
    const sequelize = await initializeDatabase();

    // Initialize all models
    initEmployeeModel();
    initLocationModel();
    initLeaveTypeModel();
    initBalanceModel();
    initTimeOffRequestModel();
    initAuditLogModel();
    initOutboxEventModel();
    initIdempotencyKeyModel();

    // Sync all models with database
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });

    console.log('✅ Database migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration when this script is executed directly
runMigrations().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
