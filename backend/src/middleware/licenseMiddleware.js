/**
 * License Middleware
 * Enforces license restrictions on API endpoints
 */

const licenseService = require('../services/licenseService');
const logger = require('../utils/logger');

/**
 * Check if license is valid
 */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const requireValidLicense = async (req, res, next) => {
    try {
        const status = await licenseService.getLicenseStatus();

        if (!status.valid) {
            if (READ_METHODS.has(req.method)) {
                logger.warn('License inactive - allowing read-only access', {
                    path: req.originalUrl,
                    method: req.method
                });
                req.license = status;
                res.setHeader('X-License-Warning', status.message || 'License inactive');
                return next();
            }

            return res.status(403).json({
                error: 'Invalid or expired license',
                message: status.message || 'Please activate a valid license to continue',
                requires_activation: status.requires_activation
            });
        }

        // Attach license info to request
        req.license = status;
        next();
    } catch (error) {
        logger.error('License validation error:', error);

        // For telemetry endpoints, allow through even if license validation fails
        // This prevents devices from being blocked due to backend issues
        if (req.path && req.path.includes('/telemetry')) {
            logger.warn('Allowing telemetry despite license validation error');
            req.license = { valid: false, error: true };
            return next();
        }

        return res.status(500).json({
            error: 'License validation failed',
            message: 'Could not validate license'
        });
    }
};

/**
 * Check if a specific feature is enabled
 */
const requireFeature = (featureName) => {
    return async (req, res, next) => {
        try {
            const enabled = await licenseService.isFeatureEnabled(featureName);

            if (!enabled) {
                const status = await licenseService.getLicenseStatus();
                return res.status(403).json({
                    error: 'Feature not available',
                    message: `This feature requires a ${featureName} license`,
                    current_license: status.license_type,
                    upgrade_required: true
                });
            }

            next();
        } catch (error) {
            logger.error('Feature check error:', error);
            return res.status(500).json({
                error: 'Feature validation failed'
            });
        }
    };
};

/**
 * Check device limit before creating new device
 */
const checkDeviceLimit = async (req, res, next) => {
    try {
        const limits = await licenseService.checkUsageLimits();

        if (!limits.devices_ok) {
            return res.status(403).json({
                error: 'Device limit exceeded',
                message: `Your license allows ${limits.max_devices} devices. Currently using ${limits.current_devices}.`,
                current_devices: limits.current_devices,
                max_devices: limits.max_devices,
                upgrade_required: true
            });
        }

        next();
    } catch (error) {
        logger.error('Device limit check error:', error);
        // Allow operation on error (fail-open for better UX)
        next();
    }
};

/**
 * Check user limit before creating new user
 */
const checkUserLimit = async (req, res, next) => {
    try {
        const limits = await licenseService.checkUsageLimits();

        if (!limits.users_ok) {
            return res.status(403).json({
                error: 'User limit exceeded',
                message: `Your license allows ${limits.max_users} users. Currently using ${limits.current_users}.`,
                current_users: limits.current_users,
                max_users: limits.max_users,
                upgrade_required: true
            });
        }

        next();
    } catch (error) {
        logger.error('User limit check error:', error);
        // Allow operation on error (fail-open for better UX)
        next();
    }
};

/**
 * Add license info to response headers
 */
const addLicenseHeaders = async (req, res, next) => {
    try {
        const status = await licenseService.getLicenseStatus();

        res.setHeader('X-License-Type', status.license_type || 'none');
        res.setHeader('X-License-Status', status.status || 'inactive');

        if (status.days_until_expiry !== null && status.days_until_expiry <= 30) {
            res.setHeader('X-License-Expiring-Soon', status.days_until_expiry.toString());
        }

        next();
    } catch (error) {
        // Don't fail request if headers can't be set
        next();
    }
};

/**
 * Check if license is expiring soon (warning, not blocking)
 */
const warnIfExpiringSoon = async (req, res, next) => {
    try {
        const status = await licenseService.getLicenseStatus();

        if (status.days_until_expiry !== null && status.days_until_expiry <= 7) {
            // Add warning to response
            const originalJson = res.json.bind(res);
            res.json = function(data) {
                data._license_warning = {
                    message: `Your license expires in ${status.days_until_expiry} days`,
                    expires_at: status.expires_at
                };
                return originalJson(data);
            };
        }

        next();
    } catch (error) {
        next();
    }
};

module.exports = {
    requireValidLicense,
    requireFeature,
    checkDeviceLimit,
    checkUserLimit,
    addLicenseHeaders,
    warnIfExpiringSoon
};
