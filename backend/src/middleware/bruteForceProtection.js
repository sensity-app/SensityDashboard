const db = require('../models/database');
const logger = require('../utils/logger');
const Redis = require('ioredis');

// Initialize Redis for rate limiting (faster than database)
const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    retryDelayOnFailover: 100,
    enableOfflineQueue: false,
});

/**
 * Brute Force Protection Configuration
 */
const CONFIG = {
    // Account lockout settings
    MAX_FAILED_ATTEMPTS: 5,        // Lock account after X failed attempts
    LOCKOUT_DURATION: 30 * 60,     // Lock for 30 minutes (seconds)
    RESET_ATTEMPTS_AFTER: 15 * 60, // Reset failed attempts after 15 minutes

    // IP-based rate limiting
    MAX_ATTEMPTS_PER_IP: 10,       // Max attempts from single IP
    IP_BAN_DURATION: 60 * 60,      // Ban IP for 1 hour (seconds)

    // Progressive delays
    USE_PROGRESSIVE_DELAYS: true,  // Slow down responses after failures
    DELAY_BASE: 1000,              // Base delay in ms
    DELAY_MULTIPLIER: 2,           // Multiply delay each attempt

    // Suspicious activity thresholds
    SUSPICIOUS_ATTEMPTS_THRESHOLD: 3,
    SUSPICIOUS_IPS_THRESHOLD: 5,   // Same email from multiple IPs

    // CAPTCHA requirement
    CAPTCHA_AFTER_ATTEMPTS: 3,     // Require CAPTCHA after X attempts
};

/**
 * Check if account is locked
 */
async function isAccountLocked(email) {
    try {
        // Check Redis first (faster)
        const lockKey = `account_lock:${email}`;
        const isLocked = await redis.get(lockKey);

        if (isLocked) {
            const ttl = await redis.ttl(lockKey);
            return {
                locked: true,
                remainingTime: ttl
            };
        }

        // Check database for permanent locks
        const result = await db.query(
            `SELECT COUNT(*) as count, MAX(attempted_at) as last_attempt
             FROM failed_login_attempts
             WHERE email = $1
             AND attempted_at > NOW() - INTERVAL '${CONFIG.RESET_ATTEMPTS_AFTER} seconds'
             AND account_locked = true`,
            [email]
        );

        const count = parseInt(result.rows[0].count);
        if (count > 0) {
            const lastAttempt = new Date(result.rows[0].last_attempt);
            const lockExpiry = new Date(lastAttempt.getTime() + CONFIG.LOCKOUT_DURATION * 1000);
            const now = new Date();

            if (now < lockExpiry) {
                const remainingTime = Math.ceil((lockExpiry - now) / 1000);

                // Cache in Redis
                await redis.setex(lockKey, remainingTime, '1');

                return {
                    locked: true,
                    remainingTime
                };
            }
        }

        return { locked: false };
    } catch (error) {
        logger.error('Account lock check error:', error);
        return { locked: false }; // Fail open to not block legitimate users
    }
}

/**
 * Check IP-based rate limiting
 */
async function isIPBlocked(ipAddress) {
    try {
        const blockKey = `ip_block:${ipAddress}`;
        const isBlocked = await redis.get(blockKey);

        if (isBlocked) {
            const ttl = await redis.ttl(blockKey);
            return {
                blocked: true,
                remainingTime: ttl
            };
        }

        // Check attempts from this IP
        const attemptKey = `ip_attempts:${ipAddress}`;
        const attempts = await redis.get(attemptKey);

        if (attempts && parseInt(attempts) >= CONFIG.MAX_ATTEMPTS_PER_IP) {
            // Block this IP
            await redis.setex(blockKey, CONFIG.IP_BAN_DURATION, '1');
            await redis.del(attemptKey);

            logger.warn(`IP blocked due to brute force: ${ipAddress}`, {
                attempts: parseInt(attempts),
                duration: CONFIG.IP_BAN_DURATION
            });

            return {
                blocked: true,
                remainingTime: CONFIG.IP_BAN_DURATION
            };
        }

        return { blocked: false, attempts: parseInt(attempts) || 0 };
    } catch (error) {
        logger.error('IP block check error:', error);
        return { blocked: false };
    }
}

/**
 * Get failed login attempts for email
 */
async function getFailedAttempts(email) {
    try {
        const result = await db.query(
            `SELECT COUNT(*) as count
             FROM failed_login_attempts
             WHERE email = $1
             AND attempted_at > NOW() - INTERVAL '${CONFIG.RESET_ATTEMPTS_AFTER} seconds'`,
            [email]
        );

        return parseInt(result.rows[0].count) || 0;
    } catch (error) {
        logger.error('Get failed attempts error:', error);
        return 0;
    }
}

/**
 * Record failed login attempt
 */
async function recordFailedAttempt(email, ipAddress, userAgent, reason = 'invalid_credentials') {
    try {
        const failedAttempts = await getFailedAttempts(email);
        const newAttemptCount = failedAttempts + 1;
        const shouldLock = newAttemptCount >= CONFIG.MAX_FAILED_ATTEMPTS;

        // Insert into database
        await db.query(
            `INSERT INTO failed_login_attempts (
                email, ip_address, user_agent, failure_reason,
                consecutive_failures, account_locked
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [email, ipAddress, userAgent, reason, newAttemptCount, shouldLock]
        );

        // If should lock, add to Redis
        if (shouldLock) {
            const lockKey = `account_lock:${email}`;
            await redis.setex(lockKey, CONFIG.LOCKOUT_DURATION, '1');

            logger.warn(`Account locked due to failed attempts: ${email}`, {
                attempts: newAttemptCount,
                ipAddress,
                lockDuration: CONFIG.LOCKOUT_DURATION
            });
        }

        // Increment IP attempt counter
        const ipKey = `ip_attempts:${ipAddress}`;
        const ipAttempts = await redis.incr(ipKey);
        if (ipAttempts === 1) {
            await redis.expire(ipKey, CONFIG.RESET_ATTEMPTS_AFTER);
        }

        // Check for suspicious activity
        await checkSuspiciousActivity(email, ipAddress);

        return {
            failedAttempts: newAttemptCount,
            locked: shouldLock,
            requiresCaptcha: newAttemptCount >= CONFIG.CAPTCHA_AFTER_ATTEMPTS
        };
    } catch (error) {
        logger.error('Record failed attempt error:', error);
        throw error;
    }
}

/**
 * Clear failed attempts on successful login
 */
async function clearFailedAttempts(email, ipAddress) {
    try {
        // Clear account lock
        const lockKey = `account_lock:${email}`;
        await redis.del(lockKey);

        // Don't clear IP attempts (IP could still be attacking other accounts)

        logger.info(`Failed attempts cleared for: ${email}`);
    } catch (error) {
        logger.error('Clear failed attempts error:', error);
    }
}

/**
 * Check for suspicious activity patterns
 */
async function checkSuspiciousActivity(email, ipAddress) {
    try {
        // Check if same email being attacked from multiple IPs
        const result = await db.query(
            `SELECT COUNT(DISTINCT ip_address) as ip_count
             FROM failed_login_attempts
             WHERE email = $1
             AND attempted_at > NOW() - INTERVAL '1 hour'`,
            [email]
        );

        const ipCount = parseInt(result.rows[0].ip_count);

        if (ipCount >= CONFIG.SUSPICIOUS_IPS_THRESHOLD) {
            logger.error('SECURITY ALERT: Distributed brute force attack detected', {
                email,
                uniqueIPs: ipCount,
                currentIP: ipAddress
            });

            // Could send alert email to admins here
            // await sendSecurityAlert('distributed_attack', { email, ipCount });
        }

        // Check if IP is attacking multiple accounts
        const ipResult = await db.query(
            `SELECT COUNT(DISTINCT email) as email_count
             FROM failed_login_attempts
             WHERE ip_address = $1
             AND attempted_at > NOW() - INTERVAL '1 hour'`,
            [ipAddress]
        );

        const emailCount = parseInt(ipResult.rows[0].email_count);

        if (emailCount >= CONFIG.SUSPICIOUS_IPS_THRESHOLD) {
            logger.error('SECURITY ALERT: IP attacking multiple accounts', {
                ipAddress,
                uniqueAccounts: emailCount
            });

            // Auto-block this IP
            const blockKey = `ip_block:${ipAddress}`;
            await redis.setex(blockKey, CONFIG.IP_BAN_DURATION * 2, '1'); // Double ban time
        }
    } catch (error) {
        logger.error('Suspicious activity check error:', error);
    }
}

/**
 * Apply progressive delay based on failed attempts
 */
async function applyProgressiveDelay(email) {
    if (!CONFIG.USE_PROGRESSIVE_DELAYS) return;

    try {
        const failedAttempts = await getFailedAttempts(email);

        if (failedAttempts > 0) {
            // Exponential backoff: delay = base * (multiplier ^ attempts)
            const delay = CONFIG.DELAY_BASE * Math.pow(CONFIG.DELAY_MULTIPLIER, Math.min(failedAttempts - 1, 5));

            logger.debug(`Applying progressive delay: ${delay}ms for ${email}`, {
                attempts: failedAttempts
            });

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    } catch (error) {
        logger.error('Progressive delay error:', error);
    }
}

/**
 * Brute force protection middleware
 */
const bruteForceProtection = async (req, res, next) => {
    try {
        const email = req.body.email;
        const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Check if account is locked
        const accountLock = await isAccountLocked(email);
        if (accountLock.locked) {
            const minutes = Math.ceil(accountLock.remainingTime / 60);

            logger.warn('Login attempt on locked account', {
                email,
                ipAddress,
                remainingTime: accountLock.remainingTime
            });

            return res.status(429).json({
                error: 'Account temporarily locked',
                message: `Too many failed login attempts. Please try again in ${minutes} minute(s).`,
                remainingTime: accountLock.remainingTime,
                locked: true
            });
        }

        // Check if IP is blocked
        const ipBlock = await isIPBlocked(ipAddress);
        if (ipBlock.blocked) {
            const minutes = Math.ceil(ipBlock.remainingTime / 60);

            logger.warn('Login attempt from blocked IP', {
                ipAddress,
                email,
                remainingTime: ipBlock.remainingTime
            });

            return res.status(429).json({
                error: 'Too many requests',
                message: `Your IP has been temporarily blocked. Please try again in ${minutes} minute(s).`,
                remainingTime: ipBlock.remainingTime,
                ipBlocked: true
            });
        }

        // Check if CAPTCHA is required
        const failedAttempts = await getFailedAttempts(email);
        if (failedAttempts >= CONFIG.CAPTCHA_AFTER_ATTEMPTS) {
            req.requiresCaptcha = true;

            // If CAPTCHA is required but not provided, reject
            if (!req.body.captchaToken && !req.body.recaptchaToken) {
                return res.status(429).json({
                    error: 'CAPTCHA required',
                    message: 'Please complete the CAPTCHA verification.',
                    requiresCaptcha: true,
                    failedAttempts
                });
            }
        }

        // Apply progressive delay (slow down brute force)
        await applyProgressiveDelay(email);

        // Attach helper functions to request
        req.bruteForce = {
            recordFailure: async (reason = 'invalid_credentials') => {
                return await recordFailedAttempt(
                    email,
                    ipAddress,
                    req.get('User-Agent'),
                    reason
                );
            },
            clearAttempts: async () => {
                return await clearFailedAttempts(email, ipAddress);
            },
            failedAttempts
        };

        next();
    } catch (error) {
        logger.error('Brute force protection error:', error);
        // Don't block on errors - fail open
        next();
    }
};

/**
 * Get brute force statistics (for admin dashboard)
 */
async function getBruteForceStats() {
    try {
        const stats = await db.query(`
            SELECT
                COUNT(*) as total_failed_attempts,
                COUNT(DISTINCT email) as unique_emails,
                COUNT(DISTINCT ip_address) as unique_ips,
                SUM(CASE WHEN account_locked THEN 1 ELSE 0 END) as locked_accounts,
                SUM(CASE WHEN attempted_at > NOW() - INTERVAL '1 hour' THEN 1 ELSE 0 END) as last_hour,
                SUM(CASE WHEN attempted_at > NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) as last_24h
            FROM failed_login_attempts
            WHERE attempted_at > NOW() - INTERVAL '7 days'
        `);

        // Get top attacked accounts
        const topAccounts = await db.query(`
            SELECT email, COUNT(*) as attempts
            FROM failed_login_attempts
            WHERE attempted_at > NOW() - INTERVAL '24 hours'
            GROUP BY email
            ORDER BY attempts DESC
            LIMIT 10
        `);

        // Get top attacking IPs
        const topIPs = await db.query(`
            SELECT ip_address, COUNT(*) as attempts, COUNT(DISTINCT email) as targets
            FROM failed_login_attempts
            WHERE attempted_at > NOW() - INTERVAL '24 hours'
            GROUP BY ip_address
            ORDER BY attempts DESC
            LIMIT 10
        `);

        return {
            summary: stats.rows[0],
            topTargets: topAccounts.rows,
            topAttackers: topIPs.rows
        };
    } catch (error) {
        logger.error('Get brute force stats error:', error);
        throw error;
    }
}

/**
 * Manually unlock an account (admin function)
 */
async function unlockAccount(email) {
    try {
        const lockKey = `account_lock:${email}`;
        await redis.del(lockKey);

        // Clear failed attempts from database
        await db.query(
            `UPDATE failed_login_attempts
             SET account_locked = false
             WHERE email = $1`,
            [email]
        );

        logger.info(`Account manually unlocked: ${email}`);
        return true;
    } catch (error) {
        logger.error('Unlock account error:', error);
        throw error;
    }
}

/**
 * Manually unblock an IP (admin function)
 */
async function unblockIP(ipAddress) {
    try {
        const blockKey = `ip_block:${ipAddress}`;
        const attemptKey = `ip_attempts:${ipAddress}`;

        await redis.del(blockKey);
        await redis.del(attemptKey);

        logger.info(`IP manually unblocked: ${ipAddress}`);
        return true;
    } catch (error) {
        logger.error('Unblock IP error:', error);
        throw error;
    }
}

module.exports = {
    bruteForceProtection,
    isAccountLocked,
    isIPBlocked,
    recordFailedAttempt,
    clearFailedAttempts,
    getBruteForceStats,
    unlockAccount,
    unblockIP,
    CONFIG
};
