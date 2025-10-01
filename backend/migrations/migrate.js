// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const db = require('../src/models/database');
const logger = require('../src/utils/logger');

async function runMigrations() {
    try {
        logger.info('Starting database migrations...');

        // Initialize database (create tables if they don't exist)
        await db.initialize();

        // Create default admin user if no users exist
        await db.createDefaultUser();

        logger.info('Database migrations completed successfully');
        process.exit(0);
    } catch (error) {
        logger.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run migrations if this script is executed directly
if (require.main === module) {
    runMigrations();
}

module.exports = runMigrations;