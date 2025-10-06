const express = require('express');
const { param, body, query, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
    getBruteForceStats,
    unlockAccount,
    unblockIP,
    isAccountLocked,
    isIPBlocked
} = require('../middleware/bruteForceProtection');

const router = express.Router();

/**
 * GET /api/security/brute-force/stats - Get brute force attack statistics
 * Role: admin
 */
router.get('/brute-force/stats', [
    authenticateToken,
    requireRole(['admin'])
], async (req, res) => {
    try {
        const stats = await getBruteForceStats();
        res.json(stats);
    } catch (error) {
        logger.error('Get brute force stats error:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

/**
 * GET /api/security/failed-attempts - Get recent failed login attempts
 * Role: admin
 */
router.get('/failed-attempts', [
    authenticateToken,
    requireRole(['admin']),
    query('limit').optional().isInt({ min: 1, max: 500 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
    query('email').optional(),
    query('ip_address').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { limit = 100, offset = 0, email, ip_address } = req.query;

        let query = `
            SELECT *
            FROM failed_login_attempts
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (email) {
            query += ` AND email ILIKE $${paramCount}`;
            params.push(`%${email}%`);
            paramCount++;
        }

        if (ip_address) {
            query += ` AND ip_address = $${paramCount}`;
            params.push(ip_address);
            paramCount++;
        }

        query += ` ORDER BY attempted_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        // Get total count
        let countQuery = `SELECT COUNT(*) FROM failed_login_attempts WHERE 1=1`;
        const countParams = [];
        if (email) {
            countQuery += ` AND email ILIKE $1`;
            countParams.push(`%${email}%`);
        }
        if (ip_address) {
            countQuery += ` AND ip_address = $${countParams.length + 1}`;
            countParams.push(ip_address);
        }

        const countResult = await db.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            attempts: result.rows,
            total,
            limit,
            offset
        });
    } catch (error) {
        logger.error('Get failed attempts error:', error);
        res.status(500).json({ error: 'Failed to get failed login attempts' });
    }
});

/**
 * GET /api/security/locked-accounts - Get currently locked accounts
 * Role: admin
 */
router.get('/locked-accounts', [
    authenticateToken,
    requireRole(['admin'])
], async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                email,
                MAX(attempted_at) as last_attempt,
                COUNT(*) as total_attempts,
                MAX(consecutive_failures) as consecutive_failures
            FROM failed_login_attempts
            WHERE account_locked = true
            AND attempted_at > NOW() - INTERVAL '1 hour'
            GROUP BY email
            ORDER BY last_attempt DESC
        `);

        // Check each account's actual lock status
        const accounts = await Promise.all(
            result.rows.map(async (account) => {
                const lockStatus = await isAccountLocked(account.email);
                return {
                    ...account,
                    currently_locked: lockStatus.locked,
                    remaining_time: lockStatus.remainingTime || 0
                };
            })
        );

        res.json({
            locked_accounts: accounts.filter(a => a.currently_locked)
        });
    } catch (error) {
        logger.error('Get locked accounts error:', error);
        res.status(500).json({ error: 'Failed to get locked accounts' });
    }
});

/**
 * GET /api/security/blocked-ips - Get currently blocked IPs
 * Role: admin
 */
router.get('/blocked-ips', [
    authenticateToken,
    requireRole(['admin'])
], async (req, res) => {
    try {
        // Get IPs with high failure rates
        const result = await db.query(`
            SELECT
                ip_address,
                COUNT(*) as attempts,
                COUNT(DISTINCT email) as unique_targets,
                MAX(attempted_at) as last_attempt,
                array_agg(DISTINCT email) as targeted_emails
            FROM failed_login_attempts
            WHERE attempted_at > NOW() - INTERVAL '1 hour'
            GROUP BY ip_address
            HAVING COUNT(*) >= 5
            ORDER BY attempts DESC
        `);

        // Check each IP's actual block status
        const ips = await Promise.all(
            result.rows.map(async (ip) => {
                const blockStatus = await isIPBlocked(ip.ip_address);
                return {
                    ...ip,
                    currently_blocked: blockStatus.blocked,
                    remaining_time: blockStatus.remainingTime || 0
                };
            })
        );

        res.json({
            blocked_ips: ips.filter(ip => ip.currently_blocked || ip.attempts >= 10)
        });
    } catch (error) {
        logger.error('Get blocked IPs error:', error);
        res.status(500).json({ error: 'Failed to get blocked IPs' });
    }
});

/**
 * POST /api/security/unlock-account - Manually unlock an account
 * Role: admin
 */
router.post('/unlock-account', [
    authenticateToken,
    requireRole(['admin']),
    body('email').isEmail().normalizeEmail()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email } = req.body;

        await unlockAccount(email);

        logger.info(`Account unlocked by admin`, {
            email,
            adminId: req.user.userId,
            adminEmail: req.user.email
        });

        res.json({
            message: 'Account unlocked successfully',
            email
        });
    } catch (error) {
        logger.error('Unlock account error:', error);
        res.status(500).json({ error: 'Failed to unlock account' });
    }
});

/**
 * POST /api/security/unblock-ip - Manually unblock an IP
 * Role: admin
 */
router.post('/unblock-ip', [
    authenticateToken,
    requireRole(['admin']),
    body('ip_address').isIP()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { ip_address } = req.body;

        await unblockIP(ip_address);

        logger.info(`IP unblocked by admin`, {
            ip_address,
            adminId: req.user.userId,
            adminEmail: req.user.email
        });

        res.json({
            message: 'IP unblocked successfully',
            ip_address
        });
    } catch (error) {
        logger.error('Unblock IP error:', error);
        res.status(500).json({ error: 'Failed to unblock IP' });
    }
});

/**
 * GET /api/security/account-status/:email - Check if account is locked
 * Role: admin or own account
 */
router.get('/account-status/:email', [
    authenticateToken,
    param('email').isEmail().normalizeEmail()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email } = req.params;

        // Users can only check their own account, admins can check any
        if (req.user.role !== 'admin' && req.user.email !== email) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const lockStatus = await isAccountLocked(email);

        // Get failed attempts count
        const result = await db.query(
            `SELECT COUNT(*) as count
             FROM failed_login_attempts
             WHERE email = $1
             AND attempted_at > NOW() - INTERVAL '15 minutes'`,
            [email]
        );

        res.json({
            email,
            locked: lockStatus.locked,
            remaining_time: lockStatus.remainingTime || 0,
            failed_attempts: parseInt(result.rows[0].count)
        });
    } catch (error) {
        logger.error('Check account status error:', error);
        res.status(500).json({ error: 'Failed to check account status' });
    }
});

/**
 * GET /api/security/ip-status/:ip - Check if IP is blocked
 * Role: admin
 */
router.get('/ip-status/:ip', [
    authenticateToken,
    requireRole(['admin']),
    param('ip').isIP()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { ip } = req.params;

        const blockStatus = await isIPBlocked(ip);

        // Get recent attempts from this IP
        const result = await db.query(
            `SELECT COUNT(*) as count, array_agg(DISTINCT email) as targeted_emails
             FROM failed_login_attempts
             WHERE ip_address = $1
             AND attempted_at > NOW() - INTERVAL '1 hour'`,
            [ip]
        );

        res.json({
            ip_address: ip,
            blocked: blockStatus.blocked,
            remaining_time: blockStatus.remainingTime || 0,
            recent_attempts: parseInt(result.rows[0].count),
            targeted_emails: result.rows[0].targeted_emails || []
        });
    } catch (error) {
        logger.error('Check IP status error:', error);
        res.status(500).json({ error: 'Failed to check IP status' });
    }
});

/**
 * DELETE /api/security/failed-attempts - Clear old failed login attempts
 * Role: admin
 */
router.delete('/failed-attempts', [
    authenticateToken,
    requireRole(['admin']),
    query('older_than_days').optional().isInt({ min: 1, max: 365 }).toInt()
], async (req, res) => {
    try {
        const { older_than_days = 30 } = req.query;

        const result = await db.query(
            `DELETE FROM failed_login_attempts
             WHERE attempted_at < NOW() - INTERVAL '${older_than_days} days'
             RETURNING id`,
            []
        );

        const deletedCount = result.rowCount;

        logger.info(`Failed login attempts cleaned up`, {
            deletedCount,
            olderThanDays: older_than_days,
            adminId: req.user.userId
        });

        res.json({
            message: 'Failed login attempts cleaned up',
            deleted_count: deletedCount
        });
    } catch (error) {
        logger.error('Clean failed attempts error:', error);
        res.status(500).json({ error: 'Failed to clean up failed attempts' });
    }
});

/**
 * GET /api/security/active-threats - Get real-time threat assessment
 * Role: admin
 */
router.get('/active-threats', [
    authenticateToken,
    requireRole(['admin'])
], async (req, res) => {
    try {
        // Identify ongoing attacks (high frequency in last 5 minutes)
        const ongoingAttacks = await db.query(`
            SELECT
                ip_address,
                COUNT(*) as attempts,
                COUNT(DISTINCT email) as unique_targets,
                MAX(attempted_at) as last_attempt,
                array_agg(DISTINCT email) as targeted_emails
            FROM failed_login_attempts
            WHERE attempted_at > NOW() - INTERVAL '5 minutes'
            GROUP BY ip_address
            HAVING COUNT(*) >= 3
            ORDER BY attempts DESC
        `);

        // Identify accounts under attack
        const attackedAccounts = await db.query(`
            SELECT
                email,
                COUNT(*) as attempts,
                COUNT(DISTINCT ip_address) as unique_ips,
                MAX(attempted_at) as last_attempt
            FROM failed_login_attempts
            WHERE attempted_at > NOW() - INTERVAL '5 minutes'
            GROUP BY email
            HAVING COUNT(*) >= 3
            ORDER BY attempts DESC
        `);

        res.json({
            ongoing_attacks: ongoingAttacks.rows,
            attacked_accounts: attackedAccounts.rows,
            threat_level: ongoingAttacks.rows.length > 5 ? 'high' :
                         ongoingAttacks.rows.length > 2 ? 'medium' : 'low'
        });
    } catch (error) {
        logger.error('Get active threats error:', error);
        res.status(500).json({ error: 'Failed to get active threats' });
    }
});

module.exports = router;
