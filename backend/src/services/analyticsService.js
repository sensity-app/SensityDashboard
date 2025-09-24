const db = require('../models/database');
const logger = require('../utils/logger');

class AnalyticsService {
    constructor() {
        this.cache = new Map(); // Simple in-memory cache for computed recommendations
        this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
    }

    /**
     * Calculate recommended alert thresholds based on historical data
     * Uses statistical analysis to determine optimal warning/critical levels
     */
    async calculateRecommendedThresholds(deviceId, sensorPin, timeRange = '30d') {
        const cacheKey = `thresholds_${deviceId}_${sensorPin}_${timeRange}`;

        // Check cache first
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        try {
            // Get historical data for the specified time range
            const endDate = new Date();
            const startDate = new Date();

            switch (timeRange) {
                case '7d': startDate.setDate(endDate.getDate() - 7); break;
                case '30d': startDate.setDate(endDate.getDate() - 30); break;
                case '90d': startDate.setDate(endDate.getDate() - 90); break;
                default: startDate.setDate(endDate.getDate() - 30);
            }

            const result = await db.query(`
                SELECT
                    t.processed_value,
                    t.timestamp,
                    ds.sensor_type_id,
                    st.name as sensor_type,
                    st.unit
                FROM telemetry t
                JOIN device_sensors ds ON t.device_sensor_id = ds.id
                JOIN sensor_types st ON ds.sensor_type_id = st.id
                WHERE ds.device_id = $1
                AND ds.pin = $2
                AND t.timestamp >= $3
                AND t.timestamp <= $4
                AND t.processed_value IS NOT NULL
                ORDER BY t.timestamp DESC
            `, [deviceId, sensorPin, startDate, endDate]);

            if (result.rows.length < 50) { // Not enough data for reliable analysis
                return {
                    hasEnoughData: false,
                    dataPoints: result.rows.length,
                    minDataPoints: 50,
                    message: 'Not enough historical data for reliable threshold recommendations. At least 50 data points needed.',
                    sensorType: result.rows[0]?.sensor_type,
                    unit: result.rows[0]?.unit
                };
            }

            const values = result.rows.map(row => parseFloat(row.processed_value));
            const sensorType = result.rows[0].sensor_type;
            const unit = result.rows[0].unit;

            // Calculate statistical measures
            const stats = this.calculateStatistics(values);

            // Generate recommendations based on sensor type and statistics
            const recommendations = this.generateThresholdRecommendations(sensorType, stats, values);

            const analysisResult = {
                hasEnoughData: true,
                dataPoints: values.length,
                timeRange,
                sensorType,
                unit,
                statistics: stats,
                recommendations,
                dataQuality: this.assessDataQuality(values),
                lastAnalyzed: new Date().toISOString()
            };

            // Cache the result
            this.cache.set(cacheKey, {
                data: analysisResult,
                timestamp: Date.now()
            });

            logger.info(`Threshold recommendations calculated for device ${deviceId}, sensor ${sensorPin}`);

            return analysisResult;

        } catch (error) {
            logger.error('Error calculating recommended thresholds:', error);
            throw new Error('Failed to calculate threshold recommendations');
        }
    }

    /**
     * Calculate comprehensive statistics for the dataset
     */
    calculateStatistics(values) {
        if (!values || values.length === 0) return null;

        const sorted = [...values].sort((a, b) => a - b);
        const n = sorted.length;

        // Basic statistics
        const min = Math.min(...values);
        const max = Math.max(...values);
        const sum = values.reduce((a, b) => a + b, 0);
        const mean = sum / n;

        // Variance and standard deviation
        const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
        const stdDev = Math.sqrt(variance);

        // Percentiles
        const q1 = this.percentile(sorted, 25);
        const median = this.percentile(sorted, 50);
        const q3 = this.percentile(sorted, 75);
        const p5 = this.percentile(sorted, 5);
        const p95 = this.percentile(sorted, 95);
        const p99 = this.percentile(sorted, 99);

        // Interquartile range
        const iqr = q3 - q1;

        // Outlier detection using IQR method
        const lowerOutlierBound = q1 - 1.5 * iqr;
        const upperOutlierBound = q3 + 1.5 * iqr;
        const outliers = values.filter(v => v < lowerOutlierBound || v > upperOutlierBound);

        return {
            count: n,
            min,
            max,
            mean: Math.round(mean * 1000) / 1000,
            median: Math.round(median * 1000) / 1000,
            stdDev: Math.round(stdDev * 1000) / 1000,
            variance: Math.round(variance * 1000) / 1000,
            q1: Math.round(q1 * 1000) / 1000,
            q3: Math.round(q3 * 1000) / 1000,
            iqr: Math.round(iqr * 1000) / 1000,
            p5: Math.round(p5 * 1000) / 1000,
            p95: Math.round(p95 * 1000) / 1000,
            p99: Math.round(p99 * 1000) / 1000,
            outlierCount: outliers.length,
            outlierPercentage: Math.round((outliers.length / n) * 100 * 10) / 10
        };
    }

    /**
     * Generate threshold recommendations based on sensor type and statistical analysis
     */
    generateThresholdRecommendations(sensorType, stats, values) {
        const recommendations = {
            method: 'statistical',
            confidence: 'medium',
            reasoning: []
        };

        // Sensor-specific logic
        switch (sensorType.toLowerCase()) {
            case 'temperature':
                return this.generateTemperatureThresholds(stats, recommendations);

            case 'humidity':
                return this.generateHumidityThresholds(stats, recommendations);

            case 'pressure':
                return this.generatePressureThresholds(stats, recommendations);

            case 'light':
            case 'lux':
                return this.generateLightThresholds(stats, recommendations);

            case 'motion':
            case 'pir':
                return this.generateMotionThresholds(stats, recommendations);

            case 'air_quality':
            case 'co2':
                return this.generateAirQualityThresholds(stats, recommendations);

            case 'noise':
            case 'sound':
                return this.generateNoiseThresholds(stats, recommendations);

            default:
                return this.generateGenericThresholds(stats, recommendations);
        }
    }

    generateTemperatureThresholds(stats, recommendations) {
        // Temperature-specific thresholds based on typical indoor/outdoor ranges
        const { mean, stdDev, p5, p95 } = stats;

        recommendations.reasoning.push('Temperature thresholds based on statistical analysis and typical ranges');

        // Conservative approach: use wider ranges for temperature
        const warningRange = Math.max(stdDev * 2, 5); // At least 5°C range
        const criticalRange = Math.max(stdDev * 3, 8); // At least 8°C range

        return {
            ...recommendations,
            warning: {
                min: Math.round((mean - warningRange) * 10) / 10,
                max: Math.round((mean + warningRange) * 10) / 10
            },
            critical: {
                min: Math.round((mean - criticalRange) * 10) / 10,
                max: Math.round((mean + criticalRange) * 10) / 10
            },
            optimal: {
                min: Math.round((mean - stdDev) * 10) / 10,
                max: Math.round((mean + stdDev) * 10) / 10
            },
            confidence: stats.outlierPercentage < 10 ? 'high' : 'medium'
        };
    }

    generateHumidityThresholds(stats, recommendations) {
        const { mean, stdDev, p5, p95 } = stats;

        recommendations.reasoning.push('Humidity thresholds based on comfort and mold prevention');

        // Humidity should generally be between 30-70%
        const warningMin = Math.max(25, mean - stdDev * 2);
        const warningMax = Math.min(75, mean + stdDev * 2);
        const criticalMin = Math.max(15, mean - stdDev * 3);
        const criticalMax = Math.min(85, mean + stdDev * 3);

        return {
            ...recommendations,
            warning: {
                min: Math.round(warningMin),
                max: Math.round(warningMax)
            },
            critical: {
                min: Math.round(criticalMin),
                max: Math.round(criticalMax)
            },
            optimal: {
                min: Math.max(30, Math.round(mean - stdDev)),
                max: Math.min(70, Math.round(mean + stdDev))
            },
            confidence: 'high'
        };
    }

    generatePressureThresholds(stats, recommendations) {
        const { mean, stdDev } = stats;

        recommendations.reasoning.push('Pressure thresholds based on weather pattern changes');

        // Barometric pressure changes of >3-4 hPa often indicate weather changes
        const warningRange = Math.max(stdDev * 1.5, 3);
        const criticalRange = Math.max(stdDev * 2.5, 5);

        return {
            ...recommendations,
            warning: {
                min: Math.round((mean - warningRange) * 10) / 10,
                max: Math.round((mean + warningRange) * 10) / 10
            },
            critical: {
                min: Math.round((mean - criticalRange) * 10) / 10,
                max: Math.round((mean + criticalRange) * 10) / 10
            },
            optimal: {
                min: Math.round((mean - stdDev * 0.5) * 10) / 10,
                max: Math.round((mean + stdDev * 0.5) * 10) / 10
            }
        };
    }

    generateGenericThresholds(stats, recommendations) {
        const { mean, stdDev, p5, p95 } = stats;

        recommendations.reasoning.push('Generic thresholds based on statistical distribution');

        // Use percentile-based approach for unknown sensors
        return {
            ...recommendations,
            warning: {
                min: Math.round(stats.p5 * 1000) / 1000,
                max: Math.round(stats.p95 * 1000) / 1000
            },
            critical: {
                min: Math.round((mean - stdDev * 3) * 1000) / 1000,
                max: Math.round((mean + stdDev * 3) * 1000) / 1000
            },
            optimal: {
                min: Math.round(stats.q1 * 1000) / 1000,
                max: Math.round(stats.q3 * 1000) / 1000
            }
        };
    }

    generateLightThresholds(stats, recommendations) {
        const { mean, stdDev, p5, p95 } = stats;

        recommendations.reasoning.push('Light level thresholds for day/night detection and optimal illumination');

        return {
            ...recommendations,
            warning: {
                min: Math.max(0, Math.round(p5)),
                max: Math.round(p95)
            },
            critical: {
                min: 0,
                max: Math.round(p99 || p95 * 1.2)
            },
            optimal: {
                min: Math.round(stats.q1),
                max: Math.round(stats.q3)
            }
        };
    }

    generateMotionThresholds(stats, recommendations) {
        const { mean } = stats;

        recommendations.reasoning.push('Motion sensor thresholds for activity detection');

        // Motion sensors are typically binary or have low/high activity levels
        return {
            ...recommendations,
            warning: {
                min: 0,
                max: mean > 0.5 ? 1 : Math.round(mean * 2 * 10) / 10
            },
            critical: {
                min: 0,
                max: 1
            },
            optimal: {
                min: 0,
                max: Math.round(mean * 10) / 10
            }
        };
    }

    generateAirQualityThresholds(stats, recommendations) {
        const { mean, stdDev } = stats;

        recommendations.reasoning.push('Air quality thresholds based on health standards');

        // CO2 levels: <1000 good, 1000-2000 acceptable, >2000 poor
        if (stats.max > 500) { // Likely CO2 in ppm
            return {
                ...recommendations,
                warning: {
                    min: 0,
                    max: 1000
                },
                critical: {
                    min: 0,
                    max: 2000
                },
                optimal: {
                    min: 0,
                    max: 800
                },
                confidence: 'high'
            };
        }

        // Generic air quality index
        return {
            ...recommendations,
            warning: {
                min: 0,
                max: Math.round(mean + stdDev * 1.5)
            },
            critical: {
                min: 0,
                max: Math.round(mean + stdDev * 2.5)
            },
            optimal: {
                min: 0,
                max: Math.round(mean + stdDev * 0.5)
            }
        };
    }

    generateNoiseThresholds(stats, recommendations) {
        const { mean, stdDev } = stats;

        recommendations.reasoning.push('Noise level thresholds based on acoustic comfort standards');

        // Noise levels in dB: <40 quiet, 40-60 moderate, >60 loud
        return {
            ...recommendations,
            warning: {
                min: 0,
                max: Math.min(60, Math.round(mean + stdDev * 1.5))
            },
            critical: {
                min: 0,
                max: Math.min(80, Math.round(mean + stdDev * 2.5))
            },
            optimal: {
                min: 0,
                max: Math.min(40, Math.round(mean + stdDev * 0.5))
            }
        };
    }

    /**
     * Calculate percentile value from sorted array
     */
    percentile(sortedArray, percentile) {
        const index = (percentile / 100) * (sortedArray.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index % 1;

        if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1];
        if (lower === upper) return sortedArray[index];

        return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
    }

    /**
     * Assess data quality based on various metrics
     */
    assessDataQuality(values) {
        if (!values || values.length === 0) {
            return { score: 0, issues: ['No data available'] };
        }

        const issues = [];
        let score = 100;

        // Check for sufficient data points
        if (values.length < 100) {
            issues.push(`Limited data points (${values.length}). More data will improve accuracy.`);
            score -= 20;
        }

        // Check for data variability
        const uniqueValues = new Set(values).size;
        const variabilityRatio = uniqueValues / values.length;

        if (variabilityRatio < 0.1) {
            issues.push('Low data variability detected. Sensor might be stuck or have limited range.');
            score -= 15;
        }

        // Check for outliers
        const stats = this.calculateStatistics(values);
        if (stats.outlierPercentage > 15) {
            issues.push(`High outlier percentage (${stats.outlierPercentage}%). Data might be noisy.`);
            score -= 10;
        }

        // Check for extreme values (possible sensor errors)
        const range = stats.max - stats.min;
        if (range > stats.mean * 10 && stats.mean > 0) {
            issues.push('Extremely wide value range detected. Check for sensor calibration issues.');
            score -= 10;
        }

        return {
            score: Math.max(0, score),
            level: score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor',
            issues: issues.length > 0 ? issues : ['Data quality looks good']
        };
    }

    /**
     * Get anomaly detection recommendations
     */
    async detectAnomalies(deviceId, sensorPin, timeRange = '24h') {
        try {
            // Get recent data
            const endDate = new Date();
            const startDate = new Date();

            switch (timeRange) {
                case '1h': startDate.setHours(endDate.getHours() - 1); break;
                case '6h': startDate.setHours(endDate.getHours() - 6); break;
                case '24h': startDate.setDate(endDate.getDate() - 1); break;
                case '7d': startDate.setDate(endDate.getDate() - 7); break;
                default: startDate.setDate(endDate.getDate() - 1);
            }

            const result = await db.query(`
                SELECT processed_value, timestamp
                FROM telemetry t
                JOIN device_sensors ds ON t.device_sensor_id = ds.id
                WHERE ds.device_id = $1 AND ds.pin = $2
                AND t.timestamp >= $3 AND t.timestamp <= $4
                ORDER BY t.timestamp DESC
                LIMIT 1000
            `, [deviceId, sensorPin, startDate, endDate]);

            if (result.rows.length < 10) {
                return { anomalies: [], message: 'Not enough recent data for anomaly detection' };
            }

            const values = result.rows.map(row => ({
                value: parseFloat(row.processed_value),
                timestamp: row.timestamp
            }));

            // Simple anomaly detection using statistical methods
            const recentValues = values.slice(0, 50).map(v => v.value);
            const stats = this.calculateStatistics(recentValues);

            const anomalies = values.filter(point => {
                const value = point.value;
                return value < (stats.mean - stats.stdDev * 3) || value > (stats.mean + stats.stdDev * 3);
            }).slice(0, 10); // Limit to 10 most recent anomalies

            return {
                anomalies: anomalies.map(a => ({
                    value: a.value,
                    timestamp: a.timestamp,
                    deviation: Math.abs(a.value - stats.mean) / stats.stdDev,
                    type: a.value > stats.mean ? 'high' : 'low'
                })),
                statistics: stats,
                timeRange
            };

        } catch (error) {
            logger.error('Error detecting anomalies:', error);
            throw new Error('Failed to detect anomalies');
        }
    }

    /**
     * Clear analysis cache
     */
    clearCache() {
        this.cache.clear();
        logger.info('Analytics cache cleared');
    }
}

module.exports = new AnalyticsService();