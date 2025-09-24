const jwt = require('jsonwebtoken');
const db = require('../models/database');
const logger = require('../utils/logger');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get user from database to ensure they still exist
        const result = await db.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = result.rows[0];
        next();
    } catch (error) {
        logger.error('Authentication error:', error);
        return res.status(403).json({ error: 'Invalid token' });
    }
};

// Middleware to check if user has required role
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const userRole = req.user.role;
        const allowedRoles = Array.isArray(roles) ? roles : [roles];

        if (!allowedRoles.includes(userRole)) {
            logger.logSecurityEvent('Insufficient permissions', {
                userId: req.user.id,
                userRole,
                requiredRoles: allowedRoles,
                endpoint: req.originalUrl,
                method: req.method,
                ip: req.ip
            });
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
};

// Middleware to check if user is admin
const requireAdmin = requireRole(['admin']);

// Middleware to check if user can access device (admin or device owner)
const requireDeviceAccess = async (req, res, next) => {
    try {
        const deviceId = req.params.deviceId || req.params.id;
        const userId = req.user.id;
        const userRole = req.user.role;

        // Admins can access all devices
        if (userRole === 'admin') {
            return next();
        }

        // Check if user has access to the device through location permissions
        const result = await db.query(`
            SELECT d.id
            FROM devices d
            INNER JOIN locations l ON d.location_id = l.id
            INNER JOIN user_locations ul ON l.id = ul.location_id
            WHERE d.id = $1 AND ul.user_id = $2
        `, [deviceId, userId]);

        if (result.rows.length === 0) {
            logger.logSecurityEvent('Unauthorized device access attempt', {
                userId,
                deviceId,
                endpoint: req.originalUrl,
                method: req.method,
                ip: req.ip
            });
            return res.status(403).json({ error: 'Access denied to this device' });
        }

        next();
    } catch (error) {
        logger.error('Device access check error:', error);
        return res.status(500).json({ error: 'Access verification failed' });
    }
};

// Middleware to validate API key for device endpoints
const authenticateDevice = async (req, res, next) => {
    try {
        const deviceId = req.params.deviceId || req.body.device_id;
        const apiKey = req.headers['x-api-key'] || req.headers['authorization'];

        if (!apiKey || !deviceId) {
            return res.status(401).json({ error: 'Device ID and API key required' });
        }

        // For simplicity, using device_id as API key. In production, use proper API keys
        const result = await db.query('SELECT * FROM devices WHERE id = $1', [deviceId]);

        if (result.rows.length === 0) {
            logger.logSecurityEvent('Unknown device authentication attempt', {
                deviceId,
                apiKey: apiKey.substring(0, 8) + '...',
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
            return res.status(401).json({ error: 'Invalid device credentials' });
        }

        req.device = result.rows[0];

        // Update last heartbeat
        await db.query(
            'UPDATE devices SET last_heartbeat = NOW(), ip_address = $2 WHERE id = $1',
            [deviceId, req.ip]
        );

        next();
    } catch (error) {
        logger.error('Device authentication error:', error);
        return res.status(500).json({ error: 'Authentication failed' });
    }
};

module.exports = {
    authenticateToken,
    requireRole,
    requireAdmin,
    requireDeviceAccess,
    authenticateDevice
};