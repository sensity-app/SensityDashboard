const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const db = require('../models/database');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/device-tags - Get all device tags
router.get('/', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                dt.*,
                COUNT(dta.device_id) as device_count
            FROM device_tags dt
            LEFT JOIN device_tag_assignments dta ON dt.id = dta.tag_id
            GROUP BY dt.id
            ORDER BY dt.name
        `);

        res.json({
            success: true,
            tags: result.rows
        });
    } catch (error) {
        logger.error('Error fetching device tags:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch device tags'
        });
    }
});

// GET /api/device-tags/:id - Get specific device tag with assigned devices
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Get tag details
        const tagResult = await db.query(
            'SELECT * FROM device_tags WHERE id = $1',
            [id]
        );

        if (tagResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Device tag not found'
            });
        }

        // Get assigned devices
        const devicesResult = await db.query(`
            SELECT
                d.id,
                d.name,
                d.location_id,
                l.name as location_name,
                d.current_status,
                d.last_heartbeat,
                dta.assigned_at,
                u.email as assigned_by_email
            FROM device_tag_assignments dta
            JOIN devices d ON dta.device_id = d.id
            LEFT JOIN locations l ON d.location_id = l.id
            LEFT JOIN users u ON dta.assigned_by = u.id
            WHERE dta.tag_id = $1
            ORDER BY d.name
        `, [id]);

        res.json({
            success: true,
            tag: {
                ...tagResult.rows[0],
                devices: devicesResult.rows
            }
        });
    } catch (error) {
        logger.error('Error fetching device tag:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch device tag'
        });
    }
});

// POST /api/device-tags - Create new device tag
router.post('/',
    authenticateToken,
    requireRole(['admin', 'operator']),
    [
        body('name').notEmpty().trim().isLength({ max: 100 }),
        body('description').optional().trim(),
        body('color').optional().matches(/^#[0-9A-F]{6}$/i)
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { name, description, color = '#6B7280' } = req.body;

            // Check if tag name already exists
            const existingTag = await db.query(
                'SELECT id FROM device_tags WHERE name = $1',
                [name]
            );

            if (existingTag.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    error: 'Device tag with this name already exists'
                });
            }

            const result = await db.query(`
                INSERT INTO device_tags (name, description, color)
                VALUES ($1, $2, $3)
                RETURNING *
            `, [name, description, color]);

            logger.info(`Device tag created: ${name} by ${req.user.email}`);

            res.status(201).json({
                success: true,
                tag: result.rows[0]
            });
        } catch (error) {
            logger.error('Error creating device tag:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create device tag'
            });
        }
    }
);

// PUT /api/device-tags/:id - Update device tag
router.put('/:id',
    authenticateToken,
    requireRole(['admin', 'operator']),
    [
        body('name').notEmpty().trim().isLength({ max: 100 }),
        body('description').optional().trim(),
        body('color').optional().matches(/^#[0-9A-F]{6}$/i)
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { id } = req.params;
            const { name, description, color } = req.body;

            // Check if tag exists
            const existingTag = await db.query(
                'SELECT id FROM device_tags WHERE id = $1',
                [id]
            );

            if (existingTag.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Device tag not found'
                });
            }

            // Check if name conflicts with other tags
            const nameConflict = await db.query(
                'SELECT id FROM device_tags WHERE name = $1 AND id != $2',
                [name, id]
            );

            if (nameConflict.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    error: 'Device tag with this name already exists'
                });
            }

            const result = await db.query(`
                UPDATE device_tags
                SET name = $1, description = $2, color = $3
                WHERE id = $4
                RETURNING *
            `, [name, description, color, id]);

            logger.info(`Device tag updated: ${name} by ${req.user.email}`);

            res.json({
                success: true,
                tag: result.rows[0]
            });
        } catch (error) {
            logger.error('Error updating device tag:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update device tag'
            });
        }
    }
);

// DELETE /api/device-tags/:id - Delete device tag
router.delete('/:id',
    authenticateToken,
    requireRole(['admin']),
    async (req, res) => {
        try {
            const { id } = req.params;

            // Check if tag exists and get usage count
            const tagInfo = await db.query(`
                SELECT dt.name, COUNT(dta.device_id) as device_count
                FROM device_tags dt
                LEFT JOIN device_tag_assignments dta ON dt.id = dta.tag_id
                WHERE dt.id = $1
                GROUP BY dt.id, dt.name
            `, [id]);

            if (tagInfo.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Device tag not found'
                });
            }

            const tag = tagInfo.rows[0];

            // Delete tag (cascade will handle assignments)
            await db.query('DELETE FROM device_tags WHERE id = $1', [id]);

            logger.info(`Device tag deleted: ${tag.name} (was assigned to ${tag.device_count} devices) by ${req.user.email}`);

            res.json({
                success: true,
                message: `Device tag "${tag.name}" deleted successfully`
            });
        } catch (error) {
            logger.error('Error deleting device tag:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete device tag'
            });
        }
    }
);

// POST /api/device-tags/:id/assign-device - Assign tag to device
router.post('/:id/assign-device',
    authenticateToken,
    requireRole(['admin', 'operator']),
    [
        body('deviceId').notEmpty().trim()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { id: tagId } = req.params;
            const { deviceId } = req.body;

            // Check if tag exists
            const tagExists = await db.query(
                'SELECT name FROM device_tags WHERE id = $1',
                [tagId]
            );

            if (tagExists.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Device tag not found'
                });
            }

            // Check if device exists
            const deviceExists = await db.query(
                'SELECT name FROM devices WHERE id = $1',
                [deviceId]
            );

            if (deviceExists.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Device not found'
                });
            }

            // Assign tag to device (ignore if already assigned)
            await db.query(`
                INSERT INTO device_tag_assignments (device_id, tag_id, assigned_by)
                VALUES ($1, $2, $3)
                ON CONFLICT (device_id, tag_id) DO NOTHING
            `, [deviceId, tagId, req.user.id]);

            logger.info(`Tag ${tagExists.rows[0].name} assigned to device ${deviceId} by ${req.user.email}`);

            res.json({
                success: true,
                message: `Tag "${tagExists.rows[0].name}" assigned to device`
            });
        } catch (error) {
            logger.error('Error assigning tag to device:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to assign tag to device'
            });
        }
    }
);

// DELETE /api/device-tags/:id/unassign-device/:deviceId - Remove tag from device
router.delete('/:id/unassign-device/:deviceId',
    authenticateToken,
    requireRole(['admin', 'operator']),
    async (req, res) => {
        try {
            const { id: tagId, deviceId } = req.params;

            // Get tag name for logging
            const tagInfo = await db.query(
                'SELECT name FROM device_tags WHERE id = $1',
                [tagId]
            );

            if (tagInfo.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Device tag not found'
                });
            }

            // Remove tag from device
            const result = await db.query(
                'DELETE FROM device_tag_assignments WHERE tag_id = $1 AND device_id = $2',
                [tagId, deviceId]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Tag not assigned to this device'
                });
            }

            logger.info(`Tag ${tagInfo.rows[0].name} unassigned from device ${deviceId} by ${req.user.email}`);

            res.json({
                success: true,
                message: `Tag "${tagInfo.rows[0].name}" removed from device`
            });
        } catch (error) {
            logger.error('Error unassigning tag from device:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to unassign tag from device'
            });
        }
    }
);

// GET /api/device-tags/device/:deviceId - Get all tags for a specific device
router.get('/device/:deviceId', authenticateToken, async (req, res) => {
    try {
        const { deviceId } = req.params;

        // Check if device exists
        const deviceExists = await db.query(
            'SELECT name FROM devices WHERE id = $1',
            [deviceId]
        );

        if (deviceExists.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Device not found'
            });
        }

        const result = await db.query(`
            SELECT
                dt.*,
                dta.assigned_at,
                u.email as assigned_by_email
            FROM device_tag_assignments dta
            JOIN device_tags dt ON dta.tag_id = dt.id
            LEFT JOIN users u ON dta.assigned_by = u.id
            WHERE dta.device_id = $1
            ORDER BY dt.name
        `, [deviceId]);

        res.json({
            success: true,
            deviceId,
            deviceName: deviceExists.rows[0].name,
            tags: result.rows
        });
    } catch (error) {
        logger.error('Error fetching device tags:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch device tags'
        });
    }
});

module.exports = router;