const db = require('../models/database');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class OTAService {
    constructor() {
        this.firmwareDirectory = process.env.FIRMWARE_DIR || './firmware';
        this.ensureFirmwareDirectory();
    }

    async ensureFirmwareDirectory() {
        try {
            await fs.mkdir(this.firmwareDirectory, { recursive: true });
        } catch (error) {
            logger.error('Error creating firmware directory:', error);
        }
    }

    async uploadFirmware(file, version, deviceType, releaseNotes = '') {
        try {
            // Generate checksum
            const fileBuffer = await fs.readFile(file.path);
            const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

            // Store firmware file
            const fileName = `firmware_${deviceType}_${version}.bin`;
            const filePath = path.join(this.firmwareDirectory, fileName);
            await fs.copyFile(file.path, filePath);

            // Store in database
            const result = await db.query(`
                INSERT INTO firmware_versions (version, device_type, binary_url, checksum, file_size, release_notes, is_stable, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, false, true)
                RETURNING id
            `, [
                version,
                deviceType,
                `/api/firmware/download/${fileName}`,
                checksum,
                fileBuffer.length,
                releaseNotes
            ]);

            // Clean up uploaded file
            await fs.unlink(file.path);

            logger.info(`Firmware uploaded: ${version} for ${deviceType}`);

            return {
                id: result.rows[0].id,
                version,
                deviceType,
                checksum,
                fileSize: fileBuffer.length
            };

        } catch (error) {
            logger.error('Error uploading firmware:', error);
            throw error;
        }
    }

    async getFirmwareVersions(deviceType) {
        const result = await db.query(`
            SELECT * FROM firmware_versions
            WHERE device_type = $1 AND is_active = true
            ORDER BY created_at DESC
        `, [deviceType]);

        return result.rows;
    }

    async getLatestFirmware(deviceType) {
        const result = await db.query(`
            SELECT * FROM firmware_versions
            WHERE device_type = $1 AND is_stable = true AND is_active = true
            ORDER BY created_at DESC
            LIMIT 1
        `, [deviceType]);

        return result.rows[0] || null;
    }

    async markFirmwareStable(firmwareId) {
        await db.query(`
            UPDATE firmware_versions
            SET is_stable = true
            WHERE id = $1
        `, [firmwareId]);

        logger.info(`Firmware ${firmwareId} marked as stable`);
    }

    async scheduleOTAUpdate(deviceId, firmwareVersionId, forced = false) {
        try {
            // Check if device supports OTA
            const deviceResult = await db.query(`
                SELECT d.*, dc.ota_enabled
                FROM devices d
                INNER JOIN device_config dc ON d.id = dc.device_id
                WHERE d.id = $1
            `, [deviceId]);

            if (deviceResult.rows.length === 0) {
                throw new Error('Device not found');
            }

            const device = deviceResult.rows[0];
            if (!device.ota_enabled && !forced) {
                throw new Error('OTA updates disabled for this device');
            }

            // Check if update already scheduled
            const existingUpdate = await db.query(`
                SELECT * FROM ota_updates
                WHERE device_id = $1 AND status IN ('pending', 'downloading', 'installing')
            `, [deviceId]);

            if (existingUpdate.rows.length > 0) {
                throw new Error('OTA update already in progress for this device');
            }

            // Create OTA update record
            const result = await db.query(`
                INSERT INTO ota_updates (device_id, firmware_version_id, status, created_at)
                VALUES ($1, $2, 'pending', NOW())
                RETURNING id
            `, [deviceId, firmwareVersionId]);

            // Update device target firmware version
            await db.query(`
                UPDATE devices
                SET target_firmware_version = (
                    SELECT version FROM firmware_versions WHERE id = $2
                )
                WHERE id = $1
            `, [deviceId, firmwareVersionId]);

            logger.info(`OTA update scheduled for device ${deviceId}`);

            return result.rows[0].id;

        } catch (error) {
            logger.error(`Error scheduling OTA update for device ${deviceId}:`, error);
            throw error;
        }
    }

    async updateOTAStatus(deviceId, status, progressPercent = 0, errorMessage = null) {
        await db.query(`
            UPDATE ota_updates
            SET status = $2,
                progress_percent = $3,
                error_message = $4,
                started_at = CASE WHEN status = 'pending' AND $2 = 'downloading' THEN NOW() ELSE started_at END,
                completed_at = CASE WHEN $2 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
            WHERE device_id = $1 AND status NOT IN ('completed', 'failed')
        `, [deviceId, status, progressPercent, errorMessage]);

        // If completed successfully, update device firmware version
        if (status === 'completed') {
            await db.query(`
                UPDATE devices
                SET firmware_version = target_firmware_version
                WHERE id = $1
            `, [deviceId]);
        }

        logger.info(`OTA status updated for device ${deviceId}: ${status} (${progressPercent}%)`);
    }

    async getOTAStatus(deviceId) {
        const result = await db.query(`
            SELECT ou.*, fv.version, fv.file_size
            FROM ota_updates ou
            INNER JOIN firmware_versions fv ON ou.firmware_version_id = fv.id
            WHERE ou.device_id = $1
            ORDER BY ou.created_at DESC
            LIMIT 1
        `, [deviceId]);

        return result.rows[0] || null;
    }

    async getPendingOTAUpdates() {
        const result = await db.query(`
            SELECT ou.*, d.name as device_name, fv.version, fv.binary_url, fv.checksum
            FROM ota_updates ou
            INNER JOIN devices d ON ou.device_id = d.id
            INNER JOIN firmware_versions fv ON ou.firmware_version_id = fv.id
            WHERE ou.status = 'pending'
            ORDER BY ou.created_at ASC
        `);

        return result.rows;
    }

    async cancelOTAUpdate(deviceId) {
        await db.query(`
            UPDATE ota_updates
            SET status = 'cancelled'
            WHERE device_id = $1 AND status IN ('pending', 'downloading')
        `, [deviceId]);

        await db.query(`
            UPDATE devices
            SET target_firmware_version = NULL
            WHERE id = $1
        `, [deviceId]);

        logger.info(`OTA update cancelled for device ${deviceId}`);
    }

    async generateFirmwareBinary(deviceId, baseVersion) {
        /**
         * Generate device-specific firmware binary with injected configuration
         *
         * This implementation uses a config injection approach:
         * 1. Get device-specific configuration
         * 2. Get protocol settings (HTTP/MQTT)
         * 3. Inject configuration into firmware binary at reserved memory location
         * 4. Return path to customized binary
         */

        try {
            // Fetch device configuration with all related data
            const deviceResult = await db.query(`
                SELECT
                    d.*,
                    dc.*,
                    l.timezone,
                    l.name as location_name,
                    ps.protocol,
                    ps.mqtt_broker_host,
                    ps.mqtt_broker_port,
                    ps.mqtt_username,
                    ps.mqtt_password,
                    ps.mqtt_topic_prefix,
                    ps.mqtt_qos,
                    ps.http_endpoint,
                    ps.heartbeat_interval as protocol_heartbeat_interval
                FROM devices d
                LEFT JOIN device_config dc ON d.id = dc.device_id
                LEFT JOIN locations l ON d.location_id = l.id
                LEFT JOIN protocol_settings ps ON d.id = ps.device_id
                WHERE d.id = $1
            `, [deviceId]);

            if (deviceResult.rows.length === 0) {
                throw new Error(`Device ${deviceId} not found`);
            }

            const deviceConfig = deviceResult.rows[0];

            // Get device sensors
            const sensorsResult = await db.query(`
                SELECT ds.*, st.name as sensor_type, st.unit
                FROM device_sensors ds
                JOIN sensor_types st ON ds.sensor_type_id = st.id
                WHERE ds.device_id = $1 AND ds.enabled = true
                ORDER BY ds.pin
            `, [deviceId]);

            deviceConfig.sensors = sensorsResult.rows;

            // Generate device configuration blob
            const configData = this.generateDeviceConfigData(deviceConfig);

            // Get base firmware path
            const baseFirmwarePath = path.join(
                this.firmwareDirectory,
                `firmware_esp8266_${baseVersion}.bin`
            );

            // Check if base firmware exists
            try {
                await fs.access(baseFirmwarePath);
            } catch (error) {
                logger.warn(`Base firmware ${baseVersion} not found, using generic firmware`);
                // Return generic firmware path - will be caught by caller
                return {
                    binaryPath: baseFirmwarePath,
                    isCustomized: false,
                    configData: configData
                };
            }

            // Create customized firmware filename
            const customFirmwareName = `firmware_${deviceId}_${baseVersion}_${Date.now()}.bin`;
            const customFirmwarePath = path.join(this.firmwareDirectory, customFirmwareName);

            // Read base firmware
            const baseFirmware = await fs.readFile(baseFirmwarePath);

            // Inject configuration into firmware binary
            const customFirmware = await this.injectConfigIntoFirmware(
                baseFirmware,
                configData
            );

            // Write customized firmware
            await fs.writeFile(customFirmwarePath, customFirmware);

            logger.info(`Generated customized firmware for device ${deviceId}: ${customFirmwareName}`);

            return {
                binaryPath: customFirmwarePath,
                binaryUrl: `/api/firmware/download/${customFirmwareName}`,
                isCustomized: true,
                configData: configData,
                checksum: crypto.createHash('sha256').update(customFirmware).digest('hex'),
                fileSize: customFirmware.length
            };

        } catch (error) {
            logger.error(`Error generating firmware for device ${deviceId}:`, error);
            throw error;
        }
    }

    generateDeviceConfigData(deviceConfig) {
        /**
         * Generate device configuration data structure
         * This creates a JSON configuration that will be injected into firmware
         */

        const config = {
            version: 1,
            device: {
                id: deviceConfig.id || deviceConfig.device_id,
                name: deviceConfig.name,
                type: deviceConfig.device_type || 'ESP8266',
                location: deviceConfig.location_name || deviceConfig.location_id || 'Unknown',
                timezone: deviceConfig.timezone || 'UTC'
            },
            wifi: {
                ssid: deviceConfig.wifi_ssid || '',
                password: deviceConfig.wifi_password || '',
                static_ip: deviceConfig.static_ip || null,
                gateway: deviceConfig.gateway || null,
                subnet: deviceConfig.subnet || null
            },
            protocol: {
                type: deviceConfig.protocol || 'http',
                heartbeat_interval: deviceConfig.protocol_heartbeat_interval ||
                                   deviceConfig.heartbeat_interval || 300
            },
            settings: {
                ota_enabled: deviceConfig.ota_enabled !== false,
                debug_mode: deviceConfig.debug_mode || false,
                armed: deviceConfig.armed !== false,
                sensor_read_interval: deviceConfig.sensor_read_interval || 5000
            },
            sensors: (deviceConfig.sensors || []).map(sensor => ({
                pin: sensor.pin,
                type: sensor.sensor_type,
                name: sensor.name || sensor.sensor_type,
                unit: sensor.unit || '',
                calibration_offset: parseFloat(sensor.calibration_offset) || 0,
                calibration_multiplier: parseFloat(sensor.calibration_multiplier) || 1,
                min_threshold: parseFloat(sensor.min_threshold) || null,
                max_threshold: parseFloat(sensor.max_threshold) || null
            }))
        };

        // Add protocol-specific configuration
        if (config.protocol.type === 'mqtt') {
            config.protocol.mqtt = {
                broker_host: deviceConfig.mqtt_broker_host || 'localhost',
                broker_port: deviceConfig.mqtt_broker_port || 1883,
                username: deviceConfig.mqtt_username || '',
                password: deviceConfig.mqtt_password || '',
                topic_prefix: deviceConfig.mqtt_topic_prefix || 'iot',
                qos: deviceConfig.mqtt_qos || 1
            };
        } else {
            config.protocol.http = {
                endpoint: deviceConfig.http_endpoint ||
                         process.env.PUBLIC_URL ||
                         'http://localhost:3000/api',
                api_key: deviceConfig.api_key || ''
            };
        }

        return config;
    }

    async injectConfigIntoFirmware(baseFirmware, configData) {
        /**
         * Inject configuration into firmware binary
         *
         * This uses a marker-based injection strategy:
         * 1. Look for a magic marker in the firmware binary
         * 2. Replace the marker section with actual configuration
         * 3. Pad/truncate to fit the reserved space
         *
         * Note: The firmware must be compiled with a CONFIG_MARKER section
         */

        const configJson = JSON.stringify(configData);
        const configBuffer = Buffer.from(configJson, 'utf8');

        // Magic marker that should exist in the compiled firmware
        // This needs to be added to the Arduino firmware code as a placeholder
        const MAGIC_MARKER = Buffer.from('__CONFIG_START__', 'utf8');
        const MAGIC_END = Buffer.from('__CONFIG_END__', 'utf8');

        // Find the magic marker in firmware
        const markerIndex = baseFirmware.indexOf(MAGIC_MARKER);
        const endMarkerIndex = baseFirmware.indexOf(MAGIC_END);

        if (markerIndex === -1 || endMarkerIndex === -1) {
            logger.warn('Config markers not found in firmware, returning unmodified binary');
            logger.info('Firmware must be compiled with CONFIG_MARKER placeholder for customization');

            // Return original firmware - it will work but without injected config
            // Device will need to fetch config via API on first boot
            return baseFirmware;
        }

        // Calculate available config space
        const configSpace = endMarkerIndex - markerIndex - MAGIC_MARKER.length;

        if (configBuffer.length > configSpace) {
            throw new Error(
                `Configuration too large: ${configBuffer.length} bytes ` +
                `(max ${configSpace} bytes). Reduce sensor count or simplify config.`
            );
        }

        // Create new firmware buffer with injected config
        const newFirmware = Buffer.alloc(baseFirmware.length);

        // Copy everything before marker
        baseFirmware.copy(newFirmware, 0, 0, markerIndex);

        // Write magic marker
        MAGIC_MARKER.copy(newFirmware, markerIndex);

        // Write configuration
        configBuffer.copy(newFirmware, markerIndex + MAGIC_MARKER.length);

        // Pad remaining space with zeros
        const paddingStart = markerIndex + MAGIC_MARKER.length + configBuffer.length;
        const paddingEnd = endMarkerIndex;
        newFirmware.fill(0, paddingStart, paddingEnd);

        // Write end marker
        MAGIC_END.copy(newFirmware, endMarkerIndex);

        // Copy everything after end marker
        baseFirmware.copy(
            newFirmware,
            endMarkerIndex + MAGIC_END.length,
            endMarkerIndex + MAGIC_END.length
        );

        logger.info(`Injected ${configBuffer.length} bytes of configuration into firmware`);

        return newFirmware;
    }

    generateConfigHeader(deviceConfig) {
        return `
// Auto-generated configuration for device ${deviceConfig.id}
#define DEVICE_ID "${deviceConfig.id}"
#define WIFI_SSID "${deviceConfig.wifi_ssid || 'YOUR_WIFI'}"
#define WIFI_PASSWORD "${deviceConfig.wifi_password || 'YOUR_PASSWORD'}"
#define SERVER_URL "${process.env.PUBLIC_URL || 'https://your-server.com'}"
#define HEARTBEAT_INTERVAL ${deviceConfig.heartbeat_interval || 300}
#define DEVICE_ARMED ${deviceConfig.armed ? 'true' : 'false'}
#define OTA_ENABLED ${deviceConfig.ota_enabled ? 'true' : 'false'}
#define DEBUG_MODE ${deviceConfig.debug_mode ? 'true' : 'false'}
        `.trim();
    }

    async getOTAStatistics() {
        const result = await db.query(`
            SELECT
                COUNT(*) as total_updates,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_updates,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_updates,
                COUNT(CASE WHEN status IN ('pending', 'downloading', 'installing') THEN 1 END) as in_progress_updates,
                AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_update_duration_seconds
            FROM ota_updates
            WHERE created_at > NOW() - INTERVAL '30 days'
        `);

        return result.rows[0];
    }
}

module.exports = OTAService;