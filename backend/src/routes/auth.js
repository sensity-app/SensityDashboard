const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, requireRole } = require('../middleware/auth');
const emailService = require('../services/emailService');
const { bruteForceProtection } = require('../middleware/bruteForceProtection');

const router = express.Router();


// GET /api/auth/setup-check - Check if first-time setup is needed
router.get('/setup-check', async (req, res) => {
    try {
        const result = await db.query('SELECT COUNT(*) as count FROM users');
        const userCount = parseInt(result.rows[0].count);

        res.json({
            needsSetup: userCount === 0,
            hasUsers: userCount > 0
        });
    } catch (error) {
        logger.error('Setup check error:', error);
        res.status(500).json({ error: 'Failed to check setup status' });
    }
});

// POST /api/auth/initial-setup - First-time admin user creation
router.post('/initial-setup', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('fullName').notEmpty().trim(),
    body('preferredLanguage').optional().isIn(['en', 'cs'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Check if any users already exist
        const userCount = await db.query('SELECT COUNT(*) as count FROM users');
        if (parseInt(userCount.rows[0].count) > 0) {
            return res.status(403).json({ error: 'Initial setup already completed' });
        }

        const { email, password, fullName, phone } = req.body;
        const preferredLanguage = req.body.preferred_language || req.body.preferredLanguage || 'en';

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create first admin user
        const result = await db.query(
            `INSERT INTO users (email, password_hash, role, phone, full_name, preferred_language)
             VALUES ($1, $2, 'admin', $3, $4, $5)
             RETURNING id, email, role, full_name, preferred_language, created_at`,
            [email, passwordHash, phone, fullName, preferredLanguage]
        );

        const user = result.rows[0];
        logger.info(`Initial admin user created: ${email}`);

        // Generate JWT token for immediate login
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            message: 'Initial setup completed successfully',
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                fullName: user.full_name,
                full_name: user.full_name,
                preferred_language: user.preferred_language,
                created_at: user.created_at
            }
        });
    } catch (error) {
        logger.error('Initial setup error:', error);
        res.status(500).json({ error: 'Initial setup failed' });
    }
});

// POST /api/auth/register - Invite-based user registration
router.post('/register', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('fullName').notEmpty().trim(),
    body('inviteToken').notEmpty(),
    body('preferredLanguage').optional().isIn(['en', 'cs'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password, fullName, inviteToken, phone } = req.body;
        const preferredLanguage = req.body.preferred_language || req.body.preferredLanguage || 'en';

        // Verify invite token
        const inviteResult = await db.query(
            `SELECT id, email, role, expires_at, used_at
             FROM user_invitations
             WHERE token = $1`,
            [inviteToken]
        );

        if (inviteResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid invitation token' });
        }

        const invitation = inviteResult.rows[0];

        // Check if invitation is expired
        if (new Date() > new Date(invitation.expires_at)) {
            return res.status(400).json({ error: 'Invitation token has expired' });
        }

        // Check if invitation is already used
        if (invitation.used_at) {
            return res.status(400).json({ error: 'Invitation token has already been used' });
        }

        // Check if email matches invitation
        if (invitation.email !== email) {
            return res.status(400).json({ error: 'Email does not match invitation' });
        }

        // Check if user already exists
        const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'User already exists' });
        }

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create user and mark invitation as used
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // Create user
            const userResult = await client.query(
                `INSERT INTO users (email, password_hash, role, phone, full_name, preferred_language)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id, email, role, full_name, preferred_language, created_at`,
                [email, passwordHash, invitation.role, phone, fullName, preferredLanguage]
            );

            // Mark invitation as used
            await client.query(
                `UPDATE user_invitations
                 SET used_at = CURRENT_TIMESTAMP, used_by = $1
                 WHERE id = $2`,
                [userResult.rows[0].id, invitation.id]
            );

            await client.query('COMMIT');

            const user = userResult.rows[0];
            logger.info(`User registered via invitation: ${email} with role: ${invitation.role}`);

            res.status(201).json({
                message: 'User registered successfully',
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    fullName: user.full_name,
                    full_name: user.full_name,
                    preferred_language: user.preferred_language,
                    created_at: user.created_at
                }
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /api/auth/login
router.post('/login', [
    bruteForceProtection,
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;

        // Find user
        const result = await db.query(
            'SELECT id, email, password_hash, role, full_name, preferred_language FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            // Record failed attempt - user not found
            if (req.bruteForce) {
                await req.bruteForce.recordFailure('user_not_found');
            }
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            // Record failed attempt - invalid password
            if (req.bruteForce) {
                await req.bruteForce.recordFailure('invalid_password');
            }
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Clear failed attempts on successful login
        if (req.bruteForce) {
            await req.bruteForce.clearAttempts();
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        logger.info(`User logged in: ${email}`);

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                fullName: user.full_name,
                full_name: user.full_name,
                preferred_language: user.preferred_language
            }
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, email, role, phone, notification_email, notification_sms,
                    notification_push, preferred_language, full_name, created_at
             FROM users WHERE id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: result.rows[0] });
    } catch (error) {
        logger.error('Get user profile error:', error);
        res.status(500).json({ error: 'Failed to get user profile' });
    }
});

// PUT /api/auth/profile
router.put('/profile', authenticateToken, [
    body('phone').optional().isMobilePhone(),
    body('notification_email').optional().isBoolean(),
    body('notification_sms').optional().isBoolean(),
    body('notification_push').optional().isBoolean(),
    body('preferred_language').optional().isIn(['en', 'cs'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { phone, notification_email, notification_sms, notification_push } = req.body;
        const preferredLanguage = req.body.preferred_language || req.body.preferredLanguage;

        const result = await db.query(
            `UPDATE users
             SET phone = COALESCE($1, phone),
                 notification_email = COALESCE($2, notification_email),
                 notification_sms = COALESCE($3, notification_sms),
                 notification_push = COALESCE($4, notification_push),
                 preferred_language = COALESCE($5, preferred_language),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6
             RETURNING id, email, role, phone, notification_email, notification_sms, notification_push, preferred_language`,
            [phone, notification_email, notification_sms, notification_push, preferredLanguage, req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        logger.info(`User profile updated: ${req.user.email}`);
        res.json({
            message: 'Profile updated successfully',
            user: result.rows[0]
        });
    } catch (error) {
        logger.error('Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// POST /api/auth/change-password
router.post('/change-password', authenticateToken, [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 6 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { currentPassword, newPassword } = req.body;

        // Get current password hash
        const result = await db.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];

        // Verify current password
        const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const saltRounds = 12;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await db.query(
            'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newPasswordHash, req.user.userId]
        );

        logger.info(`Password changed for user: ${req.user.email}`);
        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        logger.error('Password change error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', [
    body('email').isEmail().normalizeEmail()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email } = req.body;

        // Check if user exists
        const userResult = await db.query('SELECT id, email, full_name FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            // Don't reveal if user exists or not for security
            return res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
        }

        const user = userResult.rows[0];

        // Create password reset table if it doesn't exist
        await db.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                token VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                used_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1); // Expire in 1 hour

        // Delete any existing reset tokens for this user
        await db.query('DELETE FROM password_resets WHERE user_id = $1', [user.id]);

        // Store reset token
        await db.query(
            'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, resetToken, expiresAt]
        );

        // Send password reset email
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
        const subject = 'Password Reset Request';

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #007bff; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 24px;">Password Reset Request</h1>
                </div>

                <div style="background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6;">
                    <h2 style="color: #495057; margin-top: 0;">Hello ${user.full_name || user.email},</h2>
                    <p style="color: #6c757d; line-height: 1.6;">
                        You requested a password reset for your Sensity account.
                        Click the button below to reset your password:
                    </p>
                </div>

                <div style="background: white; padding: 20px; border: 1px solid #dee2e6; border-top: none; text-align: center;">
                    <div style="margin-bottom: 20px;">
                        <a href="${resetUrl}"
                           style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
                            Reset Password
                        </a>
                    </div>
                    <p style="color: #6c757d; margin: 10px 0; font-size: 14px;">
                        Or copy and paste this link into your browser:
                    </p>
                    <p style="color: #007bff; font-size: 14px; word-break: break-all;">
                        ${resetUrl}
                    </p>
                </div>

                <div style="background: #f8f9fa; padding: 15px; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px;">
                    <p style="color: #6c757d; margin: 0; font-size: 12px; text-align: center;">
                        This link will expire in 1 hour. If you didn't request a password reset,
                        you can safely ignore this email.
                    </p>
                </div>
            </div>
        `;

        await emailService.sendEmail(email, subject, html);

        logger.info(`Password reset requested for user: ${email}`);
        res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
    } catch (error) {
        logger.error('Password reset request error:', error);
        res.status(500).json({ error: 'Failed to process password reset request' });
    }
});

// POST /api/auth/reset-password - Reset password with token
router.post('/reset-password', [
    body('token').notEmpty(),
    body('password').isLength({ min: 6 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { token, password } = req.body;

        // Find valid reset token
        const resetResult = await db.query(`
            SELECT pr.id, pr.user_id, u.email
            FROM password_resets pr
            JOIN users u ON pr.user_id = u.id
            WHERE pr.token = $1
            AND pr.expires_at > CURRENT_TIMESTAMP
            AND pr.used_at IS NULL
        `, [token]);

        if (resetResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const resetData = resetResult.rows[0];

        // Hash new password
        const saltRounds = 12;
        const newPasswordHash = await bcrypt.hash(password, saltRounds);

        // Update password and mark token as used
        await db.transaction(async (client) => {
            // Update user password
            await client.query(
                'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [newPasswordHash, resetData.user_id]
            );

            // Mark token as used
            await client.query(
                'UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
                [resetData.id]
            );
        });

        logger.info(`Password reset completed for user: ${resetData.email}`);
        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        logger.error('Password reset error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// POST /api/auth/invite - Create user invitation (admin only)
router.post('/invite', authenticateToken, requireRole(['admin']), [
    body('email').isEmail().normalizeEmail(),
    body('role').isIn(['admin', 'operator', 'viewer']),
    body('fullName').notEmpty().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, role, fullName } = req.body;

        // Check if user already exists
        const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'User with this email already exists' });
        }

        // Check if there's already a pending invitation
        const existingInvite = await db.query(
            `SELECT id FROM user_invitations
             WHERE email = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
            [email]
        );
        if (existingInvite.rows.length > 0) {
            return res.status(409).json({ error: 'Pending invitation already exists for this email' });
        }

        // Generate unique invitation token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // Expire in 7 days

        // Create invitation
        const result = await db.query(
            `INSERT INTO user_invitations (email, role, full_name, token, expires_at, invited_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, email, role, full_name, token, expires_at, created_at`,
            [email, role, fullName, token, expiresAt, req.user.userId]
        );

        const invitation = result.rows[0];

        // Send invitation email
        const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/register?token=${token}`;
        await emailService.sendInvitationEmail(email, fullName, inviteUrl, req.user.email, role);

        logger.info(`User invitation sent: ${email} by ${req.user.email}`);

        res.status(201).json({
            message: 'Invitation sent successfully',
            invitation: {
                id: invitation.id,
                email: invitation.email,
                role: invitation.role,
                fullName: invitation.full_name,
                expires_at: invitation.expires_at,
                created_at: invitation.created_at
            }
        });
    } catch (error) {
        logger.error('Invitation creation error:', error);
        res.status(500).json({ error: 'Failed to create invitation' });
    }
});

// GET /api/auth/invitations - List pending invitations (admin only)
router.get('/invitations', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const result = await db.query(
            `SELECT i.id, i.email, i.role, i.full_name, i.expires_at, i.created_at,
                    u.email as invited_by_email
             FROM user_invitations i
             LEFT JOIN users u ON i.invited_by = u.id
             WHERE i.used_at IS NULL
             ORDER BY i.created_at DESC`
        );

        res.json({
            invitations: result.rows.map(inv => ({
                id: inv.id,
                email: inv.email,
                role: inv.role,
                fullName: inv.full_name,
                expiresAt: inv.expires_at,
                createdAt: inv.created_at,
                invitedBy: inv.invited_by_email,
                isExpired: new Date() > new Date(inv.expires_at)
            }))
        });
    } catch (error) {
        logger.error('Get invitations error:', error);
        res.status(500).json({ error: 'Failed to get invitations' });
    }
});

// DELETE /api/auth/invitations/:id - Cancel invitation (admin only)
router.delete('/invitations/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(
            `DELETE FROM user_invitations
             WHERE id = $1 AND used_at IS NULL
             RETURNING email`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Invitation not found or already used' });
        }

        logger.info(`Invitation canceled: ${result.rows[0].email} by ${req.user.email}`);

        res.json({ message: 'Invitation canceled successfully' });
    } catch (error) {
        logger.error('Cancel invitation error:', error);
        res.status(500).json({ error: 'Failed to cancel invitation' });
    }
});

// GET /api/auth/invite/:token - Verify invitation token
router.get('/invite/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const result = await db.query(
            `SELECT email, role, full_name, expires_at, used_at
             FROM user_invitations
             WHERE token = $1`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Invalid invitation token' });
        }

        const invitation = result.rows[0];

        if (invitation.used_at) {
            return res.status(400).json({ error: 'Invitation has already been used' });
        }

        if (new Date() > new Date(invitation.expires_at)) {
            return res.status(400).json({ error: 'Invitation has expired' });
        }

        res.json({
            email: invitation.email,
            role: invitation.role,
            fullName: invitation.full_name,
            expiresAt: invitation.expires_at,
            valid: true
        });
    } catch (error) {
        logger.error('Verify invitation error:', error);
        res.status(500).json({ error: 'Failed to verify invitation' });
    }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, (req, res) => {
    // In a more complex implementation, you might want to blacklist the token
    // For now, we'll just send a success response
    logger.info(`User logged out: ${req.user.email}`);
    res.json({ message: 'Logout successful' });
});

module.exports = router;
