/**
 * License Validation Service
 * Handles license key validation, feature checks, and grace period management
 */

const crypto = require('crypto');
const axios = require('axios');
const db = require('../models/database');
const logger = require('../utils/logger');
const os = require('os');

// License server URL (configure in .env)
const DEFAULT_LICENSE_ENDPOINTS = [
    'https://licenses.sensity.app/api/v1',
    'https://license.sensity.app/api/v1'
];
const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL || DEFAULT_LICENSE_ENDPOINTS[0];

const getLicenseEndpoints = () => {
    const configured = process.env.LICENSE_SERVER_URL
        ? [process.env.LICENSE_SERVER_URL]
        : DEFAULT_LICENSE_ENDPOINTS;
    return Array.from(new Set(configured.filter(Boolean)));
};

const DEMO_LICENSES = {
    'TRIA-SAMPLE123456789ABCD-DEMO': () => ({
        license_key: 'TRIA-SAMPLE123456789ABCD-DEMO',
        license_type: 'trial',
        max_devices: 10,
        max_users: 3,
        features: {
            audit_logging: false,
            analytics_advanced: false,
            white_label: false,
            api_access: true
        },
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        message: 'Demo trial license activated locally'
    })
};
const LICENSE_CHECK_INTERVAL = parseInt(process.env.LICENSE_CHECK_INTERVAL || '86400000'); // 24 hours
const GRACE_PERIOD_DAYS = parseInt(process.env.LICENSE_GRACE_PERIOD_DAYS || '7');
const OFFLINE_MAX_FAILURES = parseInt(process.env.LICENSE_OFFLINE_MAX_FAILURES || '3');

class LicenseService {
    constructor() {
        this.cachedLicense = null;
        this.lastCheck = null;
        this.validationTimer = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the license service
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            // Load cached license from database
            await this.loadCachedLicense();

            // Start periodic validation
            this.startPeriodicValidation();

            this.isInitialized = true;
            logger.info('License service initialized');
        } catch (error) {
            logger.error('Failed to initialize license service:', error);
            throw error;
        }
    }

    /**
     * Generate hardware fingerprint for license binding
     */
    getHardwareId() {
        try {
            const networkInterfaces = os.networkInterfaces();
            const macs = [];

            for (const iface of Object.values(networkInterfaces)) {
                for (const config of iface) {
                    if (!config.internal && config.mac !== '00:00:00:00:00:00') {
                        macs.push(config.mac);
                    }
                }
            }

            // Use first MAC address or generate from hostname
            const uniqueId = macs[0] || os.hostname();
            return crypto.createHash('sha256').update(uniqueId).digest('hex');
        } catch (error) {
            logger.error('Error generating hardware ID:', error);
            return crypto.createHash('sha256').update(os.hostname()).digest('hex');
        }
    }

    /**
     * Generate unique instance ID
     */
    async getInstanceId() {
        try {
            const result = await db.query('SELECT id FROM users LIMIT 1');
            const firstUserId = result.rows[0]?.id || 'default';
            return crypto.createHash('sha256')
                .update(`${firstUserId}-${this.getHardwareId()}`)
                .digest('hex')
                .substring(0, 32);
        } catch (error) {
            return this.getHardwareId().substring(0, 32);
        }
    }

    /**
     * Validate license key with remote server
     */
    async validateWithServer(licenseKey) {
        const normalizedKey = (licenseKey || '').trim().toUpperCase();

        if (DEMO_LICENSES[normalizedKey]) {
            logger.info('Using built-in demo license fallback');
            const demoLicense = DEMO_LICENSES[normalizedKey]();
            await this.updateLocalCache(demoLicense);
            return {
                valid: true,
                endpoint: 'local-demo',
                ...demoLicense
            };
        }

        const endpoints = getLicenseEndpoints();
        let lastError = null;
        let lastConnectionFailure = false;

        for (const baseUrl of endpoints) {
            try {
                const instanceId = await this.getInstanceId();
                const hardwareId = this.getHardwareId();

                // Get current usage stats
            const [devicesCount, usersCount] = await Promise.all([
                db.query('SELECT COUNT(*) as count FROM devices'),
                db.query('SELECT COUNT(*) as count FROM users')
            ]);

                const response = await axios.post(
                    `${baseUrl}/licenses/validate`,
                    {
                        license_key: licenseKey,
                        instance_id: instanceId,
                        hardware_id: hardwareId,
                        platform_version: process.env.npm_package_version || '1.0.0',
                        device_count: parseInt(devicesCount.rows[0].count),
                        user_count: parseInt(usersCount.rows[0].count)
                    },
                    {
                        timeout: 10000, // 10 seconds timeout
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'Sensity-Platform/1.0'
                        }
                    }
                );

                if (response.data.valid) {
                    // Update local cache
                    await this.updateLocalCache(response.data);
                    logger.info(`License validated successfully via ${baseUrl}`);
                    return {
                        valid: true,
                        endpoint: baseUrl,
                        ...response.data
                    };
                } else {
                    logger.warn(`License validation failed via ${baseUrl}:`, response.data.message);
                    return {
                        valid: false,
                        endpoint: baseUrl,
                        message: response.data.message
                    };
                }
            } catch (error) {
                lastError = error;
                const isConnectionError = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'].includes(error.code);
                lastConnectionFailure = isConnectionError;

                const errorMessage = error.response?.data?.message || error.message;
                logger.warn(`License validation attempt failed via ${baseUrl}: ${errorMessage}`);

                if (!isConnectionError) {
                    break; // No point trying other endpoints for non-connection issues
                }
            }
        }

        if (lastConnectionFailure) {
            logger.warn('All configured license endpoints unavailable, attempting offline validation');
            return await this.handleOfflineValidation(licenseKey);
        }

        logger.error('License validation error:', lastError?.message || 'Unknown error');
        return {
            valid: false,
            message: 'License validation failed: ' + (lastError?.message || 'Unknown error')
        };
    }

    /**
     * Handle offline validation during grace period
     */
    async handleOfflineValidation(licenseKey) {
        try {
            const cached = await this.loadCachedLicense();

            if (!cached || cached.license_key !== licenseKey) {
                return {
                    valid: false,
                    message: 'No cached license found. Online validation required.'
                };
            }

            // Check if license is expired
            if (cached.expires_at && new Date(cached.expires_at) < new Date()) {
                return {
                    valid: false,
                    message: 'License has expired'
                };
            }

            // Check grace period
            const failureCount = cached.validation_failures || 0;

            if (failureCount >= OFFLINE_MAX_FAILURES) {
                // Grace period exceeded
                if (cached.grace_period_ends_at && new Date(cached.grace_period_ends_at) < new Date()) {
                    await this.updateLocalCache({
                        ...cached,
                        status: 'suspended',
                        is_offline_mode: true
                    });

                    return {
                        valid: false,
                        message: 'Grace period exceeded. Please connect to internet to validate license.'
                    };
                }
            }

            // Increment failure count
            await db.query(`
                UPDATE local_license_info
                SET
                    validation_failures = validation_failures + 1,
                    grace_period_started_at = COALESCE(grace_period_started_at, CURRENT_TIMESTAMP),
                    grace_period_ends_at = COALESCE(
                        grace_period_ends_at,
                        CURRENT_TIMESTAMP + INTERVAL '${GRACE_PERIOD_DAYS} days'
                    ),
                    is_offline_mode = true,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [cached.id]);

            logger.info(`Operating in offline mode (${failureCount + 1}/${OFFLINE_MAX_FAILURES} failures)`);

            return {
                valid: true,
                offline_mode: true,
                grace_period_days_remaining: GRACE_PERIOD_DAYS - failureCount,
                ...cached
            };
        } catch (error) {
            logger.error('Offline validation error:', error);
            return {
                valid: false,
                message: 'Failed to validate license offline'
            };
        }
    }

    /**
     * Update local license cache
     */
    async updateLocalCache(licenseData) {
        try {
            // Clear existing cache
            await db.query('DELETE FROM local_license_info');

            // Insert new cache
            await db.query(`
                INSERT INTO local_license_info (
                    license_key,
                    license_type,
                    max_devices,
                    max_users,
                    features,
                    expires_at,
                    activated_at,
                    last_validated_at,
                    next_validation_due,
                    status,
                    is_offline_mode,
                    validation_failures,
                    instance_id,
                    hardware_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `, [
                licenseData.license_key || this.cachedLicense?.license_key,
                licenseData.license_type,
                licenseData.max_devices,
                licenseData.max_users,
                JSON.stringify(licenseData.features || {}),
                licenseData.expires_at,
                licenseData.activated_at || new Date(),
                new Date(),
                new Date(Date.now() + LICENSE_CHECK_INTERVAL),
                licenseData.status || 'active',
                false, // Reset offline mode
                0, // Reset failure count
                await this.getInstanceId(),
                this.getHardwareId()
            ]);

            this.cachedLicense = licenseData;
            this.lastCheck = new Date();

            logger.info('License cache updated');
        } catch (error) {
            logger.error('Failed to update license cache:', error);
            throw error;
        }
    }

    /**
     * Load cached license from database
     */
    async loadCachedLicense() {
        try {
            const result = await db.query('SELECT * FROM local_license_info LIMIT 1');

            if (result.rows.length > 0) {
                this.cachedLicense = result.rows[0];
                this.lastCheck = new Date(this.cachedLicense.last_validated_at);
                return this.cachedLicense;
            }

            return null;
        } catch (error) {
            // Table might not exist yet
            logger.warn('Could not load cached license:', error.message);
            return null;
        }
    }

    /**
     * Check if a feature is enabled
     */
    async isFeatureEnabled(featureName) {
        const license = this.cachedLicense || await this.loadCachedLicense();

        if (!license) {
            // No license - allow basic features only
            const basicFeatures = ['basic_monitoring', 'device_management'];
            return basicFeatures.includes(featureName);
        }

        const features = typeof license.features === 'string'
            ? JSON.parse(license.features)
            : license.features;

        return features[featureName] === true;
    }

    /**
     * Check if device/user limit is exceeded
     */
    async checkUsageLimits() {
        const license = this.cachedLicense || await this.loadCachedLicense();

        if (!license) {
            return {
                devices_ok: false,
                users_ok: false,
                message: 'No valid license found'
            };
        }

        const [devicesCount, usersCount] = await Promise.all([
            db.query('SELECT COUNT(*) as count FROM devices'),
            db.query('SELECT COUNT(*) as count FROM users')
        ]);

        const currentDevices = parseInt(devicesCount.rows[0].count);
        const currentUsers = parseInt(usersCount.rows[0].count);

        return {
            devices_ok: currentDevices <= license.max_devices,
            users_ok: currentUsers <= license.max_users,
            current_devices: currentDevices,
            max_devices: license.max_devices,
            current_users: currentUsers,
            max_users: license.max_users
        };
    }

    /**
     * Get current license status
     */
    async getLicenseStatus() {
        const license = this.cachedLicense || await this.loadCachedLicense();

        if (!license) {
            return {
                valid: false,
                message: 'No license configured',
                requires_activation: true
            };
        }

        const limits = await this.checkUsageLimits();
        const daysUntilExpiry = license.expires_at
            ? Math.ceil((new Date(license.expires_at) - new Date()) / (1000 * 60 * 60 * 24))
            : null;

        return {
            valid: license.status === 'active',
            license_type: license.license_type,
            status: license.status,
            offline_mode: license.is_offline_mode,
            expires_at: license.expires_at,
            days_until_expiry: daysUntilExpiry,
            last_validated_at: license.last_validated_at,
            ...limits
        };
    }

    /**
     * Activate a new license key
     */
    async activateLicense(licenseKey) {
        try {
            const validation = await this.validateWithServer(licenseKey);

            if (validation.valid) {
                logger.info('License activated successfully');
                return {
                    success: true,
                    message: 'License activated successfully',
                    license: validation
                };
            } else {
                return {
                    success: false,
                    message: validation.message || 'License validation failed'
                };
            }
        } catch (error) {
            logger.error('License activation error:', error);
            return {
                success: false,
                message: 'Failed to activate license: ' + error.message
            };
        }
    }

    /**
     * Start periodic license validation
     */
    startPeriodicValidation() {
        if (this.validationTimer) {
            clearInterval(this.validationTimer);
        }

        this.validationTimer = setInterval(async () => {
            try {
                const license = this.cachedLicense || await this.loadCachedLicense();

                if (license) {
                    logger.info('Running periodic license validation');
                    await this.validateWithServer(license.license_key);
                }
            } catch (error) {
                logger.error('Periodic validation error:', error);
            }
        }, LICENSE_CHECK_INTERVAL);

        logger.info(`Periodic license validation started (interval: ${LICENSE_CHECK_INTERVAL}ms)`);
    }

    /**
     * Stop periodic validation
     */
    stopPeriodicValidation() {
        if (this.validationTimer) {
            clearInterval(this.validationTimer);
            this.validationTimer = null;
            logger.info('Periodic license validation stopped');
        }
    }
}

// Singleton instance
const licenseService = new LicenseService();

module.exports = licenseService;
