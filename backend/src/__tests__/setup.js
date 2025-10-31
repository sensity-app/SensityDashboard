// Test setup and global mocks
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'sensity_test';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';

// Mock logger to prevent console spam during tests
jest.mock('../utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}));

// Increase timeout for integration tests
jest.setTimeout(10000);

// Global test utilities
global.testUtils = {
    generateMockToken: (userId = 1, role = 'user') => {
        const jwt = require('jsonwebtoken');
        return jwt.sign(
            { userId, email: `test${userId}@example.com`, role },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
    },

    generateAdminToken: () => {
        const jwt = require('jsonwebtoken');
        return jwt.sign(
            { userId: 1, email: 'admin@example.com', role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
    }
};
