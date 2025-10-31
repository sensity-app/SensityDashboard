const emailService = require('../../services/emailService');
const nodemailer = require('nodemailer');

// Mock nodemailer
jest.mock('nodemailer');

describe('Email Service', () => {
    let mockTransporter;

    beforeEach(() => {
        jest.clearAllMocks();

        mockTransporter = {
            sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
            verify: jest.fn().mockResolvedValue(true)
        };

        nodemailer.createTransport.mockReturnValue(mockTransporter);
    });

    describe('sendEmail', () => {
        it('should send email successfully', async () => {
            const emailOptions = {
                to: 'user@example.com',
                subject: 'Test Email',
                text: 'This is a test email',
                html: '<p>This is a test email</p>'
            };

            const result = await emailService.sendEmail(emailOptions);

            expect(result.success).toBe(true);
            expect(mockTransporter.sendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'user@example.com',
                    subject: 'Test Email'
                })
            );
        });

        it('should handle email sending errors', async () => {
            mockTransporter.sendMail.mockRejectedValue(new Error('SMTP error'));

            const emailOptions = {
                to: 'user@example.com',
                subject: 'Test',
                text: 'Test'
            };

            await expect(emailService.sendEmail(emailOptions)).rejects.toThrow('SMTP error');
        });

        it('should validate email address format', async () => {
            const emailOptions = {
                to: 'invalid-email',
                subject: 'Test',
                text: 'Test'
            };

            await expect(emailService.sendEmail(emailOptions)).rejects.toThrow('Invalid email');
        });

        it('should include default sender if not specified', async () => {
            await emailService.sendEmail({
                to: 'user@example.com',
                subject: 'Test',
                text: 'Test'
            });

            expect(mockTransporter.sendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: expect.any(String)
                })
            );
        });
    });

    describe('sendAlertEmail', () => {
        it('should send alert notification email', async () => {
            const alertData = {
                deviceName: 'Temperature Sensor',
                sensorName: 'temperature',
                value: 30,
                threshold: 25,
                severity: 'high',
                message: 'Temperature above threshold'
            };

            await emailService.sendAlertEmail('user@example.com', alertData);

            expect(mockTransporter.sendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    subject: expect.stringContaining('Alert'),
                    html: expect.stringContaining('Temperature Sensor')
                })
            );
        });

        it('should format alert email with severity styling', async () => {
            const alertData = {
                deviceName: 'Test Device',
                severity: 'critical',
                message: 'Critical alert'
            };

            await emailService.sendAlertEmail('user@example.com', alertData);

            const callArgs = mockTransporter.sendMail.mock.calls[0][0];
            expect(callArgs.html).toContain('critical');
        });
    });

    describe('sendWelcomeEmail', () => {
        it('should send welcome email to new user', async () => {
            const userData = {
                email: 'newuser@example.com',
                fullName: 'New User',
                temporaryPassword: 'temp123'
            };

            await emailService.sendWelcomeEmail(userData);

            expect(mockTransporter.sendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'newuser@example.com',
                    subject: expect.stringContaining('Welcome')
                })
            );
        });
    });

    describe('sendPasswordResetEmail', () => {
        it('should send password reset email with token', async () => {
            const resetData = {
                email: 'user@example.com',
                resetToken: 'abc123xyz',
                resetUrl: 'https://app.example.com/reset-password?token=abc123xyz'
            };

            await emailService.sendPasswordResetEmail(resetData);

            expect(mockTransporter.sendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'user@example.com',
                    html: expect.stringContaining('abc123xyz')
                })
            );
        });

        it('should include expiration time in reset email', async () => {
            const resetData = {
                email: 'user@example.com',
                resetToken: 'token123',
                resetUrl: 'https://example.com/reset',
                expiresIn: '1 hour'
            };

            await emailService.sendPasswordResetEmail(resetData);

            const callArgs = mockTransporter.sendMail.mock.calls[0][0];
            expect(callArgs.html).toContain('1 hour');
        });
    });

    describe('sendDeviceOfflineEmail', () => {
        it('should send device offline notification', async () => {
            const deviceData = {
                deviceName: 'ESP-001',
                deviceId: 'ESP-001',
                location: 'Office',
                lastSeen: new Date()
            };

            await emailService.sendDeviceOfflineEmail('user@example.com', deviceData);

            expect(mockTransporter.sendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    subject: expect.stringContaining('Offline')
                })
            );
        });
    });

    describe('sendBulkEmails', () => {
        it('should send emails to multiple recipients', async () => {
            const recipients = [
                'user1@example.com',
                'user2@example.com',
                'user3@example.com'
            ];

            const emailOptions = {
                subject: 'Bulk Email',
                text: 'This is a bulk email'
            };

            await emailService.sendBulkEmails(recipients, emailOptions);

            expect(mockTransporter.sendMail).toHaveBeenCalledTimes(3);
        });

        it('should handle partial failures in bulk send', async () => {
            mockTransporter.sendMail
                .mockResolvedValueOnce({ messageId: '1' })
                .mockRejectedValueOnce(new Error('Failed'))
                .mockResolvedValueOnce({ messageId: '3' });

            const recipients = ['user1@example.com', 'user2@example.com', 'user3@example.com'];

            const result = await emailService.sendBulkEmails(recipients, {
                subject: 'Test',
                text: 'Test'
            });

            expect(result.successful).toBe(2);
            expect(result.failed).toBe(1);
        });
    });

    describe('verifyConnection', () => {
        it('should verify SMTP connection', async () => {
            const result = await emailService.verifyConnection();

            expect(result).toBe(true);
            expect(mockTransporter.verify).toHaveBeenCalled();
        });

        it('should handle verification failure', async () => {
            mockTransporter.verify.mockRejectedValue(new Error('Connection failed'));

            const result = await emailService.verifyConnection();

            expect(result).toBe(false);
        });
    });

    describe('Email Templates', () => {
        it('should use HTML template for alert emails', async () => {
            const alertData = {
                deviceName: 'Test Device',
                message: 'Test Alert'
            };

            await emailService.sendAlertEmail('user@example.com', alertData);

            const callArgs = mockTransporter.sendMail.mock.calls[0][0];
            expect(callArgs.html).toBeDefined();
            expect(callArgs.html.length).toBeGreaterThan(0);
        });

        it('should include plain text fallback', async () => {
            await emailService.sendEmail({
                to: 'user@example.com',
                subject: 'Test',
                html: '<p>HTML content</p>'
            });

            const callArgs = mockTransporter.sendMail.mock.calls[0][0];
            expect(callArgs.text).toBeDefined();
        });
    });

    describe('Email Attachments', () => {
        it('should support email attachments', async () => {
            const emailOptions = {
                to: 'user@example.com',
                subject: 'With Attachment',
                text: 'Email with attachment',
                attachments: [
                    {
                        filename: 'report.pdf',
                        content: Buffer.from('PDF content')
                    }
                ]
            };

            await emailService.sendEmail(emailOptions);

            expect(mockTransporter.sendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    attachments: expect.arrayContaining([
                        expect.objectContaining({ filename: 'report.pdf' })
                    ])
                })
            );
        });
    });

    describe('Rate Limiting', () => {
        it('should respect rate limits', async () => {
            const emails = Array(100).fill(null).map((_, i) => ({
                to: `user${i}@example.com`,
                subject: 'Test',
                text: 'Test'
            }));

            // Should implement rate limiting
            await expect(
                emailService.sendManyEmails(emails)
            ).resolves.toBeDefined();
        });
    });
});
