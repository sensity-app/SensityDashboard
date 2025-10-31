const request = require('supertest');
const express = require('express');
const authRouter = require('../../routes/auth');
const db = require('../../models/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock dependencies
jest.mock('../../models/database');
jest.mock('../../services/auditService');
jest.mock('../../services/emailService');
jest.mock('../../middleware/bruteForceProtection', () => ({
    bruteForceProtection: (req, res, next) => next()
}));

// Create test app
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('Auth Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/auth/setup-check', () => {
        it('should return needsSetup true when no users exist', async () => {
            db.query.mockResolvedValue({ rows: [{ count: '0' }] });

            const response = await request(app)
                .get('/api/auth/setup-check')
                .expect(200);

            expect(response.body).toEqual({
                needsSetup: true,
                hasUsers: false
            });
        });

        it('should return needsSetup false when users exist', async () => {
            db.query.mockResolvedValue({ rows: [{ count: '5' }] });

            const response = await request(app)
                .get('/api/auth/setup-check')
                .expect(200);

            expect(response.body).toEqual({
                needsSetup: false,
                hasUsers: true
            });
        });

        it('should handle database errors', async () => {
            db.query.mockRejectedValue(new Error('Database error'));

            const response = await request(app)
                .get('/api/auth/setup-check')
                .expect(500);

            expect(response.body.error).toBe('Failed to check setup status');
        });
    });

    describe('POST /api/auth/initial-setup', () => {
        const validSetupData = {
            email: 'admin@example.com',
            password: 'SecurePass123!',
            fullName: 'Admin User',
            preferredLanguage: 'en'
        };

        it('should create first admin user successfully', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // User count check
                .mockResolvedValueOnce({ // User creation
                    rows: [{
                        id: 1,
                        email: 'admin@example.com',
                        role: 'admin',
                        full_name: 'Admin User',
                        preferred_language: 'en',
                        created_at: new Date()
                    }]
                });

            const response = await request(app)
                .post('/api/auth/initial-setup')
                .send(validSetupData)
                .expect(201);

            expect(response.body).toHaveProperty('token');
            expect(response.body).toHaveProperty('user');
            expect(response.body.user.email).toBe('admin@example.com');
            expect(response.body.user.role).toBe('admin');
            expect(response.body.message).toBe('Initial setup completed successfully');
        });

        it('should reject setup when users already exist', async () => {
            db.query.mockResolvedValue({ rows: [{ count: '1' }] });

            const response = await request(app)
                .post('/api/auth/initial-setup')
                .send(validSetupData)
                .expect(403);

            expect(response.body.error).toBe('Initial setup already completed');
        });

        it('should validate email format', async () => {
            const response = await request(app)
                .post('/api/auth/initial-setup')
                .send({ ...validSetupData, email: 'invalid-email' })
                .expect(400);

            expect(response.body.errors).toBeDefined();
        });

        it('should validate password length', async () => {
            const response = await request(app)
                .post('/api/auth/initial-setup')
                .send({ ...validSetupData, password: '123' })
                .expect(400);

            expect(response.body.errors).toBeDefined();
        });

        it('should validate required fields', async () => {
            const response = await request(app)
                .post('/api/auth/initial-setup')
                .send({ email: 'test@example.com' })
                .expect(400);

            expect(response.body.errors).toBeDefined();
        });
    });

    describe('POST /api/auth/login', () => {
        const loginData = {
            email: 'user@example.com',
            password: 'password123'
        };

        it('should login successfully with valid credentials', async () => {
            const hashedPassword = await bcrypt.hash('password123', 12);
            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    email: 'user@example.com',
                    password_hash: hashedPassword,
                    role: 'user',
                    full_name: 'Test User',
                    preferred_language: 'en'
                }]
            });

            const response = await request(app)
                .post('/api/auth/login')
                .send(loginData)
                .expect(200);

            expect(response.body).toHaveProperty('token');
            expect(response.body).toHaveProperty('user');
            expect(response.body.user.email).toBe('user@example.com');
        });

        it('should reject login with invalid email', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const response = await request(app)
                .post('/api/auth/login')
                .send(loginData)
                .expect(401);

            expect(response.body.error).toContain('Invalid credentials');
        });

        it('should reject login with invalid password', async () => {
            const hashedPassword = await bcrypt.hash('differentpassword', 12);
            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    email: 'user@example.com',
                    password_hash: hashedPassword,
                    role: 'user'
                }]
            });

            const response = await request(app)
                .post('/api/auth/login')
                .send(loginData)
                .expect(401);

            expect(response.body.error).toContain('Invalid credentials');
        });

        it('should validate email format on login', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({ email: 'invalid', password: 'test' })
                .expect(400);

            expect(response.body.errors).toBeDefined();
        });
    });

    describe('GET /api/auth/me', () => {
        it('should return user info with valid token', async () => {
            const token = global.testUtils.generateMockToken(1, 'user');

            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    email: 'test1@example.com',
                    role: 'user',
                    full_name: 'Test User',
                    preferred_language: 'en'
                }]
            });

            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(response.body.user).toBeDefined();
            expect(response.body.user.email).toBe('test1@example.com');
        });

        it('should reject request without token', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .expect(401);

            expect(response.body.error).toContain('No token provided');
        });

        it('should reject request with invalid token', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', 'Bearer invalid-token')
                .expect(403);

            expect(response.body.error).toContain('Invalid token');
        });
    });

    describe('Password Reset Flow', () => {
        describe('POST /api/auth/forgot-password', () => {
            it('should generate reset token for existing user', async () => {
                db.query
                    .mockResolvedValueOnce({ rows: [{ id: 1, email: 'user@example.com' }] })
                    .mockResolvedValueOnce({ rows: [] }); // Update query

                const response = await request(app)
                    .post('/api/auth/forgot-password')
                    .send({ email: 'user@example.com' })
                    .expect(200);

                expect(response.body.message).toContain('sent');
            });

            it('should return success even for non-existent users (security)', async () => {
                db.query.mockResolvedValue({ rows: [] });

                const response = await request(app)
                    .post('/api/auth/forgot-password')
                    .send({ email: 'nonexistent@example.com' })
                    .expect(200);

                expect(response.body.message).toContain('sent');
            });

            it('should validate email format', async () => {
                const response = await request(app)
                    .post('/api/auth/forgot-password')
                    .send({ email: 'invalid-email' })
                    .expect(400);

                expect(response.body.errors).toBeDefined();
            });
        });

        describe('POST /api/auth/reset-password', () => {
            it('should reset password with valid token', async () => {
                const resetToken = 'valid-reset-token';
                const tokenHash = require('crypto')
                    .createHash('sha256')
                    .update(resetToken)
                    .digest('hex');

                db.query
                    .mockResolvedValueOnce({
                        rows: [{
                            id: 1,
                            email: 'user@example.com',
                            reset_token_expires: new Date(Date.now() + 3600000)
                        }]
                    })
                    .mockResolvedValueOnce({ rows: [] }); // Update password

                const response = await request(app)
                    .post('/api/auth/reset-password')
                    .send({
                        token: resetToken,
                        newPassword: 'NewSecurePass123!'
                    })
                    .expect(200);

                expect(response.body.message).toContain('successfully');
            });

            it('should reject expired reset token', async () => {
                const resetToken = 'expired-token';
                db.query.mockResolvedValue({
                    rows: [{
                        id: 1,
                        reset_token_expires: new Date(Date.now() - 3600000) // Expired
                    }]
                });

                const response = await request(app)
                    .post('/api/auth/reset-password')
                    .send({
                        token: resetToken,
                        newPassword: 'NewPass123'
                    })
                    .expect(400);

                expect(response.body.error).toContain('expired');
            });

            it('should reject invalid reset token', async () => {
                db.query.mockResolvedValue({ rows: [] });

                const response = await request(app)
                    .post('/api/auth/reset-password')
                    .send({
                        token: 'invalid-token',
                        newPassword: 'NewPass123'
                    })
                    .expect(400);

                expect(response.body.error).toContain('Invalid');
            });
        });
    });
});
