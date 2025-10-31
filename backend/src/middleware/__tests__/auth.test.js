const { authenticateToken, requireRole, requireAdmin, authenticateDevice } = require('../../middleware/auth');
const jwt = require('jsonwebtoken');
const db = require('../../models/database');

// Mock dependencies
jest.mock('../../models/database');

describe('Auth Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            headers: {},
            body: {},
            query: {},
            params: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        next = jest.fn();
    });

    describe('authenticateToken', () => {
        it('should authenticate valid token', () => {
            const token = jwt.sign(
                { userId: 1, email: 'test@example.com', role: 'user' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            req.headers.authorization = `Bearer ${token}`;

            authenticateToken(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(req.user).toBeDefined();
            expect(req.user.userId).toBe(1);
            expect(req.user.email).toBe('test@example.com');
        });

        it('should reject request without token', () => {
            authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: expect.stringContaining('No token') })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should reject invalid token', () => {
            req.headers.authorization = 'Bearer invalid-token';

            authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: expect.stringContaining('Invalid') })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should reject expired token', () => {
            const expiredToken = jwt.sign(
                { userId: 1, email: 'test@example.com' },
                process.env.JWT_SECRET,
                { expiresIn: '-1h' } // Expired 1 hour ago
            );

            req.headers.authorization = `Bearer ${expiredToken}`;

            authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });

        it('should accept token from query parameter', () => {
            const token = jwt.sign(
                { userId: 1, email: 'test@example.com', role: 'user' },
                process.env.JWT_SECRET
            );

            req.query.token = token;

            authenticateToken(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(req.user).toBeDefined();
        });

        it('should handle malformed authorization header', () => {
            req.headers.authorization = 'InvalidFormat token123';

            authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('should reject token signed with wrong secret', () => {
            const wrongToken = jwt.sign(
                { userId: 1, email: 'test@example.com' },
                'wrong-secret'
            );

            req.headers.authorization = `Bearer ${wrongToken}`;

            authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('requireRole', () => {
        beforeEach(() => {
            req.user = { userId: 1, email: 'test@example.com', role: 'user' };
        });

        it('should allow access for matching role', () => {
            const middleware = requireRole('user');
            middleware(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should allow access for admin to any role', () => {
            req.user.role = 'admin';
            const middleware = requireRole('user');
            middleware(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('should deny access for insufficient role', () => {
            req.user.role = 'viewer';
            const middleware = requireRole('admin');
            middleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: expect.stringContaining('Insufficient') })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should accept array of allowed roles', () => {
            const middleware = requireRole(['user', 'manager']);
            middleware(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('should handle missing user object', () => {
            delete req.user;
            const middleware = requireRole('user');
            middleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('requireAdmin', () => {
        it('should allow access for admin user', () => {
            req.user = { userId: 1, email: 'admin@example.com', role: 'admin' };

            requireAdmin(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should deny access for non-admin user', () => {
            req.user = { userId: 2, email: 'user@example.com', role: 'user' };

            requireAdmin(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: expect.stringContaining('Admin') })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should deny access for viewer', () => {
            req.user = { userId: 3, email: 'viewer@example.com', role: 'viewer' };

            requireAdmin(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });

        it('should handle missing user object', () => {
            requireAdmin(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('authenticateDevice', () => {
        it('should authenticate device with valid API key', async () => {
            const apiKey = 'device-api-key-123';
            req.headers['x-api-key'] = apiKey;

            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    device_id: 'ESP-001',
                    api_key: apiKey,
                    status: 'active'
                }]
            });

            await authenticateDevice(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(req.device).toBeDefined();
            expect(req.device.device_id).toBe('ESP-001');
        });

        it('should reject request without API key', async () => {
            await authenticateDevice(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: expect.stringContaining('API key') })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should reject invalid API key', async () => {
            req.headers['x-api-key'] = 'invalid-key';
            db.query.mockResolvedValue({ rows: [] });

            await authenticateDevice(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });

        it('should reject inactive device', async () => {
            req.headers['x-api-key'] = 'device-key';
            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    device_id: 'ESP-001',
                    status: 'inactive'
                }]
            });

            await authenticateDevice(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: expect.stringContaining('inactive') })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should handle database errors', async () => {
            req.headers['x-api-key'] = 'device-key';
            db.query.mockRejectedValue(new Error('Database error'));

            await authenticateDevice(req, res, next);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(next).not.toHaveBeenCalled();
        });

        it('should accept API key from query parameter', async () => {
            req.query.api_key = 'device-api-key';
            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    device_id: 'ESP-001',
                    api_key: 'device-api-key',
                    status: 'active'
                }]
            });

            await authenticateDevice(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(req.device).toBeDefined();
        });
    });

    describe('Token Refresh', () => {
        it('should refresh token before expiration', () => {
            const almostExpiredToken = jwt.sign(
                { userId: 1, email: 'test@example.com', role: 'user' },
                process.env.JWT_SECRET,
                { expiresIn: '5m' } // 5 minutes remaining
            );

            req.headers.authorization = `Bearer ${almostExpiredToken}`;

            authenticateToken(req, res, next);

            expect(next).toHaveBeenCalled();
            // Should suggest token refresh
            expect(req.shouldRefreshToken).toBeDefined();
        });
    });

    describe('Multiple Authentication Methods', () => {
        it('should try header authentication first', () => {
            const token = jwt.sign({ userId: 1 }, process.env.JWT_SECRET);
            req.headers.authorization = `Bearer ${token}`;
            req.query.token = 'different-token';

            authenticateToken(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(req.user.userId).toBe(1);
        });

        it('should fallback to query authentication', () => {
            const token = jwt.sign({ userId: 2 }, process.env.JWT_SECRET);
            req.query.token = token;

            authenticateToken(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(req.user.userId).toBe(2);
        });
    });
});
