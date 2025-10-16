/**
 * Fix ESP8266 devices with incorrect sensor pin assignments
 * 
 * This script:
 * 1. Finds all ESP8266 devices with light/sound/gas sensors on wrong pins
 * 2. Updates the pin to A0 (the only analog pin on ESP8266)
 * 3. Clears invalid IP addresses (127.0.0.1, 0.0.0.0)
 * 
 * Run with: node scripts/fix-esp8266-sensors.js
 */

const db = require('../src/models/database');

async function fixESP8266Sensors() {
    console.log('🔧 Starting ESP8266 sensor pin and IP fixes...\n');

    try {
        // 1. Find all ESP8266 devices
        const devicesResult = await db.query(`
            SELECT id, name, device_type, ip_address
            FROM devices
            WHERE device_type = 'esp8266'
            ORDER BY created_at DESC
        `);

        console.log(`📱 Found ${devicesResult.rows.length} ESP8266 device(s)\n`);

        if (devicesResult.rows.length === 0) {
            console.log('✅ No ESP8266 devices found. Nothing to fix.');
            process.exit(0);
        }

        let totalFixed = 0;
        let ipFixed = 0;

        // 2. Process each device
        for (const device of devicesResult.rows) {
            console.log(`\n📋 Device: ${device.name} (${device.id})`);
            console.log(`   IP: ${device.ip_address || 'NULL'}`);

            // Fix invalid IP addresses
            if (device.ip_address && ['127.0.0.1', '0.0.0.0', 'localhost', '::1'].includes(device.ip_address)) {
                console.log(`   ⚠️  Invalid IP detected: ${device.ip_address}`);
                await db.query(`
                    UPDATE devices
                    SET ip_address = NULL
                    WHERE id = $1
                `, [device.id]);
                console.log(`   ✅ Cleared invalid IP address`);
                ipFixed++;
            }

            // 3. Find analog sensors (light, sound, gas) for this device
            const sensorsResult = await db.query(`
                SELECT ds.id, ds.pin, ds.name, ds.enabled, st.name as sensor_type
                FROM device_sensors ds
                JOIN sensor_types st ON ds.sensor_type_id = st.id
                WHERE ds.device_id = $1
                AND LOWER(st.name) IN ('photodiode', 'light', 'sound', 'gas', 'microphone', 'mq')
            `, [device.id]);

            if (sensorsResult.rows.length === 0) {
                console.log(`   ℹ️  No analog sensors found`);
                continue;
            }

            console.log(`   🔍 Found ${sensorsResult.rows.length} analog sensor(s):`);

            // 4. Fix each sensor's pin
            for (const sensor of sensorsResult.rows) {
                console.log(`      - ${sensor.name || sensor.sensor_type} on pin ${sensor.pin}`);

                if (sensor.pin !== 'A0') {
                    console.log(`        ⚠️  Wrong pin! Should be A0 for ESP8266`);

                    // Check if A0 pin is already taken by another sensor
                    const conflictResult = await db.query(`
                        SELECT id, name
                        FROM device_sensors
                        WHERE device_id = $1 AND pin = 'A0' AND id != $2
                    `, [device.id, sensor.id]);

                    if (conflictResult.rows.length > 0) {
                        console.log(`        ⚠️  Pin A0 is already used by: ${conflictResult.rows[0].name}`);
                        console.log(`        🗑️  Deleting old sensor on wrong pin...`);

                        // Delete the sensor with wrong pin
                        await db.query(`
                            DELETE FROM device_sensors WHERE id = $1
                        `, [sensor.id]);
                        console.log(`        ✅ Deleted sensor with wrong pin`);
                    } else {
                        // Update the pin to A0
                        await db.query(`
                            UPDATE device_sensors
                            SET pin = 'A0'
                            WHERE id = $1
                        `, [sensor.id]);
                        console.log(`        ✅ Updated pin to A0`);
                    }

                    totalFixed++;
                } else {
                    console.log(`        ✅ Pin is already correct (A0)`);
                }
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log(`\n✅ Fix complete!`);
        console.log(`   - Fixed ${totalFixed} sensor pin(s)`);
        console.log(`   - Cleared ${ipFixed} invalid IP address(es)`);
        console.log(`\n📝 Next steps:`);
        console.log(`   1. Restart your ESP8266 device`);
        console.log(`   2. Wait for it to connect to WiFi`);
        console.log(`   3. Device will send heartbeat with correct IP`);
        console.log(`   4. Sensors should start reporting data\n`);

        process.exit(0);

    } catch (error) {
        console.error('\n❌ Error fixing sensors:', error);
        process.exit(1);
    }
}

// Run the fix
fixESP8266Sensors();
