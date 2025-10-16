/**
 * Migration Runner - DO NOT RUN AS A MIGRATION
 * 
 * This is the main migration runner that orchestrates all migrations.
 * It should be called directly: node migrations/migrate.js
 * 
 * The install script automatically skips this file when running migrations.
 */

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const db = require('../src/models/database');
const logger = require('../src/utils/logger');

async function runMigrations() {
    try {
        logger.info('Starting database migrations...');

        // Initialize database (create tables if they don't exist)
        await db.initialize();

        // Create migrations tracking table if it doesn't exist
        await db.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check if ESP8266 fix migration has already been applied
        const migrationCheck = await db.query(`
            SELECT * FROM migrations WHERE name = 'fix_esp8266_sensors_and_ips'
        `);

        if (migrationCheck.rows.length === 0) {
            // Run ESP8266 sensor and IP fixes migration
            logger.info('Running ESP8266 sensor and IP fixes migration...');
            const fixESP8266SensorsAndIPs = require('./fix_esp8266_sensors_and_ips');
            await fixESP8266SensorsAndIPs();
        } else {
            logger.info('ESP8266 sensor and IP fixes migration already applied, skipping...');
        }

        // Note: No default user is created - use the first-user registration flow instead

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