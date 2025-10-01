const express = require('express');
const { param, body, query, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const thresholdCalibrationService = require('../services/thresholdCalibrationService');

const router = express.Router();

// POST /api/threshold-calibration/devices/:deviceId/sensors/:sensorId/calculate
// Calculate dynamic thresholds for a specific sensor
router.post('/devices/:deviceId/sensors/:sensorId/calculate', [
    param('deviceId').notEmpty(),
    param('sensorId').isInt({ min: 1 }),
    body('timeWindow').optional().isInt({ min: 1, max: 720 }),
    body('percentileHigh').optional().isInt({ min: 50, max: 99 }),
    body('percentileLow').optional().isInt({ min: 1, max: 50 }),
    body('useTimeOfDay').optional().isBoolean(),
    body('apply').optional().isBoolean()
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { deviceId, sensorId } = req.params;
        const {
            timeWindow,
            percentileHigh,
            percentileLow,
            useTimeOfDay,
            apply = false
        } = req.body;

        // Calculate thresholds
        const thresholds = await thresholdCalibrationService.calculateDynamicThreshold(
            deviceId,
            sensorId,
            {
                timeWindow,
                percentileHigh,
                percentileLow,
                useTimeOfDay
            }
        );

        // Apply thresholds if requested
        if (apply && thresholds.method !== 'default') {
            await thresholdCalibrationService.applyThresholds(deviceId, sensorId, thresholds);
            logger.info(`Thresholds applied for sensor ${sensorId} by user ${req.user.email}`);
        }

        res.json({
            success: true,
            thresholds,
            applied: apply && thresholds.method !== 'default'
        });

    } catch (error) {
        logger.error('Calculate threshold error:', error);
        res.status(500).json({ error: 'Failed to calculate thresholds' });
    }
});

// POST /api/threshold-calibration/devices/:deviceId/calibrate-all
// Auto-calibrate all sensors for a device
router.post('/devices/:deviceId/calibrate-all', [
    param('deviceId').notEmpty()
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { deviceId } = req.params;

        const results = await thresholdCalibrationService.calibrateAllSensors(deviceId);

        logger.info(`Auto-calibration completed for device ${deviceId} by user ${req.user.email}`);

        res.json({
            success: true,
            results
        });

    } catch (error) {
        logger.error('Auto-calibrate device error:', error);
        res.status(500).json({ error: 'Failed to auto-calibrate device' });
    }
});

// PUT /api/threshold-calibration/devices/:deviceId/sensors/:sensorId/config
// Update sensor calibration configuration
router.put('/devices/:deviceId/sensors/:sensorId/config', [
    param('deviceId').notEmpty(),
    param('sensorId').isInt({ min: 1 }),
    body('auto_calibration_enabled').optional().isBoolean(),
    body('calibration_interval_hours').optional().isInt({ min: 1, max: 168 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { deviceId, sensorId } = req.params;
        const { auto_calibration_enabled, calibration_interval_hours } = req.body;

        const result = await db.query(`
            UPDATE device_sensors
            SET auto_calibration_enabled = COALESCE($1, auto_calibration_enabled),
                calibration_interval_hours = COALESCE($2, calibration_interval_hours)
            WHERE id = $3 AND device_id = $4
            RETURNING *
        `, [auto_calibration_enabled, calibration_interval_hours, sensorId, deviceId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sensor not found' });
        }

        logger.info(`Calibration config updated for sensor ${sensorId} by user ${req.user.email}`);

        res.json({
            success: true,
            sensor: result.rows[0]
        });

    } catch (error) {
        logger.error('Update calibration config error:', error);
        res.status(500).json({ error: 'Failed to update calibration configuration' });
    }
});

// GET /api/threshold-calibration/devices/:deviceId/sensors/:sensorId/history
// Get calibration history for a sensor
router.get('/devices/:deviceId/sensors/:sensorId/history', [
    param('deviceId').notEmpty(),
    param('sensorId').isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { deviceId, sensorId } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        // Get calibration metadata from sensor updates
        const result = await db.query(`
            SELECT
                id,
                threshold_min,
                threshold_max,
                last_calibration,
                calibration_metadata,
                auto_calibrated
            FROM device_sensors
            WHERE id = $1 AND device_id = $2
        `, [sensorId, deviceId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sensor not found' });
        }

        res.json({
            success: true,
            sensor: result.rows[0]
        });

    } catch (error) {
        logger.error('Get calibration history error:', error);
        res.status(500).json({ error: 'Failed to get calibration history' });
    }
});

// DELETE /api/threshold-calibration/cache
// Clear calibration cache (admin only)
router.delete('/cache', authenticateToken, requireAdmin, async (req, res) => {
    try {
        thresholdCalibrationService.clearCache();

        logger.info(`Calibration cache cleared by user ${req.user.email}`);

        res.json({
            success: true,
            message: 'Calibration cache cleared successfully'
        });

    } catch (error) {
        logger.error('Clear cache error:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

module.exports = router;
