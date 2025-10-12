// =====================================================
// Sensity Dashboard - Webhook Management Routes
// Allows users to configure Slack, Discord, Teams integrations
// =====================================================

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const webhookService = require('../services/webhookNotificationService');

const router = express.Router();

// =====================================================
// GET /api/webhooks - Get all webhook configurations
// =====================================================
router.get('/', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                id,
                name,
                webhook_type,
                webhook_url,
                event_types,
                is_active,
                created_at,
                updated_at
            FROM webhook_configurations
            ORDER BY created_at DESC
        `);

        // Mask webhook URLs for security
        const webhooks = result.rows.map(webhook => ({
            ...webhook,
            webhook_url: maskUrl(webhook.webhook_url)
        }));

        res.json({ webhooks });
    } catch (error) {
        logger.error('Get webhooks error:', error);
        res.status(500).json({ error: 'Failed to retrieve webhooks' });
    }
});

// =====================================================
// GET /api/webhooks/:id - Get single webhook
// =====================================================
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT * FROM webhook_configurations WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Webhook not found' });
        }

        const webhook = result.rows[0];
        webhook.webhook_url = maskUrl(webhook.webhook_url);

        res.json({ webhook });
    } catch (error) {
        logger.error('Get webhook error:', error);
        res.status(500).json({ error: 'Failed to retrieve webhook' });
    }
});

// =====================================================
// POST /api/webhooks - Create new webhook configuration
// =====================================================
router.post('/',
    authenticateToken,
    requireAdmin,
    [
        body('name').trim().notEmpty().withMessage('Name is required'),
        body('webhook_type').isIn(['slack', 'discord', 'teams', 'telegram', 'custom'])
            .withMessage('Invalid webhook type'),
        body('webhook_url').optional().isURL().withMessage('Invalid webhook URL'),
        body('bot_token').optional().trim(),
        body('chat_id').optional().trim(),
        body('event_types').optional().isArray().withMessage('Event types must be an array')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const {
                name,
                webhook_type,
                webhook_url,
                bot_token,
                chat_id,
                event_types = ['alert.created'],
                custom_headers = {}
            } = req.body;

            // Validate required fields based on webhook type
            if (webhook_type === 'telegram') {
                if (!bot_token || !chat_id) {
                    return res.status(400).json({
                        error: 'Telegram webhooks require bot_token and chat_id'
                    });
                }
            } else if (!webhook_url) {
                return res.status(400).json({
                    error: 'Webhook URL is required for this type'
                });
            }

            const result = await db.query(`
                INSERT INTO webhook_configurations (
                    name,
                    webhook_type,
                    webhook_url,
                    bot_token,
                    chat_id,
                    event_types,
                    custom_headers,
                    created_by,
                    is_active
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
                RETURNING *
            `, [
                name,
                webhook_type,
                webhook_url || null,
                bot_token || null,
                chat_id || null,
                JSON.stringify(event_types),
                JSON.stringify(custom_headers),
                req.user.id
            ]);

            logger.info(`Webhook created by ${req.user.email}:`, {
                id: result.rows[0].id,
                name,
                type: webhook_type
            });

            const webhook = result.rows[0];
            webhook.webhook_url = maskUrl(webhook.webhook_url);

            res.status(201).json({
                message: 'Webhook created successfully',
                webhook
            });
        } catch (error) {
            logger.error('Create webhook error:', error);
            res.status(500).json({ error: 'Failed to create webhook' });
        }
    }
);

// =====================================================
// PUT /api/webhooks/:id - Update webhook configuration
// =====================================================
router.put('/:id',
    authenticateToken,
    requireAdmin,
    [
        param('id').isInt().withMessage('Invalid webhook ID'),
        body('name').optional().trim().notEmpty(),
        body('webhook_url').optional().isURL(),
        body('event_types').optional().isArray(),
        body('is_active').optional().isBoolean()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const { id } = req.params;
            const updates = req.body;

            // Build dynamic UPDATE query
            const fields = [];
            const values = [];
            let paramCount = 1;

            Object.keys(updates).forEach(key => {
                if (['name', 'webhook_url', 'bot_token', 'chat_id', 'is_active'].includes(key)) {
                    fields.push(`${key} = $${paramCount}`);
                    values.push(updates[key]);
                    paramCount++;
                } else if (key === 'event_types' || key === 'custom_headers') {
                    fields.push(`${key} = $${paramCount}::jsonb`);
                    values.push(JSON.stringify(updates[key]));
                    paramCount++;
                }
            });

            if (fields.length === 0) {
                return res.status(400).json({ error: 'No valid fields to update' });
            }

            fields.push(`updated_at = NOW()`);
            values.push(id);

            const query = `
                UPDATE webhook_configurations
                SET ${fields.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            const result = await db.query(query, values);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Webhook not found' });
            }

            logger.info(`Webhook updated by ${req.user.email}:`, { id });

            const webhook = result.rows[0];
            webhook.webhook_url = maskUrl(webhook.webhook_url);

            res.json({
                message: 'Webhook updated successfully',
                webhook
            });
        } catch (error) {
            logger.error('Update webhook error:', error);
            res.status(500).json({ error: 'Failed to update webhook' });
        }
    }
);

// =====================================================
// DELETE /api/webhooks/:id - Delete webhook configuration
// =====================================================
router.delete('/:id',
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const { id } = req.params;

            const result = await db.query(`
                DELETE FROM webhook_configurations WHERE id = $1 RETURNING id, name
            `, [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Webhook not found' });
            }

            logger.info(`Webhook deleted by ${req.user.email}:`, result.rows[0]);

            res.json({ message: 'Webhook deleted successfully' });
        } catch (error) {
            logger.error('Delete webhook error:', error);
            res.status(500).json({ error: 'Failed to delete webhook' });
        }
    }
);

// =====================================================
// POST /api/webhooks/:id/test - Test webhook configuration
// =====================================================
router.post('/:id/test',
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const { id } = req.params;

            const result = await db.query(`
                SELECT * FROM webhook_configurations WHERE id = $1
            `, [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Webhook not found' });
            }

            const webhook = result.rows[0];

            // Create test message
            const testMessage = 'This is a test message from Sensity Platform';
            const testAlert = {
                id: 0,
                title: 'Test Alert',
                message: 'This is a test alert to verify webhook configuration',
                device_name: 'Test Device',
                device_id: 'test-device-001',
                severity: 'info',
                status: 'active',
                created_at: new Date().toISOString()
            };

            let sendResult;

            // Send test message based on webhook type
            switch (webhook.webhook_type) {
                case 'slack':
                    sendResult = await webhookService.sendSlackNotification(
                        webhook.webhook_url,
                        testMessage,
                        { alert: testAlert }
                    );
                    break;

                case 'discord':
                    sendResult = await webhookService.sendDiscordNotification(
                        webhook.webhook_url,
                        testMessage,
                        { alert: testAlert }
                    );
                    break;

                case 'teams':
                    sendResult = await webhookService.sendTeamsNotification(
                        webhook.webhook_url,
                        testMessage,
                        { alert: testAlert }
                    );
                    break;

                case 'telegram':
                    sendResult = await webhookService.sendTelegramNotification(
                        webhook.bot_token,
                        webhook.chat_id,
                        testMessage,
                        { alert: testAlert }
                    );
                    break;

                case 'custom':
                    const customPayload = {
                        event: 'webhook.test',
                        timestamp: new Date().toISOString(),
                        message: testMessage,
                        data: testAlert
                    };
                    sendResult = await webhookService.sendCustomWebhook(
                        webhook.webhook_url,
                        customPayload,
                        JSON.parse(webhook.custom_headers || '{}')
                    );
                    break;

                default:
                    return res.status(400).json({ error: 'Unknown webhook type' });
            }

            logger.info(`Webhook test by ${req.user.email}:`, { id, success: sendResult.success });

            if (sendResult.success) {
                res.json({
                    success: true,
                    message: 'Test message sent successfully',
                    status: sendResult.status
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Failed to send test message',
                    error: sendResult.error
                });
            }
        } catch (error) {
            logger.error('Test webhook error:', error);
            res.status(500).json({ error: 'Failed to test webhook' });
        }
    }
);

// =====================================================
// GET /api/webhooks/deliveries - Get webhook delivery logs
// =====================================================
router.get('/logs/deliveries', authenticateToken, async (req, res) => {
    try {
        const { limit = 50, offset = 0, status, webhook_type } = req.query;

        let query = 'SELECT * FROM webhook_deliveries WHERE 1=1';
        const params = [];
        let paramCount = 1;

        if (status) {
            query += ` AND status = $${paramCount}`;
            params.push(status);
            paramCount++;
        }

        if (webhook_type) {
            query += ` AND webhook_type = $${paramCount}`;
            params.push(webhook_type);
            paramCount++;
        }

        query += ` ORDER BY delivered_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await db.query(query, params);

        // Mask URLs in results
        const deliveries = result.rows.map(d => ({
            ...d,
            webhook_url: maskUrl(d.webhook_url),
            payload: undefined // Don't expose full payload
        }));

        res.json({ deliveries });
    } catch (error) {
        logger.error('Get webhook deliveries error:', error);
        res.status(500).json({ error: 'Failed to retrieve webhook deliveries' });
    }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function maskUrl(url) {
    if (!url) return null;

    try {
        const urlObj = new URL(url);
        const path = urlObj.pathname;
        const masked = path.split('/').map((segment, index) => {
            if (index > 2 && segment.length > 8) {
                return segment.substring(0, 4) + '****' + segment.substring(segment.length - 4);
            }
            return segment;
        }).join('/');

        return `${urlObj.protocol}//${urlObj.host}${masked}`;
    } catch (error) {
        // If URL parsing fails, just mask the entire thing
        if (url.length > 20) {
            return url.substring(0, 15) + '****' + url.substring(url.length - 5);
        }
        return '****';
    }
}

module.exports = router;
