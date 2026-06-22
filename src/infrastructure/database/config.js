import { Sequelize } from 'sequelize';
import { Logger } from '../../common/logger.js';

const logger = new Logger('DatabaseConfig');

let sequelize = null;

export async function initializeDatabase() {
  if (sequelize) {
    return sequelize;
  }

  const databaseUrl = process.env.DATABASE_URL || 'sqlite://./data/time-off.db';
  const isLogging = process.env.DATABASE_LOGGING === 'true';

  try {
    if (databaseUrl.startsWith('sqlite://')) {
      // SQLite configuration
      const dbPath = databaseUrl.replace('sqlite://', '');
      sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: dbPath,
        logging: isLogging ? logger.debug.bind(logger) : false,
        define: {
          timestamps: true,
          underscored: false,
          freezeTableName: true,
        },
      });
    } else {
      // PostgreSQL or other databases
      sequelize = new Sequelize(databaseUrl, {
        logging: isLogging ? logger.debug.bind(logger) : false,
        define: {
          timestamps: true,
          underscored: false,
          freezeTableName: true,
        },
      });
    }

    // Test the connection
    await sequelize.authenticate();
    logger.log(`✅ Database connection established: ${databaseUrl}`);

    return sequelize;
  } catch (error) {
    logger.error('Failed to connect to database', error);
    throw error;
  }
}

export function getSequelize() {
  if (!sequelize) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return sequelize;
}

export async function closeDatabase() {
  if (sequelize) {
    await sequelize.close();
    logger.log('Database connection closed');
    sequelize = null;
  }
}
