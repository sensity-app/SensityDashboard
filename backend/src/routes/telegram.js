const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const telegramService = require('../services/telegramService');

const router = express.Router();

// GET /api/telegram/config - Get Telegram configuration (admin only)
router.get('/config', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM telegram_config ORDER BY id LIMIT 1');

        if (result.rows.length === 0) {
            return res.json({
                enabled: false,
                configured: false
            });
        }

        const config = result.rows[0];

        res.json({
            enabled: config.enabled,
            configured: !!config.bot_token,
            bot_username: config.bot_username,
            bot_name: config.bot_name
        });
    } catch (error) {
        logger.error('Get Telegram config error:', error);
        res.status(500).json({ error: 'Failed to get Telegram configuration' });
    }
});

// PUT /api/telegram/config - Update Telegram configuration (admin only)
router.put('/config', [
    body('bot_token').optional().notEmpty(),
    body('enabled').optional().isBoolean()
], authenticateToken, requireAdmin, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { bot_token, enabled } = req.body;

        // If bot token is provided, validate it by getting bot info
        let botInfo = null;
        if (bot_token) {
            // Temporarily set token to test it
            const originalToken = process.env.TELEGRAM_BOT_TOKEN;
            process.env.TELEGRAM_BOT_TOKEN = bot_token;
            telegramService.initialize();

            botInfo = await telegramService.getBotInfo();

            if (!botInfo) {
                // Restore original token
                process.env.TELEGRAM_BOT_TOKEN = originalToken;
                telegramService.initialize();
                return res.status(400).json({ error: 'Invalid Telegram bot token' });
            }
        }

        // Update or insert configuration
        const result = await db.query(`
            INSERT INTO telegram_config (id, bot_token, bot_username, bot_name, enabled, updated_at)
            VALUES (1, $1, $2, $3, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                bot_token = COALESCE($1, telegram_config.bot_token),
                bot_username = COALESCE($2, telegram_config.bot_username),
                bot_name = COALESCE($3, telegram_config.bot_name),
                enabled = COALESCE($4, telegram_config.enabled),
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [
            bot_token || null,
            botInfo?.username || null,
            botInfo?.first_name || null,
            enabled !== undefined ? enabled : null
        ]);

        logger.info(`Telegram configuration updated by ${req.user.email}`);

        res.json({
            message: 'Telegram configuration updated successfully',
            config: {
                enabled: result.rows[0].enabled,
                bot_username: result.rows[0].bot_username,
                bot_name: result.rows[0].bot_name
            }
        });
    } catch (error) {
        logger.error('Update Telegram config error:', error);
        res.status(500).json({ error: 'Failed to update Telegram configuration' });
    }
});

// GET /api/telegram/status - Get bot status
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const botInfo = await telegramService.getBotInfo();

        if (!botInfo) {
            return res.json({
                connected: false,
                message: 'Telegram bot not configured or token is invalid'
            });
        }

        res.json({
            connected: true,
            bot: {
                id: botInfo.id,
                username: botInfo.username,
                first_name: botInfo.first_name,
                can_join_groups: botInfo.can_join_groups,
                can_read_all_group_messages: botInfo.can_read_all_group_messages
            }
        });
    } catch (error) {
        logger.error('Get Telegram status error:', error);
        res.status(500).json({ error: 'Failed to get Telegram status' });
    }
});

// POST /api/telegram/test - Send test message
router.post('/test', [
    body('chat_id').notEmpty()
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { chat_id } = req.body;

        // Validate chat ID first
        const isValid = await telegramService.validateChatId(chat_id);
        if (!isValid) {
            return res.status(400).json({
                error: 'Invalid chat ID or bot is not authorized to send messages to this chat'
            });
        }

        // Send test message
        const success = await telegramService.sendTestMessage(chat_id);

        if (success) {
            logger.info(`Test Telegram message sent to ${chat_id} by ${req.user.email}`);
            res.json({ message: 'Test message sent successfully' });
        } else {
            res.status(500).json({ error: 'Failed to send test message' });
        }
    } catch (error) {
        logger.error('Send Telegram test message error:', error);
        res.status(500).json({ error: 'Failed to send test message' });
    }
});

// PUT /api/telegram/user-settings - Update user's Telegram settings
router.put('/user-settings', [
    body('telegram_chat_id').optional().notEmpty(),
    body('notification_telegram').optional().isBoolean(),
    body('telegram_enabled').optional().isBoolean()
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { telegram_chat_id, notification_telegram, telegram_enabled } = req.body;

        // If chat ID is provided, validate it
        if (telegram_chat_id) {
            const isValid = await telegramService.validateChatId(telegram_chat_id);
            if (!isValid) {
                return res.status(400).json({
                    error: 'Invalid Telegram chat ID. Please start a conversation with the bot first.'
                });
            }
        }

        const result = await db.query(`
            UPDATE users
            SET telegram_chat_id = COALESCE($1, telegram_chat_id),
                notification_telegram = COALESCE($2, notification_telegram),
                telegram_enabled = COALESCE($3, telegram_enabled),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
            RETURNING telegram_chat_id, notification_telegram, telegram_enabled
        `, [telegram_chat_id || null, notification_telegram, telegram_enabled, req.user.userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        logger.info(`Telegram settings updated for user ${req.user.email}`);

        res.json({
            message: 'Telegram settings updated successfully',
            settings: result.rows[0]
        });
    } catch (error) {
        logger.error('Update Telegram user settings error:', error);
        res.status(500).json({ error: 'Failed to update Telegram settings' });
    }
});

// GET /api/telegram/user-settings - Get current user's Telegram settings
router.get('/user-settings', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT telegram_chat_id, notification_telegram, telegram_enabled
            FROM users
            WHERE id = $1
        `, [req.user.userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            settings: result.rows[0]
        });
    } catch (error) {
        logger.error('Get Telegram user settings error:', error);
        res.status(500).json({ error: 'Failed to get Telegram settings' });
    }
});

// GET /api/telegram/notifications - Get Telegram notification history
router.get('/notifications', authenticateToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        const result = await db.query(`
            SELECT
                tn.*,
                d.name as device_name,
                a.alert_type,
                a.severity
            FROM telegram_notifications tn
            LEFT JOIN devices d ON tn.device_id = d.id
            LEFT JOIN alerts a ON tn.alert_id = a.id
            WHERE tn.user_id = $1
            ORDER BY tn.sent_at DESC
            LIMIT $2 OFFSET $3
        `, [req.user.userId, limit, offset]);

        const countResult = await db.query(`
            SELECT COUNT(*) as total
            FROM telegram_notifications
            WHERE user_id = $1
        `, [req.user.userId]);

        res.json({
            notifications: result.rows,
            total: parseInt(countResult.rows[0].total),
            limit,
            offset
        });
    } catch (error) {
        logger.error('Get Telegram notifications error:', error);
        res.status(500).json({ error: 'Failed to get Telegram notifications' });
    }
});

module.exports = router;
