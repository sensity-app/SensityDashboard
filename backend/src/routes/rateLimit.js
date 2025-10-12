/**
 * Rate Limit Management Routes
 * Admin endpoints for monitoring and managing rate limits
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

module.exports = (rateLimiter) => {
    /**
     * GET /api/rate-limits/status/:userId
     * Get rate limit status for a specific user
     */
    router.get('/status/:userId', async (req, res) => {
        try {
            const { userId } = req.params;
            const { role = 'user' } = req.query;

            const status = await rateLimiter.getUserStatus(userId, role);

            res.json({
                success: true,
                status
            });
        } catch (error) {
            logger.error('Error getting rate limit status:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get rate limit status'
            });
        }
    });

    /**
     * GET /api/rate-limits/blocked
     * Get all blocked users
     */
    router.get('/blocked', async (req, res) => {
        try {
            const blocked = await rateLimiter.getBlockedUsers();

            res.json({
                success: true,
                blocked,
                count: blocked.length
            });
        } catch (error) {
            logger.error('Error getting blocked users:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get blocked users'
            });
        }
    });

    /**
     * POST /api/rate-limits/reset/:userId
     * Reset rate limit for a user (admin only)
     */
    router.post('/reset/:userId', async (req, res) => {
        try {
            // Check admin permission
            if (!req.user || req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }

            const { userId } = req.params;
            const { role, endpointType } = req.body;

            const keysDeleted = await rateLimiter.resetUserLimit(userId, role, endpointType);

            logger.info('Rate limit reset by admin', {
                adminId: req.user.id,
                targetUserId: userId,
                role,
                endpointType,
                keysDeleted
            });

            res.json({
                success: true,
                message: 'Rate limit reset successfully',
                keysDeleted
            });
        } catch (error) {
            logger.error('Error resetting rate limit:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to reset rate limit'
            });
        }
    });

    /**
     * GET /api/rate-limits/config
     * Get current rate limit configuration
     */
    router.get('/config', (req, res) => {
        try {
            res.json({
                success: true,
                limits: rateLimiter.limits,
                endpointLimits: rateLimiter.endpointLimits
            });
        } catch (error) {
            logger.error('Error getting rate limit config:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get rate limit configuration'
            });
        }
    });

    /**
     * PUT /api/rate-limits/config/:role
     * Update rate limit configuration for a role (admin only)
     */
    router.put('/config/:role', async (req, res) => {
        try {
            // Check admin permission
            if (!req.user || req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }

            const { role } = req.params;
            const { points, duration, blockDuration } = req.body;

            // Validate inputs
            if (!rateLimiter.limits[role]) {
                return res.status(404).json({
                    success: false,
                    error: `Role '${role}' not found`
                });
            }

            if (points !== undefined && (points < 1 || points > 100000)) {
                return res.status(400).json({
                    success: false,
                    error: 'Points must be between 1 and 100000'
                });
            }

            if (duration !== undefined && (duration < 60 || duration > 86400)) {
                return res.status(400).json({
                    success: false,
                    error: 'Duration must be between 60 and 86400 seconds'
                });
            }

            const config = {};
            if (points !== undefined) config.points = points;
            if (duration !== undefined) config.duration = duration;
            if (blockDuration !== undefined) config.blockDuration = blockDuration;

            rateLimiter.updateLimits(role, config);

            logger.info('Rate limit config updated', {
                adminId: req.user.id,
                role,
                config
            });

            res.json({
                success: true,
                message: 'Rate limit configuration updated',
                newConfig: rateLimiter.limits[role]
            });
        } catch (error) {
            logger.error('Error updating rate limit config:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update rate limit configuration'
            });
        }
    });

    /**
     * PUT /api/rate-limits/endpoint-config/:endpointType
     * Update rate limit configuration for an endpoint type (admin only)
     */
    router.put('/endpoint-config/:endpointType', async (req, res) => {
        try {
            // Check admin permission
            if (!req.user || req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }

            const { endpointType } = req.params;
            const { points, duration, blockDuration } = req.body;

            // Validate inputs
            if (!rateLimiter.endpointLimits[endpointType]) {
                return res.status(404).json({
                    success: false,
                    error: `Endpoint type '${endpointType}' not found`
                });
            }

            const config = {};
            if (points !== undefined) config.points = points;
            if (duration !== undefined) config.duration = duration;
            if (blockDuration !== undefined) config.blockDuration = blockDuration;

            rateLimiter.updateEndpointLimits(endpointType, config);

            logger.info('Endpoint rate limit config updated', {
                adminId: req.user.id,
                endpointType,
                config
            });

            res.json({
                success: true,
                message: 'Endpoint rate limit configuration updated',
                newConfig: rateLimiter.endpointLimits[endpointType]
            });
        } catch (error) {
            logger.error('Error updating endpoint rate limit config:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update endpoint rate limit configuration'
            });
        }
    });

    /**
     * GET /api/rate-limits/stats
     * Get rate limit statistics across all users
     */
    router.get('/stats', async (req, res) => {
        try {
            const blocked = await rateLimiter.getBlockedUsers();

            // Get total number of active rate limit keys
            const pattern = 'ratelimit:*';
            const keys = await rateLimiter.redis.keys(pattern);
            const activeUsers = new Set(
                keys
                    .filter(k => !k.includes(':blocked'))
                    .map(k => k.split(':').pop())
            ).size;

            res.json({
                success: true,
                stats: {
                    totalBlockedUsers: blocked.length,
                    activeRateLimitedUsers: activeUsers,
                    totalRateLimitKeys: keys.length
                },
                blocked: blocked.slice(0, 10) // Return only top 10 blocked users
            });
        } catch (error) {
            logger.error('Error getting rate limit stats:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get rate limit statistics'
            });
        }
    });

    return router;
};
