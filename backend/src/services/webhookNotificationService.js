// =====================================================
// Sensity Platform - Webhook Notification Service
// Handles Slack, Discord, MS Teams, and custom webhooks
// =====================================================

const axios = require('axios');
const db = require('../models/database');
const logger = require('../utils/logger');

class WebhookNotificationService {
    constructor() {
        this.retryAttempts = 3;
        this.retryDelay = 1000; // 1 second
    }

    // =====================================================
    // SLACK NOTIFICATIONS
    // =====================================================

    async sendSlackNotification(webhookUrl, message, options = {}) {
        const payload = {
            text: message,
            username: options.username || 'Sensity Alert Bot',
            icon_emoji: options.icon || ':robot_face:',
            attachments: options.attachments || []
        };

        // Add rich formatting if details provided
        if (options.alert) {
            payload.attachments = [{
                color: this.getSeverityColor(options.alert.severity),
                title: options.alert.title || 'Device Alert',
                text: options.alert.message,
                fields: [
                    {
                        title: 'Device',
                        value: options.alert.device_name || 'Unknown',
                        short: true
                    },
                    {
                        title: 'Severity',
                        value: options.alert.severity || 'info',
                        short: true
                    },
                    {
                        title: 'Time',
                        value: new Date(options.alert.created_at).toLocaleString(),
                        short: true
                    },
                    {
                        title: 'Status',
                        value: options.alert.status || 'active',
                        short: true
                    }
                ],
                footer: 'Sensity Platform',
                footer_icon: 'https://sensity.app/icon.png',
                ts: Math.floor(Date.now() / 1000)
            }];

            // Add action buttons
            if (options.alert.id) {
                payload.attachments[0].actions = [
                    {
                        type: 'button',
                        text: 'View Alert',
                        url: `${process.env.FRONTEND_URL}/alerts/${options.alert.id}`
                    },
                    {
                        type: 'button',
                        text: 'View Device',
                        url: `${process.env.FRONTEND_URL}/devices/${options.alert.device_id}`,
                        style: 'primary'
                    }
                ];
            }
        }

        return this.sendWebhook(webhookUrl, payload, 'slack');
    }

    // =====================================================
    // DISCORD NOTIFICATIONS
    // =====================================================

    async sendDiscordNotification(webhookUrl, message, options = {}) {
        const payload = {
            content: message,
            username: options.username || 'Sensity Alert Bot',
            avatar_url: options.avatar || 'https://sensity.app/logo.png',
            embeds: options.embeds || []
        };

        // Add rich embed if details provided
        if (options.alert) {
            payload.embeds = [{
                title: options.alert.title || 'Device Alert',
                description: options.alert.message,
                color: parseInt(this.getSeverityColorHex(options.alert.severity), 16),
                fields: [
                    {
                        name: 'Device',
                        value: options.alert.device_name || 'Unknown',
                        inline: true
                    },
                    {
                        name: 'Severity',
                        value: options.alert.severity || 'info',
                        inline: true
                    },
                    {
                        name: 'Status',
                        value: options.alert.status || 'active',
                        inline: true
                    }
                ],
                timestamp: options.alert.created_at || new Date().toISOString(),
                footer: {
                    text: 'Sensity Platform',
                    icon_url: 'https://sensity.app/icon.png'
                }
            }];
        }

        return this.sendWebhook(webhookUrl, payload, 'discord');
    }

    // =====================================================
    // MICROSOFT TEAMS NOTIFICATIONS
    // =====================================================

    async sendTeamsNotification(webhookUrl, message, options = {}) {
        const payload = {
            '@type': 'MessageCard',
            '@context': 'https://schema.org/extensions',
            summary: options.summary || 'Sensity Alert',
            themeColor: this.getSeverityColorHex(options.alert?.severity),
            title: options.alert?.title || 'Device Alert',
            text: message,
            sections: []
        };

        if (options.alert) {
            payload.sections = [{
                activityTitle: options.alert.device_name || 'Unknown Device',
                activitySubtitle: new Date(options.alert.created_at).toLocaleString(),
                activityImage: 'https://sensity.app/icon.png',
                facts: [
                    {
                        name: 'Device:',
                        value: options.alert.device_name || 'Unknown'
                    },
                    {
                        name: 'Severity:',
                        value: options.alert.severity || 'info'
                    },
                    {
                        name: 'Status:',
                        value: options.alert.status || 'active'
                    }
                ]
            }];

            // Add action buttons
            payload.potentialAction = [
                {
                    '@type': 'OpenUri',
                    name: 'View Alert',
                    targets: [{
                        os: 'default',
                        uri: `${process.env.FRONTEND_URL}/alerts/${options.alert.id}`
                    }]
                },
                {
                    '@type': 'OpenUri',
                    name: 'View Device',
                    targets: [{
                        os: 'default',
                        uri: `${process.env.FRONTEND_URL}/devices/${options.alert.device_id}`
                    }]
                }
            ];
        }

        return this.sendWebhook(webhookUrl, payload, 'teams');
    }

    // =====================================================
    // TELEGRAM NOTIFICATIONS (via Bot API)
    // =====================================================

    async sendTelegramNotification(botToken, chatId, message, options = {}) {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

        let text = message;

        // Add rich formatting if details provided
        if (options.alert) {
            text = `
🚨 *${options.alert.title || 'Device Alert'}*

📱 *Device:* ${options.alert.device_name || 'Unknown'}
⚠️ *Severity:* ${options.alert.severity || 'info'}
📊 *Status:* ${options.alert.status || 'active'}

${options.alert.message}

🕐 ${new Date(options.alert.created_at).toLocaleString()}
            `.trim();
        }

        const payload = {
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        };

        // Add inline keyboard with buttons
        if (options.alert?.id) {
            payload.reply_markup = {
                inline_keyboard: [[
                    {
                        text: '🔍 View Alert',
                        url: `${process.env.FRONTEND_URL}/alerts/${options.alert.id}`
                    },
                    {
                        text: '📱 View Device',
                        url: `${process.env.FRONTEND_URL}/devices/${options.alert.device_id}`
                    }
                ]]
            };
        }

        return this.sendWebhook(url, payload, 'telegram');
    }

    // =====================================================
    // CUSTOM WEBHOOK
    // =====================================================

    async sendCustomWebhook(webhookUrl, payload, headers = {}) {
        return this.sendWebhook(webhookUrl, payload, 'custom', headers);
    }

    // =====================================================
    // GENERIC WEBHOOK SENDER WITH RETRY
    // =====================================================

    async sendWebhook(url, payload, type = 'custom', customHeaders = {}) {
        let lastError;

        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const response = await axios.post(url, payload, {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Sensity-Platform/1.0',
                        ...customHeaders
                    },
                    timeout: 10000 // 10 second timeout
                });

                logger.info(`Webhook sent successfully (${type}):`, {
                    url: url.substring(0, 50) + '...',
                    status: response.status,
                    attempt
                });

                // Log to database
                await this.logWebhookDelivery(url, type, payload, 'success', response.status);

                return {
                    success: true,
                    status: response.status,
                    response: response.data
                };
            } catch (error) {
                lastError = error;
                logger.warn(`Webhook delivery failed (${type}), attempt ${attempt}/${this.retryAttempts}:`, {
                    url: url.substring(0, 50) + '...',
                    error: error.message,
                    status: error.response?.status
                });

                // Wait before retry (exponential backoff)
                if (attempt < this.retryAttempts) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
                }
            }
        }

        // All retries failed
        logger.error(`Webhook delivery failed after ${this.retryAttempts} attempts (${type}):`, {
            url: url.substring(0, 50) + '...',
            error: lastError.message
        });

        // Log failure to database
        await this.logWebhookDelivery(
            url,
            type,
            payload,
            'failed',
            lastError.response?.status,
            lastError.message
        );

        return {
            success: false,
            error: lastError.message,
            status: lastError.response?.status
        };
    }

    // =====================================================
    // DATABASE LOGGING
    // =====================================================

    async logWebhookDelivery(url, type, payload, status, httpStatus, errorMessage = null) {
        try {
            await db.query(`
                INSERT INTO webhook_deliveries (
                    webhook_url,
                    webhook_type,
                    payload,
                    status,
                    http_status,
                    error_message,
                    delivered_at
                ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
            `, [
                url.substring(0, 255), // Truncate URL for storage
                type,
                JSON.stringify(payload),
                status,
                httpStatus,
                errorMessage
            ]);
        } catch (error) {
            logger.error('Failed to log webhook delivery:', error);
        }
    }

    // =====================================================
    // SEND ALERT TO ALL CONFIGURED WEBHOOKS
    // =====================================================

    async sendAlertToWebhooks(alert) {
        try {
            // Get all active webhook configurations
            const result = await db.query(`
                SELECT * FROM webhook_configurations
                WHERE is_active = true
                AND (
                    event_types @> '["alert.created"]'::jsonb
                    OR event_types @> '["all"]'::jsonb
                )
            `);

            if (result.rows.length === 0) {
                logger.info('No active webhooks configured for alerts');
                return;
            }

            const message = `Alert: ${alert.rule_name} triggered for device ${alert.device_name}`;

            const promises = result.rows.map(async (config) => {
                try {
                    switch (config.webhook_type) {
                        case 'slack':
                            return await this.sendSlackNotification(config.webhook_url, message, { alert });

                        case 'discord':
                            return await this.sendDiscordNotification(config.webhook_url, message, { alert });

                        case 'teams':
                            return await this.sendTeamsNotification(config.webhook_url, message, { alert });

                        case 'telegram':
                            return await this.sendTelegramNotification(
                                config.bot_token,
                                config.chat_id,
                                message,
                                { alert }
                            );

                        case 'custom':
                            const customPayload = {
                                event: 'alert.created',
                                timestamp: new Date().toISOString(),
                                data: alert
                            };
                            return await this.sendCustomWebhook(
                                config.webhook_url,
                                customPayload,
                                JSON.parse(config.custom_headers || '{}')
                            );

                        default:
                            logger.warn(`Unknown webhook type: ${config.webhook_type}`);
                    }
                } catch (error) {
                    logger.error(`Failed to send webhook (${config.webhook_type}):`, error);
                }
            });

            await Promise.allSettled(promises);
            logger.info(`Alert sent to ${result.rows.length} webhooks`);
        } catch (error) {
            logger.error('Failed to send alert to webhooks:', error);
        }
    }

    // =====================================================
    // HELPER FUNCTIONS
    // =====================================================

    getSeverityColor(severity) {
        const colors = {
            'critical': 'danger',
            'error': 'danger',
            'warning': 'warning',
            'info': 'good',
            'low': 'good'
        };
        return colors[severity] || 'good';
    }

    getSeverityColorHex(severity) {
        const colors = {
            'critical': 'DC3545', // Red
            'error': 'DC3545',     // Red
            'warning': 'FFC107',   // Yellow
            'info': '17A2B8',      // Blue
            'low': '28A745'        // Green
        };
        return colors[severity] || '6C757D'; // Gray
    }
}

module.exports = new WebhookNotificationService();
