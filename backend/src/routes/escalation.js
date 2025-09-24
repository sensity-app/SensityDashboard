const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Use centralized role-based middleware
const requireOperator = requireRole(['admin', 'operator']);

// GET /api/escalation/rules - Get all escalation rules
router.get('/rules', authenticateToken, [
    query('device_id').optional().notEmpty(),
    query('location_id').optional().isInt({ min: 1 }),
    query('enabled').optional().isBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { device_id, location_id, enabled } = req.query;

        let query = `
            SELECT
                er.*,
                d.name as device_name,
                l.name as location_name
            FROM escalation_rules er
            LEFT JOIN devices d ON er.device_id = d.id
            LEFT JOIN locations l ON er.location_id = l.id
        `;

        const params = [];
        const conditions = [];

        if (device_id) {
            conditions.push(`er.device_id = $${params.length + 1}`);
            params.push(device_id);
        }

        if (location_id) {
            conditions.push(`er.location_id = $${params.length + 1}`);
            params.push(location_id);
        }

        if (enabled !== undefined) {
            conditions.push(`er.enabled = $${params.length + 1}`);
            params.push(enabled === 'true');
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY er.created_at DESC';

        const result = await db.query(query, params);
        res.json({ escalation_rules: result.rows });
    } catch (error) {
        logger.error('Get escalation rules error:', error);
        res.status(500).json({ error: 'Failed to get escalation rules' });
    }
});

// GET /api/escalation/rules/:id - Get specific escalation rule
router.get('/rules/:id', [
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
                er.*,
                d.name as device_name,
                l.name as location_name
            FROM escalation_rules er
            LEFT JOIN devices d ON er.device_id = d.id
            LEFT JOIN locations l ON er.location_id = l.id
            WHERE er.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Escalation rule not found' });
        }

        res.json({ escalation_rule: result.rows[0] });
    } catch (error) {
        logger.error('Get escalation rule error:', error);
        res.status(500).json({ error: 'Failed to get escalation rule' });
    }
});

// POST /api/escalation/rules - Create new escalation rule
router.post('/rules', [
    body('alert_type').notEmpty(),
    body('severity').isIn(['low', 'medium', 'high', 'critical']),
    body('device_id').optional().notEmpty(),
    body('location_id').optional().isInt({ min: 1 }),
    body('escalation_delay_minutes').isInt({ min: 1, max: 10080 }), // Max 1 week
    body('max_escalation_level').isInt({ min: 1, max: 10 }),
    body('notification_methods').isArray({ min: 1 }),
    body('notification_methods.*').isIn(['email', 'sms', 'push']),
    body('recipients').isArray({ min: 1 }),
    body('enabled').optional().isBoolean()
], authenticateToken, requireOperator, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const {
            alert_type,
            severity,
            device_id,
            location_id,
            escalation_delay_minutes,
            max_escalation_level,
            notification_methods,
            recipients,
            enabled = true
        } = req.body;

        // Validate that either device_id or location_id is provided, but not both
        if (device_id && location_id) {
            return res.status(400).json({ error: 'Cannot specify both device_id and location_id' });
        }

        if (!device_id && !location_id) {
            return res.status(400).json({ error: 'Must specify either device_id or location_id' });
        }

        // Validate device or location exists
        if (device_id) {
            const deviceResult = await db.query('SELECT id FROM devices WHERE id = $1', [device_id]);
            if (deviceResult.rows.length === 0) {
                return res.status(400).json({ error: 'Device not found' });
            }
        }

        if (location_id) {
            const locationResult = await db.query('SELECT id FROM locations WHERE id = $1', [location_id]);
            if (locationResult.rows.length === 0) {
                return res.status(400).json({ error: 'Location not found' });
            }
        }

        // Check for duplicate rules
        const duplicateCheck = await db.query(`
            SELECT id FROM escalation_rules
            WHERE alert_type = $1 AND severity = $2
            AND (
                (device_id = $3 AND $3 IS NOT NULL) OR
                (location_id = $4 AND $4 IS NOT NULL)
            )
        `, [alert_type, severity, device_id, location_id]);

        if (duplicateCheck.rows.length > 0) {
            return res.status(409).json({ error: 'Escalation rule already exists for this alert type and severity' });
        }

        const result = await db.query(`
            INSERT INTO escalation_rules (
                alert_type, severity, device_id, location_id, escalation_delay_minutes,
                max_escalation_level, notification_methods, recipients, enabled
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            alert_type,
            severity,
            device_id,
            location_id,
            escalation_delay_minutes,
            max_escalation_level,
            JSON.stringify(notification_methods),
            JSON.stringify(recipients),
            enabled
        ]);

        const escalationRule = result.rows[0];
        logger.info(`Escalation rule created: ${escalationRule.id} by ${req.user.email}`);

        res.status(201).json({
            message: 'Escalation rule created successfully',
            escalation_rule: escalationRule
        });
    } catch (error) {
        logger.error('Create escalation rule error:', error);
        res.status(500).json({ error: 'Failed to create escalation rule' });
    }
});

// PUT /api/escalation/rules/:id - Update escalation rule
router.put('/rules/:id', [
    param('id').isInt({ min: 1 }),
    body('alert_type').optional().notEmpty(),
    body('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
    body('escalation_delay_minutes').optional().isInt({ min: 1, max: 10080 }),
    body('max_escalation_level').optional().isInt({ min: 1, max: 10 }),
    body('notification_methods').optional().isArray({ min: 1 }),
    body('notification_methods.*').optional().isIn(['email', 'sms', 'push']),
    body('recipients').optional().isArray({ min: 1 }),
    body('enabled').optional().isBoolean()
], authenticateToken, requireOperator, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const {
            alert_type,
            severity,
            escalation_delay_minutes,
            max_escalation_level,
            notification_methods,
            recipients,
            enabled
        } = req.body;

        const result = await db.query(`
            UPDATE escalation_rules
            SET alert_type = COALESCE($1, alert_type),
                severity = COALESCE($2, severity),
                escalation_delay_minutes = COALESCE($3, escalation_delay_minutes),
                max_escalation_level = COALESCE($4, max_escalation_level),
                notification_methods = COALESCE($5, notification_methods),
                recipients = COALESCE($6, recipients),
                enabled = COALESCE($7, enabled),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $8
            RETURNING *
        `, [
            alert_type,
            severity,
            escalation_delay_minutes,
            max_escalation_level,
            notification_methods ? JSON.stringify(notification_methods) : null,
            recipients ? JSON.stringify(recipients) : null,
            enabled,
            id
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Escalation rule not found' });
        }

        const escalationRule = result.rows[0];
        logger.info(`Escalation rule updated: ${id} by ${req.user.email}`);

        res.json({
            message: 'Escalation rule updated successfully',
            escalation_rule: escalationRule
        });
    } catch (error) {
        logger.error('Update escalation rule error:', error);
        res.status(500).json({ error: 'Failed to update escalation rule' });
    }
});

// DELETE /api/escalation/rules/:id - Delete escalation rule
router.delete('/rules/:id', [
    param('id').isInt({ min: 1 })
], authenticateToken, requireOperator, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;

        const result = await db.query('DELETE FROM escalation_rules WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Escalation rule not found' });
        }

        logger.info(`Escalation rule deleted: ${id} by ${req.user.email}`);
        res.json({ message: 'Escalation rule deleted successfully' });
    } catch (error) {
        logger.error('Delete escalation rule error:', error);
        res.status(500).json({ error: 'Failed to delete escalation rule' });
    }
});

// GET /api/escalation/history - Get escalation history
router.get('/history', authenticateToken, [
    query('device_id').optional().notEmpty(),
    query('alert_id').optional().isInt({ min: 1 }),
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const {
            device_id,
            alert_id,
            start_date,
            end_date,
            page = 1,
            limit = 50
        } = req.query;

        const offset = (page - 1) * limit;

        let query = `
            SELECT
                eh.*,
                a.alert_type,
                a.severity,
                a.message as alert_message,
                d.name as device_name,
                er.notification_methods,
                er.recipients
            FROM escalation_history eh
            JOIN alerts a ON eh.alert_id = a.id
            JOIN devices d ON a.device_id = d.id
            LEFT JOIN escalation_rules er ON eh.escalation_rule_id = er.id
        `;

        let countQuery = `
            SELECT COUNT(*) as total
            FROM escalation_history eh
            JOIN alerts a ON eh.alert_id = a.id
            JOIN devices d ON a.device_id = d.id
        `;

        const params = [];
        const conditions = [];

        if (device_id) {
            conditions.push(`d.id = $${params.length + 1}`);
            params.push(device_id);
        }

        if (alert_id) {
            conditions.push(`eh.alert_id = $${params.length + 1}`);
            params.push(alert_id);
        }

        if (start_date) {
            conditions.push(`eh.escalated_at >= $${params.length + 1}`);
            params.push(start_date);
        }

        if (end_date) {
            conditions.push(`eh.escalated_at <= $${params.length + 1}`);
            params.push(end_date);
        }

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        query += ` ORDER BY eh.escalated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const [historyResult, countResult] = await Promise.all([
            db.query(query, params),
            db.query(countQuery, params.slice(0, -2)) // Remove limit and offset for count
        ]);

        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        res.json({
            escalation_history: historyResult.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        logger.error('Get escalation history error:', error);
        res.status(500).json({ error: 'Failed to get escalation history' });
    }
});

// POST /api/escalation/test - Test escalation rule
router.post('/test', [
    body('escalation_rule_id').isInt({ min: 1 }),
    body('test_alert').optional().isObject()
], authenticateToken, requireOperator, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { escalation_rule_id, test_alert } = req.body;

        // Get escalation rule
        const ruleResult = await db.query(
            'SELECT * FROM escalation_rules WHERE id = $1',
            [escalation_rule_id]
        );

        if (ruleResult.rows.length === 0) {
            return res.status(404).json({ error: 'Escalation rule not found' });
        }

        const rule = ruleResult.rows[0];

        // Create a test alert object
        const alertData = test_alert || {
            id: 0,
            device_id: rule.device_id || 'TEST_DEVICE',
            alert_type: rule.alert_type,
            severity: rule.severity,
            message: 'This is a test escalation',
            triggered_at: new Date().toISOString()
        };

        // Simulate escalation process
        const escalationLevels = [];
        for (let level = 1; level <= rule.max_escalation_level; level++) {
            escalationLevels.push({
                level,
                delay_minutes: rule.escalation_delay_minutes * level,
                notification_methods: rule.notification_methods,
                recipients: rule.recipients,
                estimated_time: new Date(Date.now() + (rule.escalation_delay_minutes * level * 60000)).toISOString()
            });
        }

        logger.info(`Escalation rule test performed: ${escalation_rule_id} by ${req.user.email}`);

        res.json({
            message: 'Escalation test completed',
            escalation_rule: rule,
            test_alert: alertData,
            escalation_levels: escalationLevels,
            simulation_only: true
        });
    } catch (error) {
        logger.error('Test escalation error:', error);
        res.status(500).json({ error: 'Failed to test escalation rule' });
    }
});

// GET /api/escalation/statistics - Get escalation statistics
router.get('/statistics', authenticateToken, [
    query('period').optional().isIn(['24h', '7d', '30d', '90d'])
], async (req, res) => {
    try {
        const period = req.query.period || '30d';

        let intervalClause;
        switch (period) {
            case '24h':
                intervalClause = "escalated_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'";
                break;
            case '7d':
                intervalClause = "escalated_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'";
                break;
            case '30d':
                intervalClause = "escalated_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'";
                break;
            case '90d':
                intervalClause = "escalated_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'";
                break;
        }

        const [totalStats, levelStats, typeStats, timelineStats] = await Promise.all([
            // Total escalation statistics
            db.query(`
                SELECT
                    COUNT(*) as total_escalations,
                    COUNT(DISTINCT alert_id) as unique_alerts,
                    AVG(escalation_level) as avg_escalation_level,
                    MAX(escalation_level) as max_escalation_level
                FROM escalation_history
                WHERE ${intervalClause}
            `),

            // By escalation level
            db.query(`
                SELECT
                    escalation_level,
                    COUNT(*) as count
                FROM escalation_history
                WHERE ${intervalClause}
                GROUP BY escalation_level
                ORDER BY escalation_level
            `),

            // By alert type
            db.query(`
                SELECT
                    a.alert_type,
                    COUNT(eh.*) as escalation_count,
                    AVG(eh.escalation_level) as avg_level
                FROM escalation_history eh
                JOIN alerts a ON eh.alert_id = a.id
                WHERE ${intervalClause}
                GROUP BY a.alert_type
                ORDER BY escalation_count DESC
            `),

            // Timeline
            db.query(`
                SELECT
                    DATE_TRUNC('day', escalated_at) as date,
                    COUNT(*) as escalation_count,
                    COUNT(DISTINCT alert_id) as unique_alerts
                FROM escalation_history
                WHERE ${intervalClause}
                GROUP BY DATE_TRUNC('day', escalated_at)
                ORDER BY date
            `)
        ]);

        res.json({
            period,
            total: totalStats.rows[0],
            by_level: levelStats.rows,
            by_alert_type: typeStats.rows,
            timeline: timelineStats.rows
        });
    } catch (error) {
        logger.error('Get escalation statistics error:', error);
        res.status(500).json({ error: 'Failed to get escalation statistics' });
    }
});

// POST /api/escalation/manual - Manually trigger escalation for an alert
router.post('/manual', [
    body('alert_id').isInt({ min: 1 }),
    body('escalation_level').optional().isInt({ min: 1, max: 10 }),
    body('reason').optional().isLength({ max: 500 })
], authenticateToken, requireOperator, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { alert_id, escalation_level = 1, reason } = req.body;

        // Verify alert exists and is active
        const alertResult = await db.query(`
            SELECT a.*, d.name as device_name
            FROM alerts a
            JOIN devices d ON a.device_id = d.id
            WHERE a.id = $1 AND a.status = 'active'
        `, [alert_id]);

        if (alertResult.rows.length === 0) {
            return res.status(404).json({ error: 'Active alert not found' });
        }

        const alert = alertResult.rows[0];

        // Find applicable escalation rule
        const ruleResult = await db.query(`
            SELECT * FROM escalation_rules
            WHERE (device_id = $1 OR location_id = (SELECT location_id FROM devices WHERE id = $1))
            AND alert_type = $2
            AND severity = $3
            AND enabled = true
            ORDER BY device_id IS NOT NULL DESC, created_at DESC
            LIMIT 1
        `, [alert.device_id, alert.alert_type, alert.severity]);

        if (ruleResult.rows.length === 0) {
            return res.status(400).json({ error: 'No applicable escalation rule found for this alert' });
        }

        const rule = ruleResult.rows[0];

        // Check if escalation level is within bounds
        if (escalation_level > rule.max_escalation_level) {
            return res.status(400).json({
                error: `Escalation level ${escalation_level} exceeds maximum level ${rule.max_escalation_level} for this rule`
            });
        }

        // Record escalation in history
        await db.query(`
            INSERT INTO escalation_history (
                alert_id, escalation_rule_id, escalation_level, escalated_at,
                notification_methods, recipients, manual_trigger, triggered_by, notes
            )
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, true, $6, $7)
        `, [
            alert_id,
            rule.id,
            escalation_level,
            JSON.stringify(rule.notification_methods),
            JSON.stringify(rule.recipients),
            req.user.userId,
            reason
        ]);

        logger.info(`Manual escalation triggered: Alert ${alert_id} to level ${escalation_level} by ${req.user.email}`);

        res.json({
            message: 'Manual escalation triggered successfully',
            alert,
            escalation_rule: rule,
            escalation_level,
            triggered_by: req.user.email,
            reason: reason || 'Manual escalation'
        });
    } catch (error) {
        logger.error('Manual escalation error:', error);
        res.status(500).json({ error: 'Failed to trigger manual escalation' });
    }
});

module.exports = router;