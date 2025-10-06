const express = require('express');
const { query, param, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, requireRole } = require('../middleware/auth');
const auditService = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/audit-logs - Get audit logs with filtering
 * Role: admin (only admins can view audit logs)
 */
router.get('/', [
    authenticateToken,
    requireRole(['admin']),
    query('user_id').optional().isInt(),
    query('device_id').optional(),
    query('action_type').optional(),
    query('action_category').optional().isIn(['authentication', 'device', 'sensor', 'alert', 'system', 'user']),
    query('action_result').optional().isIn(['success', 'failure', 'error']),
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601(),
    query('search').optional(),
    query('limit').optional().isInt({ min: 1, max: 1000 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const {
            user_id: userId,
            device_id: deviceId,
            action_type: actionType,
            action_category: actionCategory,
            action_result: actionResult,
            start_date: startDate,
            end_date: endDate,
            search: searchTerm,
            limit = 100,
            offset = 0
        } = req.query;

        const result = await auditService.getAuditLogs({
            userId,
            deviceId,
            actionType,
            actionCategory,
            actionResult,
            startDate,
            endDate,
            searchTerm
        }, limit, offset);

        res.json(result);
    } catch (error) {
        logger.error('Get audit logs error:', error);
        res.status(500).json({ error: 'Failed to get audit logs' });
    }
});

/**
 * GET /api/audit-logs/stats - Get audit log statistics
 * Role: admin
 */
router.get('/stats', [
    authenticateToken,
    requireRole(['admin']),
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601()
], async (req, res) => {
    try {
        const { start_date: startDate, end_date: endDate } = req.query;

        // Get action counts by category
        let query = `
            SELECT action_category, action_result, COUNT(*) as count
            FROM audit_logs
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (startDate) {
            query += ` AND created_at >= $${paramCount}`;
            params.push(startDate);
            paramCount++;
        }

        if (endDate) {
            query += ` AND created_at <= $${paramCount}`;
            params.push(endDate);
            paramCount++;
        }

        query += ` GROUP BY action_category, action_result`;

        const categoryResult = await db.query(query, params);

        // Get top users by activity
        const topUsersQuery = `
            SELECT user_email, COUNT(*) as action_count
            FROM audit_logs
            WHERE user_email IS NOT NULL
            ${startDate ? `AND created_at >= $1` : ''}
            ${endDate ? `AND created_at <= ${startDate ? '$2' : '$1'}` : ''}
            GROUP BY user_email
            ORDER BY action_count DESC
            LIMIT 10
        `;
        const topUsersParams = [];
        if (startDate) topUsersParams.push(startDate);
        if (endDate) topUsersParams.push(endDate);

        const topUsersResult = await db.query(topUsersQuery, topUsersParams);

        // Get total counts
        const totalQuery = `
            SELECT
                COUNT(*) as total_actions,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(DISTINCT device_id) as unique_devices,
                SUM(CASE WHEN action_result = 'success' THEN 1 ELSE 0 END) as successful_actions,
                SUM(CASE WHEN action_result = 'failure' THEN 1 ELSE 0 END) as failed_actions,
                SUM(CASE WHEN action_result = 'error' THEN 1 ELSE 0 END) as error_actions
            FROM audit_logs
            WHERE 1=1
            ${startDate ? `AND created_at >= $1` : ''}
            ${endDate ? `AND created_at <= ${startDate ? '$2' : '$1'}` : ''}
        `;
        const totalParams = [];
        if (startDate) totalParams.push(startDate);
        if (endDate) totalParams.push(endDate);

        const totalResult = await db.query(totalQuery, totalParams);

        res.json({
            byCategory: categoryResult.rows,
            topUsers: topUsersResult.rows,
            totals: totalResult.rows[0]
        });
    } catch (error) {
        logger.error('Get audit stats error:', error);
        res.status(500).json({ error: 'Failed to get audit statistics' });
    }
});

/**
 * GET /api/audit-logs/session-history - Get user session history
 * Role: admin (or user viewing their own sessions)
 */
router.get('/session-history', [
    authenticateToken,
    query('user_id').optional().isInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
], async (req, res) => {
    try {
        const { user_id: userId, limit = 50, offset = 0 } = req.query;

        // Users can only view their own sessions unless they're admin
        const targetUserId = userId || req.user.userId;
        if (req.user.role !== 'admin' && targetUserId != req.user.userId) {
            return res.status(403).json({ error: 'Forbidden: Can only view your own sessions' });
        }

        const result = await db.query(
            `SELECT *
             FROM session_audit
             WHERE user_id = $1
             ORDER BY session_start DESC
             LIMIT $2 OFFSET $3`,
            [targetUserId, limit, offset]
        );

        const countResult = await db.query(
            'SELECT COUNT(*) FROM session_audit WHERE user_id = $1',
            [targetUserId]
        );

        res.json({
            sessions: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit,
            offset
        });
    } catch (error) {
        logger.error('Get session history error:', error);
        res.status(500).json({ error: 'Failed to get session history' });
    }
});

/**
 * GET /api/audit-logs/failed-logins - Get failed login attempts
 * Role: admin
 */
router.get('/failed-logins', [
    authenticateToken,
    requireRole(['admin']),
    query('limit').optional().isInt({ min: 1, max: 500 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
], async (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.query;

        const result = await db.query(
            `SELECT *
             FROM failed_login_attempts
             ORDER BY attempted_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        // Get stats
        const statsResult = await db.query(
            `SELECT
                COUNT(*) as total_attempts,
                COUNT(DISTINCT email) as unique_emails,
                COUNT(DISTINCT ip_address) as unique_ips,
                SUM(CASE WHEN account_locked THEN 1 ELSE 0 END) as locked_accounts,
                COUNT(CASE WHEN attempted_at > NOW() - INTERVAL '24 hours' THEN 1 END) as last_24h
             FROM failed_login_attempts`
        );

        res.json({
            attempts: result.rows,
            stats: statsResult.rows[0],
            limit,
            offset
        });
    } catch (error) {
        logger.error('Get failed logins error:', error);
        res.status(500).json({ error: 'Failed to get failed login attempts' });
    }
});

/**
 * GET /api/audit-logs/data-exports - Get data export history
 * Role: admin (or user viewing their own exports)
 */
router.get('/data-exports', [
    authenticateToken,
    query('user_id').optional().isInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
], async (req, res) => {
    try {
        const { user_id: userId, limit = 50, offset = 0 } = req.query;

        // Users can only view their own exports unless they're admin
        const targetUserId = userId || req.user.userId;
        if (req.user.role !== 'admin' && targetUserId != req.user.userId) {
            return res.status(403).json({ error: 'Forbidden: Can only view your own exports' });
        }

        const result = await db.query(
            `SELECT *
             FROM data_export_audit
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [targetUserId, limit, offset]
        );

        res.json({
            exports: result.rows,
            limit,
            offset
        });
    } catch (error) {
        logger.error('Get data exports error:', error);
        res.status(500).json({ error: 'Failed to get data export history' });
    }
});

/**
 * GET /api/audit-logs/config-changes - Get system configuration change history
 * Role: admin
 */
router.get('/config-changes', [
    authenticateToken,
    requireRole(['admin']),
    query('category').optional(),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
], async (req, res) => {
    try {
        const { category, limit = 100, offset = 0 } = req.query;

        let query = `
            SELECT *
            FROM config_change_audit
            WHERE 1=1
        `;
        const params = [limit, offset];

        if (category) {
            query += ` AND config_category = $3`;
            params.push(category);
        }

        query += ` ORDER BY created_at DESC LIMIT $1 OFFSET $2`;

        const result = await db.query(query, params);

        res.json({
            changes: result.rows,
            limit,
            offset
        });
    } catch (error) {
        logger.error('Get config changes error:', error);
        res.status(500).json({ error: 'Failed to get config change history' });
    }
});

/**
 * GET /api/audit-logs/device-commands - Get device command history
 * Role: admin, operator
 */
router.get('/device-commands', [
    authenticateToken,
    requireRole(['admin', 'operator']),
    query('device_id').optional(),
    query('status').optional().isIn(['pending', 'sent', 'acknowledged', 'completed', 'failed']),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
], async (req, res) => {
    try {
        const { device_id: deviceId, status, limit = 100, offset = 0 } = req.query;

        let query = `
            SELECT dc.*, u.email as user_email, d.name as device_name
            FROM device_command_audit dc
            LEFT JOIN users u ON dc.user_id = u.id
            LEFT JOIN devices d ON dc.device_id = d.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (deviceId) {
            query += ` AND dc.device_id = $${paramCount}`;
            params.push(deviceId);
            paramCount++;
        }

        if (status) {
            query += ` AND dc.status = $${paramCount}`;
            params.push(status);
            paramCount++;
        }

        query += ` ORDER BY dc.sent_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        res.json({
            commands: result.rows,
            limit,
            offset
        });
    } catch (error) {
        logger.error('Get device commands error:', error);
        res.status(500).json({ error: 'Failed to get device command history' });
    }
});

/**
 * GET /api/audit-logs/:id - Get single audit log entry
 * Role: admin
 */
router.get('/:id', [
    authenticateToken,
    requireRole(['admin']),
    param('id').isInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;

        const result = await db.query(
            'SELECT * FROM audit_logs WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Audit log not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Get audit log error:', error);
        res.status(500).json({ error: 'Failed to get audit log' });
    }
});

/**
 * DELETE /api/audit-logs/cleanup - Manually trigger audit log cleanup
 * Role: admin
 */
router.delete('/cleanup', [
    authenticateToken,
    requireRole(['admin'])
], async (req, res) => {
    try {
        await db.query('SELECT cleanup_old_audit_logs()');

        logger.info('Manual audit log cleanup triggered', {
            userId: req.user.userId,
            userEmail: req.user.email
        });

        res.json({
            message: 'Audit log cleanup completed successfully'
        });
    } catch (error) {
        logger.error('Audit log cleanup error:', error);
        res.status(500).json({ error: 'Failed to cleanup audit logs' });
    }
});

module.exports = router;
