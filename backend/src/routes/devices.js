const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, authenticateDevice, requireAdmin } = require('../middleware/auth');
const { requireFeature } = require('../middleware/licenseMiddleware');
const otaService = require('../services/otaService');

const router = express.Router();

// GET /api/sensor-types - Get all available sensor types
router.get('/sensor-types', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT id, name, unit, min_value, max_value, description, icon
            FROM sensor_types
            ORDER BY name
        `);

        res.json({ sensor_types: result.rows });
    } catch (error) {
        logger.error('Get sensor types error:', error);
        res.status(500).json({ error: 'Failed to retrieve sensor types' });
    }
});

// GET /api/devices/:id/sensors/:sensorId/recommended-thresholds - Get recommended thresholds based on historic data
router.get('/:id/sensors/:sensorId/recommended-thresholds',
    authenticateToken,
    async (req, res) => {
        try {
            const { id, sensorId } = req.params;
            const { days = 7 } = req.query;

            // Get historical data for the sensor
            const telemetryResult = await db.query(`
                SELECT processed_value
                FROM telemetry
                WHERE device_id = $1
                  AND device_sensor_id = $2
                  AND timestamp > CURRENT_TIMESTAMP - INTERVAL '${parseInt(days)} days'
                ORDER BY timestamp DESC
                LIMIT 10000
            `, [id, sensorId]);

            if (telemetryResult.rows.length === 0) {
                return res.json({
                    recommended_min: null,
                    recommended_max: null,
                    note: 'No historical data available. Using default values.'
                });
            }

            // Calculate statistics
            const values = telemetryResult.rows.map(r => parseFloat(r.processed_value));
            const sorted = values.sort((a, b) => a - b);
            const count = sorted.length;

            const mean = sorted.reduce((a, b) => a + b, 0) / count;
            const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / count;
            const stdDev = Math.sqrt(variance);

            // Calculate percentiles for outlier detection
            const p5 = sorted[Math.floor(count * 0.05)];
            const p95 = sorted[Math.floor(count * 0.95)];

            // Recommended thresholds: Use 3 standard deviations or percentile-based method
            // Whichever is more conservative (to reduce false positives)
            const method1_min = mean - (3 * stdDev);
            const method1_max = mean + (3 * stdDev);

            const method2_min = p5 - (p95 - p5) * 0.2; // 20% below P5
            const method2_max = p95 + (p95 - p5) * 0.2; // 20% above P95

            const recommended_min = Math.min(method1_min, method2_min);
            const recommended_max = Math.max(method1_max, method2_max);

            res.json({
                recommended_min: Math.max(0, recommended_min), // Don't go below 0
                recommended_max,
                stats: {
                    data_points: count,
                    mean,
                    std_dev: stdDev,
                    min: sorted[0],
                    max: sorted[count - 1],
                    p5,
                    p95,
                    days_analyzed: days
                },
                note: `Based on ${count} readings over last ${days} days. Using 3-sigma rule and percentile method for anomaly detection.`
            });

        } catch (error) {
            logger.error('Get recommended thresholds error:', error);
            res.status(500).json({ error: 'Failed to calculate recommended thresholds' });
        }
    }
);

// GET /api/devices - Get all devices (with pagination)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { location_id, status, device_type, page, limit, search } = req.query;

        // Pagination parameters
        const pageNum = parseInt(page) || null; // null means no pagination
        const limitNum = parseInt(limit) || 50;
        const offset = pageNum ? (pageNum - 1) * limitNum : 0;

        let query = `
            SELECT
                d.*,
                l.name as location_name,
                dc.ota_enabled,
                dc.armed,
                dc.heartbeat_interval,
                dc.debug_mode,
                dc.config_version
            FROM devices d
            LEFT JOIN locations l ON d.location_id = l.id
            LEFT JOIN device_configs dc ON d.id = dc.device_id
        `;
        const params = [];
        const conditions = [];

        if (location_id) {
            conditions.push(`d.location_id = $${params.length + 1}`);
            params.push(location_id);
        }

        if (status) {
            conditions.push(`d.status = $${params.length + 1}`);
            params.push(status);
        }

        if (device_type) {
            conditions.push(`d.device_type = $${params.length + 1}`);
            params.push(device_type);
        }

        if (search) {
            conditions.push(`(d.name ILIKE $${params.length + 1} OR d.id ILIKE $${params.length + 1})`);
            params.push(`%${search}%`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        // Get total count for pagination
        let totalCount = 0;
        if (pageNum) {
            const countQuery = query.replace(
                /SELECT[\s\S]*?FROM devices d/,
                'SELECT COUNT(DISTINCT d.id) as total FROM devices d'
            );
            const countResult = await db.query(countQuery, params);
            totalCount = parseInt(countResult.rows[0].total);
        }

        query += ' ORDER BY d.name';

        // Add pagination if requested
        if (pageNum) {
            query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            params.push(limitNum, offset);
        }

        const result = await db.query(query, params);

        // Add device health status and group/tag information
        const devicesWithMetadata = await Promise.all(
            result.rows.map(async (device) => {
                // Get device groups
                const groupsResult = await db.query(`
                    SELECT dg.id, dg.name, dg.color
                    FROM device_groups dg
                    JOIN device_group_members dgm ON dg.id = dgm.group_id
                    WHERE dgm.device_id = $1
                `, [device.id]);

                // Get device tags
                const tagsResult = await db.query(`
                    SELECT dt.id, dt.name, dt.color
                    FROM device_tags dt
                    JOIN device_tag_assignments dta ON dt.id = dta.tag_id
                    WHERE dta.device_id = $1
                `, [device.id]);

                return {
                    ...device,
                    groups: groupsResult.rows,
                    tags: tagsResult.rows,
                    health_status: calculateHealthStatus(device)
                };
            })
        );

        const response = {
            devices: devicesWithMetadata
        };

        // Add pagination metadata if pagination was requested
        if (pageNum) {
            response.pagination = {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitNum)
            };
        }

        res.json(response);
    } catch (error) {
        logger.error('Get devices error:', error);
        res.status(500).json({ error: 'Failed to get devices' });
    }
});

// GET /api/devices/:id - Get device by ID
router.get('/:id', [
    param('id').notEmpty()
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const result = await db.query(`
            SELECT
                d.*,
                l.name as location_name,
                l.timezone,
                dc.ota_enabled,
                dc.armed,
                dc.heartbeat_interval,
                dc.debug_mode,
                dc.config_version,
                dc.updated_at as config_updated_at
            FROM devices d
            LEFT JOIN locations l ON d.location_id = l.id
            LEFT JOIN device_configs dc ON d.id = dc.device_id
            WHERE d.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        res.json({ device: result.rows[0] });
    } catch (error) {
        logger.error('Get device error:', error);
        res.status(500).json({ error: 'Failed to get device' });
    }
});

// POST /api/devices - Create new device
router.post('/', [
    body('id').notEmpty().isLength({ min: 1, max: 50 }),
    body('name').notEmpty().isLength({ min: 1, max: 255 }),
    body('location_id').optional().isInt(),
    body('device_type').optional().isIn(['esp8266', 'esp32', 'arduino']),
    body('wifi_ssid').optional().isLength({ max: 255 }),
    body('wifi_password').optional().isLength({ max: 255 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        if (req.user.role !== 'admin' && req.user.role !== 'operator') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const {
            id,
            name,
            location_id,
            device_type = 'esp8266',
            wifi_ssid,
            wifi_password,
            hardware_version
        } = req.body;

        // Check if device ID already exists
        const existingDevice = await db.query('SELECT id FROM devices WHERE id = $1', [id]);
        if (existingDevice.rows.length > 0) {
            return res.status(409).json({ error: 'Device ID already exists' });
        }

        const result = await db.query(`
            INSERT INTO devices (id, name, location_id, device_type, wifi_ssid, wifi_password, hardware_version)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [id, name, location_id, device_type, wifi_ssid, wifi_password, hardware_version]);

        const device = result.rows[0];
        logger.info(`Device created: ${id} by ${req.user.email}`);

        res.status(201).json({
            message: 'Device created successfully',
            device
        });
    } catch (error) {
        logger.error('Create device error:', error);
        res.status(500).json({ error: 'Failed to create device' });
    }
});

// PUT /api/devices/:id - Update device
router.put('/:id', [
    param('id').notEmpty(),
    body('name').optional().isLength({ min: 1, max: 255 }),
    body('location_id').optional().isInt(),
    body('wifi_ssid').optional().isLength({ max: 255 }),
    body('wifi_password').optional().isLength({ max: 255 }),
    body('hardware_version').optional().isLength({ max: 20 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        if (req.user.role !== 'admin' && req.user.role !== 'operator') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const { id } = req.params;
        const { name, location_id, wifi_ssid, wifi_password, hardware_version } = req.body;

        const result = await db.query(`
            UPDATE devices
            SET name = COALESCE($1, name),
                location_id = COALESCE($2, location_id),
                wifi_ssid = COALESCE($3, wifi_ssid),
                wifi_password = COALESCE($4, wifi_password),
                hardware_version = COALESCE($5, hardware_version),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING *
        `, [name, location_id, wifi_ssid, wifi_password, hardware_version, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        logger.info(`Device updated: ${id} by ${req.user.email}`);
        res.json({
            message: 'Device updated successfully',
            device: result.rows[0]
        });
    } catch (error) {
        logger.error('Update device error:', error);
        res.status(500).json({ error: 'Failed to update device' });
    }
});

// PUT /api/devices/:id/config - Update device configuration
router.put('/:id/config', [
    param('id').notEmpty(),
    body('ota_enabled').optional().isBoolean(),
    body('armed').optional().isBoolean(),
    body('heartbeat_interval').optional().isInt({ min: 10, max: 3600 }),
    body('debug_mode').optional().isBoolean()
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        if (req.user.role !== 'admin' && req.user.role !== 'operator') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const { id } = req.params;
        const { ota_enabled, armed, heartbeat_interval, debug_mode } = req.body;

        // Check if device exists
        const deviceCheck = await db.query('SELECT id FROM devices WHERE id = $1', [id]);
        if (deviceCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Update or insert device config
        const result = await db.query(`
            INSERT INTO device_configs (device_id, ota_enabled, armed, heartbeat_interval, debug_mode, config_version, updated_at)
            VALUES ($1, $2, $3, $4, $5, 1, CURRENT_TIMESTAMP)
            ON CONFLICT (device_id) 
            DO UPDATE SET
                ota_enabled = COALESCE($2, device_configs.ota_enabled),
                armed = COALESCE($3, device_configs.armed),
                heartbeat_interval = COALESCE($4, device_configs.heartbeat_interval),
                debug_mode = COALESCE($5, device_configs.debug_mode),
                config_version = device_configs.config_version + 1,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [id, ota_enabled, armed, heartbeat_interval, debug_mode]);

        logger.info(`Device config updated: ${id} by ${req.user.email}`);
        res.json({
            message: 'Device configuration updated successfully. Changes will apply on next heartbeat.',
            config: result.rows[0]
        });
    } catch (error) {
        logger.error('Update device config error:', error);
        res.status(500).json({ error: 'Failed to update device configuration' });
    }
});

// DELETE /api/devices/:id - Delete device
router.delete('/:id', [
    param('id').notEmpty()
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin permissions required' });
        }

        const { id } = req.params;

        // Start a transaction to delete device and related data
        await db.query('BEGIN');

        try {
            // Delete related telemetry data (CASCADE should handle this automatically)
            await db.query('DELETE FROM telemetry WHERE device_id = $1', [id]);

            // Delete related alerts
            await db.query('DELETE FROM alerts WHERE device_id = $1', [id]);

            // Delete device configurations
            await db.query('DELETE FROM device_configs WHERE device_id = $1', [id]);

            // Delete the device
            const result = await db.query('DELETE FROM devices WHERE id = $1 RETURNING id', [id]);

            if (result.rows.length === 0) {
                await db.query('ROLLBACK');
                return res.status(404).json({ error: 'Device not found' });
            }

            await db.query('COMMIT');
            logger.info(`Device deleted: ${id} by ${req.user.email}`);
            res.json({ message: 'Device deleted successfully' });
        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        logger.error('Delete device error:', error);
        res.status(500).json({ error: 'Failed to delete device' });
    }
});

// POST /api/devices/:id/telemetry - Receive telemetry data from device
router.post('/:id/telemetry', [
    param('id').notEmpty(),
    body('sensors').isArray(),
    body('uptime').optional().isInt({ min: 0 }),
    body('free_heap').optional().isInt({ min: 0 }),
    body('wifi_rssi').optional().isInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { sensors, uptime, free_heap, wifi_rssi } = req.body;

        // Extract IP address - prefer X-Forwarded-For for local network IP (private IP)
        // Priority: X-Forwarded-For (device's local IP) > req.ip (may be public)
        let telemetryIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

        // Handle IPv6-mapped IPv4 addresses
        if (telemetryIp && telemetryIp.startsWith('::ffff:')) {
            telemetryIp = telemetryIp.substring(7);
        }

        // Validate it's a private IP (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
        const isPrivateIP = (ip) => {
            if (!ip) return false;
            return ip.startsWith('192.168.') ||
                ip.startsWith('10.') ||
                /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip);
        };

        // If we got a public IP, try to preserve the existing private IP from database
        if (!isPrivateIP(telemetryIp)) {
            try {
                const deviceCheck = await db.query('SELECT ip_address FROM devices WHERE id = $1', [id]);
                if (deviceCheck.rows.length > 0 && deviceCheck.rows[0].ip_address && isPrivateIP(deviceCheck.rows[0].ip_address)) {
                    // Keep existing private IP
                    telemetryIp = deviceCheck.rows[0].ip_address;
                    logger.info(`Preserving private IP ${telemetryIp} for device ${id} (ignoring public IP)`);
                }
            } catch (error) {
                logger.warn('Failed to check existing IP:', error.message);
            }
        }

        // Calculate health metrics
        const memoryUsagePercent = free_heap ? Math.max(0, Math.min(100, 100 - (free_heap / 81920 * 100))) : null;
        const wifiQualityPercent = wifi_rssi ? Math.max(0, Math.min(100, 2 * (wifi_rssi + 100))) : null;

        // Update device last heartbeat and health metrics
        await db.query(`
            UPDATE devices
            SET last_heartbeat = CURRENT_TIMESTAMP,
                status = 'online',
                current_status = 'online',
                uptime_seconds = COALESCE($1, uptime_seconds),
                ip_address = $2,
                free_heap_bytes = COALESCE($3, free_heap_bytes),
                wifi_signal_strength = COALESCE($4, wifi_signal_strength),
                memory_usage_percent = COALESCE($5, memory_usage_percent),
                wifi_quality_percent = COALESCE($6, wifi_quality_percent)
            WHERE id = $7
        `, [uptime, telemetryIp, free_heap, wifi_rssi, memoryUsagePercent, wifiQualityPercent, id]);

        // Process telemetry data using TelemetryProcessor service from request
        const telemetryProcessor = req.telemetryProcessor;
        if (!telemetryProcessor) {
            logger.error('Telemetry processor not available on request context');
            return res.status(500).json({ error: 'Telemetry processor unavailable' });
        }

        const SENSOR_TYPE_ALIASES = {
            light: 'Photodiode'
        };

        // ESP8266 pin mapping - pin 17 is actually A0 (analog input)
        const mapESP8266Pin = (pin) => {
            if (pin === 17 || pin === '17') {
                return 'A0';
            }
            return String(pin);
        };

        for (const sensorData of sensors) {
            try {
                // Map pin for ESP8266 compatibility
                const mappedPin = mapESP8266Pin(sensorData.pin);

                // Find or create device sensor
                let deviceSensor = await db.query(`
                    SELECT ds.*, st.name as sensor_type_name, st.unit
                    FROM device_sensors ds
                    JOIN sensor_types st ON ds.sensor_type_id = st.id
                    WHERE ds.device_id = $1 AND ds.pin = $2
                `, [id, mappedPin]);

                if (deviceSensor.rows.length === 0) {
                    const sensorTypeName = SENSOR_TYPE_ALIASES[sensorData.type] || sensorData.type;
                    // Auto-create device sensor if it doesn't exist (enabled by default)
                    // Sensors sending telemetry are assumed to be configured in firmware
                    const sensorType = await db.query(
                        'SELECT id FROM sensor_types WHERE LOWER(name) = LOWER($1)',
                        [sensorTypeName]
                    );

                    if (sensorType.rows.length > 0) {
                        const newSensor = await db.query(`
                            INSERT INTO device_sensors (device_id, sensor_type_id, pin, name, enabled)
                            VALUES ($1, $2, $3, $4, true)
                            RETURNING *
                        `, [id, sensorType.rows[0].id, mappedPin, sensorData.name || `${sensorData.type} Sensor`]);

                        deviceSensor.rows = [{ ...newSensor.rows[0], sensor_type_name: sensorData.type }];
                        logger.info(`Auto-created enabled sensor: ${sensorData.type} on pin ${mappedPin} for device ${id}`);
                    } else {
                        logger.warn(`Unknown sensor type: ${sensorData.type} for device ${id}`);
                        continue;
                    }
                }

                const sensor = deviceSensor.rows[0];

                // Calculate processed value
                const rawValue = parseFloat(sensorData.raw_value || sensorData.processed_value || sensorData.value);
                const processedValue = (rawValue * (sensor.calibration_multiplier || 1)) + (sensor.calibration_offset || 0);

                // Insert telemetry data
                await db.query(`
                    INSERT INTO telemetry (device_id, device_sensor_id, raw_value, processed_value, metadata)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    id,
                    sensor.id,
                    rawValue,
                    processedValue,
                    JSON.stringify({
                        timestamp: sensorData.timestamp,
                        pin: mappedPin,
                        sensor_type: sensorData.type,
                        unit: sensor.unit
                    })
                ]);

                // Process sensor rules for alerts using the telemetry processor
                await telemetryProcessor.processRulesForSensor(id, {
                    pin: mappedPin,
                    type: sensorData.type,
                    name: sensor.name,
                    raw_value: rawValue,
                    processed_value: processedValue,
                    timestamp: sensorData.timestamp || new Date().toISOString()
                });

            } catch (sensorError) {
                logger.error(`Error processing sensor data for device ${id}, pin ${sensorData.pin}:`, sensorError);
            }
        }

        try {
            await telemetryProcessor.cacheRecentTelemetry(id, sensors);
        } catch (cacheError) {
            logger.warn('Failed to cache recent telemetry:', cacheError.message);
        }

        // Log system metrics if provided (store as metadata)
        if (uptime !== undefined || free_heap !== undefined || wifi_rssi !== undefined) {
            await db.query(`
                UPDATE devices
                SET uptime_seconds = COALESCE($2, uptime_seconds)
                WHERE id = $1
            `, [id, uptime]);

            // Store system metrics as device metadata
            logger.logDeviceActivity(id, 'system_metrics', {
                uptime,
                free_heap,
                wifi_rssi
            });
        }

        res.json({ message: 'Telemetry received successfully' });
    } catch (error) {
        logger.error('Telemetry error:', error);
        res.status(500).json({ error: 'Failed to process telemetry' });
    }
});

// POST /api/devices/:id/heartbeat - Device heartbeat endpoint
router.post('/:id/heartbeat', [
    param('id').notEmpty()
], async (req, res) => {
    try {
        const { id } = req.params;
        const { firmware_version, uptime, free_heap, wifi_rssi, ip_address } = req.body;

        // Use IP from request body if provided, otherwise use req.ip
        // Extract IPv4 from IPv6-mapped address if needed
        let deviceIp = ip_address || req.ip;

        // Strip IPv6 prefix if present
        if (deviceIp && deviceIp.startsWith('::ffff:')) {
            deviceIp = deviceIp.substring(7); // Remove ::ffff: prefix
        }

        // Validate IP address - reject invalid/localhost IPs
        const invalidIps = ['::1', '::', 'localhost', '127.0.0.1', '0.0.0.0', ''];
        if (!deviceIp || invalidIps.includes(deviceIp)) {
            // Try to get actual IP from request headers (useful when behind proxy)
            const requestIp = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                req.headers['x-real-ip'] ||
                req.ip ||
                req.connection.remoteAddress ||
                req.socket.remoteAddress;

            if (requestIp && requestIp !== '::1' && requestIp !== '::ffff:127.0.0.1' && requestIp !== '127.0.0.1') {
                deviceIp = requestIp.startsWith('::ffff:') ? requestIp.substring(7) : requestIp;
            } else {
                // If we can't determine a valid IP, don't update it
                deviceIp = null;
            }
        }

        // Only update IP if we have a valid one
        const updateQuery = deviceIp
            ? `UPDATE devices
               SET last_heartbeat = CURRENT_TIMESTAMP,
                   status = 'online',
                   firmware_version = COALESCE($1, firmware_version),
                   uptime_seconds = COALESCE($2, uptime_seconds),
                   ip_address = $3,
                   wifi_signal_strength = $4
               WHERE id = $5`
            : `UPDATE devices
               SET last_heartbeat = CURRENT_TIMESTAMP,
                   status = 'online',
                   firmware_version = COALESCE($1, firmware_version),
                   uptime_seconds = COALESCE($2, uptime_seconds),
                   wifi_signal_strength = $3
               WHERE id = $4`;

        const params = deviceIp
            ? [firmware_version, uptime, deviceIp, wifi_rssi, id]
            : [firmware_version, uptime, wifi_rssi, id];

        await db.query(updateQuery, params);

        // Get sensor configuration for this device
        const sensorsResult = await db.query(`
            SELECT
                ds.id as sensor_id,
                ds.pin,
                ds.name,
                ds.enabled,
                ds.calibration_offset,
                ds.calibration_multiplier,
                ds.threshold_min,
                ds.threshold_max,
                st.name as sensor_type
            FROM device_sensors ds
            JOIN sensor_types st ON ds.sensor_type_id = st.id
            WHERE ds.device_id = $1
            ORDER BY ds.pin
        `, [id]);

        // Build sensor configuration array with thresholds
        // Thresholds are now stored directly on device_sensors table
        const sensorConfig = sensorsResult.rows.map(sensor => {
            return {
                pin: sensor.pin,
                type: sensor.sensor_type,
                name: sensor.name,
                enabled: sensor.enabled,
                calibration_offset: sensor.calibration_offset || 0,
                calibration_multiplier: sensor.calibration_multiplier || 1,
                threshold_min: sensor.threshold_min != null ? sensor.threshold_min : 0,
                threshold_max: sensor.threshold_max != null ? sensor.threshold_max : 0
            };
        });

        res.json({
            message: 'Heartbeat received',
            timestamp: new Date().toISOString(),
            config: {
                sensors: sensorConfig
            }
        });
    } catch (error) {
        logger.error('Heartbeat error:', error);
        res.status(500).json({ error: 'Failed to process heartbeat' });
    }
});

// POST /api/devices/:id/alarm - Device alarm endpoint
router.post('/:id/alarm', [
    param('id').notEmpty(),
    body('alarm_type').notEmpty(),
    body('message').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { alarm_type, message } = req.body;

        // Create an alert for the alarm
        await db.query(`
            INSERT INTO alerts (device_id, alert_type, severity, message, triggered_at)
            VALUES ($1, $2, 'high', $3, CURRENT_TIMESTAMP)
        `, [id, alarm_type, message || `Device ${id} triggered ${alarm_type} alarm`]);

        logger.warn(`Alarm received from device ${id}: ${alarm_type}`);
        res.json({ message: 'Alarm received and alert created' });
    } catch (error) {
        logger.error('Alarm error:', error);
        res.status(500).json({ error: 'Failed to process alarm' });
    }
});

// POST /api/devices/:id/threshold-alert - Immediate threshold crossing alert
router.post('/:id/threshold-alert', [
    param('id').notEmpty(),
    body('sensor_pin').notEmpty(),
    body('sensor_name').notEmpty(),
    body('value').isNumeric(),
    body('alert_type').isIn(['above_max', 'below_min']),
    body('threshold_min').optional().isNumeric(),
    body('threshold_max').optional().isNumeric()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { sensor_pin, sensor_name, sensor_type, value, alert_type, threshold_min, threshold_max } = req.body;

        // AUTO-CREATE SENSOR IF IT DOESN'T EXIST
        // This fixes the issue where device sends alerts but sensor isn't in database
        try {
            const sensorCheck = await db.query(`
                SELECT id FROM device_sensors 
                WHERE device_id = $1 AND pin = $2
            `, [id, sensor_pin]);

            if (sensorCheck.rows.length === 0) {
                // Sensor doesn't exist - auto-create it
                logger.info(`Auto-creating sensor for alert: device=${id}, pin=${sensor_pin}, type=${sensor_type || 'Photodiode'}`);

                const SENSOR_TYPE_ALIASES = {
                    light: 'Photodiode',
                    temperature: 'DHT22',
                    motion: 'PIR'
                };

                const sensorTypeName = SENSOR_TYPE_ALIASES[sensor_type?.toLowerCase()] || sensor_type || 'Photodiode';

                const sensorTypeResult = await db.query(
                    'SELECT id, default_min, default_max FROM sensor_types WHERE LOWER(name) = LOWER($1)',
                    [sensorTypeName]
                );

                if (sensorTypeResult.rows.length > 0) {
                    const sensorTypeData = sensorTypeResult.rows[0];
                    await db.query(`
                        INSERT INTO device_sensors (device_id, sensor_type_id, pin, name, enabled)
                        VALUES ($1, $2, $3, $4, true)
                        ON CONFLICT (device_id, pin) DO NOTHING
                    `, [id, sensorTypeData.id, sensor_pin, sensor_name || `${sensorTypeName} Sensor`]);

                    logger.info(`Auto-created sensor: ${sensor_name} on pin ${sensor_pin} for device ${id}`);
                } else {
                    logger.warn(`Cannot auto-create sensor - unknown type: ${sensorTypeName}`);
                }
            }
        } catch (autoCreateError) {
            logger.error(`Failed to auto-create sensor for alert: ${autoCreateError.message}`);
            // Continue with alert creation even if sensor creation fails
        }

        // Check cooldown - don't send alert if one was sent recently (default 10 seconds for firmware alerts)
        const ALERT_COOLDOWN_SECONDS = parseInt(process.env.THRESHOLD_ALERT_COOLDOWN_SEC || '10');

        const recentAlertCheck = await db.query(`
            SELECT id, triggered_at
            FROM alerts
            WHERE device_id = $1
            AND alert_type = 'threshold_crossing'
            AND message LIKE $2
            AND triggered_at > CURRENT_TIMESTAMP - INTERVAL '${ALERT_COOLDOWN_SECONDS} seconds'
            ORDER BY triggered_at DESC
            LIMIT 1
        `, [id, `%${sensor_name}%${alert_type}%`]);

        if (recentAlertCheck.rows.length > 0) {
            const lastAlert = recentAlertCheck.rows[0];
            const secondsSinceAlert = Math.floor((Date.now() - new Date(lastAlert.triggered_at)) / 1000);
            logger.info(`Threshold alert for ${id}/${sensor_name} suppressed - last alert ${secondsSinceAlert}s ago (cooldown: ${ALERT_COOLDOWN_SECONDS}s)`);

            return res.json({
                message: 'Alert received but suppressed due to cooldown',
                cooldown_remaining_seconds: ALERT_COOLDOWN_SECONDS - secondsSinceAlert
            });
        }

        // Optional: Check if sensor rules exist for this sensor
        // If REQUIRE_SENSOR_RULES env var is set to 'true', only create alerts if rules exist
        const requireRules = process.env.REQUIRE_SENSOR_RULES === 'true';

        if (requireRules) {
            const rulesCheck = await db.query(`
                SELECT sr.id
                FROM sensor_rules sr
                INNER JOIN device_sensors ds ON sr.device_sensor_id = ds.id
                WHERE ds.device_id = $1
                AND ds.pin = $2
                AND sr.enabled = true
                LIMIT 1
            `, [id, sensor_pin]);

            if (rulesCheck.rows.length === 0) {
                logger.info(`Threshold alert for ${id}/${sensor_name} suppressed - no enabled rules configured`);
                return res.json({
                    message: 'Alert received but suppressed - no sensor rules configured',
                    note: 'Configure sensor rules in the UI to receive threshold crossing alerts'
                });
            }
        }

        // Create alert
        const alertMessage = `${sensor_name} ${alert_type === 'above_max' ? 'exceeded maximum' : 'fell below minimum'} threshold (value: ${value.toFixed(2)})`;

        const alertResult = await db.query(`
            INSERT INTO alerts (device_id, alert_type, severity, message, sensor_pin, sensor_value, triggered_at)
            VALUES ($1, 'threshold_crossing', 'medium', $2, $3, $4, CURRENT_TIMESTAMP)
            RETURNING id
        `, [id, alertMessage, sensor_pin, value]);

        const alertId = alertResult.rows[0].id;

        logger.warn(`Threshold alert from device ${id}: ${alertMessage}`);

        // Send email and WhatsApp notifications (async, don't wait)
        setImmediate(async () => {
            try {
                const emailService = require('../services/emailService');
                const whatsappService = require('../services/whatsappService');

                // Get device info
                const deviceResult = await db.query(`
                    SELECT d.name, d.id, l.name as location_name
                    FROM devices d
                    LEFT JOIN locations l ON d.location_id = l.id
                    WHERE d.id = $1
                `, [id]);

                if (deviceResult.rows.length === 0) return;

                const device = deviceResult.rows[0];

                // Get notification recipients for this device/location
                const recipientsResult = await db.query(`
                    SELECT DISTINCT u.email, u.name, u.whatsapp_number, u.whatsapp_notifications_enabled
                    FROM users u
                    WHERE u.role IN ('admin', 'operator')
                    AND (u.email IS NOT NULL OR u.whatsapp_number IS NOT NULL)
                `);

                if (recipientsResult.rows.length === 0) {
                    logger.info('No recipients configured for threshold alerts');
                    return;
                }

                const alertData = {
                    sensor_name,
                    sensor_type: sensor_type || 'Unknown',
                    sensor_pin,
                    value,
                    alert_type,
                    threshold_min,
                    threshold_max,
                    alert_id: alertId,
                    message: alertMessage
                };

                // Send email notifications
                const emailRecipients = recipientsResult.rows
                    .filter(r => r.email)
                    .map(r => r.email);

                if (emailRecipients.length > 0) {
                    await emailService.sendThresholdAlert(device, alertData, emailRecipients);
                    logger.info(`Threshold alert email sent to ${emailRecipients.length} recipient(s)`);
                }

                // Send WhatsApp notifications
                const whatsappRecipients = recipientsResult.rows
                    .filter(r => r.whatsapp_notifications_enabled && r.whatsapp_number);

                if (whatsappRecipients.length > 0) {
                    const whatsappResults = await whatsappService.sendThresholdAlert(device, alertData, whatsappRecipients);
                    const successCount = whatsappResults.filter(r => r.success).length;
                    logger.info(`Threshold alert WhatsApp sent to ${successCount}/${whatsappRecipients.length} recipient(s)`);
                }

            } catch (error) {
                logger.error('Failed to send threshold alert notifications:', error);
            }
        });

        res.json({
            message: 'Threshold alert received and processed',
            alert_id: alertId
        });
    } catch (error) {
        logger.error('Threshold alert error:', error);
        res.status(500).json({ error: 'Failed to process threshold alert' });
    }
});

// GET /api/devices/:id/status - Get device status
router.get('/:id/status', [
    param('id').notEmpty()
], authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT
                d.id,
                d.name,
                d.status,
                d.last_heartbeat,
                d.uptime_seconds,
                d.firmware_version,
                d.ip_address,
                EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - d.last_heartbeat)) as seconds_since_heartbeat
            FROM devices d
            WHERE d.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const device = result.rows[0];

        // Determine if device is truly online (heartbeat within last 10 minutes)
        const isOnline = device.seconds_since_heartbeat < 600;

        res.json({
            device: {
                ...device,
                is_online: isOnline,
                status: isOnline ? 'online' : 'offline'
            }
        });
    } catch (error) {
        logger.error('Get device status error:', error);
        res.status(500).json({ error: 'Failed to get device status' });
    }
});

// POST /api/devices/:id/ota-status - OTA update status from device
router.post('/:id/ota-status', [
    param('id').notEmpty(),
    body('status').isIn(['started', 'progress', 'completed', 'failed']),
    body('progress').optional().isInt({ min: 0, max: 100 }),
    body('error').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { status, progress, error } = req.body;

        let progressPercent = progress !== undefined ? parseInt(progress, 10) : 0;
        if (!Number.isFinite(progressPercent)) {
            progressPercent = 0;
        }
        progressPercent = Math.max(0, Math.min(100, progressPercent));

        let statusForUpdate;
        switch ((status || '').toLowerCase()) {
            case 'started':
                statusForUpdate = 'downloading';
                progressPercent = 0;
                break;
            case 'progress':
                statusForUpdate = 'downloading';
                break;
            case 'completed':
                statusForUpdate = 'completed';
                if (progress === undefined) {
                    progressPercent = 100;
                }
                break;
            case 'failed':
                statusForUpdate = 'failed';
                break;
            default:
                return res.status(400).json({ error: `Unsupported OTA status: ${status}` });
        }

        const otaUpdate = await otaService.updateOTAStatus(
            id,
            statusForUpdate,
            progressPercent,
            error || null
        );

        if (!otaUpdate) {
            return res.status(404).json({ error: 'No OTA update in progress for this device' });
        }

        const payload = {
            ota_update_id: otaUpdate.id,
            status: otaUpdate.status,
            progress_percent: otaUpdate.progress_percent ?? progressPercent,
            error_message: otaUpdate.error_message,
            version: otaUpdate.version
        };

        if (req.websocketService && typeof req.websocketService.broadcastOTAStatus === 'function') {
            req.websocketService.broadcastOTAStatus(id, payload);
        }

        logger.info(`OTA status update for device ${id}: ${statusForUpdate} (${payload.progress_percent}%)`);

        res.json({ message: 'OTA status received', ota: payload });
    } catch (error) {
        logger.error('OTA status error:', error);
        res.status(500).json({ error: 'Failed to process OTA status' });
    }
});

// POST /api/devices/:id/ota-check - Check for available firmware updates
router.post('/:id/ota-check', [
    param('id').isString().notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const deviceId = req.params.id;
        const { current_version, device_type } = req.body;

        // Get device info
        const deviceResult = await db.query('SELECT * FROM devices WHERE id = $1', [deviceId]);
        if (deviceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Check for latest firmware version
        const firmwareResult = await db.query(`
            SELECT * FROM firmware_versions
            WHERE device_type = $1 AND is_active = true AND is_stable = true
            ORDER BY created_at DESC LIMIT 1
        `, [device_type || 'esp8266']);

        if (firmwareResult.rows.length === 0) {
            return res.json({
                update_available: false,
                message: 'No firmware available'
            });
        }

        const latestFirmware = firmwareResult.rows[0];
        const updateAvailable = latestFirmware.version !== current_version;

        if (updateAvailable) {
            res.json({
                update_available: true,
                firmware_url: `${process.env.OTA_BASE_URL || 'http://localhost:3000'}/firmware/${latestFirmware.id}`,
                version: latestFirmware.version,
                checksum: latestFirmware.checksum,
                file_size: latestFirmware.file_size,
                release_notes: latestFirmware.release_notes
            });
        } else {
            res.json({
                update_available: false,
                current_version,
                message: 'Firmware is up to date'
            });
        }

        logger.logOTAEvent(deviceId, 'update_check', {
            currentVersion: current_version,
            latestVersion: latestFirmware.version,
            updateAvailable
        });

    } catch (error) {
        logger.error('OTA check error:', error);
        res.status(500).json({ error: 'Failed to check for updates' });
    }
});

// GET /api/devices/:id/ota-pending - Check for pending OTA updates
router.get('/:id/ota-pending', [
    param('id').isString().notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const deviceId = req.params.id;

        // Check for pending OTA updates in database
        const otaResult = await db.query(`
            SELECT ou.*, fv.version, fv.binary_url, fv.checksum, fv.file_size
            FROM ota_updates ou
            JOIN firmware_versions fv ON ou.firmware_version_id = fv.id
            WHERE ou.device_id = $1 AND ou.status IN ('pending', 'downloading')
            ORDER BY ou.created_at DESC LIMIT 1
        `, [deviceId]);

        if (otaResult.rows.length === 0) {
            return res.json({
                pending_update: false,
                message: 'No pending updates'
            });
        }

        const pendingUpdate = otaResult.rows[0];

        res.json({
            pending_update: true,
            firmware_url: `${process.env.OTA_BASE_URL || 'http://localhost:3000'}/firmware/${pendingUpdate.firmware_version_id}`,
            version: pendingUpdate.version,
            checksum: pendingUpdate.checksum,
            file_size: pendingUpdate.file_size,
            update_id: pendingUpdate.id
        });

        // Update status to downloading if it was pending
        if (pendingUpdate.status === 'pending') {
            await db.query(
                'UPDATE ota_updates SET status = $1, started_at = NOW() WHERE id = $2',
                ['downloading', pendingUpdate.id]
            );
        }

        logger.logOTAEvent(deviceId, 'pending_check', {
            updateId: pendingUpdate.id,
            version: pendingUpdate.version
        });

    } catch (error) {
        logger.error('OTA pending check error:', error);
        res.status(500).json({ error: 'Failed to check for pending updates' });
    }
});

// Device Health Monitoring Endpoints

// POST /api/devices/:id/health - Update device health data (from device)
router.post('/:id/health',
    authenticateDevice,
    [
        body('memory_usage_percent').optional().isFloat({ min: 0, max: 100 }),
        body('wifi_signal_strength').optional().isInt({ min: -100, max: 0 }),
        body('battery_level').optional().isFloat({ min: 0, max: 100 }),
        body('cpu_temperature').optional().isFloat({ min: -40, max: 125 }),
        body('free_heap_bytes').optional().isInt({ min: 0 }),
        body('wifi_quality_percent').optional().isFloat({ min: 0, max: 100 }),
        body('uptime_seconds').optional().isInt({ min: 0 }),
        body('reset_reason').optional().isString(),
        body('ping_response_time').optional().isInt({ min: 0 }),
        body('packet_loss_percent').optional().isFloat({ min: 0, max: 100 })
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const deviceId = req.params.id;
            const healthData = req.body;

            // Update device table with latest health data
            const updateFields = [];
            const updateValues = [];
            let paramIndex = 1;

            Object.keys(healthData).forEach(key => {
                if (healthData[key] !== undefined && key !== 'uptime_seconds' && key !== 'ping_response_time' && key !== 'packet_loss_percent') {
                    updateFields.push(`${key} = $${paramIndex}`);
                    updateValues.push(healthData[key]);
                    paramIndex++;
                }
            });

            if (updateFields.length > 0) {
                updateValues.push(deviceId);
                const updateQuery = `
                    UPDATE devices
                    SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $${paramIndex}
                `;
                await db.query(updateQuery, updateValues);
            }

            // Insert into health history for trend analysis
            const historyData = {
                device_id: deviceId,
                ...healthData
            };

            const historyFields = Object.keys(historyData);
            const historyPlaceholders = historyFields.map((_, index) => `$${index + 1}`);

            await db.query(`
                INSERT INTO device_health_history (${historyFields.join(', ')})
                VALUES (${historyPlaceholders.join(', ')})
            `, Object.values(historyData));

            logger.logDeviceActivity(deviceId, 'health_update', healthData);

            res.json({
                success: true,
                message: 'Device health data updated'
            });

        } catch (error) {
            logger.error('Update device health error:', error);
            res.status(500).json({ error: 'Failed to update device health data' });
        }
    }
);

// GET /api/devices/:id/health - Get device health status
router.get('/:id/health',
    authenticateToken,
    requireFeature('analytics_advanced'),
    async (req, res) => {
        try {
            const deviceId = req.params.id;

            // Get current device health data
            const deviceResult = await db.query(`
                SELECT
                    d.memory_usage_percent,
                    d.wifi_signal_strength,
                    d.battery_level,
                    d.cpu_temperature,
                    d.free_heap_bytes,
                    d.wifi_quality_percent,
                    d.boot_time,
                    d.reset_reason,
                    d.last_heartbeat,
                    d.uptime_seconds
                FROM devices d
                WHERE d.id = $1
            `, [deviceId]);

            if (deviceResult.rows.length === 0) {
                return res.status(404).json({ error: 'Device not found' });
            }

            const device = deviceResult.rows[0];

            // Calculate uptime if boot_time is available
            if (device.boot_time) {
                const bootTime = new Date(device.boot_time);
                const now = new Date();
                device.calculated_uptime_hours = ((now - bootTime) / (1000 * 60 * 60)).toFixed(1);
            }

            // Get recent health history (last 24 hours)
            const historyResult = await db.query(`
                SELECT *
                FROM device_health_history
                WHERE device_id = $1
                AND timestamp >= NOW() - INTERVAL '24 hours'
                ORDER BY timestamp DESC
                LIMIT 100
            `, [deviceId]);

            // Calculate health score
            const healthScore = calculateDeviceHealthScore(device);

            res.json({
                success: true,
                deviceId,
                currentHealth: device,
                healthScore,
                recentHistory: historyResult.rows,
                recommendations: generateHealthRecommendations(device, healthScore)
            });

        } catch (error) {
            logger.error('Get device health error:', error);
            res.status(500).json({ error: 'Failed to get device health data' });
        }
    }
);

// GET /api/devices/:id/health/history - Get device health history
router.get('/:id/health/history',
    authenticateToken,
    requireFeature('analytics_advanced'),
    [
        query('timeRange').optional().isIn(['1h', '6h', '24h', '7d', '30d']),
        query('metrics').optional().isString()
    ],
    async (req, res) => {
        try {
            const deviceId = req.params.id;
            const { timeRange = '24h', metrics } = req.query;

            // Calculate time range
            const timeRanges = {
                '1h': '1 hour',
                '6h': '6 hours',
                '24h': '24 hours',
                '7d': '7 days',
                '30d': '30 days'
            };

            const interval = timeRanges[timeRange] || '24 hours';

            // Build metrics selection
            let selectMetrics = '*';
            if (metrics) {
                const requestedMetrics = metrics.split(',').map(m => m.trim());
                const allowedMetrics = [
                    'memory_usage_percent', 'wifi_signal_strength', 'battery_level',
                    'cpu_temperature', 'free_heap_bytes', 'wifi_quality_percent',
                    'uptime_seconds', 'ping_response_time', 'packet_loss_percent'
                ];
                const validMetrics = requestedMetrics.filter(m => allowedMetrics.includes(m));
                if (validMetrics.length > 0) {
                    selectMetrics = 'timestamp, ' + validMetrics.join(', ');
                }
            }

            const result = await db.query(`
                SELECT ${selectMetrics}
                FROM device_health_history
                WHERE device_id = $1
                AND timestamp >= NOW() - INTERVAL '${interval}'
                ORDER BY timestamp DESC
                LIMIT 1000
            `, [deviceId]);

            res.json({
                success: true,
                deviceId,
                timeRange,
                dataPoints: result.rows.length,
                history: result.rows
            });

        } catch (error) {
            logger.error('Get device health history error:', error);
            res.status(500).json({ error: 'Failed to get device health history' });
        }
    }
);

// Helper Functions

function calculateHealthStatus(device) {
    if (!device) return 'unknown';

    const now = new Date();
    const lastHeartbeat = device.last_heartbeat ? new Date(device.last_heartbeat) : null;

    // Check if device is offline
    if (!lastHeartbeat || (now - lastHeartbeat) > 5 * 60 * 1000) { // 5 minutes
        return 'offline';
    }

    // Check critical health indicators
    const issues = [];

    if (device.memory_usage_percent > 90) issues.push('high_memory');
    if (device.wifi_signal_strength && device.wifi_signal_strength < -80) issues.push('poor_wifi');
    if (device.battery_level && device.battery_level < 20) issues.push('low_battery');
    if (device.cpu_temperature && device.cpu_temperature > 70) issues.push('high_temperature');
    if (device.free_heap_bytes && device.free_heap_bytes < 10000) issues.push('low_memory');

    if (issues.length === 0) return 'healthy';
    if (issues.length <= 2) return 'warning';
    return 'critical';
}

function calculateDeviceHealthScore(device) {
    let score = 100;
    const issues = [];

    // Memory usage (0-30 points deduction)
    if (device.memory_usage_percent) {
        if (device.memory_usage_percent > 95) {
            score -= 30;
            issues.push({ type: 'memory', severity: 'critical', message: 'Critically high memory usage' });
        } else if (device.memory_usage_percent > 85) {
            score -= 20;
            issues.push({ type: 'memory', severity: 'warning', message: 'High memory usage' });
        } else if (device.memory_usage_percent > 75) {
            score -= 10;
            issues.push({ type: 'memory', severity: 'info', message: 'Elevated memory usage' });
        }
    }

    // WiFi signal strength (0-25 points deduction)
    if (device.wifi_signal_strength) {
        if (device.wifi_signal_strength < -85) {
            score -= 25;
            issues.push({ type: 'wifi', severity: 'critical', message: 'Very poor WiFi signal' });
        } else if (device.wifi_signal_strength < -75) {
            score -= 15;
            issues.push({ type: 'wifi', severity: 'warning', message: 'Poor WiFi signal' });
        } else if (device.wifi_signal_strength < -65) {
            score -= 5;
            issues.push({ type: 'wifi', severity: 'info', message: 'Weak WiFi signal' });
        }
    }

    // Battery level (0-20 points deduction)
    if (device.battery_level !== null && device.battery_level !== undefined) {
        if (device.battery_level < 10) {
            score -= 20;
            issues.push({ type: 'battery', severity: 'critical', message: 'Critically low battery' });
        } else if (device.battery_level < 25) {
            score -= 10;
            issues.push({ type: 'battery', severity: 'warning', message: 'Low battery' });
        }
    }

    // CPU temperature (0-15 points deduction)
    if (device.cpu_temperature) {
        if (device.cpu_temperature > 80) {
            score -= 15;
            issues.push({ type: 'temperature', severity: 'critical', message: 'High CPU temperature' });
        } else if (device.cpu_temperature > 70) {
            score -= 8;
            issues.push({ type: 'temperature', severity: 'warning', message: 'Elevated CPU temperature' });
        }
    }

    // Free heap (0-10 points deduction)
    if (device.free_heap_bytes) {
        if (device.free_heap_bytes < 5000) {
            score -= 10;
            issues.push({ type: 'heap', severity: 'critical', message: 'Very low free memory' });
        } else if (device.free_heap_bytes < 15000) {
            score -= 5;
            issues.push({ type: 'heap', severity: 'warning', message: 'Low free memory' });
        }
    }

    return {
        score: Math.max(0, score),
        level: score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 50 ? 'fair' : 'poor',
        issues
    };
}

function generateHealthRecommendations(device, healthScore) {
    const recommendations = [];

    healthScore.issues.forEach(issue => {
        switch (issue.type) {
            case 'memory':
                recommendations.push({
                    priority: issue.severity,
                    title: 'Optimize Memory Usage',
                    description: 'Consider reducing sensor polling frequency or implementing data buffering',
                    action: 'Review device configuration and sensor update intervals'
                });
                break;
            case 'wifi':
                recommendations.push({
                    priority: issue.severity,
                    title: 'Improve WiFi Connectivity',
                    description: 'Device is experiencing poor WiFi signal strength',
                    action: 'Relocate device closer to WiFi access point or add WiFi extender'
                });
                break;
            case 'battery':
                recommendations.push({
                    priority: issue.severity,
                    title: 'Battery Maintenance Required',
                    description: 'Battery level is critically low',
                    action: 'Replace or recharge device battery immediately'
                });
                break;
            case 'temperature':
                recommendations.push({
                    priority: issue.severity,
                    title: 'Temperature Management',
                    description: 'CPU temperature is elevated',
                    action: 'Ensure proper ventilation and check for excessive processing load'
                });
                break;
            case 'heap':
                recommendations.push({
                    priority: issue.severity,
                    title: 'Memory Optimization',
                    description: 'Device is running low on available memory',
                    action: 'Restart device or optimize firmware to use less RAM'
                });
                break;
        }
    });

    // Add general recommendations
    if (recommendations.length === 0) {
        recommendations.push({
            priority: 'info',
            title: 'Device Health Optimal',
            description: 'Your device is operating within normal parameters',
            action: 'Continue regular monitoring and maintenance'
        });
    }

    return recommendations;
}

// Sensor CRUD routes for frontend compatibility
// GET /api/devices/:id/sensors - Get device sensors
router.get('/:id/sensors', authenticateToken, async (req, res) => {
    try {
        const deviceId = req.params.id;
        const result = await db.query(`
            SELECT ds.*, st.name as sensor_type, st.unit, st.icon
            FROM device_sensors ds
            INNER JOIN sensor_types st ON ds.sensor_type_id = st.id
            WHERE ds.device_id = $1
            ORDER BY ds.pin
        `, [deviceId]);

        res.json({ sensors: result.rows });
    } catch (error) {
        logger.error('Get device sensors error:', error);
        res.status(500).json({ error: 'Failed to fetch device sensors' });
    }
});

// POST /api/devices/:id/sensors - Create sensor
router.post('/:id/sensors', authenticateToken, async (req, res) => {
    try {
        const deviceId = req.params.id;
        const { sensor_type_id, type, pin, name, calibration_offset, calibration_multiplier, enabled } = req.body;

        let sensorTypeId = sensor_type_id;

        // If type name is provided instead of ID, look up the ID
        if (!sensorTypeId && type) {
            const typeResult = await db.query(
                'SELECT id FROM sensor_types WHERE LOWER(name) = LOWER($1)',
                [type]
            );

            if (typeResult.rows.length > 0) {
                sensorTypeId = typeResult.rows[0].id;
            } else {
                return res.status(400).json({ error: `Unknown sensor type: ${type}` });
            }
        }

        if (!sensorTypeId) {
            return res.status(400).json({ error: 'sensor_type_id or type is required' });
        }

        const result = await db.query(`
            INSERT INTO device_sensors (device_id, sensor_type_id, pin, name, calibration_offset, calibration_multiplier, enabled)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (device_id, pin) DO UPDATE
            SET sensor_type_id = $2,
                name = $4,
                calibration_offset = $5,
                calibration_multiplier = $6,
                enabled = $7,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [deviceId, sensorTypeId, pin, name, calibration_offset || 0, calibration_multiplier || 1, enabled !== false]);

        res.json({ sensor: result.rows[0] });
    } catch (error) {
        logger.error('Create sensor error:', error);
        res.status(500).json({ error: 'Failed to create sensor' });
    }
});

// PUT /api/devices/:deviceId/sensors/:sensorId - Update sensor
router.put('/:deviceId/sensors/:sensorId', authenticateToken, async (req, res) => {
    try {
        const { deviceId, sensorId } = req.params;
        const { name, calibration_offset, calibration_multiplier, enabled, trigger_ota, threshold_min, threshold_max } = req.body;

        const result = await db.query(`
            UPDATE device_sensors
            SET name = COALESCE($1, name),
                calibration_offset = COALESCE($2, calibration_offset),
                calibration_multiplier = COALESCE($3, calibration_multiplier),
                enabled = COALESCE($4, enabled),
                threshold_min = COALESCE($5, threshold_min),
                threshold_max = COALESCE($6, threshold_max),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $7 AND device_id = $8
            RETURNING *
        `, [name, calibration_offset, calibration_multiplier, enabled, threshold_min, threshold_max, sensorId, deviceId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sensor not found' });
        }

        const updatedSensor = result.rows[0];

        // If OTA is requested, queue a firmware rebuild with updated sensor config
        if (trigger_ota !== false) {
            try {
                // Get device info for firmware rebuild
                const deviceResult = await db.query(`
                    SELECT d.device_type, d.name, d.wifi_ssid, d.wifi_password,
                           dc.heartbeat_interval, dc.ota_enabled
                    FROM devices d
                    LEFT JOIN device_configs dc ON d.id = dc.device_id
                    WHERE d.id = $1
                `, [deviceId]);

                if (deviceResult.rows.length > 0) {
                    const deviceInfo = deviceResult.rows[0];

                    // Get all sensors for this device to rebuild firmware
                    const sensorsResult = await db.query(`
                        SELECT ds.*, st.name as sensor_type
                        FROM device_sensors ds
                        JOIN sensor_types st ON ds.sensor_type_id = st.id
                        WHERE ds.device_id = $1 AND ds.enabled = true
                        ORDER BY ds.pin
                    `, [deviceId]);

                    logger.info(`Sensor configuration updated for device ${deviceId}. OTA firmware rebuild queued with ${sensorsResult.rows.length} enabled sensors.`);

                    // Note: In a production environment, you would trigger an actual firmware rebuild here
                    // For now, we just log that the configuration has changed
                    // The device will receive updated calibration values on next server sync
                }
            } catch (otaError) {
                logger.warn(`Failed to queue OTA update after sensor config change: ${otaError.message}`);
                // Don't fail the sensor update if OTA queueing fails
            }
        }

        res.json({
            sensor: updatedSensor,
            message: trigger_ota !== false ? 'Sensor updated. Firmware rebuild queued for OTA deployment.' : 'Sensor updated successfully.'
        });
    } catch (error) {
        logger.error('Update sensor error:', error);
        res.status(500).json({ error: 'Failed to update sensor' });
    }
});

// DELETE /api/devices/:deviceId/sensors/:sensorId - Delete sensor
router.delete('/:deviceId/sensors/:sensorId', authenticateToken, async (req, res) => {
    try {
        const { sensorId } = req.params;

        const result = await db.query('DELETE FROM device_sensors WHERE id = $1 RETURNING id', [sensorId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sensor not found' });
        }

        res.json({ message: 'Sensor deleted successfully' });
    } catch (error) {
        logger.error('Delete sensor error:', error);
        res.status(500).json({ error: 'Failed to delete sensor' });
    }
});

// Telemetry helper routes for frontend compatibility
// GET /api/devices/:id/telemetry/latest - Latest readings per sensor
router.get('/:id/telemetry/latest', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT DISTINCT ON (ds.id)
                t.timestamp,
                t.raw_value,
                t.processed_value as value,
                ds.pin as sensor_pin,
                ds.name as sensor_name,
                st.name as sensor_type,
                st.unit,
                t.metadata
            FROM telemetry t
            JOIN device_sensors ds ON t.device_sensor_id = ds.id
            JOIN sensor_types st ON ds.sensor_type_id = st.id
            WHERE t.device_id = $1
            ORDER BY ds.id, t.timestamp DESC
        `, [id]);

        res.json({ telemetry: result.rows });
    } catch (error) {
        logger.error('Get latest telemetry error:', error);
        res.status(500).json({ error: 'Failed to fetch latest telemetry' });
    }
});

// GET /api/devices/:id/telemetry/history - Proxy to telemetry service
router.get('/:id/telemetry/history', authenticateToken, async (req, res) => {
    try {
        const deviceId = req.params.id;
        const { sensor_pin, start_date, end_date, aggregation = 'raw' } = req.query;

        const telemetryProcessor = req.telemetryProcessor;
        if (!sensor_pin) {
            return res.status(400).json({ error: 'sensor_pin query parameter is required' });
        }
        const safeStart = start_date ? new Date(start_date) : new Date(Date.now() - 24 * 60 * 60 * 1000);
        const safeEnd = end_date ? new Date(end_date) : new Date();

        const data = await telemetryProcessor.getHistoricalTelemetry(
            deviceId,
            sensor_pin,
            safeStart,
            safeEnd,
            aggregation
        );

        res.json({ telemetry: data });
    } catch (error) {
        logger.error('Get historical telemetry error:', error);
        res.status(500).json({ error: 'Failed to fetch telemetry history' });
    }
});

// GET /api/devices/:id/telemetry/stats - Get telemetry statistics
router.get('/:id/telemetry/stats', authenticateToken, async (req, res) => {
    try {
        const deviceId = req.params.id;
        const { range = '24h' } = req.query;

        const telemetryProcessor = req.telemetryProcessor;
        const stats = await telemetryProcessor.getDeviceStats(deviceId, range);

        res.json({ stats });
    } catch (error) {
        logger.error('Get telemetry stats error:', error);
        res.status(500).json({ error: 'Failed to fetch telemetry statistics' });
    }
});

// GET /api/devices/:id/alerts - Get device-specific alerts
router.get('/:id/alerts', authenticateToken, async (req, res) => {
    try {
        const deviceId = req.params.id;
        const { limit = 10 } = req.query;

        // Try with joins first, fall back to simple query if tables don't exist
        let result;
        try {
            result = await db.query(`
                SELECT a.*, ds.name as sensor_name, st.name as sensor_type
                FROM alerts a
                LEFT JOIN device_sensors ds ON a.device_sensor_id = ds.id
                LEFT JOIN sensor_types st ON ds.sensor_type_id = st.id
                WHERE a.device_id = $1
                ORDER BY COALESCE(a.created_at, a.triggered_at) DESC
                LIMIT $2
            `, [deviceId, limit]);
        } catch (joinError) {
            logger.warn('Failed to join sensor tables, trying simple query:', joinError.message);
            // Fallback: just get alerts without sensor info
            result = await db.query(`
                SELECT a.*
                FROM alerts a
                WHERE a.device_id = $1
                ORDER BY COALESCE(a.created_at, a.triggered_at) DESC
                LIMIT $2
            `, [deviceId, limit]);
        }

        res.json({ alerts: result.rows || [] });
    } catch (error) {
        logger.error('Get device alerts error:', error);
        res.status(500).json({ error: 'Failed to fetch device alerts', details: error.message });
    }
});

// GET /api/devices/:id/stats - Get device statistics
router.get('/:id/stats', authenticateToken, async (req, res) => {
    try {
        const deviceId = req.params.id;
        const { range = '24h' } = req.query;

        // Get sensor statistics (handle if method doesn't exist)
        let sensorStats = [];
        const telemetryProcessor = req.telemetryProcessor;
        if (telemetryProcessor && typeof telemetryProcessor.getDeviceStats === 'function') {
            try {
                sensorStats = await telemetryProcessor.getDeviceStats(deviceId, range);
            } catch (err) {
                logger.warn('Failed to get sensor stats:', err.message);
                sensorStats = [];
            }
        }

        // Convert range to proper interval
        const interval = range === '24h' ? '24 hours' :
            range === '7d' ? '7 days' :
                range === '30d' ? '30 days' : '24 hours';

        // Get alert counts
        const alertsResult = await db.query(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'active') as active_alerts,
                COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged_alerts,
                COUNT(*) as total_alerts
            FROM alerts
            WHERE device_id = $1
            AND created_at > NOW() - INTERVAL '${interval}'
        `, [deviceId]);

        const deviceResult = await db.query(`
            SELECT status, last_heartbeat, uptime_seconds
            FROM devices
            WHERE id = $1
        `, [deviceId]);

        res.json({
            stats: {
                sensors: sensorStats || [],
                alerts: alertsResult.rows[0] || { active_alerts: 0, acknowledged_alerts: 0, total_alerts: 0 },
                device: deviceResult.rows[0] || {}
            }
        });
    } catch (error) {
        logger.error('Get device stats error:', error);
        res.status(500).json({ error: 'Failed to fetch device statistics', details: error.message });
    }
});

// GET /api/devices/:id/sensors/:sensorId/threshold-suggestions - Get AI-suggested thresholds based on historical data
router.get('/:id/sensors/:sensorId/threshold-suggestions', authenticateToken, [
    param('id').notEmpty(),
    param('sensorId').isInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id, sensorId } = req.params;
        const { days = 7 } = req.query; // Default to last 7 days

        // Get sensor info
        const sensorResult = await db.query(`
            SELECT ds.id, ds.name, ds.pin, st.name as sensor_type, st.unit
            FROM device_sensors ds
            JOIN sensor_types st ON ds.sensor_type_id = st.id
            WHERE ds.id = $1 AND ds.device_id = $2
        `, [sensorId, id]);

        if (sensorResult.rows.length === 0) {
            return res.status(404).json({ error: 'Sensor not found' });
        }

        const sensor = sensorResult.rows[0];

        // Get historical telemetry data
        const telemetryResult = await db.query(`
            SELECT processed_value
            FROM telemetry
            WHERE device_sensor_id = $1
            AND timestamp > NOW() - INTERVAL '${parseInt(days)} days'
            ORDER BY timestamp DESC
        `, [sensorId]);

        if (telemetryResult.rows.length < 10) {
            return res.status(200).json({
                sensor_id: parseInt(sensorId),
                sensor_name: sensor.name,
                sensor_type: sensor.sensor_type,
                unit: sensor.unit,
                message: 'Insufficient data for threshold recommendations',
                data_points: telemetryResult.rows.length,
                minimum_required: 10,
                suggestions: null
            });
        }

        const values = telemetryResult.rows.map(row => parseFloat(row.processed_value));

        // Calculate statistics
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const sortedValues = [...values].sort((a, b) => a - b);
        const min = sortedValues[0];
        const max = sortedValues[sortedValues.length - 1];
        const median = sortedValues[Math.floor(sortedValues.length / 2)];

        // Calculate standard deviation
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        // Calculate percentiles
        const p5 = sortedValues[Math.floor(sortedValues.length * 0.05)];
        const p95 = sortedValues[Math.floor(sortedValues.length * 0.95)];
        const p10 = sortedValues[Math.floor(sortedValues.length * 0.10)];
        const p90 = sortedValues[Math.floor(sortedValues.length * 0.90)];

        // Generate suggestions based on distribution
        const suggestions = {
            // Conservative: Mean ± 2 std dev (covers ~95% of normal distribution)
            conservative: {
                min: parseFloat((mean - 2 * stdDev).toFixed(2)),
                max: parseFloat((mean + 2 * stdDev).toFixed(2)),
                description: 'Conservative thresholds covering 95% of normal values (±2σ)',
                alert_frequency: 'Rare alerts, only extreme outliers'
            },
            // Moderate: Mean ± 1.5 std dev
            moderate: {
                min: parseFloat((mean - 1.5 * stdDev).toFixed(2)),
                max: parseFloat((mean + 1.5 * stdDev).toFixed(2)),
                description: 'Balanced thresholds for typical variations (±1.5σ)',
                alert_frequency: 'Occasional alerts for significant deviations'
            },
            // Sensitive: Mean ± 1 std dev (covers ~68% of normal distribution)
            sensitive: {
                min: parseFloat((mean - stdDev).toFixed(2)),
                max: parseFloat((mean + stdDev).toFixed(2)),
                description: 'Sensitive thresholds for quick detection (±1σ)',
                alert_frequency: 'More frequent alerts, catches smaller anomalies'
            },
            // Percentile-based: Use 5th and 95th percentiles
            percentile_based: {
                min: parseFloat(p10.toFixed(2)),
                max: parseFloat(p90.toFixed(2)),
                description: 'Percentile-based (10th-90th percentile)',
                alert_frequency: 'Balanced approach based on actual distribution'
            }
        };

        // Add warning if data suggests sensor might be faulty
        let warnings = [];
        if (stdDev / mean > 0.5 && mean > 0) {
            warnings.push('High variability detected - consider checking sensor calibration');
        }
        if (max - min > mean * 3 && mean > 0) {
            warnings.push('Wide data range detected - possible outliers or sensor issues');
        }

        res.json({
            sensor_id: parseInt(sensorId),
            sensor_name: sensor.name,
            sensor_type: sensor.sensor_type,
            unit: sensor.unit,
            analysis: {
                data_points: values.length,
                time_range_days: parseInt(days),
                min: parseFloat(min.toFixed(2)),
                max: parseFloat(max.toFixed(2)),
                mean: parseFloat(mean.toFixed(2)),
                median: parseFloat(median.toFixed(2)),
                std_deviation: parseFloat(stdDev.toFixed(2)),
                coefficient_of_variation: mean > 0 ? parseFloat((stdDev / mean * 100).toFixed(2)) : null,
                percentiles: {
                    p5: parseFloat(p5.toFixed(2)),
                    p10: parseFloat(p10.toFixed(2)),
                    p90: parseFloat(p90.toFixed(2)),
                    p95: parseFloat(p95.toFixed(2))
                }
            },
            suggestions,
            warnings: warnings.length > 0 ? warnings : null,
            recommendation: 'Start with moderate or percentile_based thresholds and adjust based on alert frequency'
        });
    } catch (error) {
        logger.error('Threshold suggestions error:', error);
        res.status(500).json({ error: 'Failed to calculate threshold suggestions' });
    }
});

// POST /api/devices/:id/sensors/:sensorId/rules - Create or update sensor rule
router.post('/:id/sensors/:sensorId/rules', authenticateToken, [
    param('id').notEmpty(),
    param('sensorId').isInt(),
    body('threshold_min').optional().isNumeric(),
    body('threshold_max').optional().isNumeric(),
    body('rule_name').optional().isString(),
    body('severity').optional().isIn(['low', 'medium', 'high', 'critical'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id, sensorId } = req.params;
        const {
            threshold_min,
            threshold_max,
            rule_name = 'Threshold Alert',
            severity = 'medium',
            enabled = true
        } = req.body;

        // Verify sensor exists and belongs to device
        const sensorCheck = await db.query(`
            SELECT id FROM device_sensors WHERE id = $1 AND device_id = $2
        `, [sensorId, id]);

        if (sensorCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Sensor not found' });
        }

        // Check if rule already exists
        const existingRule = await db.query(`
            SELECT id FROM sensor_rules
            WHERE device_sensor_id = $1 AND rule_type = 'threshold'
        `, [sensorId]);

        let result;
        if (existingRule.rows.length > 0) {
            // Update existing rule
            result = await db.query(`
                UPDATE sensor_rules
                SET threshold_min = $1,
                    threshold_max = $2,
                    rule_name = $3,
                    severity = $4,
                    enabled = $5
                WHERE id = $6
                RETURNING *
            `, [threshold_min, threshold_max, rule_name, severity, enabled, existingRule.rows[0].id]);
        } else {
            // Create new rule
            result = await db.query(`
                INSERT INTO sensor_rules (
                    device_sensor_id,
                    rule_name,
                    rule_type,
                    condition,
                    threshold_min,
                    threshold_max,
                    severity,
                    enabled
                ) VALUES ($1, $2, 'threshold', 'between', $3, $4, $5, $6)
                RETURNING *
            `, [sensorId, rule_name, threshold_min, threshold_max, severity, enabled]);
        }

        logger.info(`Sensor rule ${existingRule.rows.length > 0 ? 'updated' : 'created'} for sensor ${sensorId}`);

        res.json({
            message: existingRule.rows.length > 0 ? 'Rule updated successfully' : 'Rule created successfully',
            rule: result.rows[0]
        });
    } catch (error) {
        logger.error('Create/update sensor rule error:', error);
        res.status(500).json({ error: 'Failed to save sensor rule' });
    }
});

// DELETE /api/devices/:id/sensors/:sensorId/rules/:ruleId - Delete sensor rule
router.delete('/:id/sensors/:sensorId/rules/:ruleId', authenticateToken, [
    param('id').notEmpty(),
    param('sensorId').isInt(),
    param('ruleId').isInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id, sensorId, ruleId } = req.params;

        // Verify rule exists and belongs to the correct sensor/device
        const ruleCheck = await db.query(`
            SELECT sr.id
            FROM sensor_rules sr
            JOIN device_sensors ds ON sr.device_sensor_id = ds.id
            WHERE sr.id = $1 AND ds.id = $2 AND ds.device_id = $3
        `, [ruleId, sensorId, id]);

        if (ruleCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Rule not found' });
        }

        await db.query('DELETE FROM sensor_rules WHERE id = $1', [ruleId]);

        logger.info(`Sensor rule ${ruleId} deleted`);

        res.json({ message: 'Rule deleted successfully' });
    } catch (error) {
        logger.error('Delete sensor rule error:', error);
        res.status(500).json({ error: 'Failed to delete sensor rule' });
    }
});

// GET /api/devices/export - Export devices to CSV
router.get('/export', authenticateToken, async (req, res) => {
    try {
        const { location_id, status, device_type } = req.query;

        let query = `
            SELECT
                d.id,
                d.name,
                d.device_type,
                d.status,
                d.location_id,
                l.name as location_name,
                d.firmware_version,
                d.hardware_version,
                d.ip_address,
                d.last_heartbeat,
                d.uptime_seconds,
                d.wifi_ssid,
                d.memory_usage_percent,
                d.wifi_signal_strength,
                d.battery_level,
                d.cpu_temperature,
                d.created_at,
                d.updated_at
            FROM devices d
            LEFT JOIN locations l ON d.location_id = l.id
        `;

        const params = [];
        const conditions = [];

        if (location_id) {
            conditions.push(`d.location_id = $${params.length + 1}`);
            params.push(location_id);
        }

        if (status) {
            conditions.push(`d.status = $${params.length + 1}`);
            params.push(status);
        }

        if (device_type) {
            conditions.push(`d.device_type = $${params.length + 1}`);
            params.push(device_type);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY d.name';

        const result = await db.query(query, params);

        // Convert to CSV
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No devices found' });
        }

        // Build CSV header
        const headers = [
            'Device ID',
            'Name',
            'Type',
            'Status',
            'Location',
            'Firmware Version',
            'Hardware Version',
            'IP Address',
            'Last Heartbeat',
            'Uptime (seconds)',
            'WiFi SSID',
            'Memory Usage (%)',
            'WiFi Signal (dBm)',
            'Battery Level (%)',
            'CPU Temperature (°C)',
            'Created At',
            'Updated At'
        ];

        // Build CSV rows
        const csvRows = [headers.join(',')];

        result.rows.forEach(device => {
            const row = [
                escapeCsvValue(device.id),
                escapeCsvValue(device.name),
                escapeCsvValue(device.device_type),
                escapeCsvValue(device.status),
                escapeCsvValue(device.location_name || ''),
                escapeCsvValue(device.firmware_version || ''),
                escapeCsvValue(device.hardware_version || ''),
                escapeCsvValue(device.ip_address || ''),
                escapeCsvValue(device.last_heartbeat ? new Date(device.last_heartbeat).toISOString() : ''),
                escapeCsvValue(device.uptime_seconds || ''),
                escapeCsvValue(device.wifi_ssid || ''),
                escapeCsvValue(device.memory_usage_percent || ''),
                escapeCsvValue(device.wifi_signal_strength || ''),
                escapeCsvValue(device.battery_level || ''),
                escapeCsvValue(device.cpu_temperature || ''),
                escapeCsvValue(device.created_at ? new Date(device.created_at).toISOString() : ''),
                escapeCsvValue(device.updated_at ? new Date(device.updated_at).toISOString() : '')
            ];
            csvRows.push(row.join(','));
        });

        const csv = csvRows.join('\n');

        // Set headers for file download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="devices_export_${new Date().toISOString().split('T')[0]}.csv"`);

        logger.info(`Devices exported to CSV by ${req.user.email}: ${result.rows.length} devices`);

        res.send(csv);
    } catch (error) {
        logger.error('Export devices error:', error);
        res.status(500).json({ error: 'Failed to export devices' });
    }
});

// Helper function to escape CSV values
function escapeCsvValue(value) {
    if (value === null || value === undefined) {
        return '';
    }

    const stringValue = String(value);

    // If the value contains comma, quote, or newline, wrap it in quotes and escape quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
}

module.exports = router;
