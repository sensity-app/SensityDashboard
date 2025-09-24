const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = process.env.FIRMWARE_UPLOAD_DIR || './uploads/firmware';
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const originalName = file.originalname;
        cb(null, `${timestamp}_${originalName}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept only .bin files for firmware
        if (path.extname(file.originalname).toLowerCase() === '.bin') {
            cb(null, true);
        } else {
            cb(new Error('Only .bin files are allowed for firmware uploads'));
        }
    }
});


// Use centralized role-based middleware
const requireOperator = requireRole(['admin', 'operator']);

// GET /api/firmware/versions - Get all firmware versions
router.get('/versions', authenticateToken, [
    query('device_type').optional().isIn(['esp8266', 'esp32', 'arduino']),
    query('stable_only').optional().isBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { device_type, stable_only } = req.query;
        let query = `
            SELECT
                id, version, device_type, checksum, file_size, release_notes,
                is_stable, is_active, created_at,
                (SELECT COUNT(*) FROM ota_updates WHERE firmware_version_id = fv.id) as usage_count
            FROM firmware_versions fv
            WHERE is_active = true
        `;

        const params = [];

        if (device_type) {
            query += ` AND device_type = $${params.length + 1}`;
            params.push(device_type);
        }

        if (stable_only === 'true') {
            query += ` AND is_stable = true`;
        }

        query += ' ORDER BY created_at DESC';

        const result = await db.query(query, params);
        res.json({ firmware_versions: result.rows });
    } catch (error) {
        logger.error('Get firmware versions error:', error);
        res.status(500).json({ error: 'Failed to get firmware versions' });
    }
});

// GET /api/firmware/versions/:id - Get specific firmware version
router.get('/versions/:id', [
    param('id').isInt({ min: 1 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const result = await db.query(`
            SELECT
                fv.*,
                COUNT(ou.id) as total_deployments,
                COUNT(CASE WHEN ou.status = 'completed' THEN 1 END) as successful_deployments,
                COUNT(CASE WHEN ou.status = 'failed' THEN 1 END) as failed_deployments
            FROM firmware_versions fv
            LEFT JOIN ota_updates ou ON fv.id = ou.firmware_version_id
            WHERE fv.id = $1
            GROUP BY fv.id
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Firmware version not found' });
        }

        res.json({ firmware_version: result.rows[0] });
    } catch (error) {
        logger.error('Get firmware version error:', error);
        res.status(500).json({ error: 'Failed to get firmware version' });
    }
});

// POST /api/firmware/upload - Upload new firmware version
router.post('/upload', authenticateToken, requireOperator, upload.single('firmware'), [
    body('version').notEmpty().isLength({ min: 1, max: 20 }),
    body('device_type').isIn(['esp8266', 'esp32', 'arduino']),
    body('release_notes').optional().isLength({ max: 1000 }),
    body('is_stable').optional().isBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Firmware file is required' });
        }

        const { version, device_type, release_notes = '', is_stable = false } = req.body;

        // Check if version already exists for this device type
        const existingVersion = await db.query(
            'SELECT id FROM firmware_versions WHERE version = $1 AND device_type = $2',
            [version, device_type]
        );

        if (existingVersion.rows.length > 0) {
            // Clean up uploaded file
            await fs.unlink(req.file.path);
            return res.status(409).json({ error: 'Firmware version already exists for this device type' });
        }

        // Calculate checksum
        const fileBuffer = await fs.readFile(req.file.path);
        const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // Move file to firmware directory
        const firmwareDir = process.env.FIRMWARE_DIR || './firmware';
        await fs.mkdir(firmwareDir, { recursive: true });

        const fileName = `firmware_${device_type}_${version}.bin`;
        const finalPath = path.join(firmwareDir, fileName);
        await fs.rename(req.file.path, finalPath);

        // Store in database
        const result = await db.query(`
            INSERT INTO firmware_versions (
                version, device_type, binary_url, checksum, file_size,
                release_notes, is_stable, is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, true)
            RETURNING *
        `, [
            version,
            device_type,
            `/api/firmware/download/${fileName}`,
            checksum,
            fileBuffer.length,
            release_notes,
            is_stable
        ]);

        const firmware = result.rows[0];
        logger.info(`Firmware uploaded: ${version} for ${device_type} by ${req.user.email}`);

        res.status(201).json({
            message: 'Firmware uploaded successfully',
            firmware_version: firmware
        });
    } catch (error) {
        logger.error('Upload firmware error:', error);

        // Clean up uploaded file on error
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (cleanupError) {
                logger.error('Error cleaning up uploaded file:', cleanupError);
            }
        }

        res.status(500).json({ error: 'Failed to upload firmware' });
    }
});

// GET /api/firmware/download/:filename - Download firmware file
router.get('/download/:filename', async (req, res) => {
    try {
        const { filename } = req.params;

        // Security check: only allow firmware files
        if (!filename.match(/^firmware_\w+_[\w\.-]+\.bin$/)) {
            return res.status(400).json({ error: 'Invalid filename format' });
        }

        const firmwareDir = process.env.FIRMWARE_DIR || './firmware';
        const filePath = path.join(firmwareDir, filename);

        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({ error: 'Firmware file not found' });
        }

        // Set appropriate headers
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Stream the file
        const fs_sync = require('fs');
        const fileStream = fs_sync.createReadStream(filePath);
        fileStream.pipe(res);

        logger.info(`Firmware downloaded: ${filename}`);
    } catch (error) {
        logger.error('Download firmware error:', error);
        res.status(500).json({ error: 'Failed to download firmware' });
    }
});

// PUT /api/firmware/versions/:id/stable - Mark firmware as stable
router.put('/versions/:id/stable', [
    param('id').isInt({ min: 1 })
], authenticateToken, requireOperator, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;

        const result = await db.query(`
            UPDATE firmware_versions
            SET is_stable = true
            WHERE id = $1 AND is_active = true
            RETURNING *
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Firmware version not found' });
        }

        const firmware = result.rows[0];
        logger.info(`Firmware marked as stable: ${firmware.version} by ${req.user.email}`);

        res.json({
            message: 'Firmware marked as stable',
            firmware_version: firmware
        });
    } catch (error) {
        logger.error('Mark firmware stable error:', error);
        res.status(500).json({ error: 'Failed to mark firmware as stable' });
    }
});

// DELETE /api/firmware/versions/:id - Delete firmware version
router.delete('/versions/:id', [
    param('id').isInt({ min: 1 })
], authenticateToken, requireOperator, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;

        // Check if firmware is currently being used in any OTA updates
        const otaResult = await db.query(`
            SELECT COUNT(*) as count
            FROM ota_updates
            WHERE firmware_version_id = $1 AND status IN ('pending', 'downloading', 'installing')
        `, [id]);

        if (parseInt(otaResult.rows[0].count) > 0) {
            return res.status(400).json({
                error: 'Cannot delete firmware version that is currently being deployed'
            });
        }

        // Get firmware details before deletion
        const firmwareResult = await db.query(
            'SELECT * FROM firmware_versions WHERE id = $1',
            [id]
        );

        if (firmwareResult.rows.length === 0) {
            return res.status(404).json({ error: 'Firmware version not found' });
        }

        const firmware = firmwareResult.rows[0];

        // Mark as inactive instead of deleting (soft delete)
        await db.query('UPDATE firmware_versions SET is_active = false WHERE id = $1', [id]);

        // Optionally delete the physical file
        if (firmware.binary_url) {
            const filename = path.basename(firmware.binary_url);
            const firmwareDir = process.env.FIRMWARE_DIR || './firmware';
            const filePath = path.join(firmwareDir, filename);

            try {
                await fs.unlink(filePath);
                logger.info(`Firmware file deleted: ${filename}`);
            } catch (fileError) {
                logger.warn(`Could not delete firmware file: ${filename}`, fileError);
            }
        }

        logger.info(`Firmware version deleted: ${firmware.version} by ${req.user.email}`);
        res.json({ message: 'Firmware version deleted successfully' });
    } catch (error) {
        logger.error('Delete firmware error:', error);
        res.status(500).json({ error: 'Failed to delete firmware version' });
    }
});

// GET /api/firmware/latest/:device_type - Get latest stable firmware for device type
router.get('/latest/:device_type', [
    param('device_type').isIn(['esp8266', 'esp32', 'arduino'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { device_type } = req.params;

        const result = await db.query(`
            SELECT *
            FROM firmware_versions
            WHERE device_type = $1 AND is_stable = true AND is_active = true
            ORDER BY created_at DESC
            LIMIT 1
        `, [device_type]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No stable firmware found for this device type' });
        }

        res.json({ firmware_version: result.rows[0] });
    } catch (error) {
        logger.error('Get latest firmware error:', error);
        res.status(500).json({ error: 'Failed to get latest firmware' });
    }
});

// POST /api/firmware/deploy - Deploy firmware to device(s)
router.post('/deploy', [
    body('firmware_version_id').isInt({ min: 1 }),
    body('device_ids').isArray({ min: 1 }),
    body('device_ids.*').notEmpty(),
    body('forced').optional().isBoolean()
], authenticateToken, requireOperator, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { firmware_version_id, device_ids, forced = false } = req.body;

        // Verify firmware version exists
        const firmwareResult = await db.query(
            'SELECT * FROM firmware_versions WHERE id = $1 AND is_active = true',
            [firmware_version_id]
        );

        if (firmwareResult.rows.length === 0) {
            return res.status(404).json({ error: 'Firmware version not found' });
        }

        const firmware = firmwareResult.rows[0];

        // Get device details and check compatibility
        const devicesResult = await db.query(`
            SELECT d.*, dc.ota_enabled
            FROM devices d
            LEFT JOIN device_configs dc ON d.id = dc.device_id
            WHERE d.id = ANY($1)
        `, [device_ids]);

        const deployments = [];
        const errors_list = [];

        for (const device of devicesResult.rows) {
            try {
                // Check device type compatibility
                if (device.device_type !== firmware.device_type) {
                    errors_list.push({
                        device_id: device.id,
                        error: `Device type ${device.device_type} incompatible with firmware for ${firmware.device_type}`
                    });
                    continue;
                }

                // Check if OTA is enabled (unless forced)
                if (!device.ota_enabled && !forced) {
                    errors_list.push({
                        device_id: device.id,
                        error: 'OTA updates disabled for this device'
                    });
                    continue;
                }

                // Check if update already scheduled
                const existingUpdate = await db.query(`
                    SELECT id FROM ota_updates
                    WHERE device_id = $1 AND status IN ('pending', 'downloading', 'installing')
                `, [device.id]);

                if (existingUpdate.rows.length > 0) {
                    errors_list.push({
                        device_id: device.id,
                        error: 'OTA update already in progress'
                    });
                    continue;
                }

                // Schedule OTA update
                const otaResult = await db.query(`
                    INSERT INTO ota_updates (device_id, firmware_version_id, status, created_at)
                    VALUES ($1, $2, 'pending', CURRENT_TIMESTAMP)
                    RETURNING id
                `, [device.id, firmware_version_id]);

                // Update device target firmware version
                await db.query(`
                    UPDATE devices
                    SET target_firmware_version = $1
                    WHERE id = $2
                `, [firmware.version, device.id]);

                deployments.push({
                    device_id: device.id,
                    ota_update_id: otaResult.rows[0].id,
                    status: 'scheduled'
                });

            } catch (deviceError) {
                logger.error(`Error scheduling OTA for device ${device.id}:`, deviceError);
                errors_list.push({
                    device_id: device.id,
                    error: 'Failed to schedule OTA update'
                });
            }
        }

        logger.info(`Firmware deployment initiated for ${deployments.length} devices by ${req.user.email}`);

        res.json({
            message: `Firmware deployment scheduled for ${deployments.length} devices`,
            deployments,
            errors: errors_list,
            firmware_version: firmware
        });
    } catch (error) {
        logger.error('Deploy firmware error:', error);
        res.status(500).json({ error: 'Failed to deploy firmware' });
    }
});

// GET /api/firmware/deployments - Get OTA deployment status
router.get('/deployments', authenticateToken, [
    query('device_id').optional().notEmpty(),
    query('status').optional().isIn(['pending', 'downloading', 'installing', 'completed', 'failed', 'cancelled']),
    query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { device_id, status, limit = 50 } = req.query;

        let query = `
            SELECT
                ou.*,
                d.name as device_name,
                d.device_type,
                fv.version as firmware_version,
                fv.file_size
            FROM ota_updates ou
            JOIN devices d ON ou.device_id = d.id
            JOIN firmware_versions fv ON ou.firmware_version_id = fv.id
        `;

        const params = [];
        const conditions = [];

        if (device_id) {
            conditions.push(`ou.device_id = $${params.length + 1}`);
            params.push(device_id);
        }

        if (status) {
            conditions.push(`ou.status = $${params.length + 1}`);
            params.push(status);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ` ORDER BY ou.created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await db.query(query, params);
        res.json({ deployments: result.rows });
    } catch (error) {
        logger.error('Get deployments error:', error);
        res.status(500).json({ error: 'Failed to get deployments' });
    }
});

// PUT /api/firmware/deployments/:id/cancel - Cancel OTA deployment
router.put('/deployments/:id/cancel', [
    param('id').isInt({ min: 1 })
], authenticateToken, requireOperator, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;

        const result = await db.query(`
            UPDATE ota_updates
            SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status IN ('pending', 'downloading')
            RETURNING device_id
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Deployment not found or cannot be cancelled' });
        }

        const deviceId = result.rows[0].device_id;

        // Clear target firmware version
        await db.query(`
            UPDATE devices
            SET target_firmware_version = NULL
            WHERE id = $1
        `, [deviceId]);

        logger.info(`OTA deployment cancelled: ${id} by ${req.user.email}`);
        res.json({ message: 'Deployment cancelled successfully' });
    } catch (error) {
        logger.error('Cancel deployment error:', error);
        res.status(500).json({ error: 'Failed to cancel deployment' });
    }
});

// GET /api/firmware/statistics - Get firmware deployment statistics
router.get('/statistics', authenticateToken, async (req, res) => {
    try {
        const [deploymentStats, versionStats, deviceStats] = await Promise.all([
            // Deployment statistics
            db.query(`
                SELECT
                    COUNT(*) as total_deployments,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_deployments,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_deployments,
                    COUNT(CASE WHEN status IN ('pending', 'downloading', 'installing') THEN 1 END) as in_progress_deployments,
                    AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_deployment_duration_seconds
                FROM ota_updates
                WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
            `),

            // Version distribution
            db.query(`
                SELECT
                    fv.version,
                    fv.device_type,
                    COUNT(d.id) as device_count
                FROM firmware_versions fv
                JOIN devices d ON fv.version = d.firmware_version
                WHERE fv.is_active = true
                GROUP BY fv.version, fv.device_type
                ORDER BY device_count DESC
            `),

            // Device firmware status
            db.query(`
                SELECT
                    device_type,
                    COUNT(*) as total_devices,
                    COUNT(CASE WHEN firmware_version IS NOT NULL THEN 1 END) as devices_with_firmware,
                    COUNT(CASE WHEN target_firmware_version IS NOT NULL THEN 1 END) as devices_pending_update
                FROM devices
                GROUP BY device_type
            `)
        ]);

        res.json({
            deployment_stats: deploymentStats.rows[0],
            version_distribution: versionStats.rows,
            device_stats: deviceStats.rows
        });
    } catch (error) {
        logger.error('Get firmware statistics error:', error);
        res.status(500).json({ error: 'Failed to get firmware statistics' });
    }
});

// GET /api/firmware/:id - Download firmware binary by ID (for OTA updates)
router.get('/:id', [
    param('id').isInt({ min: 1 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;

        // Get firmware version info
        const result = await db.query(`
            SELECT * FROM firmware_versions
            WHERE id = $1 AND is_active = true
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Firmware not found' });
        }

        const firmware = result.rows[0];

        // If binary_url is set, redirect to external URL
        if (firmware.binary_url) {
            return res.redirect(firmware.binary_url);
        }

        // Otherwise, serve from binary_data or local file
        if (firmware.binary_data) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="firmware_${firmware.version}.bin"`);
            res.setHeader('Content-Length', firmware.file_size);
            res.setHeader('X-Firmware-Version', firmware.version);
            res.setHeader('X-Firmware-Checksum', firmware.checksum);

            return res.send(firmware.binary_data);
        }

        // Try to serve from file system
        const firmwareDir = process.env.FIRMWARE_UPLOAD_DIR || './uploads/firmware';
        const possibleFiles = [
            `firmware_${firmware.device_type}_${firmware.version}.bin`,
            `${firmware.id}_${firmware.version}.bin`,
            `firmware_${firmware.version}.bin`
        ];

        for (const filename of possibleFiles) {
            const filePath = path.join(firmwareDir, filename);
            try {
                await fs.access(filePath);

                res.setHeader('Content-Type', 'application/octet-stream');
                res.setHeader('Content-Disposition', `attachment; filename="firmware_${firmware.version}.bin"`);
                res.setHeader('X-Firmware-Version', firmware.version);
                res.setHeader('X-Firmware-Checksum', firmware.checksum);

                const fs_sync = require('fs');
                const fileStream = fs_sync.createReadStream(filePath);
                fileStream.pipe(res);

                logger.logOTAEvent('', 'firmware_download', {
                    firmwareId: id,
                    version: firmware.version,
                    deviceType: firmware.device_type,
                    filename
                });

                return;
            } catch (error) {
                // File doesn't exist, try next one
                continue;
            }
        }

        return res.status(404).json({ error: 'Firmware binary file not found' });

    } catch (error) {
        logger.error('Download firmware by ID error:', error);
        res.status(500).json({ error: 'Failed to download firmware' });
    }
});

module.exports = router;