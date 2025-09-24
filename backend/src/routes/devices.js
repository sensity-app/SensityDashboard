const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, authenticateDevice, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/devices - Get all devices
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { location_id, status, device_type } = req.query;
        let query = `
            SELECT d.*, l.name as location_name
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

        res.json({ devices: devicesWithMetadata });
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
            SELECT d.*, l.name as location_name, l.timezone
            FROM devices d
            LEFT JOIN locations l ON d.location_id = l.id
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

        // Update device last heartbeat
        await db.query(`
            UPDATE devices
            SET last_heartbeat = CURRENT_TIMESTAMP,
                status = 'online',
                uptime_seconds = COALESCE($1, uptime_seconds),
                ip_address = $2
            WHERE id = $3
        `, [uptime, req.ip, id]);

        // Process telemetry data using TelemetryProcessor service
        const TelemetryProcessor = require('../services/telemetryProcessor');
        const telemetryProcessor = new TelemetryProcessor();

        for (const sensorData of sensors) {
            try {
                // Find or create device sensor
                let deviceSensor = await db.query(`
                    SELECT ds.*, st.name as sensor_type_name, st.unit
                    FROM device_sensors ds
                    JOIN sensor_types st ON ds.sensor_type_id = st.id
                    WHERE ds.device_id = $1 AND ds.pin = $2
                `, [id, sensorData.pin]);

                if (deviceSensor.rows.length === 0) {
                    // Auto-create device sensor if it doesn't exist
                    const sensorType = await db.query(
                        'SELECT id FROM sensor_types WHERE name = $1',
                        [sensorData.type]
                    );

                    if (sensorType.rows.length > 0) {
                        const newSensor = await db.query(`
                            INSERT INTO device_sensors (device_id, sensor_type_id, pin, name, enabled)
                            VALUES ($1, $2, $3, $4, true)
                            RETURNING *
                        `, [id, sensorType.rows[0].id, sensorData.pin, sensorData.name || `${sensorData.type} Sensor`]);

                        deviceSensor.rows = [{ ...newSensor.rows[0], sensor_type_name: sensorData.type }];
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
                        pin: sensorData.pin,
                        sensor_type: sensorData.type,
                        unit: sensor.unit
                    })
                ]);

                // Process sensor data for alerts using the telemetry processor
                await telemetryProcessor.processSensorData({
                    device_id: id,
                    device_sensor_id: sensor.id,
                    raw_value: rawValue,
                    processed_value: processedValue,
                    sensor,
                    timestamp: sensorData.timestamp || new Date().toISOString()
                });

            } catch (sensorError) {
                logger.error(`Error processing sensor data for device ${id}, pin ${sensorData.pin}:`, sensorError);
            }
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
        const { firmware_version, uptime, free_heap, wifi_rssi } = req.body;

        await db.query(`
            UPDATE devices
            SET last_heartbeat = CURRENT_TIMESTAMP,
                status = 'online',
                firmware_version = COALESCE($1, firmware_version),
                uptime_seconds = COALESCE($2, uptime_seconds),
                ip_address = $3
            WHERE id = $4
        `, [firmware_version, uptime, req.ip, id]);

        res.json({
            message: 'Heartbeat received',
            timestamp: new Date().toISOString()
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

        logger.info(`OTA status update for device ${id}: ${status} ${progress ? `(${progress}%)` : ''}`);

        // Update device if OTA completed successfully
        if (status === 'completed') {
            const device = await db.query('SELECT target_firmware_version FROM devices WHERE id = $1', [id]);
            if (device.rows.length > 0) {
                await db.query(`
                    UPDATE devices
                    SET firmware_version = target_firmware_version,
                        target_firmware_version = NULL
                    WHERE id = $1
                `, [id]);
            }
        }

        res.json({ message: 'OTA status received' });
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

module.exports = router;