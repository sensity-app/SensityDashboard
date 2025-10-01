const db = require('../models/database');
const logger = require('../utils/logger');

class ThresholdCalibrationService {
    constructor() {
        this.calibrationCache = new Map();
        this.cacheTimeout = 3600000; // 1 hour cache
    }

    /**
     * Calculate dynamic threshold for a sensor based on historical data
     * @param {string} deviceId - Device ID
     * @param {number} sensorId - Sensor ID
     * @param {object} options - Calibration options
     * @returns {Promise<object>} - Calculated thresholds
     */
    async calculateDynamicThreshold(deviceId, sensorId, options = {}) {
        try {
            const {
                timeWindow = 168, // hours (7 days default)
                percentileHigh = 95, // 95th percentile for max threshold
                percentileLow = 5,   // 5th percentile for min threshold
                smoothingFactor = 0.2, // For exponential smoothing
                useTimeOfDay = true,  // Consider time-of-day patterns
                minDataPoints = 100   // Minimum data points required
            } = options;

            // Check cache first
            const cacheKey = `${deviceId}_${sensorId}`;
            const cached = this.calibrationCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
                return cached.thresholds;
            }

            // Get sensor configuration
            const sensorResult = await db.query(`
                SELECT ds.*, st.name as sensor_type, st.unit
                FROM device_sensors ds
                JOIN sensor_types st ON ds.sensor_type_id = st.id
                WHERE ds.id = $1 AND ds.device_id = $2
            `, [sensorId, deviceId]);

            if (sensorResult.rows.length === 0) {
                throw new Error('Sensor not found');
            }

            const sensor = sensorResult.rows[0];

            // Get historical data
            const historicalData = await this.getHistoricalData(deviceId, sensorId, timeWindow);

            if (historicalData.length < minDataPoints) {
                logger.warn(`Insufficient historical data for sensor ${sensorId} (${historicalData.length} points). Using default thresholds.`);
                return {
                    min_threshold: sensor.threshold_min,
                    max_threshold: sensor.threshold_max,
                    method: 'default',
                    confidence: 'low'
                };
            }

            // Calculate thresholds
            let thresholds;

            if (useTimeOfDay && sensor.sensor_type === 'light') {
                // Special handling for light sensors with time-of-day patterns
                thresholds = await this.calculateTimeBasedThresholds(
                    historicalData,
                    percentileHigh,
                    percentileLow
                );
            } else {
                // Standard statistical threshold calculation
                thresholds = this.calculateStatisticalThresholds(
                    historicalData,
                    percentileHigh,
                    percentileLow,
                    smoothingFactor
                );
            }

            // Add metadata
            thresholds.sensor_id = sensorId;
            thresholds.device_id = deviceId;
            thresholds.sensor_type = sensor.sensor_type;
            thresholds.unit = sensor.unit;
            thresholds.calculated_at = new Date();
            thresholds.data_points = historicalData.length;
            thresholds.time_window_hours = timeWindow;

            // Cache the result
            this.calibrationCache.set(cacheKey, {
                thresholds,
                timestamp: Date.now()
            });

            logger.info(`Dynamic thresholds calculated for sensor ${sensorId}: min=${thresholds.min_threshold}, max=${thresholds.max_threshold}`);

            return thresholds;

        } catch (error) {
            logger.error('Error calculating dynamic threshold:', error);
            throw error;
        }
    }

    /**
     * Get historical telemetry data for threshold calculation
     * @param {string} deviceId - Device ID
     * @param {number} sensorId - Sensor ID
     * @param {number} timeWindowHours - Time window in hours
     * @returns {Promise<Array>} - Historical data points
     */
    async getHistoricalData(deviceId, sensorId, timeWindowHours) {
        const result = await db.query(`
            SELECT
                processed_value as value,
                timestamp,
                EXTRACT(HOUR FROM timestamp) as hour_of_day,
                EXTRACT(DOW FROM timestamp) as day_of_week
            FROM telemetry
            WHERE device_id = $1
                AND device_sensor_id = $2
                AND timestamp >= NOW() - INTERVAL '${timeWindowHours} hours'
                AND processed_value IS NOT NULL
            ORDER BY timestamp ASC
        `, [deviceId, sensorId]);

        return result.rows.map(row => ({
            value: parseFloat(row.value),
            timestamp: row.timestamp,
            hour: parseInt(row.hour_of_day),
            day: parseInt(row.day_of_week)
        }));
    }

    /**
     * Calculate statistical thresholds using percentiles
     * @param {Array} data - Historical data points
     * @param {number} percentileHigh - High percentile
     * @param {number} percentileLow - Low percentile
     * @param {number} smoothingFactor - Exponential smoothing factor
     * @returns {object} - Calculated thresholds
     */
    calculateStatisticalThresholds(data, percentileHigh, percentileLow, smoothingFactor) {
        const values = data.map(d => d.value).sort((a, b) => a - b);

        // Calculate percentiles
        const highIndex = Math.ceil((percentileHigh / 100) * values.length) - 1;
        const lowIndex = Math.floor((percentileLow / 100) * values.length);

        const percentileMax = values[highIndex];
        const percentileMin = values[lowIndex];

        // Calculate mean and standard deviation
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        // Apply exponential smoothing for stability
        const maxThreshold = percentileMax + (smoothingFactor * stdDev);
        const minThreshold = Math.max(0, percentileMin - (smoothingFactor * stdDev));

        return {
            min_threshold: parseFloat(minThreshold.toFixed(2)),
            max_threshold: parseFloat(maxThreshold.toFixed(2)),
            mean: parseFloat(mean.toFixed(2)),
            std_dev: parseFloat(stdDev.toFixed(2)),
            percentile_high: percentileHigh,
            percentile_low: percentileLow,
            method: 'statistical',
            confidence: this.assessConfidence(values.length, stdDev, mean)
        };
    }

    /**
     * Calculate time-based thresholds (for sensors with day/night patterns like light sensors)
     * @param {Array} data - Historical data with time information
     * @param {number} percentileHigh - High percentile
     * @param {number} percentileLow - Low percentile
     * @returns {object} - Time-based threshold configuration
     */
    async calculateTimeBasedThresholds(data, percentileHigh, percentileLow) {
        // Group data by hour of day
        const hourlyData = {};
        for (let hour = 0; hour < 24; hour++) {
            hourlyData[hour] = [];
        }

        data.forEach(point => {
            hourlyData[point.hour].push(point.value);
        });

        // Calculate thresholds for each hour
        const hourlyThresholds = {};
        const allValues = [];

        for (let hour = 0; hour < 24; hour++) {
            const hourValues = hourlyData[hour];
            if (hourValues.length > 0) {
                hourValues.sort((a, b) => a - b);

                const highIndex = Math.ceil((percentileHigh / 100) * hourValues.length) - 1;
                const lowIndex = Math.floor((percentileLow / 100) * hourValues.length);

                hourlyThresholds[hour] = {
                    min: hourValues[lowIndex],
                    max: hourValues[highIndex],
                    avg: hourValues.reduce((sum, v) => sum + v, 0) / hourValues.length,
                    samples: hourValues.length
                };

                allValues.push(...hourValues);
            }
        }

        // Calculate overall fallback thresholds
        allValues.sort((a, b) => a - b);
        const overallHighIndex = Math.ceil((percentileHigh / 100) * allValues.length) - 1;
        const overallLowIndex = Math.floor((percentileLow / 100) * allValues.length);

        return {
            min_threshold: allValues[overallLowIndex],
            max_threshold: allValues[overallHighIndex],
            method: 'time_based',
            hourly_thresholds: hourlyThresholds,
            confidence: this.assessConfidence(allValues.length, null, null)
        };
    }

    /**
     * Assess confidence level based on data quality
     * @param {number} dataPoints - Number of data points
     * @param {number} stdDev - Standard deviation (optional)
     * @param {number} mean - Mean value (optional)
     * @returns {string} - Confidence level: 'high', 'medium', 'low'
     */
    assessConfidence(dataPoints, stdDev, mean) {
        if (dataPoints < 100) return 'low';

        if (stdDev !== null && mean !== null) {
            const coefficientOfVariation = (stdDev / mean) * 100;
            if (dataPoints >= 1000 && coefficientOfVariation < 30) return 'high';
            if (dataPoints >= 500 && coefficientOfVariation < 50) return 'medium';
        } else {
            if (dataPoints >= 1000) return 'high';
            if (dataPoints >= 500) return 'medium';
        }

        return 'low';
    }

    /**
     * Apply calculated thresholds to a sensor
     * @param {string} deviceId - Device ID
     * @param {number} sensorId - Sensor ID
     * @param {object} thresholds - Calculated thresholds
     * @returns {Promise<boolean>} - Success status
     */
    async applyThresholds(deviceId, sensorId, thresholds) {
        try {
            await db.query(`
                UPDATE device_sensors
                SET threshold_min = $1,
                    threshold_max = $2,
                    auto_calibrated = true,
                    last_calibration = CURRENT_TIMESTAMP,
                    calibration_metadata = $3
                WHERE id = $4 AND device_id = $5
            `, [
                thresholds.min_threshold,
                thresholds.max_threshold,
                JSON.stringify({
                    method: thresholds.method,
                    confidence: thresholds.confidence,
                    data_points: thresholds.data_points,
                    calculated_at: thresholds.calculated_at,
                    hourly_thresholds: thresholds.hourly_thresholds || null
                }),
                sensorId,
                deviceId
            ]);

            logger.info(`Applied dynamic thresholds to sensor ${sensorId}: [${thresholds.min_threshold}, ${thresholds.max_threshold}]`);
            return true;

        } catch (error) {
            logger.error('Error applying thresholds:', error);
            return false;
        }
    }

    /**
     * Auto-calibrate all sensors for a device
     * @param {string} deviceId - Device ID
     * @returns {Promise<object>} - Calibration results
     */
    async calibrateAllSensors(deviceId) {
        try {
            const sensorsResult = await db.query(`
                SELECT id, sensor_type_id, auto_calibration_enabled
                FROM device_sensors
                WHERE device_id = $1 AND enabled = true
            `, [deviceId]);

            const results = {
                device_id: deviceId,
                calibrated: [],
                skipped: [],
                failed: []
            };

            for (const sensor of sensorsResult.rows) {
                if (!sensor.auto_calibration_enabled) {
                    results.skipped.push({
                        sensor_id: sensor.id,
                        reason: 'auto_calibration_disabled'
                    });
                    continue;
                }

                try {
                    const thresholds = await this.calculateDynamicThreshold(deviceId, sensor.id);

                    if (thresholds.method !== 'default') {
                        await this.applyThresholds(deviceId, sensor.id, thresholds);
                        results.calibrated.push({
                            sensor_id: sensor.id,
                            thresholds: thresholds
                        });
                    } else {
                        results.skipped.push({
                            sensor_id: sensor.id,
                            reason: 'insufficient_data'
                        });
                    }

                } catch (error) {
                    logger.error(`Failed to calibrate sensor ${sensor.id}:`, error);
                    results.failed.push({
                        sensor_id: sensor.id,
                        error: error.message
                    });
                }
            }

            return results;

        } catch (error) {
            logger.error('Error calibrating sensors:', error);
            throw error;
        }
    }

    /**
     * Clear calibration cache
     */
    clearCache() {
        this.calibrationCache.clear();
        logger.info('Threshold calibration cache cleared');
    }
}

// Export singleton instance
module.exports = new ThresholdCalibrationService();
