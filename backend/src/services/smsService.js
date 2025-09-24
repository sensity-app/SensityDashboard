const twilio = require('twilio');
const logger = require('../utils/logger');

class SMSService {
    constructor() {
        this.client = null;
        this.fromNumber = null;
        this.initialize();
    }

    initialize() {
        try {
            const accountSid = process.env.TWILIO_ACCOUNT_SID;
            const authToken = process.env.TWILIO_AUTH_TOKEN;
            this.fromNumber = process.env.TWILIO_PHONE_NUMBER;

            if (accountSid && authToken && this.fromNumber) {
                this.client = twilio(accountSid, authToken);
                logger.info('SMS service initialized successfully');
            } else {
                logger.warn('SMS service not configured - Twilio settings missing');
            }
        } catch (error) {
            logger.error('SMS service initialization failed:', error);
            this.client = null;
        }
    }

    async sendSMS(to, message) {
        if (!this.client || !this.fromNumber) {
            logger.warn('SMS service not available - cannot send SMS');
            return false;
        }

        try {
            // Ensure phone number is in international format
            const formattedNumber = this.formatPhoneNumber(to);

            const result = await this.client.messages.create({
                body: message,
                from: this.fromNumber,
                to: formattedNumber
            });

            logger.info(`SMS sent successfully to ${to}:`, { sid: result.sid });
            return true;
        } catch (error) {
            logger.error(`Failed to send SMS to ${to}:`, error);
            return false;
        }
    }

    async sendAlertSMS(alert, recipients) {
        const message = this.formatAlertMessage(alert);

        const promises = recipients.map(async (recipient) => {
            if (typeof recipient === 'string') {
                return await this.sendSMS(recipient, message);
            } else if (recipient.phone) {
                return await this.sendSMS(recipient.phone, message);
            }
            return false;
        });

        const results = await Promise.allSettled(promises);
        const successful = results.filter(r => r.status === 'fulfilled' && r.value === true).length;

        logger.info(`SMS alert sent to ${successful}/${recipients.length} recipients`);
        return successful > 0;
    }

    async sendEscalationSMS(alert, escalationLevel, recipients) {
        const message = this.formatEscalationMessage(alert, escalationLevel);

        const promises = recipients.map(async (recipient) => {
            if (typeof recipient === 'string') {
                return await this.sendSMS(recipient, message);
            } else if (recipient.phone) {
                return await this.sendSMS(recipient.phone, message);
            }
            return false;
        });

        const results = await Promise.allSettled(promises);
        const successful = results.filter(r => r.status === 'fulfilled' && r.value === true).length;

        logger.info(`SMS escalation sent to ${successful}/${recipients.length} recipients`);
        return successful > 0;
    }

    async sendOTANotificationSMS(device, updateInfo, recipients) {
        const message = this.formatOTAMessage(device, updateInfo);

        const promises = recipients.map(async (recipient) => {
            if (typeof recipient === 'string') {
                return await this.sendSMS(recipient, message);
            } else if (recipient.phone) {
                return await this.sendSMS(recipient.phone, message);
            }
            return false;
        });

        const results = await Promise.allSettled(promises);
        const successful = results.filter(r => r.status === 'fulfilled' && r.value === true).length;

        logger.info(`OTA SMS notification sent to ${successful}/${recipients.length} recipients`);
        return successful > 0;
    }

    formatAlertMessage(alert) {
        const deviceName = alert.device_name || alert.device_id;
        const severity = alert.severity.toUpperCase();
        const timestamp = new Date(alert.triggered_at || alert.created_at).toLocaleString();

        let message = `🚨 IoT ALERT [${severity}]
Device: ${deviceName}
Type: ${alert.alert_type}
Message: ${alert.message}
Time: ${timestamp}`;

        if (alert.sensor_value !== undefined) {
            message += `
Value: ${alert.sensor_value}${alert.sensor_unit ? ' ' + alert.sensor_unit : ''}`;
        }

        if (alert.threshold_value !== undefined) {
            message += `
Threshold: ${alert.threshold_value}${alert.sensor_unit ? ' ' + alert.sensor_unit : ''}`;
        }

        message += `
View: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/alerts`;

        return message;
    }

    formatEscalationMessage(alert, escalationLevel) {
        const deviceName = alert.device_name || alert.device_id;

        return `🆘 ESCALATED ALERT - LEVEL ${escalationLevel}
Device: ${deviceName}
Type: ${alert.alert_type}
Severity: ${alert.severity.toUpperCase()}

⚠️ IMMEDIATE ACTION REQUIRED
This alert requires urgent attention!

Original Time: ${new Date(alert.triggered_at || alert.created_at).toLocaleString()}
Escalated: ${new Date().toLocaleString()}

Acknowledge: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/alerts/${alert.id}`;
    }

    formatOTAMessage(device, updateInfo) {
        const deviceName = device.name || device.id;
        const status = updateInfo.status.toUpperCase();

        let message = `🔄 OTA UPDATE ${status}
Device: ${deviceName}
Version: ${updateInfo.version}
Status: ${status}`;

        if (updateInfo.progress) {
            message += `
Progress: ${updateInfo.progress}%`;
        }

        if (updateInfo.error_message) {
            message += `
Error: ${updateInfo.error_message}`;
        }

        message += `
View: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/devices/${device.id}`;

        return message;
    }

    formatPhoneNumber(phoneNumber) {
        // Remove all non-digit characters
        let cleaned = phoneNumber.replace(/\D/g, '');

        // If it starts with country code, keep it
        if (cleaned.startsWith('420') || cleaned.startsWith('1')) {
            return '+' + cleaned;
        }

        // If it's a Czech number without country code, add +420
        if (cleaned.length === 9 && cleaned.startsWith('7')) {
            return '+420' + cleaned;
        }

        // If it's a US number without country code, add +1
        if (cleaned.length === 10) {
            return '+1' + cleaned;
        }

        // Default: assume international format if starts with +
        if (phoneNumber.startsWith('+')) {
            return phoneNumber;
        }

        // Default: add +1 for US numbers
        return '+1' + cleaned;
    }

    // Health check method
    async healthCheck() {
        if (!this.client || !this.fromNumber) {
            return { status: 'unavailable', message: 'SMS service not configured' };
        }

        try {
            // Try to get account info to verify connection
            await this.client.api.accounts.get();
            return { status: 'healthy', message: 'SMS service operational' };
        } catch (error) {
            return { status: 'unhealthy', message: error.message };
        }
    }

    // Get account balance (if available)
    async getBalance() {
        if (!this.client) {
            return null;
        }

        try {
            const balance = await this.client.balance.fetch();
            return {
                balance: balance.balance,
                currency: balance.currency
            };
        } catch (error) {
            logger.error('Failed to get SMS service balance:', error);
            return null;
        }
    }

    // Get message delivery status
    async getMessageStatus(messageSid) {
        if (!this.client) {
            return null;
        }

        try {
            const message = await this.client.messages(messageSid).fetch();
            return {
                status: message.status,
                errorCode: message.errorCode,
                errorMessage: message.errorMessage,
                dateCreated: message.dateCreated,
                dateSent: message.dateSent,
                dateUpdated: message.dateUpdated
            };
        } catch (error) {
            logger.error('Failed to get message status:', error);
            return null;
        }
    }
}

module.exports = new SMSService();