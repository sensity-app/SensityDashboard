const axios = require('axios');
const logger = require('../utils/logger');

class TelegramService {
    constructor() {
        this.botToken = null;
        this.baseUrl = null;
        this.initialize();
    }

    initialize() {
        try {
            this.botToken = process.env.TELEGRAM_BOT_TOKEN;

            if (this.botToken) {
                this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
                logger.info('Telegram service initialized successfully');
            } else {
                logger.warn('Telegram service not configured - TELEGRAM_BOT_TOKEN missing');
            }
        } catch (error) {
            logger.error('Telegram service initialization failed:', error);
            this.botToken = null;
        }
    }

    /**
     * Send a message to a Telegram chat
     * @param {string|number} chatId - Telegram chat ID or username
     * @param {string} message - Message text
     * @param {object} options - Additional options (parse_mode, disable_notification, etc.)
     * @returns {Promise<boolean>} - Success status
     */
    async sendMessage(chatId, message, options = {}) {
        if (!this.botToken || !this.baseUrl) {
            logger.warn('Telegram service not available - cannot send message');
            return false;
        }

        try {
            const payload = {
                chat_id: chatId,
                text: message,
                parse_mode: options.parse_mode || 'HTML',
                disable_notification: options.silent || false,
                disable_web_page_preview: options.disable_preview !== false
            };

            const response = await axios.post(`${this.baseUrl}/sendMessage`, payload);

            if (response.data.ok) {
                logger.info(`Telegram message sent successfully to chat ${chatId}`);
                return true;
            } else {
                logger.error('Telegram API returned error:', response.data);
                return false;
            }
        } catch (error) {
            logger.error(`Failed to send Telegram message to ${chatId}:`, error.message);
            return false;
        }
    }

    /**
     * Send alert notification via Telegram
     * @param {string|number} chatId - Telegram chat ID
     * @param {object} alert - Alert object
     * @param {object} device - Device object
     * @returns {Promise<boolean>}
     */
    async sendAlertNotification(chatId, alert, device) {
        const severityEmoji = {
            low: '🟢',
            medium: '🟡',
            high: '🟠',
            critical: '🔴'
        };

        const emoji = severityEmoji[alert.severity] || '⚠️';

        const message = `
${emoji} <b>Alert: ${alert.alert_type.toUpperCase()}</b>

<b>Device:</b> ${device.name}
<b>Location:</b> ${device.location_name || 'Unknown'}
<b>Severity:</b> ${alert.severity.toUpperCase()}
<b>Time:</b> ${new Date(alert.triggered_at).toLocaleString()}

<b>Message:</b>
${alert.message || 'No additional details'}

<i>Alert ID: ${alert.id}</i>
        `.trim();

        return this.sendMessage(chatId, message);
    }

    /**
     * Send device offline notification
     * @param {string|number} chatId - Telegram chat ID
     * @param {object} device - Device object
     * @returns {Promise<boolean>}
     */
    async sendDeviceOfflineNotification(chatId, device) {
        const message = `
⚠️ <b>Device Offline</b>

<b>Device:</b> ${device.name}
<b>Location:</b> ${device.location_name || 'Unknown'}
<b>Last seen:</b> ${new Date(device.last_heartbeat).toLocaleString()}

The device has not sent a heartbeat for over 1 hour.
        `.trim();

        return this.sendMessage(chatId, message);
    }

    /**
     * Send test message
     * @param {string|number} chatId - Telegram chat ID
     * @returns {Promise<boolean>}
     */
    async sendTestMessage(chatId) {
        const message = `
✅ <b>Telegram Integration Test</b>

Your ESP8266 IoT Monitoring Platform is successfully connected to Telegram!

You will receive notifications for:
• Device alerts and alarms
• Device offline status
• Critical system events

<i>Test sent at ${new Date().toLocaleString()}</i>
        `.trim();

        return this.sendMessage(chatId, message);
    }

    /**
     * Get bot information
     * @returns {Promise<object|null>}
     */
    async getBotInfo() {
        if (!this.botToken || !this.baseUrl) {
            return null;
        }

        try {
            const response = await axios.get(`${this.baseUrl}/getMe`);
            if (response.data.ok) {
                return response.data.result;
            }
            return null;
        } catch (error) {
            logger.error('Failed to get Telegram bot info:', error.message);
            return null;
        }
    }

    /**
     * Validate chat ID by attempting to send a message
     * @param {string|number} chatId - Telegram chat ID
     * @returns {Promise<boolean>}
     */
    async validateChatId(chatId) {
        if (!this.botToken || !this.baseUrl) {
            return false;
        }

        try {
            const response = await axios.post(`${this.baseUrl}/sendChatAction`, {
                chat_id: chatId,
                action: 'typing'
            });

            return response.data.ok;
        } catch (error) {
            logger.error(`Invalid Telegram chat ID ${chatId}:`, error.message);
            return false;
        }
    }

    /**
     * Format device status message
     * @param {object} device - Device object
     * @param {object} status - Status details
     * @returns {string}
     */
    formatDeviceStatus(device, status) {
        const statusEmoji = status.is_online ? '🟢' : '🔴';

        return `
${statusEmoji} <b>Device Status: ${device.name}</b>

<b>Status:</b> ${status.is_online ? 'Online' : 'Offline'}
<b>Location:</b> ${device.location_name || 'Unknown'}
<b>Firmware:</b> ${device.firmware_version || 'Unknown'}
<b>IP Address:</b> ${device.ip_address || 'Unknown'}
<b>Last Heartbeat:</b> ${new Date(device.last_heartbeat).toLocaleString()}
<b>Uptime:</b> ${this.formatUptime(device.uptime_seconds)}

<i>Updated: ${new Date().toLocaleString()}</i>
        `.trim();
    }

    /**
     * Format uptime in human-readable format
     * @param {number} seconds - Uptime in seconds
     * @returns {string}
     */
    formatUptime(seconds) {
        if (!seconds) return 'Unknown';

        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);

        return parts.join(' ') || '< 1m';
    }
}

// Export singleton instance
module.exports = new TelegramService();
