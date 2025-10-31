const express = require('express');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const fsConstants = require('fs').constants;
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { spawn } = require('child_process');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

let backendPackageVersion = 'unknown';
try {
    const backendPackageJson = require('../../package.json');
    if (backendPackageJson?.version) {
        backendPackageVersion = backendPackageJson.version;
    }
} catch (error) {
    logger.warn('Could not read backend package version:', error.message);
}

const router = express.Router();

function formatDuration(seconds) {
    const totalSeconds = Math.floor(seconds);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    return parts.join(' ');
}

// Global update status tracking
let updateStatus = {
    isRunning: false,
    progress: 0,
    currentStep: '',
    logs: [],
    startTime: null,
    error: null,
    script: null
};

// GitHub repository configuration
const GITHUB_REPO = 'sensity-app/SensityDashboard';
const GITHUB_RAW_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main`;

/**
 * Detect instance name from project root path
 * @param {string} projectRoot - Project root directory path
 * @returns {string} - Instance name (e.g., 'default', 'dev', 'staging')
 */
function detectInstanceName(projectRoot) {
    const normalizedPath = path.normalize(projectRoot);

    // Check if it's the default instance
    if (normalizedPath === '/opt/sensity-platform' || normalizedPath.endsWith('/opt/sensity-platform')) {
        return 'default';
    }

    // Check if it matches pattern /opt/sensity-platform-{instance}
    const match = normalizedPath.match(/sensity-platform-([^/]+)$/);
    if (match) {
        return match[1]; // Return the instance name (dev, staging, etc.)
    }

    // For development or non-standard paths, return 'default'
    return 'default';
}

/**
 * Download update script from GitHub
 * @param {string} scriptName - Name of the script to download
 * @param {string} targetPath - Path where to save the script
 * @returns {Promise<boolean>} - True if successful
 */
async function downloadUpdateScriptFromGitHub(scriptName, targetPath) {
    try {
        logger.info(`Downloading ${scriptName} from GitHub...`);

        const scriptUrl = `${GITHUB_RAW_URL}/${scriptName}`;
        const curlCommand = `curl -fsSL "${scriptUrl}" -o "${targetPath}"`;

        await exec(curlCommand);

        // Make script executable
        await exec(`chmod +x "${targetPath}"`);

        logger.info(`Successfully downloaded and made executable: ${targetPath}`);
        return true;
    } catch (error) {
        logger.error(`Failed to download ${scriptName} from GitHub:`, error.message);
        return false;
    }
}

/**
 * Ensure update script exists, download from GitHub if missing
 * @param {string} scriptPath - Path to the script
 * @param {string} scriptName - Name of the script
 * @returns {Promise<boolean>} - True if script exists or was downloaded
 */
async function ensureUpdateScript(scriptPath, scriptName) {
    try {
        // Check if script exists
        await fs.access(scriptPath, fsConstants.F_OK);
        logger.info(`Update script found: ${scriptPath}`);
        return true;
    } catch (error) {
        // Script doesn't exist, try to download from GitHub
        logger.warn(`Update script not found: ${scriptPath}`);
        logger.info(`Attempting to download ${scriptName} from GitHub...`);

        updateStatus.currentStep = `Downloading ${scriptName} from GitHub...`;
        updateStatus.logs.push({
            timestamp: new Date(),
            type: 'info',
            message: `Update script not found locally, downloading from GitHub repository...`
        });

        const downloaded = await downloadUpdateScriptFromGitHub(scriptName, scriptPath);

        if (downloaded) {
            updateStatus.logs.push({
                timestamp: new Date(),
                type: 'success',
                message: `Successfully downloaded ${scriptName} from GitHub`
            });
            return true;
        } else {
            updateStatus.logs.push({
                timestamp: new Date(),
                type: 'error',
                message: `Failed to download ${scriptName} from GitHub`
            });
            return false;
        }
    }
}

async function commandExists(command) {
    try {
        const { stdout } = await exec(`command -v ${command}`);
        const resolvedPath = stdout.trim();
        if (resolvedPath) {
            logger.info(`Command "${command}" resolved to ${resolvedPath}`);
            return resolvedPath;
        }
        return null;
    } catch (error) {
        logger.debug(`Command "${command}" not found: ${error.message}`);
        return null;
    }
}

// GET /api/system/info - Get system information
router.get('/info', authenticateToken, async (req, res) => {
    try {
        // Get git version info
        let gitInfo = {
            commit: 'unknown',
            branch: 'unknown',
            date: 'unknown'
        };

        // Determine git root directory (go up one level from backend if needed)
        const gitRoot = process.cwd().includes('/backend')
            ? path.join(process.cwd(), '..')
            : process.cwd();

        logger.debug('Git detection:', {
            cwd: process.cwd(),
            gitRoot,
            hasBackendInPath: process.cwd().includes('/backend')
        });

        try {
            const { stdout: commit } = await exec('git rev-parse HEAD', { cwd: gitRoot });
            gitInfo.commit = commit.trim().substring(0, 8);
            logger.debug('Git commit detected:', gitInfo.commit);

            const { stdout: branch } = await exec('git rev-parse --abbrev-ref HEAD', { cwd: gitRoot });
            gitInfo.branch = branch.trim();
            logger.debug('Git branch detected:', gitInfo.branch);

            const { stdout: date } = await exec('git log -1 --format=%cd --date=iso', { cwd: gitRoot });
            gitInfo.date = date.trim();
            logger.debug('Git date detected:', gitInfo.date);
        } catch (gitError) {
            logger.warn('Git information not available:', {
                error: gitError.message,
                cwd: process.cwd(),
                gitRoot,
                stderr: gitError.stderr
            });
        }

        const envCommit = process.env.GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_SHA;
        if (gitInfo.commit === 'unknown' && envCommit) {
            gitInfo.commit = envCommit.substring(0, 8);
        }

        const envBranch = process.env.GIT_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || process.env.BRANCH_NAME;
        if (gitInfo.branch === 'unknown' && envBranch) {
            gitInfo.branch = envBranch;
        }

        const envDate = process.env.GIT_COMMIT_DATE || process.env.VERCEL_GIT_COMMIT_DATE;
        if (gitInfo.date === 'unknown' && envDate) {
            gitInfo.date = envDate;
        }

        const packageVersion =
            process.env.APP_VERSION ||
            process.env.npm_package_version ||
            backendPackageVersion ||
            gitInfo.commit;
        const uptimeSeconds = process.uptime();
        const uptimeHuman = formatDuration(uptimeSeconds);

        const systemInfo = {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            uptime: uptimeSeconds,
            uptimeHuman,
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
            version: {
                ...gitInfo,
                version: packageVersion
            }
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
        const uptimeSeconds = process.uptime();
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: uptimeSeconds,
            uptimeHuman: formatDuration(uptimeSeconds),
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

        // Determine git root directory (go up one level from backend if needed)
        const gitRoot = process.cwd().includes('/backend')
            ? path.join(process.cwd(), '..')
            : process.cwd();

        try {
            // Get current commit hash
            const { stdout: commit } = await exec('git rev-parse HEAD', { cwd: gitRoot });
            gitInfo.commit = commit.trim().substring(0, 8);

            // Get current branch
            const { stdout: branch } = await exec('git rev-parse --abbrev-ref HEAD', { cwd: gitRoot });
            gitInfo.branch = branch.trim();

            // Get commit date
            const { stdout: date } = await exec('git log -1 --format=%cd --date=iso', { cwd: gitRoot });
            gitInfo.date = date.trim();

            // Get commit author
            const { stdout: author } = await exec('git log -1 --format=%an', { cwd: gitRoot });
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
            error: null,
            script: null
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

                // Detect which instance we're running on
                const instanceName = detectInstanceName(projectRoot);
                logger.info(`Detected instance: ${instanceName} (from path: ${projectRoot})`);

                let updateCommand;
                let scriptName;
                let scriptPath;

                if (isDevelopment) {
                    // Development: use development-friendly script
                    scriptName = 'update-system-dev.sh';
                    scriptPath = path.join(projectRoot, scriptName);

                    // Ensure script exists, download from GitHub if missing
                    const scriptExists = await ensureUpdateScript(scriptPath, scriptName);

                    if (!scriptExists) {
                        // Try fallback to production script
                        logger.warn('Development script unavailable, trying production script...');
                        scriptName = 'update-system.sh';
                        scriptPath = path.join(projectRoot, scriptName);

                        const prodScriptExists = await ensureUpdateScript(scriptPath, scriptName);
                        if (!prodScriptExists) {
                            throw new Error('Unable to find or download update script');
                        }
                    }

                    updateCommand = `bash "${scriptPath}"`;
                    logger.info(`Development mode: Using update script: ${scriptPath}`);
                } else {
                    // Production: prefer global update-system command if available
                    const globalUpdateCommand = await commandExists('update-system');

                    if (globalUpdateCommand) {
                        scriptName = 'update-system';
                        scriptPath = globalUpdateCommand;
                        // Pass instance name to update only this specific instance
                        updateCommand = `sudo "${scriptPath}" "${instanceName}"`;
                        logger.info(`Production mode: Using global update-system command at ${scriptPath} for instance: ${instanceName}`);
                    } else {
                        // Fall back to bundled production script
                        scriptName = 'update-system.sh';
                        scriptPath = path.join(projectRoot, scriptName);

                        // Ensure script exists, download from GitHub if missing
                        const scriptExists = await ensureUpdateScript(scriptPath, scriptName);

                        if (!scriptExists) {
                            throw new Error('Unable to find or download update script');
                        }

                        // Pass instance name to update only this specific instance
                        updateCommand = `sudo bash "${scriptPath}" "${instanceName}"`;
                        logger.info(`Production mode: Using bundled update script: ${scriptPath} for instance: ${instanceName}`);
                    }

                    // In production, check if we can run sudo without password
                    try {
                        await exec('sudo -n true', { cwd: projectRoot, timeout: 2000 });
                        logger.info('Sudo check passed - passwordless sudo is configured');
                    } catch (sudoError) {
                        logger.error('Sudo check failed:', sudoError.message);
                        updateStatus.error = 'Permission denied: Passwordless sudo is not configured for this user. Please configure /etc/sudoers.d/sensity-update';
                        updateStatus.currentStep = 'Permission error - sudo not configured';
                        updateStatus.isRunning = false;
                        updateStatus.logs.push({
                            timestamp: new Date(),
                            type: 'error',
                            message: 'ERROR: Backend user cannot execute sudo without password. Please configure passwordless sudo for the update script.'
                        });
                        updateStatus.logs.push({
                            timestamp: new Date(),
                            type: 'info',
                            message: 'See UPDATE_FIX_GUIDE.md for instructions on configuring sudo access.'
                        });
                        return;
                    }
                }

                updateStatus.script = scriptName;

                logger.info(`Executing update command: ${updateCommand}`);
                logger.info(`Working directory: ${projectRoot}`);

                const updateProcess = spawn('bash', ['-c', updateCommand], {
                    detached: true,
                    stdio: 'pipe',
                    cwd: projectRoot  // Set working directory to project root
                });

                updateStatus.logs.push({
                    timestamp: new Date(),
                    type: 'info',
                    message: `Starting update for instance: ${instanceName}`
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

                    // Check for sudo password prompt (indicates permission issue)
                    if (output.toLowerCase().includes('password') && output.includes('sudo')) {
                        logger.error('Sudo password prompt detected - permission denied');
                        updateStatus.error = 'Permission denied: Backend user cannot run update script. Please configure passwordless sudo.';
                        updateStatus.currentStep = 'Permission error';
                        updateStatus.logs.push({
                            timestamp: new Date(),
                            type: 'error',
                            message: 'ERROR: Update script requires sudo permissions that are not configured. Please contact system administrator.'
                        });
                    }

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

                    // Check for sudo permission errors
                    if (output.toLowerCase().includes('permission denied') ||
                        output.toLowerCase().includes('not in the sudoers file')) {
                        logger.error('Sudo permission error detected');
                        updateStatus.error = 'Permission denied: Backend user lacks sudo privileges for update script.';
                        updateStatus.currentStep = 'Permission error';
                    }
                });

                updateProcess.on('close', (code) => {
                    const endTime = Date.now();
                    const duration = updateStatus.startTime ? endTime - new Date(updateStatus.startTime).getTime() : 0;

                    if (code === 0) {
                        logger.info('Platform update completed successfully');
                        updateStatus.progress = 100;
                        updateStatus.currentStep = 'Update completed successfully!';
                        updateStatus.isRunning = false;
                        updateStatus.logs.push({
                            timestamp: new Date(),
                            type: 'success',
                            message: `Update completed successfully in ${Math.round(duration / 1000)}s`
                        });
                    } else {
                        logger.error(`Platform update failed with code ${code}`);
                        logger.error('Update logs:', JSON.stringify(updateStatus.logs, null, 2));
                        updateStatus.error = `Update failed with exit code ${code}`;
                        updateStatus.currentStep = 'Update failed';
                        updateStatus.isRunning = false;
                        updateStatus.logs.push({
                            timestamp: new Date(),
                            type: 'error',
                            message: `Update script exited with code ${code}. Check server logs for details.`
                        });
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

// GET /api/system/update-status - Check if update is available by comparing with remote
router.get('/update-status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        let updateAvailable = false;
        let updateScript = '';
        let currentCommit = '';
        let remoteCommit = '';
        let behindBy = 0;

        // Check if we're running in development or production
        const isDevelopment = process.env.NODE_ENV !== 'production';
        const projectRoot = process.cwd().includes('/backend') ?
            path.join(process.cwd(), '..') : process.cwd();

        try {
            // Check for update script/command
            if (!isDevelopment) {
                const globalUpdateCommand = await commandExists('update-system');
                if (globalUpdateCommand) {
                    updateScript = 'update-system';
                }
            }

            if (!updateScript) {
                if (isDevelopment) {
                    const devScript = path.join(projectRoot, 'update-system-dev.sh');
                    try {
                        await fs.access(devScript, fs.constants.F_OK);
                        updateScript = devScript;
                    } catch {
                        const prodScript = path.join(projectRoot, 'update-system.sh');
                        try {
                            await fs.access(prodScript, fs.constants.F_OK);
                            updateScript = prodScript;
                        } catch {
                            updateScript = 'update-system.sh';
                        }
                    }
                } else {
                    const prodScript = path.join(projectRoot, 'update-system.sh');
                    try {
                        await fs.access(prodScript, fs.constants.F_OK);
                        updateScript = prodScript;
                    } catch {
                        updateScript = 'update-system.sh';
                    }
                }
            }

            // Check Git status to compare with remote
            try {
                // Fetch latest from remote (without merging)
                await exec('git fetch origin', { cwd: projectRoot });

                // Get current commit hash
                const currentResult = await exec('git rev-parse HEAD', { cwd: projectRoot });
                currentCommit = currentResult.stdout.trim();

                // Get current branch and remote commit
                const branchResult = await exec('git rev-parse --abbrev-ref HEAD', { cwd: projectRoot });
                const currentBranch = branchResult.stdout.trim();

                const remoteResult = await exec(`git rev-parse origin/${currentBranch}`, { cwd: projectRoot });
                remoteCommit = remoteResult.stdout.trim();

                // Check if remote is ahead
                if (currentCommit !== remoteCommit) {
                    const behindResult = await exec(`git rev-list --count ${currentCommit}..${remoteCommit}`, { cwd: projectRoot });
                    behindBy = parseInt(behindResult.stdout.trim()) || 0;

                    if (behindBy > 0) {
                        updateAvailable = true;
                        logger.info(`Update available: ${behindBy} commits behind remote`);
                    }
                } else {
                    logger.info('System is up to date with remote');
                }
            } catch (gitError) {
                logger.warn('Could not check Git status for updates:', gitError.message);
            }
        } catch (error) {
            logger.error(`Error checking update status:`, error.message);
        }

        res.json({
            success: true,
            updateAvailable,
            updateScript: updateScript ? path.basename(updateScript) : null,
            currentCommit: currentCommit ? currentCommit.substring(0, 7) : 'unknown',
            remoteCommit: remoteCommit ? remoteCommit.substring(0, 7) : 'unknown',
            behindBy
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
