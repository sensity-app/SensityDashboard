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
        // This would generate a custom firmware binary with device-specific configuration
        // For now, this is a placeholder that returns the base firmware

        const device = await db.query(`
            SELECT d.*, dc.*, l.timezone
            FROM devices d
            INNER JOIN device_config dc ON d.id = dc.device_id
            LEFT JOIN locations l ON d.location_id = l.id
            WHERE d.id = $1
        `, [deviceId]);

        if (device.rows.length === 0) {
            throw new Error('Device not found');
        }

        const deviceConfig = device.rows[0];

        // Generate configuration header file
        const configHeader = this.generateConfigHeader(deviceConfig);

        // In a real implementation, you would:
        // 1. Take the base firmware binary
        // 2. Inject the configuration
        // 3. Recompile or patch the binary
        // 4. Return the custom binary

        return {
            binaryPath: path.join(this.firmwareDirectory, `firmware_esp8266_${baseVersion}.bin`),
            configHeader: configHeader
        };
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