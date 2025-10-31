const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/alerts - Get all alerts with filtering and pagination
router.get('/', authenticateToken, [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
    query('status').optional().isIn(['active', 'acknowledged', 'resolved']),
    query('device_id').optional().notEmpty(),
    query('alert_type').optional().notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const { severity, status, device_id, alert_type } = req.query;

        let countQuery = `
            SELECT COUNT(*) as total
            FROM alerts a
            LEFT JOIN devices d ON a.device_id = d.id
        `;

        let query = `
            SELECT
                a.*,
                d.name as device_name,
                l.name as location_name,
                u1.email as acknowledged_by_email,
                u2.email as resolved_by_email
            FROM alerts a
            LEFT JOIN devices d ON a.device_id = d.id
            LEFT JOIN locations l ON d.location_id = l.id
            LEFT JOIN users u1 ON a.acknowledged_by = u1.id
            LEFT JOIN users u2 ON a.resolved_by = u2.id
        `;

        const params = [];
        const conditions = [];

        if (severity) {
            conditions.push(`a.severity = $${params.length + 1}`);
            params.push(severity);
        }

        if (status) {
            conditions.push(`a.status = $${params.length + 1}`);
            params.push(status);
        }

        if (device_id) {
            conditions.push(`a.device_id = $${params.length + 1}`);
            params.push(device_id);
        }

        if (alert_type) {
            conditions.push(`a.alert_type = $${params.length + 1}`);
            params.push(alert_type);
        }

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        query += ` ORDER BY a.triggered_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        // Get stats for all alerts (unfiltered)
        const statsQuery = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN status = 'acknowledged' THEN 1 ELSE 0 END) as acknowledged,
                SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
                SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical
            FROM alerts
        `;

        const [alertResult, countResult, statsResult] = await Promise.all([
            db.query(query, params),
            db.query(countQuery, params.slice(0, -2)), // Remove limit and offset for count
            db.query(statsQuery)
        ]);

        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);
        const stats = {
            total: parseInt(statsResult.rows[0].total),
            active: parseInt(statsResult.rows[0].active),
            acknowledged: parseInt(statsResult.rows[0].acknowledged),
            resolved: parseInt(statsResult.rows[0].resolved),
            critical: parseInt(statsResult.rows[0].critical)
        };

        res.json({
            alerts: alertResult.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            },
            stats
        });
    } catch (error) {
        logger.error('Get alerts error:', error);
        res.status(500).json({ error: 'Failed to get alerts' });
    }
});

// GET /api/alerts/:id - Get specific alert by ID
router.get('/:id', [
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
                a.*,
                d.name as device_name,
                l.name as location_name,
                u1.email as acknowledged_by_email,
                u2.email as resolved_by_email
            FROM alerts a
            LEFT JOIN devices d ON a.device_id = d.id
            LEFT JOIN locations l ON d.location_id = l.id
            LEFT JOIN users u1 ON a.acknowledged_by = u1.id
            LEFT JOIN users u2 ON a.resolved_by = u2.id
            WHERE a.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        res.json({ alert: result.rows[0] });
    } catch (error) {
        logger.error('Get alert error:', error);
        res.status(500).json({ error: 'Failed to get alert' });
    }
});

// POST /api/alerts - Create new alert
router.post('/', [
    body('device_id').notEmpty(),
    body('alert_type').notEmpty(),
    body('severity').isIn(['low', 'medium', 'high', 'critical']),
    body('message').notEmpty(),
    body('sensor_pin').optional().isInt(),
    body('sensor_value').optional().isNumeric(),
    body('threshold_value').optional().isNumeric()
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        if (req.user.role !== 'admin' && req.user.role !== 'operator') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const {
            device_id,
            alert_type,
            severity,
            message,
            sensor_pin,
            sensor_value,
            threshold_value
        } = req.body;

        // Verify device exists
        const deviceResult = await db.query('SELECT id FROM devices WHERE id = $1', [device_id]);
        if (deviceResult.rows.length === 0) {
            return res.status(400).json({ error: 'Device not found' });
        }

        const result = await db.query(`
            INSERT INTO alerts (
                device_id, alert_type, severity, message, sensor_pin,
                sensor_value, threshold_value, triggered_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
            RETURNING *
        `, [device_id, alert_type, severity, message, sensor_pin, sensor_value, threshold_value]);

        const alert = result.rows[0];
        logger.info(`Alert created: ${alert.id} for device ${device_id} by ${req.user.email}`);

        res.status(201).json({
            message: 'Alert created successfully',
            alert
        });
    } catch (error) {
        logger.error('Create alert error:', error);
        res.status(500).json({ error: 'Failed to create alert' });
    }
});

// PUT /api/alerts/:id/acknowledge - Acknowledge an alert
router.put('/:id/acknowledge', [
    param('id').isInt({ min: 1 }),
    body('notes').optional().isLength({ max: 1000 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { notes } = req.body;

        const result = await db.query(`
            UPDATE alerts
            SET status = 'acknowledged',
                acknowledged_at = CURRENT_TIMESTAMP,
                acknowledged_by = $1,
                notes = COALESCE($2, notes)
            WHERE id = $3 AND status = 'active'
            RETURNING *
        `, [req.user.userId, notes, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Alert not found or already acknowledged' });
        }

        const alert = result.rows[0];
        logger.info(`Alert acknowledged: ${id} by ${req.user.email}`);

        res.json({
            message: 'Alert acknowledged successfully',
            alert
        });
    } catch (error) {
        logger.error('Acknowledge alert error:', error);
        res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
});

// PUT /api/alerts/:id/resolve - Resolve an alert
router.put('/:id/resolve', [
    param('id').isInt({ min: 1 }),
    body('resolution_notes').optional().isLength({ max: 1000 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { resolution_notes } = req.body;

        const result = await db.query(`
            UPDATE alerts
            SET status = 'resolved',
                resolved_at = CURRENT_TIMESTAMP,
                resolved_by = $1,
                resolution_notes = $2
            WHERE id = $3 AND status IN ('active', 'acknowledged')
            RETURNING *
        `, [req.user.userId, resolution_notes, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Alert not found or already resolved' });
        }

        const alert = result.rows[0];
        logger.info(`Alert resolved: ${id} by ${req.user.email}`);

        res.json({
            message: 'Alert resolved successfully',
            alert
        });
    } catch (error) {
        logger.error('Resolve alert error:', error);
        res.status(500).json({ error: 'Failed to resolve alert' });
    }
});

// GET /api/alerts/statistics - Get alert statistics
router.get('/statistics', authenticateToken, [
    query('period').optional().isIn(['24h', '7d', '30d', '90d'])
], async (req, res) => {
    try {
        const period = req.query.period || '7d';

        let intervalClause;
        switch (period) {
            case '24h':
                intervalClause = "triggered_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'";
                break;
            case '7d':
                intervalClause = "triggered_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'";
                break;
            case '30d':
                intervalClause = "triggered_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'";
                break;
            case '90d':
                intervalClause = "triggered_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'";
                break;
        }

        const [totalStats, severityStats, typeStats, statusStats] = await Promise.all([
            // Total counts
            db.query(`
                SELECT
                    COUNT(*) as total_alerts,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_alerts,
                    COUNT(CASE WHEN status = 'acknowledged' THEN 1 END) as acknowledged_alerts,
                    COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_alerts
                FROM alerts
                WHERE ${intervalClause}
            `),

            // By severity
            db.query(`
                SELECT severity, COUNT(*) as count
                FROM alerts
                WHERE ${intervalClause}
                GROUP BY severity
                ORDER BY
                    CASE severity
                        WHEN 'critical' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3
                        WHEN 'low' THEN 4
                    END
            `),

            // By type
            db.query(`
                SELECT alert_type, COUNT(*) as count
                FROM alerts
                WHERE ${intervalClause}
                GROUP BY alert_type
                ORDER BY count DESC
                LIMIT 10
            `),

            // By status over time
            db.query(`
                SELECT
                    DATE_TRUNC('day', triggered_at) as date,
                    COUNT(*) as count
                FROM alerts
                WHERE ${intervalClause}
                GROUP BY DATE_TRUNC('day', triggered_at)
                ORDER BY date
            `)
        ]);

        res.json({
            period,
            total: totalStats.rows[0],
            by_severity: severityStats.rows,
            by_type: typeStats.rows,
            timeline: statusStats.rows
        });
    } catch (error) {
        logger.error('Get alert statistics error:', error);
        res.status(500).json({ error: 'Failed to get alert statistics' });
    }
});

// DELETE /api/alerts/:id - Delete an alert (admin only)
router.delete('/:id', [
    param('id').isInt({ min: 1 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin permissions required' });
        }

        const { id } = req.params;
        const result = await db.query('DELETE FROM alerts WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        logger.info(`Alert deleted: ${id} by ${req.user.email}`);
        res.json({ message: 'Alert deleted successfully' });
    } catch (error) {
        logger.error('Delete alert error:', error);
        res.status(500).json({ error: 'Failed to delete alert' });
    }
});

// POST /api/alerts/bulk-acknowledge - Bulk acknowledge alerts
router.post('/bulk-acknowledge', [
    body('alert_ids').isArray({ min: 1 }),
    body('alert_ids.*').isInt({ min: 1 }),
    body('notes').optional().isLength({ max: 1000 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { alert_ids, notes } = req.body;

        const result = await db.query(`
            UPDATE alerts
            SET status = 'acknowledged',
                acknowledged_at = CURRENT_TIMESTAMP,
                acknowledged_by = $1,
                notes = COALESCE($2, notes)
            WHERE id = ANY($3) AND status = 'active'
            RETURNING id
        `, [req.user.userId, notes, alert_ids]);

        const acknowledgedCount = result.rows.length;
        logger.info(`Bulk acknowledged ${acknowledgedCount} alerts by ${req.user.email}`);

        res.json({
            message: `${acknowledgedCount} alerts acknowledged successfully`,
            acknowledged_alerts: result.rows.map(row => row.id)
        });
    } catch (error) {
        logger.error('Bulk acknowledge alerts error:', error);
        res.status(500).json({ error: 'Failed to acknowledge alerts' });
    }
});

module.exports = router;