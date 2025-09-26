const express = require('express');
const os = require('os');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/system/info - Get system information
router.get('/info', authenticateToken, async (req, res) => {
    try {
        const systemInfo = {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            uptime: process.uptime(),
            memory: {
                used: process.memoryUsage(),
                system: {
                    total: os.totalmem(),
                    free: os.freemem()
                }
            },
            cpus: os.cpus().length,
            hostname: os.hostname(),
            loadavg: os.loadavg()
        };

        res.json(systemInfo);
    } catch (error) {
        logger.error('Get system info error:', error);
        res.status(500).json({ error: 'Failed to get system information' });
    }
});

// GET /api/system/health - Get system health status
router.get('/health', authenticateToken, async (req, res) => {
    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            checks: {}
        };

        // Database health check
        try {
            await db.query('SELECT 1');
            health.checks.database = {
                status: 'healthy',
                message: 'Database connection successful'
            };
        } catch (dbError) {
            health.status = 'unhealthy';
            health.checks.database = {
                status: 'unhealthy',
                message: 'Database connection failed',
                error: dbError.message
            };
        }

        // Memory health check
        const memoryUsage = process.memoryUsage();
        const totalMemory = os.totalmem();
        const usedMemoryPercent = ((totalMemory - os.freemem()) / totalMemory) * 100;

        if (usedMemoryPercent > 90) {
            health.status = 'unhealthy';
            health.checks.memory = {
                status: 'unhealthy',
                message: `High memory usage: ${usedMemoryPercent.toFixed(1)}%`
            };
        } else {
            health.checks.memory = {
                status: 'healthy',
                message: `Memory usage: ${usedMemoryPercent.toFixed(1)}%`
            };
        }

        // Load average check (Unix-like systems only)
        if (os.platform() !== 'win32') {
            const loadavg = os.loadavg();
            const cpuCount = os.cpus().length;
            const loadPercent = (loadavg[0] / cpuCount) * 100;

            if (loadPercent > 80) {
                health.status = 'degraded';
                health.checks.cpu = {
                    status: 'degraded',
                    message: `High CPU load: ${loadPercent.toFixed(1)}%`
                };
            } else {
                health.checks.cpu = {
                    status: 'healthy',
                    message: `CPU load: ${loadPercent.toFixed(1)}%`
                };
            }
        }

        res.json(health);
    } catch (error) {
        logger.error('Get system health error:', error);
        res.status(500).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Failed to check system health'
        });
    }
});

// GET /api/system/stats - Get system statistics (admin only)
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stats = {
            timestamp: new Date().toISOString(),
            system: {
                uptime: process.uptime(),
                platform: os.platform(),
                arch: os.arch(),
                nodeVersion: process.version,
                memory: process.memoryUsage(),
                cpus: os.cpus().length
            },
            database: {}
        };

        // Get database statistics
        try {
            const [
                deviceCount,
                userCount,
                alertCount,
                telemetryCount
            ] = await Promise.all([
                db.query('SELECT COUNT(*) as count FROM devices'),
                db.query('SELECT COUNT(*) as count FROM users'),
                db.query('SELECT COUNT(*) as count FROM alerts WHERE status = $1', ['active']),
                db.query('SELECT COUNT(*) as count FROM telemetry WHERE timestamp >= NOW() - INTERVAL \'24 hours\'')
            ]);

            stats.database = {
                devices: parseInt(deviceCount.rows[0].count),
                users: parseInt(userCount.rows[0].count),
                activeAlerts: parseInt(alertCount.rows[0].count),
                telemetryLast24h: parseInt(telemetryCount.rows[0].count)
            };
        } catch (dbError) {
            stats.database.error = 'Failed to fetch database statistics';
        }

        res.json(stats);
    } catch (error) {
        logger.error('Get system stats error:', error);
        res.status(500).json({ error: 'Failed to get system statistics' });
    }
});

module.exports = router;