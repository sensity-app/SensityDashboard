/**
 * User-based Rate Limiting Middleware
 * Implements per-user rate limiting with Redis storage
 * Provides different rate limits for different user roles
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');

class UserRateLimiter {
    constructor(redis) {
        this.redis = redis;

        // Rate limit configurations per role
        this.limits = {
            admin: {
                points: 2000,      // Number of requests
                duration: 900,      // Per 15 minutes (900 seconds)
                blockDuration: 900  // Block for 15 minutes if exceeded
            },
            user: {
                points: 500,
                duration: 900,
                blockDuration: 900
            },
            viewer: {
                points: 200,
                duration: 900,
                blockDuration: 900
            },
            api: {
                points: 5000,       // Higher limit for API clients
                duration: 900,
                blockDuration: 1800
            },
            guest: {
                points: 100,        // Very limited for unauthenticated
                duration: 900,
                blockDuration: 1800
            }
        };

        // Endpoint-specific limits (more restrictive)
        this.endpointLimits = {
            login: {
                points: 5,
                duration: 900,
                blockDuration: 3600  // 1 hour block for failed logins
            },
            export: {
                points: 10,
                duration: 3600,      // 10 exports per hour
                blockDuration: 3600
            },
            'device-control': {
                points: 100,
                duration: 3600,      // 100 control actions per hour
                blockDuration: 1800
            },
            'firmware-upload': {
                points: 20,
                duration: 3600,      // 20 uploads per hour
                blockDuration: 3600
            }
        };
    }

    /**
     * Express middleware for rate limiting
     */
    middleware(options = {}) {
        return async (req, res, next) => {
            try {
                // Determine user identifier
                const userId = req.user?.id || req.ip;
                const userRole = req.user?.role || 'guest';

                // Determine which limit to apply
                const endpointType = options.endpointType || this.detectEndpointType(req);
                const limitConfig = endpointType && this.endpointLimits[endpointType]
                    ? this.endpointLimits[endpointType]
                    : this.limits[userRole] || this.limits.guest;

                // Check rate limit
                const rateLimitResult = await this.checkRateLimit(
                    userId,
                    userRole,
                    endpointType,
                    limitConfig
                );

                // Add rate limit info to response headers
                res.setHeader('X-RateLimit-Limit', limitConfig.points);
                res.setHeader('X-RateLimit-Remaining', Math.max(0, rateLimitResult.remaining));
                res.setHeader('X-RateLimit-Reset', rateLimitResult.resetTime);

                if (!rateLimitResult.allowed) {
                    // Rate limit exceeded
                    const retryAfter = rateLimitResult.retryAfter;
                    res.setHeader('Retry-After', retryAfter);

                    logger.warn('Rate limit exceeded', {
                        userId,
                        userRole,
                        endpointType,
                        ip: req.ip,
                        path: req.path
                    });

                    return res.status(429).json({
                        error: 'Rate limit exceeded',
                        message: `Too many requests. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`,
                        retryAfter,
                        limit: limitConfig.points,
                        duration: limitConfig.duration
                    });
                }

                // Request allowed
                next();
            } catch (error) {
                logger.error('Rate limiter error:', error);
                // Fail open - allow request if rate limiter fails
                next();
            }
        };
    }

    /**
     * Check if user has exceeded rate limit
     */
    async checkRateLimit(userId, userRole, endpointType, limitConfig) {
        const key = this.generateKey(userId, userRole, endpointType);
        const blockKey = `${key}:blocked`;
        const now = Date.now();

        // Check if user is blocked
        const isBlocked = await this.redis.get(blockKey);
        if (isBlocked) {
            const ttl = await this.redis.ttl(blockKey);
            return {
                allowed: false,
                remaining: 0,
                resetTime: now + (ttl * 1000),
                retryAfter: ttl
            };
        }

        // Get current request count
        const current = await this.redis.get(key);
        const count = current ? parseInt(current) : 0;
        const remaining = limitConfig.points - count - 1;

        // Get TTL of current window
        let ttl = await this.redis.ttl(key);
        if (ttl === -1 || !current) {
            // Key doesn't exist or has no expiry, set new window
            ttl = limitConfig.duration;
        }

        const resetTime = now + (ttl * 1000);

        if (count >= limitConfig.points) {
            // Exceeded limit - block user
            await this.redis.setex(
                blockKey,
                limitConfig.blockDuration,
                now.toString()
            );

            logger.warn('User blocked due to rate limit', {
                userId,
                userRole,
                endpointType,
                count,
                limit: limitConfig.points
            });

            return {
                allowed: false,
                remaining: 0,
                resetTime,
                retryAfter: limitConfig.blockDuration
            };
        }

        // Increment counter
        if (current) {
            await this.redis.incr(key);
        } else {
            await this.redis.setex(key, limitConfig.duration, '1');
        }

        return {
            allowed: true,
            remaining,
            resetTime,
            retryAfter: 0
        };
    }

    /**
     * Generate Redis key for rate limiting
     */
    generateKey(userId, userRole, endpointType) {
        const prefix = 'ratelimit';
        if (endpointType) {
            return `${prefix}:${endpointType}:${userId}`;
        }
        return `${prefix}:${userRole}:${userId}`;
    }

    /**
     * Detect endpoint type from request
     */
    detectEndpointType(req) {
        const path = req.path.toLowerCase();

        if (path.includes('/auth/login')) return 'login';
        if (path.includes('/export')) return 'export';
        if (path.includes('/control') || path.includes('/command')) return 'device-control';
        if (path.includes('/firmware') && req.method === 'POST') return 'firmware-upload';

        return null;
    }

    /**
     * Reset rate limit for a user (admin function)
     */
    async resetUserLimit(userId, userRole = null, endpointType = null) {
        const keys = [];

        if (userRole && endpointType) {
            keys.push(this.generateKey(userId, userRole, endpointType));
            keys.push(`${this.generateKey(userId, userRole, endpointType)}:blocked`);
        } else if (userRole) {
            keys.push(this.generateKey(userId, userRole, null));
            keys.push(`${this.generateKey(userId, userRole, null)}:blocked`);
        } else {
            // Reset all limits for user
            const pattern = `ratelimit:*:${userId}*`;
            const allKeys = await this.redis.keys(pattern);
            keys.push(...allKeys);
        }

        if (keys.length > 0) {
            await this.redis.del(...keys);
            logger.info('Rate limit reset', { userId, userRole, endpointType, keysDeleted: keys.length });
        }

        return keys.length;
    }

    /**
     * Get rate limit status for a user
     */
    async getUserStatus(userId, userRole) {
        const key = this.generateKey(userId, userRole, null);
        const blockKey = `${key}:blocked`;

        const [current, blocked, ttl, blockTtl] = await Promise.all([
            this.redis.get(key),
            this.redis.get(blockKey),
            this.redis.ttl(key),
            this.redis.ttl(blockKey)
        ]);

        const limitConfig = this.limits[userRole] || this.limits.guest;
        const count = current ? parseInt(current) : 0;

        return {
            userId,
            userRole,
            isBlocked: !!blocked,
            requestCount: count,
            limit: limitConfig.points,
            remaining: Math.max(0, limitConfig.points - count),
            resetIn: ttl > 0 ? ttl : 0,
            blockedFor: blockTtl > 0 ? blockTtl : 0
        };
    }

    /**
     * Get all blocked users
     */
    async getBlockedUsers() {
        const pattern = 'ratelimit:*:blocked';
        const keys = await this.redis.keys(pattern);

        const blocked = await Promise.all(
            keys.map(async (key) => {
                const ttl = await this.redis.ttl(key);
                const parts = key.split(':');
                return {
                    key,
                    userId: parts[parts.length - 1].replace(':blocked', ''),
                    blockedFor: ttl
                };
            })
        );

        return blocked.filter(b => b.blockedFor > 0);
    }

    /**
     * Update rate limit configuration
     */
    updateLimits(role, config) {
        if (this.limits[role]) {
            this.limits[role] = { ...this.limits[role], ...config };
            logger.info('Rate limit configuration updated', { role, config });
        }
    }

    /**
     * Update endpoint-specific limits
     */
    updateEndpointLimits(endpointType, config) {
        if (this.endpointLimits[endpointType]) {
            this.endpointLimits[endpointType] = { ...this.endpointLimits[endpointType], ...config };
            logger.info('Endpoint rate limit updated', { endpointType, config });
        }
    }
}

module.exports = UserRateLimiter;
