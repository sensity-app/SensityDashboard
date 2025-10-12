/**
 * License Management Routes
 * Handles license activation, status, and management
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const licenseService = require('../services/licenseService');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/license/status - Get current license status
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const status = await licenseService.getLicenseStatus();

        res.json({
            success: true,
            license: status
        });
    } catch (error) {
        logger.error('Get license status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get license status'
        });
    }
});

// POST /api/license/activate - Activate a new license key
router.post('/activate', [
    authenticateToken,
    requireAdmin,
    body('license_key').notEmpty().trim().isLength({ min: 20, max: 255 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { license_key } = req.body;

        logger.info(`License activation attempt by ${req.user.email}`);

        const result = await licenseService.activateLicense(license_key);

        if (result.success) {
            logger.info(`License activated successfully by ${req.user.email}`);
            res.json({
                success: true,
                message: result.message,
                license: result.license
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.message
            });
        }
    } catch (error) {
        logger.error('License activation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to activate license'
        });
    }
});

// POST /api/license/validate - Manually trigger license validation
router.post('/validate', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const cached = await licenseService.loadCachedLicense();

        if (!cached) {
            return res.status(400).json({
                success: false,
                error: 'No license found. Please activate a license first.'
            });
        }

        logger.info(`Manual license validation triggered by ${req.user.email}`);

        const validation = await licenseService.validateWithServer(cached.license_key);

        res.json({
            success: validation.valid,
            validation
        });
    } catch (error) {
        logger.error('License validation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to validate license'
        });
    }
});

// GET /api/license/features - Get available features for current license
router.get('/features', authenticateToken, async (req, res) => {
    try {
        const status = await licenseService.getLicenseStatus();
        const cached = await licenseService.loadCachedLicense();

        if (!cached) {
            return res.json({
                success: true,
                features: {
                    basic_monitoring: true,
                    device_management: true,
                    audit_logging: false,
                    analytics_advanced: false,
                    white_label: false,
                    api_access: false,
                    priority_support: false
                }
            });
        }

        const features = typeof cached.features === 'string'
            ? JSON.parse(cached.features)
            : cached.features;

        res.json({
            success: true,
            license_type: cached.license_type,
            features
        });
    } catch (error) {
        logger.error('Get features error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get features'
        });
    }
});

// GET /api/license/limits - Get current usage vs limits
router.get('/limits', authenticateToken, async (req, res) => {
    try {
        const limits = await licenseService.checkUsageLimits();
        const cached = await licenseService.loadCachedLicense();

        res.json({
            success: true,
            license_type: cached?.license_type || 'none',
            limits: {
                devices: {
                    current: limits.current_devices,
                    max: limits.max_devices,
                    available: limits.max_devices - limits.current_devices,
                    percentage_used: Math.round((limits.current_devices / limits.max_devices) * 100)
                },
                users: {
                    current: limits.current_users,
                    max: limits.max_users,
                    available: limits.max_users - limits.current_users,
                    percentage_used: Math.round((limits.current_users / limits.max_users) * 100)
                }
            }
        });
    } catch (error) {
        logger.error('Get limits error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get limits'
        });
    }
});

// DELETE /api/license - Remove current license (admin only)
router.delete('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = require('../models/database');

        await db.query('DELETE FROM local_license_info');

        licenseService.cachedLicense = null;
        licenseService.lastCheck = null;

        logger.info(`License removed by ${req.user.email}`);

        res.json({
            success: true,
            message: 'License removed successfully'
        });
    } catch (error) {
        logger.error('Remove license error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove license'
        });
    }
});

// GET /api/license/info - Get detailed license information (admin only)
router.get('/info', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const cached = await licenseService.loadCachedLicense();

        if (!cached) {
            return res.json({
                success: true,
                license: null,
                message: 'No license configured'
            });
        }

        // Don't expose the full license key
        const maskedKey = cached.license_key
            ? cached.license_key.substring(0, 10) + '...' + cached.license_key.substring(cached.license_key.length - 5)
            : null;

        res.json({
            success: true,
            license: {
                license_key: maskedKey,
                license_type: cached.license_type,
                status: cached.status,
                max_devices: cached.max_devices,
                max_users: cached.max_users,
                features: typeof cached.features === 'string' ? JSON.parse(cached.features) : cached.features,
                expires_at: cached.expires_at,
                activated_at: cached.activated_at,
                last_validated_at: cached.last_validated_at,
                next_validation_due: cached.next_validation_due,
                is_offline_mode: cached.is_offline_mode,
                validation_failures: cached.validation_failures,
                grace_period_ends_at: cached.grace_period_ends_at,
                instance_id: cached.instance_id,
                hardware_id: cached.hardware_id
            }
        });
    } catch (error) {
        logger.error('Get license info error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get license info'
        });
    }
});

module.exports = router;
