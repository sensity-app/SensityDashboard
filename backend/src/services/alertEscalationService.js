const db = require('../models/database');
const emailService = require('./emailService');
const smsService = require('./smsService');
const telegramService = require('./telegramService');
const logger = require('../utils/logger');
const { isInSilentMode } = require('../routes/silentMode');

class AlertEscalationService {
    constructor() {
        this.escalationInProgress = new Set();
    }

    async processEscalations() {
        try {
            // Get alerts that need escalation
            const alertsToEscalate = await this.getAlertsForEscalation();

            for (const alert of alertsToEscalate) {
                if (!this.escalationInProgress.has(alert.id)) {
                    this.escalationInProgress.add(alert.id);
                    await this.escalateAlert(alert);
                    this.escalationInProgress.delete(alert.id);
                }
            }
        } catch (error) {
            logger.error('Error processing escalations:', error);
        }
    }

    async getAlertsForEscalation() {
        const result = await db.query(`
            SELECT a.*,
                   d.name as device_name,
                   d.location_id,
                   l.name as location_name,
                   er.escalation_delay_minutes,
                   er.max_escalation_level,
                   er.notification_methods,
                   er.recipients
            FROM alerts a
            INNER JOIN devices d ON a.device_id = d.id
            LEFT JOIN locations l ON d.location_id = l.id
            INNER JOIN escalation_rules er ON (
                (er.severity = a.severity OR er.severity = 'all') AND
                (er.location_id = d.location_id OR er.location_id IS NULL)
            )
            WHERE a.status = 'active'
                AND er.enabled = true
                AND (
                    a.last_escalated IS NULL OR
                    a.last_escalated < NOW() - INTERVAL '1 minute' * er.escalation_delay_minutes
                )
                AND COALESCE(a.escalation_level, 0) < er.max_escalation_level
            ORDER BY a.severity DESC, a.created_at ASC
        `);

        return result.rows;
    }

    async escalateAlert(alert) {
        try {
            // Check if device is in silent mode
            const inSilentMode = await isInSilentMode(alert.device_id, alert.alert_type, alert.severity);

            if (inSilentMode) {
                logger.info(`Alert ${alert.id} escalation skipped - device in silent mode`);

                // Update last_escalated to prevent repeated checks for a while
                await db.query(`
                    UPDATE alerts
                    SET last_escalated = NOW()
                    WHERE id = $1
                `, [alert.id]);

                return;
            }

            const nextLevel = (alert.escalation_level || 0) + 1;

            // Update alert escalation level
            await db.query(`
                UPDATE alerts
                SET escalation_level = $1, last_escalated = NOW()
                WHERE id = $2
            `, [nextLevel, alert.id]);

            // Send notifications based on escalation rules
            await this.sendEscalationNotifications(alert, nextLevel);

            logger.info(`Alert ${alert.id} escalated to level ${nextLevel}`);

        } catch (error) {
            logger.error(`Error escalating alert ${alert.id}:`, error);
        }
    }

    async sendEscalationNotifications(alert, escalationLevel) {
        const notificationMethods = alert.notification_methods || ['email'];
        const recipients = alert.recipients || [];

        // Add escalation context to alert data
        const escalatedAlert = {
            ...alert,
            escalation_level: escalationLevel,
            escalation_message: this.getEscalationMessage(escalationLevel)
        };

        // Send notifications via each configured method
        for (const method of notificationMethods) {
            try {
                switch (method) {
                    case 'email':
                        await this.sendEscalationEmail(escalatedAlert, recipients);
                        break;
                    case 'sms':
                        await this.sendEscalationSMS(escalatedAlert, recipients);
                        break;
                    case 'telegram':
                        await this.sendEscalationTelegram(escalatedAlert, recipients);
                        break;
                    case 'push':
                        await this.sendEscalationPush(escalatedAlert, recipients);
                        break;
                    case 'webhook':
                        await this.sendEscalationWebhook(escalatedAlert, recipients);
                        break;
                }
            } catch (error) {
                logger.error(`Failed to send ${method} escalation for alert ${alert.id}:`, error);
            }
        }
    }

    getEscalationMessage(level) {
        const messages = {
            1: 'Alert requires immediate attention',
            2: 'URGENT: Alert has been escalated - requires immediate response',
            3: 'CRITICAL: Alert escalation level 3 - emergency response required'
        };
        return messages[level] || `Alert escalated to level ${level}`;
    }

    async sendEscalationEmail(alert, recipients) {
        const subject = `[ESCALATION Level ${alert.escalation_level}] ${alert.alert_type} - ${alert.device_name}`;

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <div style="background-color: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 24px;">🚨 ALERT ESCALATION</h1>
                    <p style="margin: 5px 0 0 0; font-size: 16px;">Level ${alert.escalation_level} Escalation</p>
                </div>

                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 0 0 8px 8px;">
                    <p style="color: #dc2626; font-weight: bold; font-size: 18px; margin-top: 0;">
                        ${alert.escalation_message}
                    </p>

                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; width: 30%;">Alert ID:</td>
                            <td style="padding: 8px 0;">#${alert.id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold;">Device:</td>
                            <td style="padding: 8px 0;">${alert.device_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold;">Location:</td>
                            <td style="padding: 8px 0;">${alert.location_name || 'Unknown'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold;">Severity:</td>
                            <td style="padding: 8px 0; color: #dc2626; font-weight: bold;">${alert.severity.toUpperCase()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold;">Alert Type:</td>
                            <td style="padding: 8px 0;">${alert.alert_type}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold;">Message:</td>
                            <td style="padding: 8px 0;">${alert.message}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold;">Created:</td>
                            <td style="padding: 8px 0;">${new Date(alert.created_at).toLocaleString()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold;">Duration:</td>
                            <td style="padding: 8px 0;">${this.getAlertDuration(alert.created_at)}</td>
                        </tr>
                    </table>

                    <div style="background-color: #fff; padding: 15px; border-radius: 6px; border-left: 4px solid #dc2626;">
                        <p style="margin: 0; color: #374151;">
                            This alert has been automatically escalated to level ${alert.escalation_level}
                            due to lack of acknowledgment. Please take immediate action to resolve this issue.
                        </p>
                    </div>

                    <p style="margin-top: 20px; color: #6b7280;">
                        Please log into the ESP8266 Platform immediately to acknowledge and resolve this alert.
                    </p>
                </div>
            </div>
        `;

        await emailService.sendEscalationEmail({
            recipients: recipients.filter(r => r.type === 'email').map(r => r.address),
            subject,
            html
        });
    }

    async sendEscalationSMS(alert, recipients) {
        const message = `[ESCALATION L${alert.escalation_level}] ${alert.alert_type} at ${alert.device_name} (${alert.location_name}). ${alert.escalation_message}. Alert ID: ${alert.id}`;

        const phoneNumbers = recipients.filter(r => r.type === 'sms').map(r => r.address);

        for (const phone of phoneNumbers) {
            await smsService.sendSMS(phone, message);
        }
    }

    async sendEscalationTelegram(alert, recipients) {
        const escalationEmoji = {
            1: '⚠️',
            2: '🚨',
            3: '🆘'
        };

        const emoji = escalationEmoji[alert.escalation_level] || '🔴';

        const message = `
${emoji} <b>ALERT ESCALATION - Level ${alert.escalation_level}</b>

<b>${alert.escalation_message}</b>

<b>Alert Details:</b>
• Alert ID: #${alert.id}
• Device: ${alert.device_name}
• Location: ${alert.location_name || 'Unknown'}
• Type: ${alert.alert_type}
• Severity: ${alert.severity.toUpperCase()}

<b>Message:</b>
${alert.message}

<b>Alert Duration:</b> ${this.getAlertDuration(alert.created_at)}
<b>Created:</b> ${new Date(alert.created_at).toLocaleString()}

⏰ <i>This alert has been escalated due to lack of acknowledgment. Please take immediate action!</i>
        `.trim();

        // Get all Telegram recipients
        const chatIds = recipients.filter(r => r.type === 'telegram').map(r => r.address);

        for (const chatId of chatIds) {
            const success = await telegramService.sendMessage(chatId, message);

            // Log notification attempt
            await db.query(`
                INSERT INTO telegram_notifications (user_id, chat_id, message_text, notification_type, alert_id, device_id, success)
                VALUES (
                    (SELECT id FROM users WHERE telegram_chat_id = $1 LIMIT 1),
                    $1, $2, 'escalation', $3, $4, $5
                )
            `, [chatId, message, alert.id, alert.device_id, success]);
        }
    }

    async sendEscalationPush(alert, recipients) {
        // Implementation for push notifications
        logger.info(`Sending push notification escalation for alert ${alert.id}`);
    }

    async sendEscalationWebhook(alert, recipients) {
        // Implementation for webhook notifications
        logger.info(`Sending webhook escalation for alert ${alert.id}`);
    }

    getAlertDuration(createdAt) {
        const now = new Date();
        const created = new Date(createdAt);
        const diffMs = now - created;
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 60) {
            return `${diffMins} minutes`;
        } else if (diffMins < 1440) {
            return `${Math.floor(diffMins / 60)} hours ${diffMins % 60} minutes`;
        } else {
            return `${Math.floor(diffMins / 1440)} days ${Math.floor((diffMins % 1440) / 60)} hours`;
        }
    }

    // Create default escalation rules
    async createDefaultEscalationRules() {
        const defaultRules = [
            {
                name: 'Critical Alert Escalation',
                severity: 'critical',
                escalation_delay_minutes: 5,
                max_escalation_level: 3,
                notification_methods: ['email', 'sms'],
                recipients: [
                    { type: 'email', address: process.env.ADMIN_EMAIL },
                    { type: 'sms', address: process.env.ADMIN_PHONE }
                ]
            },
            {
                name: 'High Priority Escalation',
                severity: 'high',
                escalation_delay_minutes: 15,
                max_escalation_level: 2,
                notification_methods: ['email'],
                recipients: [
                    { type: 'email', address: process.env.ADMIN_EMAIL }
                ]
            },
            {
                name: 'Medium Priority Escalation',
                severity: 'medium',
                escalation_delay_minutes: 60,
                max_escalation_level: 1,
                notification_methods: ['email'],
                recipients: [
                    { type: 'email', address: process.env.ADMIN_EMAIL }
                ]
            }
        ];

        for (const rule of defaultRules) {
            await db.query(`
                INSERT INTO escalation_rules (name, severity, location_id, escalation_delay_minutes, max_escalation_level, notification_methods, recipients, enabled)
                VALUES ($1, $2, NULL, $3, $4, $5, $6, true)
                ON CONFLICT (name) DO NOTHING
            `, [
                rule.name,
                rule.severity,
                rule.escalation_delay_minutes,
                rule.max_escalation_level,
                JSON.stringify(rule.notification_methods),
                JSON.stringify(rule.recipients)
            ]);
        }
    }
}

module.exports = AlertEscalationService;
