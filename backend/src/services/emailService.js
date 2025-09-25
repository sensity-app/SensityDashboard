const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

class EmailService {
    constructor() {
        this.transporter = null;
        this.initialize();
    }

    async initialize() {
        try {
            // Create transporter based on environment configuration
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASSWORD
                },
                tls: {
                    rejectUnauthorized: process.env.NODE_ENV === 'production'
                }
            });

            // Verify connection
            if (process.env.SMTP_HOST) {
                await this.transporter.verify();
                logger.info('Email service initialized successfully');
            } else {
                logger.warn('Email service not configured - SMTP settings missing');
            }
        } catch (error) {
            logger.error('Email service initialization failed:', error);
            this.transporter = null;
        }
    }

    async sendEmail(to, subject, html, text = null) {
        if (!this.transporter) {
            logger.warn('Email service not available - cannot send email');
            return false;
        }

        try {
            const mailOptions = {
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: Array.isArray(to) ? to.join(', ') : to,
                subject,
                html,
                text: text || this.htmlToText(html)
            };

            const result = await this.transporter.sendMail(mailOptions);
            logger.info(`Email sent successfully to ${to}:`, { messageId: result.messageId });
            return true;
        } catch (error) {
            logger.error(`Failed to send email to ${to}:`, error);
            return false;
        }
    }

    async sendAlertEmail(alert, recipients) {
        const subject = `[${alert.severity.toUpperCase()}] Alert: ${alert.alert_type}`;

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: ${this.getSeverityColor(alert.severity)}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 24px;">IoT Alert Notification</h1>
                    <p style="margin: 5px 0 0; opacity: 0.9;">Severity: ${alert.severity.toUpperCase()}</p>
                </div>

                <div style="background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6;">
                    <h2 style="color: #495057; margin-top: 0;">Alert Details</h2>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Device:</td>
                            <td style="padding: 8px 0;">${alert.device_name || alert.device_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Alert Type:</td>
                            <td style="padding: 8px 0;">${alert.alert_type}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Message:</td>
                            <td style="padding: 8px 0;">${alert.message}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Triggered At:</td>
                            <td style="padding: 8px 0;">${new Date(alert.triggered_at || alert.created_at).toLocaleString()}</td>
                        </tr>
                        ${alert.sensor_value !== undefined ? `
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Sensor Value:</td>
                            <td style="padding: 8px 0;">${alert.sensor_value} ${alert.sensor_unit || ''}</td>
                        </tr>
                        ` : ''}
                        ${alert.threshold_value !== undefined ? `
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Threshold:</td>
                            <td style="padding: 8px 0;">${alert.threshold_value} ${alert.sensor_unit || ''}</td>
                        </tr>
                        ` : ''}
                    </table>
                </div>

                <div style="background: white; padding: 20px; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px;">
                    <p style="color: #6c757d; margin: 0; font-size: 14px;">
                        This is an automated alert from your IoT monitoring system.
                        <br>
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/alerts" style="color: #007bff;">View in Dashboard</a>
                    </p>
                </div>
            </div>
        `;

        return await this.sendEmail(recipients, subject, html);
    }

    async sendEscalationEmail(alert, escalationLevel, recipients) {
        const subject = `[ESCALATION LEVEL ${escalationLevel}] Alert: ${alert.alert_type}`;

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #dc3545; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 24px;">🚨 ESCALATED ALERT</h1>
                    <p style="margin: 5px 0 0; opacity: 0.9;">Escalation Level: ${escalationLevel}</p>
                </div>

                <div style="background: #fff3cd; padding: 20px; border: 1px solid #ffeaa7; border-top: none;">
                    <h2 style="color: #856404; margin-top: 0;">⚠️ This alert has been escalated and requires immediate attention!</h2>
                    <p style="color: #856404;">The alert was not acknowledged within the specified time frame and has been escalated to level ${escalationLevel}.</p>
                </div>

                <div style="background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; border-top: none;">
                    <h3 style="color: #495057; margin-top: 0;">Alert Details</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Device:</td>
                            <td style="padding: 8px 0;">${alert.device_name || alert.device_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Alert Type:</td>
                            <td style="padding: 8px 0;">${alert.alert_type}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Severity:</td>
                            <td style="padding: 8px 0;">${alert.severity.toUpperCase()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Message:</td>
                            <td style="padding: 8px 0;">${alert.message}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Originally Triggered:</td>
                            <td style="padding: 8px 0;">${new Date(alert.triggered_at || alert.created_at).toLocaleString()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Escalated At:</td>
                            <td style="padding: 8px 0;">${new Date().toLocaleString()}</td>
                        </tr>
                    </table>
                </div>

                <div style="background: white; padding: 20px; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px;">
                    <div style="text-align: center; margin-bottom: 15px;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/alerts/${alert.id}"
                           style="background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
                            ACKNOWLEDGE ALERT NOW
                        </a>
                    </div>
                    <p style="color: #6c757d; margin: 0; font-size: 14px; text-align: center;">
                        This is an escalated alert requiring immediate attention.
                    </p>
                </div>
            </div>
        `;

        return await this.sendEmail(recipients, subject, html);
    }

    async sendOTANotification(device, updateInfo, recipients) {
        const subject = `OTA Update ${updateInfo.status}: ${device.name || device.id}`;

        let statusColor = '#17a2b8'; // info blue
        if (updateInfo.status === 'completed') statusColor = '#28a745'; // success green
        if (updateInfo.status === 'failed') statusColor = '#dc3545'; // danger red

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: ${statusColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 24px;">OTA Update Notification</h1>
                    <p style="margin: 5px 0 0; opacity: 0.9;">Status: ${updateInfo.status.toUpperCase()}</p>
                </div>

                <div style="background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; border-radius: 0 0 8px 8px;">
                    <h2 style="color: #495057; margin-top: 0;">Update Details</h2>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Device:</td>
                            <td style="padding: 8px 0;">${device.name || device.id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Current Version:</td>
                            <td style="padding: 8px 0;">${device.firmware_version || 'Unknown'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Target Version:</td>
                            <td style="padding: 8px 0;">${updateInfo.version}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Status:</td>
                            <td style="padding: 8px 0;">${updateInfo.status}</td>
                        </tr>
                        ${updateInfo.progress ? `
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Progress:</td>
                            <td style="padding: 8px 0;">${updateInfo.progress}%</td>
                        </tr>
                        ` : ''}
                        ${updateInfo.error_message ? `
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">Error:</td>
                            <td style="padding: 8px 0; color: #dc3545;">${updateInfo.error_message}</td>
                        </tr>
                        ` : ''}
                    </table>

                    <p style="color: #6c757d; margin: 15px 0 0; font-size: 14px;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/devices/${device.id}" style="color: #007bff;">View Device Details</a>
                    </p>
                </div>
            </div>
        `;

        return await this.sendEmail(recipients, subject, html);
    }

    getSeverityColor(severity) {
        switch (severity.toLowerCase()) {
            case 'critical': return '#dc3545';
            case 'high': return '#fd7e14';
            case 'medium': return '#ffc107';
            case 'low': return '#17a2b8';
            default: return '#6c757d';
        }
    }

    htmlToText(html) {
        return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    async sendInvitationEmail(email, fullName, inviteUrl, invitedBy, role) {
        const subject = 'You\'re invited to join our IoT Monitoring Platform';

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #007bff; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 24px;">Welcome to IoT Monitoring!</h1>
                    <p style="margin: 5px 0 0; opacity: 0.9;">You've been invited to join our platform</p>
                </div>

                <div style="background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6;">
                    <h2 style="color: #495057; margin-top: 0;">Hello ${fullName},</h2>
                    <p style="color: #6c757d; line-height: 1.6;">
                        You have been invited by <strong>${invitedBy}</strong> to join our IoT Monitoring Platform
                        with the role of <strong>${role}</strong>.
                    </p>
                    <p style="color: #6c757d; line-height: 1.6;">
                        Our platform allows you to monitor and manage IoT devices, view real-time sensor data,
                        configure alerts, and much more.
                    </p>
                </div>

                <div style="background: white; padding: 20px; border: 1px solid #dee2e6; border-top: none; text-align: center;">
                    <div style="margin-bottom: 20px;">
                        <a href="${inviteUrl}"
                           style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
                            Accept Invitation
                        </a>
                    </div>
                    <p style="color: #6c757d; margin: 10px 0; font-size: 14px;">
                        Or copy and paste this link into your browser:
                    </p>
                    <p style="color: #007bff; font-size: 14px; word-break: break-all;">
                        ${inviteUrl}
                    </p>
                </div>

                <div style="background: #f8f9fa; padding: 15px; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px;">
                    <p style="color: #6c757d; margin: 0; font-size: 12px; text-align: center;">
                        This invitation will expire in 7 days. If you didn't expect this invitation,
                        you can safely ignore this email.
                    </p>
                </div>
            </div>
        `;

        return await this.sendEmail(email, subject, html);
    }

    // Health check method
    async healthCheck() {
        if (!this.transporter) {
            return { status: 'unavailable', message: 'Email service not configured' };
        }

        try {
            await this.transporter.verify();
            return { status: 'healthy', message: 'Email service operational' };
        } catch (error) {
            return { status: 'unhealthy', message: error.message };
        }
    }
}

module.exports = new EmailService();