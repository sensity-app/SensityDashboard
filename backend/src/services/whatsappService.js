const axios = require('axios');
const logger = require('../utils/logger');
const db = require('../models/database');

/**
 * WhatsApp Notification Service
 *
 * Supports multiple providers:
 * 1. Twilio WhatsApp Business API
 * 2. WhatsApp Business Cloud API (Meta)
 * 3. Green API (unofficial but simple)
 *
 * Configure via environment variables
 */

class WhatsAppService {
    constructor() {
        this.enabled = process.env.WHATSAPP_ENABLED === 'true';
        this.provider = process.env.WHATSAPP_PROVIDER || 'twilio'; // twilio | meta | green-api

        // Twilio configuration
        this.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
        this.twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
        this.twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER; // e.g., whatsapp:+14155238886

        // Meta WhatsApp Business API configuration
        this.metaAccessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
        this.metaPhoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;

        // Green API configuration (unofficial but easy)
        this.greenApiUrl = process.env.GREEN_API_URL; // e.g., https://api.green-api.com
        this.greenApiInstance = process.env.GREEN_API_INSTANCE_ID;
        this.greenApiToken = process.env.GREEN_API_TOKEN;

        if (this.enabled) {
            logger.info(`WhatsApp notifications enabled using provider: ${this.provider}`);
        }
    }

    /**
     * Send WhatsApp message via Twilio
     */
    async sendViaTwilio(to, message) {
        try {
            const url = `https://api.twilio.com/2010-04-01/Accounts/${this.twilioAccountSid}/Messages.json`;

            const response = await axios.post(url, new URLSearchParams({
                From: this.twilioWhatsAppNumber,
                To: `whatsapp:${to}`,
                Body: message
            }), {
                auth: {
                    username: this.twilioAccountSid,
                    password: this.twilioAuthToken
                },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            logger.info(`WhatsApp message sent via Twilio to ${to}`);
            return { success: true, messageId: response.data.sid };
        } catch (error) {
            logger.error('Twilio WhatsApp error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Send WhatsApp message via Meta Cloud API
     */
    async sendViaMeta(to, message) {
        try {
            const url = `https://graph.facebook.com/v18.0/${this.metaPhoneNumberId}/messages`;

            const response = await axios.post(url, {
                messaging_product: 'whatsapp',
                to: to.replace('+', ''), // Remove + prefix
                type: 'text',
                text: { body: message }
            }, {
                headers: {
                    'Authorization': `Bearer ${this.metaAccessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            logger.info(`WhatsApp message sent via Meta to ${to}`);
            return { success: true, messageId: response.data.messages[0].id };
        } catch (error) {
            logger.error('Meta WhatsApp error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Send WhatsApp message via Green API (unofficial)
     */
    async sendViaGreenApi(to, message) {
        try {
            const url = `${this.greenApiUrl}/waInstance${this.greenApiInstance}/sendMessage/${this.greenApiToken}`;

            const response = await axios.post(url, {
                chatId: `${to.replace('+', '')}@c.us`,
                message: message
            });

            logger.info(`WhatsApp message sent via Green API to ${to}`);
            return { success: true, messageId: response.data.idMessage };
        } catch (error) {
            logger.error('Green API WhatsApp error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Send WhatsApp message (provider-agnostic)
     */
    async sendMessage(to, message) {
        if (!this.enabled) {
            logger.warn('WhatsApp notifications are disabled');
            return { success: false, error: 'WhatsApp notifications disabled' };
        }

        // Validate phone number format
        if (!to.startsWith('+')) {
            to = '+' + to;
        }

        try {
            switch (this.provider) {
                case 'twilio':
                    return await this.sendViaTwilio(to, message);
                case 'meta':
                    return await this.sendViaMeta(to, message);
                case 'green-api':
                    return await this.sendViaGreenApi(to, message);
                default:
                    throw new Error(`Unknown WhatsApp provider: ${this.provider}`);
            }
        } catch (error) {
            logger.error(`Failed to send WhatsApp to ${to}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send threshold alert via WhatsApp
     */
    async sendThresholdAlert(device, alert, recipients) {
        const message = this.formatThresholdAlertMessage(device, alert);

        const results = [];
        for (const recipient of recipients) {
            if (recipient.whatsapp_number) {
                const result = await this.sendMessage(recipient.whatsapp_number, message);
                results.push({
                    recipient: recipient.whatsapp_number,
                    ...result
                });
            }
        }

        return results;
    }

    /**
     * Send rule violation alert via WhatsApp
     */
    async sendRuleViolationAlert(device, alert, recipients) {
        const message = this.formatRuleViolationMessage(device, alert);

        const results = [];
        for (const recipient of recipients) {
            if (recipient.whatsapp_number) {
                const result = await this.sendMessage(recipient.whatsapp_number, message);
                results.push({
                    recipient: recipient.whatsapp_number,
                    ...result
                });
            }
        }

        return results;
    }

    /**
     * Format threshold alert message
     */
    formatThresholdAlertMessage(device, alert) {
        return `🚨 *Sensity Alert: Threshold Crossed*\n\n` +
               `*Device:* ${device.name}\n` +
               `*Location:* ${device.location_name || 'Unknown'}\n` +
               `*Sensor:* ${alert.sensor_name}\n` +
               `*Alert:* ${alert.message}\n` +
               `*Time:* ${new Date().toLocaleString()}\n\n` +
               `This is an automated alert from your Sensity monitoring system.`;
    }

    /**
     * Format rule violation message
     */
    formatRuleViolationMessage(device, alert) {
        return `⚠️ *Sensity Alert: Rule Violation*\n\n` +
               `*Device:* ${device.name}\n` +
               `*Location:* ${device.location_name || 'Unknown'}\n` +
               `*Rule:* ${alert.rule_name}\n` +
               `*Details:* ${alert.message}\n` +
               `*Severity:* ${alert.severity.toUpperCase()}\n` +
               `*Time:* ${new Date().toLocaleString()}\n\n` +
               `Please check your Sensity dashboard for more details.`;
    }

    /**
     * Send daily summary via WhatsApp
     */
    async sendDailySummary(userId) {
        try {
            // Get user WhatsApp number
            const userResult = await db.query(
                'SELECT whatsapp_number, email FROM users WHERE id = $1',
                [userId]
            );

            if (userResult.rows.length === 0 || !userResult.rows[0].whatsapp_number) {
                return { success: false, error: 'User has no WhatsApp number configured' };
            }

            const whatsappNumber = userResult.rows[0].whatsapp_number;

            // Get today's stats
            const statsResult = await db.query(`
                SELECT
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_alerts,
                    COUNT(CASE WHEN status = 'resolved' AND DATE(resolved_at) = CURRENT_DATE THEN 1 END) as resolved_today,
                    COUNT(CASE WHEN DATE(triggered_at) = CURRENT_DATE THEN 1 END) as new_today
                FROM alerts
            `);

            const stats = statsResult.rows[0];

            const message = `📊 *Sensity Daily Summary*\n\n` +
                          `*New Alerts Today:* ${stats.new_today}\n` +
                          `*Resolved Today:* ${stats.resolved_today}\n` +
                          `*Active Alerts:* ${stats.active_alerts}\n\n` +
                          `Have a great day! 🌟`;

            return await this.sendMessage(whatsappNumber, message);
        } catch (error) {
            logger.error('Failed to send daily summary:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test WhatsApp connection
     */
    async testConnection(phoneNumber) {
        const message = `✅ *Sensity WhatsApp Test*\n\n` +
                       `Your WhatsApp notifications are configured correctly!\n\n` +
                       `You will receive alerts on this number: ${phoneNumber}`;

        return await this.sendMessage(phoneNumber, message);
    }
}

module.exports = new WhatsAppService();
