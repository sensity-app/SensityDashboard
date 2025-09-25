const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { query: dbQuery } = require('../models/database');
const logger = require('../utils/logger');

const router = express.Router();

// Helper function to check if current time is within silent mode
const isInSilentMode = async (deviceId, alertType = null, severity = 'medium') => {
    try {
        const now = new Date();
        const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS format
        const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday

        const result = await dbQuery(`
            SELECT * FROM silent_mode_schedules
            WHERE enabled = true
            AND (device_id = $1 OR device_id IS NULL)
            AND $2 = ANY(days_of_week)
            AND (
                (start_time <= end_time AND $3 BETWEEN start_time AND end_time)
                OR
                (start_time > end_time AND ($3 >= start_time OR $3 <= end_time))
            )
            AND (alert_types IS NULL OR $4 = ANY(alert_types))
            AND (severity_threshold IS NULL OR
                 CASE severity_threshold
                    WHEN 'critical' THEN $5 IN ('low', 'medium', 'high')
                    WHEN 'high' THEN $5 IN ('low', 'medium')
                    WHEN 'medium' THEN $5 IN ('low')
                    ELSE FALSE
                 END)
        `, [deviceId, currentDay, currentTime, alertType, severity]);

        return result.rows.length > 0;
    } catch (error) {
        logger.error('Error checking silent mode:', error);
        return false;
    }
};

// GET /api/silent-mode - Get all silent mode schedules
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { deviceId, locationId } = req.query;

        let whereClause = '';
        let params = [];

        if (deviceId) {
            whereClause += ' AND device_id = $1';
            params.push(deviceId);
        }
        if (locationId) {
            const paramIndex = params.length + 1;
            whereClause += ` AND location_id = $${paramIndex}`;
            params.push(locationId);
        }

        const result = await dbQuery(`
            SELECT
                s.*,
                d.name as device_name,
                l.name as location_name,
                u.email as created_by_email
            FROM silent_mode_schedules s
            LEFT JOIN devices d ON s.device_id = d.id
            LEFT JOIN locations l ON s.location_id = l.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE 1=1 ${whereClause}
            ORDER BY s.created_at DESC
        `, params);

        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching silent mode schedules:', error);
        res.status(500).json({ error: 'Failed to fetch silent mode schedules' });
    }
});

// GET /api/silent-mode/:id - Get specific silent mode schedule
router.get('/:id', authenticateToken, [
    param('id').isInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;

        const result = await dbQuery(`
            SELECT
                s.*,
                d.name as device_name,
                l.name as location_name,
                u.email as created_by_email
            FROM silent_mode_schedules s
            LEFT JOIN devices d ON s.device_id = d.id
            LEFT JOIN locations l ON s.location_id = l.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Silent mode schedule not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Error fetching silent mode schedule:', error);
        res.status(500).json({ error: 'Failed to fetch silent mode schedule' });
    }
});

// POST /api/silent-mode - Create new silent mode schedule
router.post('/', authenticateToken, [
    body('name').notEmpty().trim(),
    body('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    body('endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    body('daysOfWeek').isArray().custom(days => {
        return days.every(day => Number.isInteger(day) && day >= 0 && day <= 6);
    }),
    body('deviceId').optional().isString(),
    body('locationId').optional().isInt(),
    body('timezone').optional().isString(),
    body('alertTypes').optional().isArray(),
    body('severityThreshold').optional().isIn(['low', 'medium', 'high', 'critical'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const {
            name,
            startTime,
            endTime,
            daysOfWeek,
            deviceId,
            locationId,
            timezone = 'UTC',
            alertTypes,
            severityThreshold,
            enabled = true
        } = req.body;

        // Validate that either deviceId or locationId is provided
        if (!deviceId && !locationId) {
            return res.status(400).json({ error: 'Either deviceId or locationId must be provided' });
        }

        const result = await dbQuery(`
            INSERT INTO silent_mode_schedules (
                device_id, location_id, user_id, name, start_time, end_time,
                days_of_week, timezone, alert_types, severity_threshold, enabled
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `, [
            deviceId || null,
            locationId || null,
            req.user.userId,
            name,
            startTime,
            endTime,
            daysOfWeek,
            timezone,
            alertTypes || null,
            severityThreshold || null,
            enabled
        ]);

        logger.info(`Silent mode schedule created: ${name} by user ${req.user.email}`);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        logger.error('Error creating silent mode schedule:', error);
        res.status(500).json({ error: 'Failed to create silent mode schedule' });
    }
});

// PUT /api/silent-mode/:id - Update silent mode schedule
router.put('/:id', authenticateToken, [
    param('id').isInt(),
    body('name').optional().notEmpty().trim(),
    body('startTime').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    body('endTime').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    body('daysOfWeek').optional().isArray(),
    body('deviceId').optional().isString(),
    body('locationId').optional().isInt(),
    body('timezone').optional().isString(),
    body('alertTypes').optional().isArray(),
    body('severityThreshold').optional().isIn(['low', 'medium', 'high', 'critical']),
    body('enabled').optional().isBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;

        // Check if schedule exists
        const existingResult = await dbQuery('SELECT * FROM silent_mode_schedules WHERE id = $1', [id]);
        if (existingResult.rows.length === 0) {
            return res.status(404).json({ error: 'Silent mode schedule not found' });
        }

        const existing = existingResult.rows[0];
        const updates = { ...existing, ...req.body };

        const result = await dbQuery(`
            UPDATE silent_mode_schedules SET
                device_id = $1,
                location_id = $2,
                name = $3,
                start_time = $4,
                end_time = $5,
                days_of_week = $6,
                timezone = $7,
                alert_types = $8,
                severity_threshold = $9,
                enabled = $10,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $11
            RETURNING *
        `, [
            updates.deviceId || null,
            updates.locationId || null,
            updates.name,
            updates.startTime,
            updates.endTime,
            updates.daysOfWeek,
            updates.timezone,
            updates.alertTypes || null,
            updates.severityThreshold || null,
            updates.enabled,
            id
        ]);

        logger.info(`Silent mode schedule updated: ${id} by user ${req.user.email}`);
        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Error updating silent mode schedule:', error);
        res.status(500).json({ error: 'Failed to update silent mode schedule' });
    }
});

// DELETE /api/silent-mode/:id - Delete silent mode schedule
router.delete('/:id', authenticateToken, [
    param('id').isInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;

        const result = await dbQuery('DELETE FROM silent_mode_schedules WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Silent mode schedule not found' });
        }

        logger.info(`Silent mode schedule deleted: ${id} by user ${req.user.email}`);
        res.json({ message: 'Silent mode schedule deleted successfully' });
    } catch (error) {
        logger.error('Error deleting silent mode schedule:', error);
        res.status(500).json({ error: 'Failed to delete silent mode schedule' });
    }
});

// GET /api/silent-mode/check/:deviceId - Check if device is in silent mode
router.get('/check/:deviceId', authenticateToken, [
    param('deviceId').isString(),
    query('alertType').optional().isString(),
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { deviceId } = req.params;
        const { alertType, severity = 'medium' } = req.query;

        const inSilentMode = await isInSilentMode(deviceId, alertType, severity);

        res.json({
            deviceId,
            inSilentMode,
            alertType: alertType || null,
            severity,
            checkedAt: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error checking silent mode status:', error);
        res.status(500).json({ error: 'Failed to check silent mode status' });
    }
});

module.exports = router;
module.exports.isInSilentMode = isInSilentMode;