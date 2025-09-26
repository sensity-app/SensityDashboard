const express = require('express');
const os = require('os');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { spawn } = require('child_process');
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

// GET /api/system/version - Get current git commit version
router.get('/version', authenticateToken, async (req, res) => {
    try {
        let gitInfo = {
            commit: 'unknown',
            branch: 'unknown',
            date: 'unknown',
            author: 'unknown'
        };

        try {
            // Get current commit hash
            const { stdout: commit } = await exec('git rev-parse HEAD', { cwd: process.cwd() });
            gitInfo.commit = commit.trim().substring(0, 8);

            // Get current branch
            const { stdout: branch } = await exec('git rev-parse --abbrev-ref HEAD', { cwd: process.cwd() });
            gitInfo.branch = branch.trim();

            // Get commit date
            const { stdout: date } = await exec('git log -1 --format=%cd --date=iso', { cwd: process.cwd() });
            gitInfo.date = date.trim();

            // Get commit author
            const { stdout: author } = await exec('git log -1 --format=%an', { cwd: process.cwd() });
            gitInfo.author = author.trim();
        } catch (gitError) {
            logger.warn('Git information not available:', gitError.message);
        }

        res.json({
            success: true,
            version: gitInfo
        });
    } catch (error) {
        logger.error('Get version error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get version information'
        });
    }
});

// POST /api/system/update - Update the platform (admin only)
router.post('/update', authenticateToken, requireAdmin, async (req, res) => {
    try {
        logger.info('Platform update requested by user:', req.user.email);

        res.json({
            success: true,
            message: 'Update started in background'
        });

        // Run update-system command in background
        setTimeout(async () => {
            try {
                logger.info('Starting platform update...');

                const updateProcess = spawn('bash', ['-c', 'update-system'], {
                    detached: true,
                    stdio: 'pipe'
                });

                updateProcess.stdout.on('data', (data) => {
                    logger.info('Update stdout:', data.toString());
                });

                updateProcess.stderr.on('data', (data) => {
                    logger.error('Update stderr:', data.toString());
                });

                updateProcess.on('close', (code) => {
                    if (code === 0) {
                        logger.info('Platform update completed successfully');
                    } else {
                        logger.error(`Platform update failed with code ${code}`);
                    }
                });

                updateProcess.unref();
            } catch (error) {
                logger.error('Failed to start update process:', error);
            }
        }, 1000);

    } catch (error) {
        logger.error('Update platform error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start platform update'
        });
    }
});

// GET /api/system/update-status - Check if update command exists
router.get('/update-status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        let updateAvailable = false;
        let updateScript = '';

        try {
            // Check if update-system command exists
            await exec('which update-system');
            updateAvailable = true;
            updateScript = 'update-system';
        } catch (error) {
            // Check if there's a local update script
            try {
                await exec('ls update-system.sh');
                updateAvailable = true;
                updateScript = './update-system.sh';
            } catch (localError) {
                logger.info('No update script found');
            }
        }

        res.json({
            success: true,
            updateAvailable,
            updateScript
        });
    } catch (error) {
        logger.error('Update status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check update status'
        });
    }
});

module.exports = router;