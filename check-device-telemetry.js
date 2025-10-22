#!/usr/bin/env node

/**
 * Diagnostic script to check why telemetry is failing
 * Run on server: node check-device-telemetry.js ESP8266_mh2cy4di_1sntz
 */

const { Pool } = require('pg');
require('dotenv').config({ path: './backend/.env' });

const pool = new Pool({
    user: process.env.DB_USER || 'sensityapp',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'sensity_platform',
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432
});

async function checkDeviceTelemetry(deviceId) {
    console.log('==========================================');
    console.log('Device Telemetry Diagnostic Tool');
    console.log('==========================================\n');

    try {
        // 1. Check if device exists
        console.log(`1. Checking if device "${deviceId}" exists...`);
        const deviceCheck = await pool.query(
            'SELECT id, name, device_type, status, last_heartbeat FROM devices WHERE id = $1',
            [deviceId]
        );

        if (deviceCheck.rows.length === 0) {
            console.log('❌ ERROR: Device not found in database!');
            console.log(`\nThe device "${deviceId}" does not exist.`);
            console.log('\nTo fix:');
            console.log('1. Create the device in the platform UI first');
            console.log('2. Or the device needs to send a heartbeat first to auto-register');
            process.exit(1);
        }

        console.log('✅ Device found:');
        console.log(`   Name: ${deviceCheck.rows[0].name}`);
        console.log(`   Type: ${deviceCheck.rows[0].device_type}`);
        console.log(`   Status: ${deviceCheck.rows[0].status}`);
        console.log(`   Last Heartbeat: ${deviceCheck.rows[0].last_heartbeat || 'Never'}\n`);

        // 2. Check sensor_types table
        console.log('2. Checking sensor_types table...');
        const sensorTypesCheck = await pool.query(
            'SELECT COUNT(*) as count FROM sensor_types'
        );

        if (parseInt(sensorTypesCheck.rows[0].count) === 0) {
            console.log('❌ ERROR: sensor_types table is empty!');
            console.log('\nThe sensor_types table has no data.');
            console.log('\nTo fix:');
            console.log('1. Run database initialization');
            console.log('2. Or manually insert sensor types');
            process.exit(1);
        }

        console.log(`✅ Found ${sensorTypesCheck.rows[0].count} sensor types\n`);

        // 3. List available sensor types
        console.log('3. Available sensor types:');
        const sensorTypes = await pool.query(
            'SELECT name, unit FROM sensor_types ORDER BY name'
        );
        sensorTypes.rows.forEach(st => {
            console.log(`   - ${st.name} (${st.unit})`);
        });
        console.log();

        // 4. Check device sensors
        console.log('4. Checking device sensors...');
        const deviceSensors = await pool.query(
            `SELECT ds.pin, ds.name, ds.enabled, st.name as type
             FROM device_sensors ds
             JOIN sensor_types st ON ds.sensor_type_id = st.id
             WHERE ds.device_id = $1
             ORDER BY ds.pin`,
            [deviceId]
        );

        if (deviceSensors.rows.length === 0) {
            console.log('⚠️  No sensors configured for this device yet');
            console.log('   (Sensors will be auto-created when telemetry arrives)\n');
        } else {
            console.log(`✅ Found ${deviceSensors.rows.length} configured sensors:`);
            deviceSensors.rows.forEach(s => {
                console.log(`   - Pin ${s.pin}: ${s.name} (${s.type}) - ${s.enabled ? 'Enabled' : 'Disabled'}`);
            });
            console.log();
        }

        // 5. Check recent telemetry
        console.log('5. Checking recent telemetry...');
        const recentTelemetry = await pool.query(
            `SELECT t.timestamp, t.raw_value, t.processed_value, ds.pin, st.name as type
             FROM telemetry t
             JOIN device_sensors ds ON t.device_sensor_id = ds.id
             JOIN sensor_types st ON ds.sensor_type_id = st.id
             WHERE t.device_id = $1
             ORDER BY t.timestamp DESC
             LIMIT 5`,
            [deviceId]
        );

        if (recentTelemetry.rows.length === 0) {
            console.log('⚠️  No telemetry data received yet\n');
        } else {
            console.log(`✅ Last ${recentTelemetry.rows.length} telemetry records:`);
            recentTelemetry.rows.forEach(t => {
                console.log(`   ${t.timestamp} - Pin ${t.pin} (${t.type}): ${t.raw_value} → ${t.processed_value}`);
            });
            console.log();
        }

        // 6. Check local_license_info
        console.log('6. Checking license configuration...');
        const licenseCheck = await pool.query(
            'SELECT status, license_type, expires_at FROM local_license_info LIMIT 1'
        );

        if (licenseCheck.rows.length === 0) {
            console.log('⚠️  No license configured (operating in grace mode)');
        } else {
            const license = licenseCheck.rows[0];
            console.log(`✅ License: ${license.license_type} - ${license.status}`);
            if (license.expires_at) {
                console.log(`   Expires: ${license.expires_at}`);
            }
        }
        console.log();

        // 7. Test sample telemetry
        console.log('7. Suggested test telemetry payload:');
        console.log(JSON.stringify({
            sensors: [{
                pin: 'A0',
                type: 'light',
                name: 'Light Sensor',
                raw_value: 523,
                processed_value: 523
            }],
            uptime: 123,
            free_heap: 45000,
            wifi_rssi: -67
        }, null, 2));
        console.log();

        console.log('==========================================');
        console.log('Diagnostic Complete');
        console.log('==========================================');
        console.log('\nIf telemetry is still failing, check:');
        console.log('1. Backend logs: pm2 logs server');
        console.log('2. License middleware errors');
        console.log('3. Database connection issues');
        console.log('4. TelemetryProcessor initialization');

    } catch (error) {
        console.error('❌ Diagnostic error:', error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Get device ID from command line
const deviceId = process.argv[2];

if (!deviceId) {
    console.error('Usage: node check-device-telemetry.js <DEVICE_ID>');
    console.error('Example: node check-device-telemetry.js ESP8266_mh2cy4di_1sntz');
    process.exit(1);
}

checkDeviceTelemetry(deviceId);
