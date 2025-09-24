const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    const jwt = require('jsonwebtoken');
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// GET /api/telemetry/devices/:device_id - Get telemetry data for a device
router.get('/devices/:device_id', [
    param('device_id').notEmpty(),
    query('sensor_pin').optional().isInt(),
    query('sensor_type').optional().notEmpty(),
    query('start_time').optional().isISO8601(),
    query('end_time').optional().isISO8601(),
    query('limit').optional().isInt({ min: 1, max: 10000 }),
    query('aggregation').optional().isIn(['raw', 'hourly', 'daily']),
    query('page').optional().isInt({ min: 1 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { device_id } = req.params;
        const {
            sensor_pin,
            sensor_type,
            start_time,
            end_time,
            limit = 1000,
            aggregation = 'raw',
            page = 1
        } = req.query;

        // Verify device exists
        const deviceResult = await db.query('SELECT id, name FROM devices WHERE id = $1', [device_id]);
        if (deviceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        let query;
        let countQuery;
        const params = [device_id];
        const conditions = ['device_id = $1'];

        if (sensor_pin !== undefined) {
            conditions.push(`sensor_pin = $${params.length + 1}`);
            params.push(parseInt(sensor_pin));
        }

        if (sensor_type) {
            conditions.push(`sensor_type = $${params.length + 1}`);
            params.push(sensor_type);
        }

        if (start_time) {
            conditions.push(`timestamp >= $${params.length + 1}`);
            params.push(start_time);
        }

        if (end_time) {
            conditions.push(`timestamp <= $${params.length + 1}`);
            params.push(end_time);
        }

        const whereClause = 'WHERE ' + conditions.join(' AND ');

        if (aggregation === 'raw') {
            query = `
                SELECT t.timestamp, ds.pin as sensor_pin, st.name as sensor_type, t.processed_value as value, st.unit
                FROM telemetry t
                JOIN device_sensors ds ON t.device_sensor_id = ds.id
                JOIN sensor_types st ON ds.sensor_type_id = st.id
                ${whereClause.replace('sensor_pin', 'ds.pin').replace('sensor_type', 'st.name').replace('device_telemetry', 'telemetry t')}
                ORDER BY t.timestamp DESC
            `;

            countQuery = `
                SELECT COUNT(*) as total
                FROM telemetry t
                JOIN device_sensors ds ON t.device_sensor_id = ds.id
                JOIN sensor_types st ON ds.sensor_type_id = st.id
                ${whereClause.replace('sensor_pin', 'ds.pin').replace('sensor_type', 'st.name').replace('device_telemetry', 'telemetry t')}
            `;
        } else if (aggregation === 'hourly') {
            query = `
                SELECT
                    DATE_TRUNC('hour', timestamp) as timestamp,
                    sensor_pin,
                    sensor_type,
                    AVG(value) as value,
                    MIN(value) as min_value,
                    MAX(value) as max_value,
                    COUNT(*) as sample_count,
                    unit
                FROM device_telemetry
                ${whereClause}
                GROUP BY DATE_TRUNC('hour', timestamp), sensor_pin, sensor_type, unit
                ORDER BY timestamp DESC
            `;

            countQuery = `
                SELECT COUNT(DISTINCT DATE_TRUNC('hour', timestamp), sensor_pin, sensor_type) as total
                FROM device_telemetry
                ${whereClause}
            `;
        } else if (aggregation === 'daily') {
            query = `
                SELECT
                    DATE_TRUNC('day', timestamp) as timestamp,
                    sensor_pin,
                    sensor_type,
                    AVG(value) as value,
                    MIN(value) as min_value,
                    MAX(value) as max_value,
                    COUNT(*) as sample_count,
                    unit
                FROM device_telemetry
                ${whereClause}
                GROUP BY DATE_TRUNC('day', timestamp), sensor_pin, sensor_type, unit
                ORDER BY timestamp DESC
            `;

            countQuery = `
                SELECT COUNT(DISTINCT DATE_TRUNC('day', timestamp), sensor_pin, sensor_type) as total
                FROM device_telemetry
                ${whereClause}
            `;
        }

        // Add pagination
        const offset = (page - 1) * limit;
        query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const [telemetryResult, countResult] = await Promise.all([
            db.query(query, params),
            db.query(countQuery, params.slice(0, -2)) // Remove limit and offset for count
        ]);

        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        res.json({
            device: deviceResult.rows[0],
            telemetry: telemetryResult.rows,
            aggregation,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        logger.error('Get telemetry error:', error);
        res.status(500).json({ error: 'Failed to get telemetry data' });
    }
});

// GET /api/telemetry/devices/:device_id/latest - Get latest telemetry readings for a device
router.get('/devices/:device_id/latest', [
    param('device_id').notEmpty()
], authenticateToken, async (req, res) => {
    try {
        const { device_id } = req.params;

        // Verify device exists
        const deviceResult = await db.query('SELECT id, name FROM devices WHERE id = $1', [device_id]);
        if (deviceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Get latest reading for each sensor
        const result = await db.query(`
            SELECT DISTINCT ON (sensor_pin, sensor_type)
                sensor_pin,
                sensor_type,
                value,
                unit,
                timestamp
            FROM device_telemetry
            WHERE device_id = $1
            ORDER BY sensor_pin, sensor_type, timestamp DESC
        `, [device_id]);

        res.json({
            device: deviceResult.rows[0],
            latest_readings: result.rows
        });
    } catch (error) {
        logger.error('Get latest telemetry error:', error);
        res.status(500).json({ error: 'Failed to get latest telemetry' });
    }
});

// GET /api/telemetry/devices/:device_id/sensors - Get sensor information for a device
router.get('/devices/:device_id/sensors', [
    param('device_id').notEmpty()
], authenticateToken, async (req, res) => {
    try {
        const { device_id } = req.params;

        // Verify device exists
        const deviceResult = await db.query('SELECT id, name FROM devices WHERE id = $1', [device_id]);
        if (deviceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Get sensor information with statistics
        const result = await db.query(`
            SELECT
                sensor_pin,
                sensor_type,
                unit,
                COUNT(*) as total_readings,
                MIN(value) as min_value,
                MAX(value) as max_value,
                AVG(value) as avg_value,
                MIN(timestamp) as first_reading,
                MAX(timestamp) as last_reading
            FROM device_telemetry
            WHERE device_id = $1
            GROUP BY sensor_pin, sensor_type, unit
            ORDER BY sensor_pin
        `, [device_id]);

        res.json({
            device: deviceResult.rows[0],
            sensors: result.rows
        });
    } catch (error) {
        logger.error('Get device sensors error:', error);
        res.status(500).json({ error: 'Failed to get device sensors' });
    }
});

// GET /api/telemetry/devices/:device_id/export - Export telemetry data as CSV
router.get('/devices/:device_id/export', [
    param('device_id').notEmpty(),
    query('sensor_pin').optional().isInt(),
    query('sensor_type').optional().notEmpty(),
    query('start_time').optional().isISO8601(),
    query('end_time').optional().isISO8601(),
    query('format').optional().isIn(['csv', 'json'])
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { device_id } = req.params;
        const { sensor_pin, sensor_type, start_time, end_time, format = 'csv' } = req.query;

        // Verify device exists
        const deviceResult = await db.query('SELECT id, name FROM devices WHERE id = $1', [device_id]);
        if (deviceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const params = [device_id];
        const conditions = ['device_id = $1'];

        if (sensor_pin !== undefined) {
            conditions.push(`sensor_pin = $${params.length + 1}`);
            params.push(parseInt(sensor_pin));
        }

        if (sensor_type) {
            conditions.push(`sensor_type = $${params.length + 1}`);
            params.push(sensor_type);
        }

        if (start_time) {
            conditions.push(`timestamp >= $${params.length + 1}`);
            params.push(start_time);
        }

        if (end_time) {
            conditions.push(`timestamp <= $${params.length + 1}`);
            params.push(end_time);
        }

        const whereClause = 'WHERE ' + conditions.join(' AND ');

        const result = await db.query(`
            SELECT timestamp, sensor_pin, sensor_type, value, unit
            FROM device_telemetry
            ${whereClause}
            ORDER BY timestamp DESC
            LIMIT 50000
        `, params);

        if (format === 'csv') {
            // Generate CSV
            let csv = 'Timestamp,Sensor Pin,Sensor Type,Value,Unit\n';
            for (const row of result.rows) {
                csv += `${row.timestamp},${row.sensor_pin},${row.sensor_type},${row.value},${row.unit}\n`;
            }

            const filename = `telemetry_${device_id}_${new Date().toISOString().split('T')[0]}.csv`;
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(csv);
        } else {
            // Return JSON
            res.json({
                device: deviceResult.rows[0],
                telemetry: result.rows,
                export_info: {
                    format,
                    record_count: result.rows.length,
                    generated_at: new Date().toISOString()
                }
            });
        }

        logger.info(`Telemetry exported for device ${device_id} in ${format} format by ${req.user.email}`);
    } catch (error) {
        logger.error('Export telemetry error:', error);
        res.status(500).json({ error: 'Failed to export telemetry data' });
    }
});

// POST /api/telemetry/devices/:device_id - Add telemetry data (for testing purposes)
router.post('/devices/:device_id', [
    param('device_id').notEmpty(),
    body('sensor_pin').isInt({ min: -10, max: 50 }), // Allow negative pins for system metrics
    body('sensor_type').notEmpty(),
    body('value').isNumeric(),
    body('unit').notEmpty(),
    body('timestamp').optional().isISO8601()
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Only allow admin/operator to manually add telemetry data
        if (req.user.role !== 'admin' && req.user.role !== 'operator') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const { device_id } = req.params;
        const { sensor_pin, sensor_type, value, unit, timestamp } = req.body;

        // Verify device exists
        const deviceResult = await db.query('SELECT id FROM devices WHERE id = $1', [device_id]);
        if (deviceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const result = await db.query(`
            INSERT INTO device_telemetry (device_id, sensor_pin, sensor_type, value, unit, timestamp)
            VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_TIMESTAMP))
            RETURNING *
        `, [device_id, sensor_pin, sensor_type, value, unit, timestamp]);

        const telemetryRecord = result.rows[0];
        logger.info(`Manual telemetry added for device ${device_id} by ${req.user.email}`);

        res.status(201).json({
            message: 'Telemetry data added successfully',
            telemetry: telemetryRecord
        });
    } catch (error) {
        logger.error('Add telemetry error:', error);
        res.status(500).json({ error: 'Failed to add telemetry data' });
    }
});

// DELETE /api/telemetry/devices/:device_id - Delete telemetry data (cleanup)
router.delete('/devices/:device_id', [
    param('device_id').notEmpty(),
    query('older_than_days').optional().isInt({ min: 1, max: 3650 }),
    query('sensor_pin').optional().isInt(),
    query('sensor_type').optional().notEmpty()
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Only allow admin to delete telemetry data
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin permissions required' });
        }

        const { device_id } = req.params;
        const { older_than_days = 90, sensor_pin, sensor_type } = req.query;

        // Verify device exists
        const deviceResult = await db.query('SELECT id FROM devices WHERE id = $1', [device_id]);
        if (deviceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const params = [device_id, older_than_days];
        const conditions = ['device_id = $1', `timestamp < CURRENT_TIMESTAMP - INTERVAL '${older_than_days} days'`];

        if (sensor_pin !== undefined) {
            conditions.push(`sensor_pin = $${params.length + 1}`);
            params.push(parseInt(sensor_pin));
        }

        if (sensor_type) {
            conditions.push(`sensor_type = $${params.length + 1}`);
            params.push(sensor_type);
        }

        const whereClause = 'WHERE ' + conditions.join(' AND ');

        const result = await db.query(`
            DELETE FROM device_telemetry
            ${whereClause}
            RETURNING COUNT(*) as deleted_count
        `, params.slice(0, -1)); // Remove older_than_days from params since it's inline

        // Since DELETE...RETURNING COUNT(*) doesn't work in PostgreSQL, we'll do it differently
        const countResult = await db.query(`
            SELECT COUNT(*) as count FROM device_telemetry ${whereClause}
        `, params.slice(0, -1));

        await db.query(`DELETE FROM device_telemetry ${whereClause}`, params.slice(0, -1));

        const deletedCount = parseInt(countResult.rows[0].count);

        logger.info(`Deleted ${deletedCount} telemetry records for device ${device_id} by ${req.user.email}`);

        res.json({
            message: `${deletedCount} telemetry records deleted successfully`,
            deleted_count: deletedCount,
            criteria: {
                device_id,
                older_than_days,
                sensor_pin: sensor_pin || 'all',
                sensor_type: sensor_type || 'all'
            }
        });
    } catch (error) {
        logger.error('Delete telemetry error:', error);
        res.status(500).json({ error: 'Failed to delete telemetry data' });
    }
});

// GET /api/telemetry/statistics - Get telemetry statistics across all devices
router.get('/statistics', authenticateToken, [
    query('device_type').optional().isIn(['esp8266', 'esp32', 'arduino']),
    query('location_id').optional().isInt({ min: 1 }),
    query('period').optional().isIn(['24h', '7d', '30d'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { device_type, location_id, period = '7d' } = req.query;

        let intervalClause;
        switch (period) {
            case '24h':
                intervalClause = "dt.timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'";
                break;
            case '7d':
                intervalClause = "dt.timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'";
                break;
            case '30d':
                intervalClause = "dt.timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 days'";
                break;
        }

        let deviceJoin = 'FROM device_telemetry dt JOIN devices d ON dt.device_id = d.id';
        const params = [];
        const conditions = [intervalClause];

        if (device_type) {
            conditions.push(`d.device_type = $${params.length + 1}`);
            params.push(device_type);
        }

        if (location_id) {
            conditions.push(`d.location_id = $${params.length + 1}`);
            params.push(location_id);
        }

        const whereClause = 'WHERE ' + conditions.join(' AND ');

        const [totalStats, sensorStats, deviceStats, timelineStats] = await Promise.all([
            // Total statistics
            db.query(`
                SELECT
                    COUNT(*) as total_readings,
                    COUNT(DISTINCT dt.device_id) as active_devices,
                    COUNT(DISTINCT CONCAT(dt.device_id, '-', dt.sensor_pin, '-', dt.sensor_type)) as unique_sensors
                ${deviceJoin}
                ${whereClause}
            `, params),

            // By sensor type
            db.query(`
                SELECT
                    dt.sensor_type,
                    COUNT(*) as reading_count,
                    COUNT(DISTINCT dt.device_id) as device_count,
                    AVG(dt.value) as avg_value,
                    MIN(dt.value) as min_value,
                    MAX(dt.value) as max_value
                ${deviceJoin}
                ${whereClause}
                GROUP BY dt.sensor_type
                ORDER BY reading_count DESC
            `, params),

            // By device
            db.query(`
                SELECT
                    d.id as device_id,
                    d.name as device_name,
                    d.device_type,
                    COUNT(dt.*) as reading_count,
                    MAX(dt.timestamp) as last_reading
                ${deviceJoin}
                ${whereClause}
                GROUP BY d.id, d.name, d.device_type
                ORDER BY reading_count DESC
                LIMIT 10
            `, params),

            // Timeline (daily aggregation)
            db.query(`
                SELECT
                    DATE_TRUNC('day', dt.timestamp) as date,
                    COUNT(*) as reading_count,
                    COUNT(DISTINCT dt.device_id) as active_devices
                ${deviceJoin}
                ${whereClause}
                GROUP BY DATE_TRUNC('day', dt.timestamp)
                ORDER BY date
            `, params)
        ]);

        res.json({
            period,
            total: totalStats.rows[0],
            by_sensor_type: sensorStats.rows,
            by_device: deviceStats.rows,
            timeline: timelineStats.rows
        });
    } catch (error) {
        logger.error('Get telemetry statistics error:', error);
        res.status(500).json({ error: 'Failed to get telemetry statistics' });
    }
});

// POST /api/telemetry/cleanup - Cleanup old telemetry data (admin only)
router.post('/cleanup', [
    body('older_than_days').isInt({ min: 1, max: 3650 }),
    body('dry_run').optional().isBoolean()
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Only allow admin to perform cleanup
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin permissions required' });
        }

        const { older_than_days, dry_run = false } = req.body;

        // Count records that would be deleted
        const countResult = await db.query(`
            SELECT COUNT(*) as count
            FROM device_telemetry
            WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '${older_than_days} days'
        `);

        const recordsToDelete = parseInt(countResult.rows[0].count);

        if (dry_run) {
            res.json({
                message: 'Dry run completed',
                records_to_delete: recordsToDelete,
                older_than_days,
                dry_run: true
            });
        } else {
            // Perform actual cleanup
            await db.query(`
                DELETE FROM device_telemetry
                WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '${older_than_days} days'
            `);

            logger.info(`Cleaned up ${recordsToDelete} telemetry records older than ${older_than_days} days by ${req.user.email}`);

            res.json({
                message: 'Cleanup completed successfully',
                records_deleted: recordsToDelete,
                older_than_days,
                dry_run: false
            });
        }
    } catch (error) {
        logger.error('Telemetry cleanup error:', error);
        res.status(500).json({ error: 'Failed to cleanup telemetry data' });
    }
});

module.exports = router;