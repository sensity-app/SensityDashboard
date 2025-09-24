const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();


// GET /api/users - Get all users (admin only)
router.get('/', authenticateToken, requireAdmin, [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('role').optional().isIn(['admin', 'operator', 'viewer'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const { role } = req.query;

        let countQuery = 'SELECT COUNT(*) as total FROM users';
        let query = `
            SELECT
                id, email, role, phone, notification_email, notification_sms,
                notification_push, created_at, updated_at
            FROM users
        `;

        const params = [];

        if (role) {
            countQuery += ' WHERE role = $1';
            query += ' WHERE role = $1';
            params.push(role);
        }

        query += ` ORDER BY email LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const [usersResult, countResult] = await Promise.all([
            db.query(query, params),
            db.query(countQuery, params.slice(0, -2)) // Remove limit and offset for count
        ]);

        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        res.json({
            users: usersResult.rows,
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
        logger.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// GET /api/users/:id - Get user by ID
router.get('/:id', [
    param('id').isInt({ min: 1 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;

        // Users can only view their own profile unless they're admin
        if (req.user.role !== 'admin' && req.user.userId !== parseInt(id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = await db.query(`
            SELECT
                id, email, role, phone, notification_email, notification_sms,
                notification_push, created_at, updated_at
            FROM users
            WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: result.rows[0] });
    } catch (error) {
        logger.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// POST /api/users - Create new user (admin only)
router.post('/', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['admin', 'operator', 'viewer']),
    body('phone').optional().isMobilePhone(),
    body('notification_email').optional().isBoolean(),
    body('notification_sms').optional().isBoolean(),
    body('notification_push').optional().isBoolean()
], authenticateToken, requireAdmin, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const {
            email,
            password,
            role,
            phone,
            notification_email = true,
            notification_sms = false,
            notification_push = true
        } = req.body;

        // Check if user already exists
        const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'User already exists' });
        }

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const result = await db.query(`
            INSERT INTO users (
                email, password_hash, role, phone, notification_email,
                notification_sms, notification_push
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, email, role, phone, notification_email, notification_sms, notification_push, created_at
        `, [email, passwordHash, role, phone, notification_email, notification_sms, notification_push]);

        const user = result.rows[0];
        logger.info(`User created: ${email} with role: ${role} by ${req.user.email}`);

        res.status(201).json({
            message: 'User created successfully',
            user
        });
    } catch (error) {
        logger.error('Create user error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// PUT /api/users/:id - Update user
router.put('/:id', [
    param('id').isInt({ min: 1 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('role').optional().isIn(['admin', 'operator', 'viewer']),
    body('phone').optional().isMobilePhone(),
    body('notification_email').optional().isBoolean(),
    body('notification_sms').optional().isBoolean(),
    body('notification_push').optional().isBoolean()
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { email, role, phone, notification_email, notification_sms, notification_push } = req.body;

        // Users can only update their own profile unless they're admin
        if (req.user.role !== 'admin' && req.user.userId !== parseInt(id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Only admins can change roles
        if (role && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can change user roles' });
        }

        // Check if new email conflicts with existing users (excluding current one)
        if (email) {
            const existingUser = await db.query(
                'SELECT id FROM users WHERE email = $1 AND id != $2',
                [email, id]
            );
            if (existingUser.rows.length > 0) {
                return res.status(409).json({ error: 'Email already exists' });
            }
        }

        const result = await db.query(`
            UPDATE users
            SET email = COALESCE($1, email),
                role = COALESCE($2, role),
                phone = COALESCE($3, phone),
                notification_email = COALESCE($4, notification_email),
                notification_sms = COALESCE($5, notification_sms),
                notification_push = COALESCE($6, notification_push),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $7
            RETURNING id, email, role, phone, notification_email, notification_sms, notification_push, updated_at
        `, [email, role, phone, notification_email, notification_sms, notification_push, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];
        logger.info(`User updated: ${id} by ${req.user.email}`);

        res.json({
            message: 'User updated successfully',
            user
        });
    } catch (error) {
        logger.error('Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// PUT /api/users/:id/password - Change user password
router.put('/:id/password', [
    param('id').isInt({ min: 1 }),
    body('currentPassword').optional().notEmpty(),
    body('newPassword').isLength({ min: 6 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { currentPassword, newPassword } = req.body;

        // Users can only change their own password unless they're admin
        if (req.user.role !== 'admin' && req.user.userId !== parseInt(id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get current password hash
        const userResult = await db.query('SELECT password_hash FROM users WHERE id = $1', [id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        // If not admin, verify current password
        if (req.user.role !== 'admin') {
            if (!currentPassword) {
                return res.status(400).json({ error: 'Current password is required' });
            }

            const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
            if (!isValidPassword) {
                return res.status(400).json({ error: 'Current password is incorrect' });
            }
        }

        // Hash new password
        const saltRounds = 12;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await db.query(
            'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newPasswordHash, id]
        );

        logger.info(`Password changed for user ID: ${id} by ${req.user.email}`);
        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        logger.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// DELETE /api/users/:id - Delete user (admin only)
router.delete('/:id', [
    param('id').isInt({ min: 1 })
], authenticateToken, requireAdmin, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;

        // Prevent admins from deleting themselves
        if (req.user.userId === parseInt(id)) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        // Check if user exists and get their details
        const userResult = await db.query('SELECT id, email, role FROM users WHERE id = $1', [id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userToDelete = userResult.rows[0];

        // Prevent deletion of the last admin
        if (userToDelete.role === 'admin') {
            const adminCountResult = await db.query('SELECT COUNT(*) as count FROM users WHERE role = $1', ['admin']);
            const adminCount = parseInt(adminCountResult.rows[0].count);

            if (adminCount <= 1) {
                return res.status(400).json({ error: 'Cannot delete the last admin user' });
            }
        }

        // Start transaction to clean up user-related data
        await db.query('BEGIN');

        try {
            // Update alerts to remove user references
            await db.query(`
                UPDATE alerts
                SET acknowledged_by = NULL,
                    resolved_by = NULL
                WHERE acknowledged_by = $1 OR resolved_by = $1
            `, [id]);

            // Delete the user
            await db.query('DELETE FROM users WHERE id = $1', [id]);

            await db.query('COMMIT');
            logger.info(`User deleted: ${id} (${userToDelete.email}) by ${req.user.email}`);

            res.json({ message: 'User deleted successfully' });
        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        logger.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// GET /api/users/me/activity - Get current user's activity
router.get('/me/activity', authenticateToken, [
    query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;

        const result = await db.query(`
            SELECT
                'alert_acknowledged' as activity_type,
                a.id as alert_id,
                a.alert_type,
                a.acknowledged_at as timestamp,
                d.name as device_name
            FROM alerts a
            JOIN devices d ON a.device_id = d.id
            WHERE a.acknowledged_by = $1

            UNION ALL

            SELECT
                'alert_resolved' as activity_type,
                a.id as alert_id,
                a.alert_type,
                a.resolved_at as timestamp,
                d.name as device_name
            FROM alerts a
            JOIN devices d ON a.device_id = d.id
            WHERE a.resolved_by = $1

            ORDER BY timestamp DESC
            LIMIT $2
        `, [req.user.userId, limit]);

        res.json({ activity: result.rows });
    } catch (error) {
        logger.error('Get user activity error:', error);
        res.status(500).json({ error: 'Failed to get user activity' });
    }
});

// GET /api/users/statistics - Get user statistics (admin only)
router.get('/statistics', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [userStats, activityStats] = await Promise.all([
            // User role distribution
            db.query(`
                SELECT
                    role,
                    COUNT(*) as count
                FROM users
                GROUP BY role
                ORDER BY
                    CASE role
                        WHEN 'admin' THEN 1
                        WHEN 'operator' THEN 2
                        WHEN 'viewer' THEN 3
                    END
            `),

            // Recent user activity
            db.query(`
                SELECT
                    DATE_TRUNC('day', acknowledged_at) as date,
                    COUNT(*) as acknowledged_alerts
                FROM alerts
                WHERE acknowledged_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
                GROUP BY DATE_TRUNC('day', acknowledged_at)
                ORDER BY date
            `)
        ]);

        res.json({
            user_distribution: userStats.rows,
            activity_timeline: activityStats.rows
        });
    } catch (error) {
        logger.error('Get user statistics error:', error);
        res.status(500).json({ error: 'Failed to get user statistics' });
    }
});

module.exports = router;