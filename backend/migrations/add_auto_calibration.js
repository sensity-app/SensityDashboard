const db = require('../src/models/database');
const logger = require('../src/utils/logger');

async function addAutoCalibration() {
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        logger.info('Adding auto-calibration fields to device_sensors table...');

        // Add auto-calibration fields
        await client.query(`
            ALTER TABLE device_sensors
            ADD COLUMN IF NOT EXISTS auto_calibration_enabled BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS calibration_interval_hours INTEGER DEFAULT 24,
            ADD COLUMN IF NOT EXISTS last_calibration TIMESTAMP,
            ADD COLUMN IF NOT EXISTS auto_calibrated BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS calibration_metadata JSONB
        `);

        // Create index for faster calibration queries
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_device_sensors_calibration
            ON device_sensors(auto_calibration_enabled, last_calibration)
            WHERE auto_calibration_enabled = true
        `);

        await client.query('COMMIT');
        logger.info('Auto-calibration migration completed successfully!');

        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Auto-calibration migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run migration if called directly
if (require.main === module) {
    addAutoCalibration()
        .then(() => {
            logger.info('Migration completed');
            process.exit(0);
        })
        .catch((error) => {
            logger.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = addAutoCalibration;
