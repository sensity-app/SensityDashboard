// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const db = require('../src/models/database');
const logger = require('../src/utils/logger');

/**
 * Migration: Fix ESP8266 Analog Sensor Pins and Invalid IP Addresses
 * 
 * Issue: ESP8266 devices were registering with wrong pin numbers (e.g., 17 instead of A0)
 * and invalid IP addresses (127.0.0.1, 0.0.0.0) were being stored.
 * 
 * This migration:
 * 1. Normalizes analog sensor pins (light, sound, gas) to A0 for ESP8266 devices
 * 2. Clears invalid IP addresses from devices table
 * 3. Ensures data consistency between firmware and database
 * 
 * Created: October 16, 2025
 */

async function fixESP8266SensorsAndIPs() {
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        logger.info('Starting ESP8266 sensor pin and IP address fixes...');

        // Step 0: Ensure migration tracking table exists (in case this is run standalone)
        await client.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                migration_name VARCHAR(255) UNIQUE NOT NULL,
                migration_type VARCHAR(10) NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check if already applied (for standalone runs)
        const alreadyApplied = await client.query(`
            SELECT 1 FROM migrations WHERE migration_name = 'fix_esp8266_sensors_and_ips.js' AND migration_type = 'js'
        `);

        if (alreadyApplied.rows.length > 0) {
            logger.info('Migration already applied, skipping...');
            await client.query('COMMIT');
            return;
        }

        // Step 1: Clear invalid IP addresses from all devices
        logger.info('Clearing invalid IP addresses...');

        // Handle inet type - only match valid inet values, skip invalid ones
        const invalidIPsResult = await client.query(`
            UPDATE devices
            SET ip_address = NULL
            WHERE ip_address IS NOT NULL 
            AND (
                ip_address = '127.0.0.1'::inet 
                OR ip_address = '0.0.0.0'::inet 
                OR ip_address = '::1'::inet 
                OR ip_address = '::'::inet
                OR host(ip_address) = '127.0.0.1'
                OR host(ip_address) = '0.0.0.0'
            )
            RETURNING id, name
        `);

        if (invalidIPsResult.rowCount > 0) {
            logger.info(`Cleared invalid IP addresses from ${invalidIPsResult.rowCount} device(s)`);
        } else {
            logger.info('No invalid IP addresses found');
        }

        // Step 2: Fix ESP8266 analog sensor pins
        logger.info('Fixing ESP8266 analog sensor pins...');

        // Find all ESP8266 devices with analog sensors on wrong pins
        const wrongPinsResult = await client.query(`
            SELECT 
                d.id as device_id,
                d.name as device_name,
                ds.id as sensor_id,
                ds.pin as current_pin,
                ds.name as sensor_name,
                st.name as sensor_type
            FROM devices d
            JOIN device_sensors ds ON d.id = ds.device_id
            JOIN sensor_types st ON ds.sensor_type_id = st.id
            WHERE d.device_type = 'esp8266'
            AND LOWER(st.name) IN ('photodiode', 'light', 'sound', 'gas', 'microphone', 'mq-2', 'mq-7', 'mq-135')
            AND ds.pin != 'A0'
        `);

        if (wrongPinsResult.rows.length > 0) {
            logger.info(`Found ${wrongPinsResult.rows.length} sensor(s) with incorrect pins`);

            for (const sensor of wrongPinsResult.rows) {
                logger.info(`  - Device: ${sensor.device_name}, Sensor: ${sensor.sensor_type}, Wrong Pin: ${sensor.current_pin}`);

                // Check if A0 is already occupied by another sensor on this device
                const conflictResult = await client.query(`
                    SELECT id, name
                    FROM device_sensors
                    WHERE device_id = $1 
                    AND pin = 'A0' 
                    AND id != $2
                `, [sensor.device_id, sensor.sensor_id]);

                if (conflictResult.rows.length > 0) {
                    // A0 is occupied - delete the sensor with wrong pin (duplicate)
                    logger.info(`    Pin A0 already occupied, deleting duplicate sensor on pin ${sensor.current_pin}`);
                    await client.query(`
                        DELETE FROM device_sensors WHERE id = $1
                    `, [sensor.sensor_id]);
                } else {
                    // A0 is free - update the pin
                    logger.info(`    Updating pin from ${sensor.current_pin} to A0`);
                    await client.query(`
                        UPDATE device_sensors
                        SET pin = 'A0'
                        WHERE id = $1
                    `, [sensor.sensor_id]);
                }
            }

            logger.info(`✅ Fixed ${wrongPinsResult.rows.length} sensor pin(s)`);
        } else {
            logger.info('No sensors with incorrect pins found');
        }

        // Step 3: Record this migration
        await client.query(`
            INSERT INTO migrations (migration_name, migration_type)
            VALUES ('fix_esp8266_sensors_and_ips.js', 'js')
            ON CONFLICT (migration_name) DO NOTHING
        `);

        await client.query('COMMIT');

        logger.info('✅ ESP8266 sensor and IP fix migration completed successfully');
        logger.info('');
        logger.info('Summary:');
        logger.info(`  - Invalid IPs cleared: ${invalidIPsResult.rowCount}`);
        logger.info(`  - Sensor pins fixed: ${wrongPinsResult.rows.length}`);
        logger.info('');
        logger.info('Next steps:');
        logger.info('  1. Restart affected ESP8266 devices');
        logger.info('  2. Devices will send heartbeat with correct IP after WiFi connection');
        logger.info('  3. Sensors will report data correctly on A0 pin');

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run migration if called directly
if (require.main === module) {
    fixESP8266SensorsAndIPs()
        .then(() => {
            logger.info('Migration completed');
            process.exit(0);
        })
        .catch((error) => {
            logger.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = fixESP8266SensorsAndIPs;
