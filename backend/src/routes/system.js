const express = require('express');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { spawn } = require('child_process');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Global update status tracking
let updateStatus = {
    isRunning: false,
    progress: 0,
    currentStep: '',
    logs: [],
    startTime: null,
    error: null
};

// GET /api/system/info - Get system information
router.get('/info', authenticateToken, async (req, res) => {
    try {
        // Get git version info
        let gitInfo = {
            commit: 'unknown',
            branch: 'unknown',
            date: 'unknown'
        };

        try {
            const { stdout: commit } = await exec('git rev-parse HEAD', { cwd: process.cwd() });
            gitInfo.commit = commit.trim().substring(0, 8);

            const { stdout: branch } = await exec('git rev-parse --abbrev-ref HEAD', { cwd: process.cwd() });
            gitInfo.branch = branch.trim();

            const { stdout: date } = await exec('git log -1 --format=%cd --date=iso', { cwd: process.cwd() });
            gitInfo.date = date.trim();
        } catch (gitError) {
            logger.warn('Git information not available:', gitError.message);
        }

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
            loadavg: os.loadavg(),
            version: gitInfo
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
        if (updateStatus.isRunning) {
            return res.status(409).json({
                success: false,
                error: 'Update is already in progress'
            });
        }

        logger.info('Platform update requested by user:', req.user.email);

        // Initialize update status
        updateStatus = {
            isRunning: true,
            progress: 0,
            currentStep: 'Initializing update process...',
            logs: [],
            startTime: new Date(),
            error: null
        };

        res.json({
            success: true,
            message: 'Update started in background'
        });

        // Run update-system command in background
        setTimeout(async () => {
            try {
                logger.info('Starting platform update...');
                updateStatus.currentStep = 'Starting update script...';
                updateStatus.progress = 10;

                // Check if we're running in development or production
                const isDevelopment = process.env.NODE_ENV !== 'production';
                const projectRoot = process.cwd().includes('/backend') ?
                    path.join(process.cwd(), '..') : process.cwd();

                let updateCommand;
                if (isDevelopment) {
                    // Development: use development-friendly script
                    const devScript = path.join(projectRoot, 'update-system-dev.sh');
                    updateCommand = `bash "${devScript}"`;
                    logger.info(`Development mode: Using development update script: ${devScript}`);
                } else {
                    // Production: use system-wide command or production script
                    const prodScript = path.join(projectRoot, 'update-system.sh');
                    try {
                        // Try production script first
                        await exec(`ls "${prodScript}"`);
                        updateCommand = `sudo bash "${prodScript}"`;
                        logger.info(`Production mode: Using production update script: ${prodScript}`);
                    } catch (e) {
                        // Fallback to system command
                        updateCommand = 'update-system';
                        logger.info('Production mode: Using system update-system command');
                    }
                }

                const updateProcess = spawn('bash', ['-c', updateCommand], {
                    detached: true,
                    stdio: 'pipe',
                    cwd: projectRoot  // Set working directory to project root
                });

                updateProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    logger.info('Update stdout:', output);

                    // Add to logs
                    updateStatus.logs.push({
                        timestamp: new Date(),
                        type: 'info',
                        message: output.trim()
                    });

                    // Update progress based on output patterns
                    if (output.includes('git pull') || output.includes('Fetching')) {
                        updateStatus.currentStep = 'Downloading updates...';
                        updateStatus.progress = 25;
                    } else if (output.includes('npm install') || output.includes('Installing')) {
                        updateStatus.currentStep = 'Installing dependencies...';
                        updateStatus.progress = 50;
                    } else if (output.includes('build') || output.includes('Building')) {
                        updateStatus.currentStep = 'Building application...';
                        updateStatus.progress = 75;
                    } else if (output.includes('restart') || output.includes('Restarting')) {
                        updateStatus.currentStep = 'Restarting services...';
                        updateStatus.progress = 90;
                    }

                    // Keep only last 100 log entries
                    if (updateStatus.logs.length > 100) {
                        updateStatus.logs = updateStatus.logs.slice(-100);
                    }
                });

                updateProcess.stderr.on('data', (data) => {
                    const output = data.toString();
                    logger.error('Update stderr:', output);

                    updateStatus.logs.push({
                        timestamp: new Date(),
                        type: 'error',
                        message: output.trim()
                    });
                });

                updateProcess.on('close', (code) => {
                    if (code === 0) {
                        logger.info('Platform update completed successfully');
                        updateStatus.progress = 100;
                        updateStatus.currentStep = 'Update completed successfully!';
                        updateStatus.isRunning = false;
                    } else {
                        logger.error(`Platform update failed with code ${code}`);
                        updateStatus.error = `Update failed with exit code ${code}`;
                        updateStatus.currentStep = 'Update failed';
                        updateStatus.isRunning = false;
                    }
                });

                // Timeout after 10 minutes
                setTimeout(() => {
                    if (updateStatus.isRunning) {
                        logger.error('Update process timed out');
                        updateStatus.error = 'Update process timed out after 10 minutes';
                        updateStatus.currentStep = 'Update timed out';
                        updateStatus.isRunning = false;
                        try {
                            updateProcess.kill('SIGTERM');
                        } catch (e) {
                            logger.error('Failed to kill update process:', e);
                        }
                    }
                }, 10 * 60 * 1000);

                updateProcess.unref();
            } catch (error) {
                logger.error('Failed to start update process:', error);
                updateStatus.error = 'Failed to start update process: ' + error.message;
                updateStatus.currentStep = 'Failed to start update';
                updateStatus.isRunning = false;
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

// GET /api/system/update-progress - Get current update progress
router.get('/update-progress', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // Return current update status
        const status = {
            ...updateStatus,
            duration: updateStatus.startTime ? Date.now() - updateStatus.startTime.getTime() : 0
        };

        res.json({
            success: true,
            status
        });
    } catch (error) {
        logger.error('Get update progress error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get update progress'
        });
    }
});

// GET /api/system/update-status - Check if update command exists
router.get('/update-status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        let updateAvailable = false;
        let updateScript = '';

        // Check if we're running in development or production
        const isDevelopment = process.env.NODE_ENV !== 'production';
        const projectRoot = process.cwd().includes('/backend') ?
            path.join(process.cwd(), '..') : process.cwd();

        try {
            if (isDevelopment) {
                // Development: check for development script
                const devScript = path.join(projectRoot, 'update-system-dev.sh');
                await exec(`ls "${devScript}"`);
                updateAvailable = true;
                updateScript = devScript;
                logger.info(`Development mode: Found development update script: ${devScript}`);
            } else {
                // Production: try production script first, then system command
                try {
                    const prodScript = path.join(projectRoot, 'update-system.sh');
                    await exec(`ls "${prodScript}"`);
                    updateAvailable = true;
                    updateScript = prodScript;
                    logger.info(`Production mode: Found production update script: ${prodScript}`);
                } catch (prodError) {
                    // Fallback to system command
                    await exec('which update-system');
                    updateAvailable = true;
                    updateScript = 'update-system';
                    logger.info('Production mode: Found system update-system command');
                }
            }
        } catch (error) {
            logger.info(`No update script found for ${isDevelopment ? 'development' : 'production'} mode:`, error.message);
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