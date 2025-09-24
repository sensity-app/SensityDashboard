const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const db = require('../models/database');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/device-groups - Get all device groups
router.get('/', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                dg.*,
                u.email as created_by_email,
                COUNT(dgm.device_id) as device_count
            FROM device_groups dg
            LEFT JOIN users u ON dg.created_by = u.id
            LEFT JOIN device_group_members dgm ON dg.id = dgm.group_id
            GROUP BY dg.id, u.email
            ORDER BY dg.name
        `);

        res.json({
            success: true,
            groups: result.rows
        });
    } catch (error) {
        logger.error('Error fetching device groups:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch device groups'
        });
    }
});

// GET /api/device-groups/:id - Get specific device group with members
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Get group details
        const groupResult = await db.query(`
            SELECT
                dg.*,
                u.email as created_by_email
            FROM device_groups dg
            LEFT JOIN users u ON dg.created_by = u.id
            WHERE dg.id = $1
        `, [id]);

        if (groupResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Device group not found'
            });
        }

        // Get group members
        const membersResult = await db.query(`
            SELECT
                d.id,
                d.name,
                d.location_id,
                l.name as location_name,
                d.current_status,
                d.last_heartbeat,
                dgm.added_at,
                u.email as added_by_email
            FROM device_group_members dgm
            JOIN devices d ON dgm.device_id = d.id
            LEFT JOIN locations l ON d.location_id = l.id
            LEFT JOIN users u ON dgm.added_by = u.id
            WHERE dgm.group_id = $1
            ORDER BY d.name
        `, [id]);

        res.json({
            success: true,
            group: {
                ...groupResult.rows[0],
                devices: membersResult.rows
            }
        });
    } catch (error) {
        logger.error('Error fetching device group:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch device group'
        });
    }
});

// POST /api/device-groups - Create new device group
router.post('/',
    authenticateToken,
    requireRole(['admin', 'operator']),
    [
        body('name').notEmpty().trim().isLength({ max: 255 }),
        body('description').optional().trim(),
        body('color').optional().matches(/^#[0-9A-F]{6}$/i)
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { name, description, color = '#3B82F6' } = req.body;

            // Check if group name already exists
            const existingGroup = await db.query(
                'SELECT id FROM device_groups WHERE name = $1',
                [name]
            );

            if (existingGroup.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    error: 'Device group with this name already exists'
                });
            }

            const result = await db.query(`
                INSERT INTO device_groups (name, description, color, created_by)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `, [name, description, color, req.user.id]);

            logger.info(`Device group created: ${name} by ${req.user.email}`);

            res.status(201).json({
                success: true,
                group: result.rows[0]
            });
        } catch (error) {
            logger.error('Error creating device group:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create device group'
            });
        }
    }
);

// PUT /api/device-groups/:id - Update device group
router.put('/:id',
    authenticateToken,
    requireRole(['admin', 'operator']),
    [
        body('name').notEmpty().trim().isLength({ max: 255 }),
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

            // Check if group exists
            const existingGroup = await db.query(
                'SELECT id FROM device_groups WHERE id = $1',
                [id]
            );

            if (existingGroup.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Device group not found'
                });
            }

            // Check if name conflicts with other groups
            const nameConflict = await db.query(
                'SELECT id FROM device_groups WHERE name = $1 AND id != $2',
                [name, id]
            );

            if (nameConflict.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    error: 'Device group with this name already exists'
                });
            }

            const result = await db.query(`
                UPDATE device_groups
                SET name = $1, description = $2, color = $3, updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
                RETURNING *
            `, [name, description, color, id]);

            logger.info(`Device group updated: ${name} by ${req.user.email}`);

            res.json({
                success: true,
                group: result.rows[0]
            });
        } catch (error) {
            logger.error('Error updating device group:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update device group'
            });
        }
    }
);

// DELETE /api/device-groups/:id - Delete device group
router.delete('/:id',
    authenticateToken,
    requireRole(['admin']),
    async (req, res) => {
        try {
            const { id } = req.params;

            // Check if group exists and get member count
            const groupInfo = await db.query(`
                SELECT dg.name, COUNT(dgm.device_id) as device_count
                FROM device_groups dg
                LEFT JOIN device_group_members dgm ON dg.id = dgm.group_id
                WHERE dg.id = $1
                GROUP BY dg.id, dg.name
            `, [id]);

            if (groupInfo.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Device group not found'
                });
            }

            const group = groupInfo.rows[0];

            // Delete group (cascade will handle members)
            await db.query('DELETE FROM device_groups WHERE id = $1', [id]);

            logger.info(`Device group deleted: ${group.name} (had ${group.device_count} devices) by ${req.user.email}`);

            res.json({
                success: true,
                message: `Device group "${group.name}" deleted successfully`
            });
        } catch (error) {
            logger.error('Error deleting device group:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete device group'
            });
        }
    }
);

// POST /api/device-groups/:id/add-device - Add device to group
router.post('/:id/add-device',
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

            const { id: groupId } = req.params;
            const { deviceId } = req.body;

            // Check if group exists
            const groupExists = await db.query(
                'SELECT name FROM device_groups WHERE id = $1',
                [groupId]
            );

            if (groupExists.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Device group not found'
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

            // Add device to group (ignore if already exists)
            await db.query(`
                INSERT INTO device_group_members (device_id, group_id, added_by)
                VALUES ($1, $2, $3)
                ON CONFLICT (device_id, group_id) DO NOTHING
            `, [deviceId, groupId, req.user.id]);

            logger.info(`Device ${deviceId} added to group ${groupExists.rows[0].name} by ${req.user.email}`);

            res.json({
                success: true,
                message: `Device added to group "${groupExists.rows[0].name}"`
            });
        } catch (error) {
            logger.error('Error adding device to group:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to add device to group'
            });
        }
    }
);

// DELETE /api/device-groups/:id/remove-device/:deviceId - Remove device from group
router.delete('/:id/remove-device/:deviceId',
    authenticateToken,
    requireRole(['admin', 'operator']),
    async (req, res) => {
        try {
            const { id: groupId, deviceId } = req.params;

            // Get group name for logging
            const groupInfo = await db.query(
                'SELECT name FROM device_groups WHERE id = $1',
                [groupId]
            );

            if (groupInfo.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Device group not found'
                });
            }

            // Remove device from group
            const result = await db.query(
                'DELETE FROM device_group_members WHERE group_id = $1 AND device_id = $2',
                [groupId, deviceId]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Device not found in this group'
                });
            }

            logger.info(`Device ${deviceId} removed from group ${groupInfo.rows[0].name} by ${req.user.email}`);

            res.json({
                success: true,
                message: `Device removed from group "${groupInfo.rows[0].name}"`
            });
        } catch (error) {
            logger.error('Error removing device from group:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to remove device from group'
            });
        }
    }
);

module.exports = router;