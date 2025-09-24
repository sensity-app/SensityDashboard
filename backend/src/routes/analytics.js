const express = require('express');
const { query, validationResult } = require('express-validator');
const { authenticateToken, requireDeviceAccess } = require('../middleware/auth');
const analyticsService = require('../services/analyticsService');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/analytics/sensor-recommendations/:deviceId/:sensorPin
router.get('/sensor-recommendations/:deviceId/:sensorPin',
    authenticateToken,
    requireDeviceAccess,
    [
        query('timeRange').optional().isIn(['7d', '30d', '90d']),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { deviceId, sensorPin } = req.params;
            const { timeRange = '30d' } = req.query;

            const recommendations = await analyticsService.calculateRecommendedThresholds(
                deviceId,
                parseInt(sensorPin),
                timeRange
            );

            logger.info(`Threshold recommendations retrieved for device ${deviceId}, sensor ${sensorPin}`);

            res.json({
                success: true,
                deviceId,
                sensorPin: parseInt(sensorPin),
                timeRange,
                recommendations
            });

        } catch (error) {
            logger.error('Error getting sensor recommendations:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to calculate sensor recommendations'
            });
        }
    }
);

// GET /api/analytics/anomalies/:deviceId/:sensorPin
router.get('/anomalies/:deviceId/:sensorPin',
    authenticateToken,
    requireDeviceAccess,
    [
        query('timeRange').optional().isIn(['1h', '6h', '24h', '7d']),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { deviceId, sensorPin } = req.params;
            const { timeRange = '24h' } = req.query;

            const anomalies = await analyticsService.detectAnomalies(
                deviceId,
                parseInt(sensorPin),
                timeRange
            );

            logger.info(`Anomalies detected for device ${deviceId}, sensor ${sensorPin}: ${anomalies.anomalies.length} found`);

            res.json({
                success: true,
                deviceId,
                sensorPin: parseInt(sensorPin),
                timeRange,
                ...anomalies
            });

        } catch (error) {
            logger.error('Error detecting anomalies:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to detect anomalies'
            });
        }
    }
);

// GET /api/analytics/device-summary/:deviceId
router.get('/device-summary/:deviceId',
    authenticateToken,
    requireDeviceAccess,
    [
        query('timeRange').optional().isIn(['24h', '7d', '30d']),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { deviceId } = req.params;
            const { timeRange = '24h' } = req.query;

            // Get all sensors for this device
            const sensorsResult = await require('../models/database').query(`
                SELECT ds.pin, ds.name, st.name as sensor_type, st.unit
                FROM device_sensors ds
                JOIN sensor_types st ON ds.sensor_type_id = st.id
                WHERE ds.device_id = $1
                ORDER BY ds.pin
            `, [deviceId]);

            if (sensorsResult.rows.length === 0) {
                return res.json({
                    success: true,
                    deviceId,
                    sensors: [],
                    message: 'No sensors found for this device'
                });
            }

            // Get recommendations for each sensor
            const sensorAnalytics = await Promise.allSettled(
                sensorsResult.rows.map(async sensor => {
                    const recommendations = await analyticsService.calculateRecommendedThresholds(
                        deviceId,
                        sensor.pin,
                        timeRange
                    );

                    const anomalies = await analyticsService.detectAnomalies(
                        deviceId,
                        sensor.pin,
                        '24h'
                    );

                    return {
                        pin: sensor.pin,
                        name: sensor.name,
                        sensorType: sensor.sensor_type,
                        unit: sensor.unit,
                        recommendations,
                        recentAnomalies: anomalies.anomalies?.length || 0,
                        dataQuality: recommendations.dataQuality
                    };
                })
            );

            const successfulAnalytics = sensorAnalytics
                .filter(result => result.status === 'fulfilled')
                .map(result => result.value);

            const failedAnalytics = sensorAnalytics
                .filter(result => result.status === 'rejected')
                .length;

            logger.info(`Device analytics summary generated for ${deviceId}: ${successfulAnalytics.length} sensors analyzed`);

            res.json({
                success: true,
                deviceId,
                timeRange,
                sensors: successfulAnalytics,
                summary: {
                    totalSensors: sensorsResult.rows.length,
                    analyzedSensors: successfulAnalytics.length,
                    failedAnalytics,
                    sensorsWithAnomalies: successfulAnalytics.filter(s => s.recentAnomalies > 0).length,
                    averageDataQuality: Math.round(
                        successfulAnalytics.reduce((sum, s) => sum + (s.dataQuality?.score || 0), 0) /
                        Math.max(successfulAnalytics.length, 1)
                    )
                }
            });

        } catch (error) {
            logger.error('Error generating device analytics summary:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to generate device analytics summary'
            });
        }
    }
);

// POST /api/analytics/clear-cache
router.post('/clear-cache',
    authenticateToken,
    async (req, res) => {
        try {
            // Only allow admins to clear cache
            if (req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'Admin privileges required to clear analytics cache'
                });
            }

            analyticsService.clearCache();

            logger.info(`Analytics cache cleared by user ${req.user.email}`);

            res.json({
                success: true,
                message: 'Analytics cache cleared successfully'
            });

        } catch (error) {
            logger.error('Error clearing analytics cache:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to clear analytics cache'
            });
        }
    }
);

module.exports = router;