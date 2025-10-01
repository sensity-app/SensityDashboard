const db = require('../models/database');
const logger = require('../utils/logger');
const analyticsService = require('./analyticsService');

class TelemetryProcessor {
    constructor(redis, websocketService) {
        this.redis = redis;
        this.websocketService = websocketService;
        this.ruleCache = new Map();
        this.lastRuleCacheUpdate = 0;
    }

    async processTelemetryData(deviceId, sensorData) {
        try {
            // Store raw telemetry data
            await this.storeTelemetryData(deviceId, sensorData);

            // Process rules for each sensor reading
            for (const sensor of sensorData) {
                await this.processRulesForSensor(deviceId, sensor);
            }

            // Update device status
            await this.updateDeviceStatus(deviceId, 'online');

            // Broadcast real-time updates
            await this.websocketService.broadcastTelemetryUpdate(deviceId, sensorData);

            // Cache recent data in Redis for fast access
            await this.cacheRecentTelemetry(deviceId, sensorData);

        } catch (error) {
            logger.error(`Error processing telemetry for device ${deviceId}:`, error);
        }
    }

    async storeTelemetryData(deviceId, sensorData) {
        const client = await db.getClient();

        try {
            await client.query('BEGIN');

            for (const sensor of sensorData) {
                // Get device_sensor_id
                const sensorResult = await client.query(`
                    SELECT id FROM device_sensors
                    WHERE device_id = $1 AND pin = $2 AND sensor_type_id = (
                        SELECT id FROM sensor_types WHERE name = $3
                    )
                `, [deviceId, sensor.pin, sensor.type]);

                if (sensorResult.rows.length > 0) {
                    const deviceSensorId = sensorResult.rows[0].id;

                    await client.query(`
                        INSERT INTO telemetry (device_id, device_sensor_id, raw_value, processed_value, timestamp, metadata)
                        VALUES ($1, $2, $3, $4, NOW(), $5)
                    `, [
                        deviceId,
                        deviceSensorId,
                        sensor.raw_value,
                        sensor.processed_value,
                        JSON.stringify({
                            calibration_offset: sensor.calibration_offset || 0,
                            calibration_multiplier: sensor.calibration_multiplier || 1,
                            sensor_name: sensor.name,
                            wifi_rssi: sensor.wifi_rssi
                        })
                    ]);
                }
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async processRulesForSensor(deviceId, sensor) {
        const rules = await this.getSensorRules(deviceId, sensor.pin, sensor.type);

        for (const rule of rules) {
            if (!rule.enabled) continue;

            const isTriggered = await this.evaluateRule(rule, sensor);

            if (isTriggered) {
                await this.createAlert(deviceId, sensor, rule);
            }
        }
    }

    async getSensorRules(deviceId, pin, sensorType) {
        const cacheKey = `rules:${deviceId}:${pin}:${sensorType}`;

        // Check cache first (refresh every 5 minutes)
        if (this.ruleCache.has(cacheKey) &&
            Date.now() - this.lastRuleCacheUpdate < 300000) {
            return this.ruleCache.get(cacheKey);
        }

        const result = await db.query(`
            SELECT sr.*, ds.id as device_sensor_id, ds.name as sensor_name
            FROM sensor_rules sr
            INNER JOIN device_sensors ds ON sr.device_sensor_id = ds.id
            INNER JOIN sensor_types st ON ds.sensor_type_id = st.id
            WHERE ds.device_id = $1 AND ds.pin = $2 AND st.name = $3 AND sr.enabled = true
        `, [deviceId, pin, sensorType]);

        const rules = result.rows;
        this.ruleCache.set(cacheKey, rules);
        this.lastRuleCacheUpdate = Date.now();

        return rules;
    }

    async evaluateRule(rule, sensor) {
        const value = sensor.processed_value;

        switch (rule.condition) {
            case 'greater_than':
                return value > rule.threshold_max;
            case 'less_than':
                return value < rule.threshold_min;
            case 'equals':
                return Math.abs(value - rule.threshold_min) < 0.01;
            case 'between':
                return value >= rule.threshold_min && value <= rule.threshold_max;
            case 'outside_range':
                return value < rule.threshold_min || value > rule.threshold_max;
            case 'rate_of_change':
                return await this.evaluateRateOfChange(rule, sensor);
            case 'pattern':
                return await this.evaluatePattern(rule, sensor);
            case 'dynamic_threshold':
                return await this.evaluateDynamicThreshold(rule, sensor);
            case 'statistical_anomaly':
                return await this.evaluateStatisticalAnomaly(rule, sensor);
            case 'seasonal_anomaly':
                return await this.evaluateSeasonalAnomaly(rule, sensor);
            case 'trend_detection':
                return await this.evaluateTrend(rule, sensor);
            default:
                return false;
        }
    }

    async evaluateRateOfChange(rule, sensor) {
        // Get previous readings within time window
        const result = await db.query(`
            SELECT processed_value, timestamp
            FROM telemetry
            WHERE device_sensor_id = $1
                AND timestamp > NOW() - INTERVAL '1 minute' * $2
            ORDER BY timestamp DESC
            LIMIT 10
        `, [rule.device_sensor_id, rule.time_window_minutes]);

        if (result.rows.length < 2) return false;

        const current = sensor.processed_value;
        const previous = result.rows[1].processed_value;
        const rateOfChange = Math.abs(current - previous);

        return rateOfChange > rule.threshold_max;
    }

    async evaluatePattern(rule, sensor) {
        // Implementation for pattern-based rules (e.g., detecting oscillations, trends)
        // This is a placeholder for advanced pattern detection
        return false;
    }

    async evaluateDynamicThreshold(rule, sensor) {
        try {
            // Get device and sensor info
            const sensorInfo = await db.query(`
                SELECT ds.pin, st.name as sensor_type
                FROM device_sensors ds
                JOIN sensor_types st ON ds.sensor_type_id = st.id
                WHERE ds.id = $1
            `, [rule.device_sensor_id]);

            if (sensorInfo.rows.length === 0) return false;

            const { pin, sensor_type } = sensorInfo.rows[0];

            // Get dynamic thresholds from analytics service
            const analysis = await analyticsService.calculateRecommendedThresholds(
                rule.device_id, pin, rule.time_window || '7d'
            );

            if (!analysis.hasEnoughData || !analysis.recommendations) {
                // Fall back to static thresholds if not enough data
                return sensor.processed_value < rule.threshold_min || sensor.processed_value > rule.threshold_max;
            }

            const thresholds = analysis.recommendations;
            const value = sensor.processed_value;

            // Determine severity level based on rule settings
            switch (rule.severity) {
                case 'critical':
                    return value < thresholds.critical.min || value > thresholds.critical.max;
                case 'high':
                case 'warning':
                    return value < thresholds.warning.min || value > thresholds.warning.max;
                default:
                    return value < thresholds.optimal.min || value > thresholds.optimal.max;
            }

        } catch (error) {
            logger.error('Error evaluating dynamic threshold:', error);
            // Fall back to static threshold comparison
            return sensor.processed_value < rule.threshold_min || sensor.processed_value > rule.threshold_max;
        }
    }

    async evaluateStatisticalAnomaly(rule, sensor) {
        try {
            // Get recent historical data for baseline
            const result = await db.query(`
                SELECT processed_value, timestamp
                FROM telemetry
                WHERE device_sensor_id = $1
                    AND timestamp > NOW() - INTERVAL '1 day' * $2
                    AND timestamp < NOW() - INTERVAL '5 minutes'
                ORDER BY timestamp DESC
                LIMIT 500
            `, [rule.device_sensor_id, rule.time_window_days || 7]);

            if (result.rows.length < 20) return false;

            const historicalValues = result.rows.map(row => parseFloat(row.processed_value));
            const stats = analyticsService.calculateStatistics(historicalValues);

            if (!stats) return false;

            const value = sensor.processed_value;
            const zScore = Math.abs((value - stats.mean) / stats.stdDev);

            // Configurable sensitivity: higher values = less sensitive
            const sensitivity = rule.sensitivity || 3; // Default 3-sigma

            return zScore > sensitivity;

        } catch (error) {
            logger.error('Error evaluating statistical anomaly:', error);
            return false;
        }
    }

    async evaluateSeasonalAnomaly(rule, sensor) {
        try {
            // Get same time period from previous days/weeks for seasonal comparison
            const now = new Date();
            const dayOfWeek = now.getDay();
            const hourOfDay = now.getHours();

            const result = await db.query(`
                SELECT processed_value
                FROM telemetry
                WHERE device_sensor_id = $1
                    AND EXTRACT(DOW FROM timestamp) = $2
                    AND EXTRACT(HOUR FROM timestamp) BETWEEN $3 AND $4
                    AND timestamp > NOW() - INTERVAL '30 days'
                    AND timestamp < NOW() - INTERVAL '1 day'
                ORDER BY timestamp DESC
                LIMIT 100
            `, [rule.device_sensor_id, dayOfWeek, hourOfDay - 1, hourOfDay + 1]);

            if (result.rows.length < 10) {
                // Fall back to general statistical anomaly if not enough seasonal data
                return await this.evaluateStatisticalAnomaly(rule, sensor);
            }

            const seasonalValues = result.rows.map(row => parseFloat(row.processed_value));
            const stats = analyticsService.calculateStatistics(seasonalValues);

            if (!stats) return false;

            const value = sensor.processed_value;
            const zScore = Math.abs((value - stats.mean) / stats.stdDev);

            const sensitivity = rule.sensitivity || 2.5; // Slightly more sensitive for seasonal

            return zScore > sensitivity;

        } catch (error) {
            logger.error('Error evaluating seasonal anomaly:', error);
            return false;
        }
    }

    async evaluateTrend(rule, sensor) {
        try {
            // Get recent readings to analyze trend
            const windowMinutes = rule.time_window_minutes || 60;
            const result = await db.query(`
                SELECT processed_value, timestamp
                FROM telemetry
                WHERE device_sensor_id = $1
                    AND timestamp > NOW() - INTERVAL '1 minute' * $2
                ORDER BY timestamp ASC
            `, [rule.device_sensor_id, windowMinutes]);

            if (result.rows.length < 10) return false;

            const values = result.rows.map((row, index) => ({
                x: index,
                y: parseFloat(row.processed_value)
            }));

            // Calculate linear regression to determine trend
            const n = values.length;
            const sumX = values.reduce((sum, point) => sum + point.x, 0);
            const sumY = values.reduce((sum, point) => sum + point.y, 0);
            const sumXY = values.reduce((sum, point) => sum + (point.x * point.y), 0);
            const sumXX = values.reduce((sum, point) => sum + (point.x * point.x), 0);

            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

            // Determine trend direction and magnitude
            const trendThreshold = rule.threshold_max || 0.1; // Rate of change threshold

            switch (rule.trend_type) {
                case 'increasing':
                    return slope > trendThreshold;
                case 'decreasing':
                    return slope < -trendThreshold;
                case 'stable':
                    return Math.abs(slope) < trendThreshold;
                case 'any_change':
                    return Math.abs(slope) > trendThreshold;
                default:
                    return Math.abs(slope) > trendThreshold;
            }

        } catch (error) {
            logger.error('Error evaluating trend:', error);
            return false;
        }
    }

    async createAlert(deviceId, sensor, rule) {
        try {
            // Check if similar alert already exists (prevent spam)
            const existingAlert = await db.query(`
                SELECT id FROM alerts
                WHERE device_id = $1
                    AND device_sensor_id = $2
                    AND sensor_rule_id = $3
                    AND status = 'active'
                    AND created_at > NOW() - INTERVAL '5 minutes'
            `, [deviceId, rule.device_sensor_id, rule.id]);

            if (existingAlert.rows.length > 0) {
                return; // Don't create duplicate alerts
            }

            const alertResult = await db.query(`
                INSERT INTO alerts (device_id, device_sensor_id, sensor_rule_id, alert_type, severity, message, status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW())
                RETURNING id
            `, [
                deviceId,
                rule.device_sensor_id,
                rule.id,
                'RULE_VIOLATION',
                rule.severity,
                `${rule.rule_name}: ${sensor.name} value ${sensor.processed_value} violates rule condition ${rule.condition}`
            ]);

            const alertId = alertResult.rows[0].id;

            // Get full alert data for broadcasting
            const alertData = await db.query(`
                SELECT a.*, d.name as device_name, l.name as location_name, st.name as sensor_type
                FROM alerts a
                INNER JOIN devices d ON a.device_id = d.id
                LEFT JOIN locations l ON d.location_id = l.id
                INNER JOIN device_sensors ds ON a.device_sensor_id = ds.id
                INNER JOIN sensor_types st ON ds.sensor_type_id = st.id
                WHERE a.id = $1
            `, [alertId]);

            const alert = alertData.rows[0];

            // Broadcast new alert
            await this.websocketService.broadcastNewAlert(alert);

            // Update device status to alarm
            await this.updateDeviceStatus(deviceId, 'alarm');

            logger.info(`Alert created: ${alertId} for device ${deviceId} sensor ${sensor.name}`);

        } catch (error) {
            logger.error('Error creating alert:', error);
        }
    }

    async updateDeviceStatus(deviceId, status) {
        await db.query(`
            UPDATE devices
            SET status = $2, last_heartbeat = NOW(), updated_at = NOW()
            WHERE id = $1
        `, [deviceId, status]);

        // Broadcast status change
        await this.websocketService.broadcastDeviceStatus(deviceId, status);
    }

    async cacheRecentTelemetry(deviceId, sensorData) {
        for (const sensor of sensorData) {
            const key = `telemetry:${deviceId}:${sensor.pin}:recent`;
            const data = {
                ...sensor,
                timestamp: new Date().toISOString()
            };

            await this.redis.lpush(key, JSON.stringify(data));
            await this.redis.ltrim(key, 0, 999); // Keep last 1000 readings
            await this.redis.expire(key, 86400); // 24 hour TTL
        }
    }

    async checkOfflineDevices() {
        try {
            const offlineDevices = await db.query(`
                UPDATE devices
                SET status = 'offline'
                WHERE last_heartbeat < NOW() - INTERVAL '10 minutes'
                    AND status != 'offline'
                RETURNING id, name
            `);

            for (const device of offlineDevices.rows) {
                // Create offline alert
                await db.query(`
                    INSERT INTO alerts (device_id, alert_type, severity, message, status, created_at)
                    VALUES ($1, 'OFFLINE', 'medium', $2, 'active', NOW())
                `, [device.id, `Device ${device.name} has gone offline`]);

                // Broadcast status change
                await this.websocketService.broadcastDeviceStatus(device.id, 'offline');
            }

            if (offlineDevices.rows.length > 0) {
                logger.info(`Marked ${offlineDevices.rows.length} devices as offline`);
            }

        } catch (error) {
            logger.error('Error checking offline devices:', error);
        }
    }

    async cleanupOldTelemetry() {
        try {
            // Keep detailed telemetry for 30 days
            const detailedCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            // Keep aggregated hourly data for 1 year
            const aggregatedCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

            // Create aggregated data before deletion
            await this.createHourlyAggregates(detailedCutoff);

            // Delete old detailed telemetry
            const deletedRows = await db.query(`
                DELETE FROM telemetry
                WHERE timestamp < $1
            `, [detailedCutoff]);

            // Delete very old aggregated data
            await db.query(`
                DELETE FROM telemetry_hourly_aggregates
                WHERE hour_timestamp < $1
            `, [aggregatedCutoff]);

            logger.info(`Cleaned up ${deletedRows.rowCount} old telemetry records`);

        } catch (error) {
            logger.error('Error cleaning up old telemetry:', error);
        }
    }

    async createHourlyAggregates(cutoffDate) {
        // Create aggregation table if it doesn't exist
        await db.query(`
            CREATE TABLE IF NOT EXISTS telemetry_hourly_aggregates (
                id SERIAL PRIMARY KEY,
                device_id VARCHAR(50) REFERENCES devices(id),
                device_sensor_id INTEGER REFERENCES device_sensors(id),
                hour_timestamp TIMESTAMP NOT NULL,
                avg_value DECIMAL(10, 4),
                min_value DECIMAL(10, 4),
                max_value DECIMAL(10, 4),
                sample_count INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(device_id, device_sensor_id, hour_timestamp)
            )
        `);

        // Create hourly aggregates for data older than cutoff
        await db.query(`
            INSERT INTO telemetry_hourly_aggregates (device_id, device_sensor_id, hour_timestamp, avg_value, min_value, max_value, sample_count)
            SELECT
                device_id,
                device_sensor_id,
                DATE_TRUNC('hour', timestamp) as hour_timestamp,
                AVG(processed_value) as avg_value,
                MIN(processed_value) as min_value,
                MAX(processed_value) as max_value,
                COUNT(*) as sample_count
            FROM telemetry
            WHERE timestamp < $1
            GROUP BY device_id, device_sensor_id, DATE_TRUNC('hour', timestamp)
            ON CONFLICT (device_id, device_sensor_id, hour_timestamp) DO NOTHING
        `, [cutoffDate]);
    }

    // Historical data analysis methods
    async getHistoricalTelemetry(deviceId, sensorPin, startDate, endDate, aggregation = 'raw') {
        let query;
        let params = [deviceId, sensorPin, startDate, endDate];

        if (aggregation === 'hourly') {
            query = `
                SELECT
                    hour_timestamp as timestamp,
                    avg_value as value,
                    min_value,
                    max_value,
                    sample_count
                FROM telemetry_hourly_aggregates tha
                INNER JOIN device_sensors ds ON tha.device_sensor_id = ds.id
                WHERE tha.device_id = $1 AND ds.pin = $2
                    AND hour_timestamp BETWEEN $3 AND $4
                ORDER BY hour_timestamp
            `;
        } else if (aggregation === 'daily') {
            query = `
                SELECT
                    DATE_TRUNC('day', hour_timestamp) as timestamp,
                    AVG(avg_value) as value,
                    MIN(min_value) as min_value,
                    MAX(max_value) as max_value,
                    SUM(sample_count) as sample_count
                FROM telemetry_hourly_aggregates tha
                INNER JOIN device_sensors ds ON tha.device_sensor_id = ds.id
                WHERE tha.device_id = $1 AND ds.pin = $2
                    AND hour_timestamp BETWEEN $3 AND $4
                GROUP BY DATE_TRUNC('day', hour_timestamp)
                ORDER BY timestamp
            `;
        } else {
            // Raw data
            query = `
                SELECT timestamp, processed_value as value, raw_value, metadata
                FROM telemetry t
                INNER JOIN device_sensors ds ON t.device_sensor_id = ds.id
                WHERE t.device_id = $1 AND ds.pin = $2
                    AND timestamp BETWEEN $3 AND $4
                ORDER BY timestamp
                LIMIT 10000
            `;
        }

        const result = await db.query(query, params);
        return result.rows;
    }

    async getDeviceStats(deviceId, timeRange = '24h') {
        const intervals = {
            '1h': '1 hour',
            '6h': '6 hours',
            '24h': '24 hours',
            '7d': '7 days',
            '30d': '30 days'
        };

        const interval = intervals[timeRange] || '24 hours';

        const result = await db.query(`
            SELECT
                ds.pin,
                ds.name as sensor_name,
                st.name as sensor_type,
                st.unit,
                COUNT(t.id) as reading_count,
                AVG(t.processed_value) as avg_value,
                MIN(t.processed_value) as min_value,
                MAX(t.processed_value) as max_value,
                STDDEV(t.processed_value) as std_dev
            FROM device_sensors ds
            INNER JOIN sensor_types st ON ds.sensor_type_id = st.id
            LEFT JOIN telemetry t ON ds.id = t.device_sensor_id
                AND t.timestamp > NOW() - INTERVAL $2
            WHERE ds.device_id = $1 AND ds.enabled = true
            GROUP BY ds.id, ds.pin, ds.name, st.name, st.unit
            ORDER BY ds.pin
        `, [deviceId, interval]);

        return result.rows;
    }
}

module.exports = TelemetryProcessor;