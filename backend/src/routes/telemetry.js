const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/telemetry/devices/:device_id - Get telemetry data for a device
router.get('/devices/:device_id', [
    param('device_id').notEmpty(),
    query('sensor_id').optional().isInt(),
    query('sensor_pin').optional(),
    query('sensor_type').optional(),
    query('start_time').optional().isISO8601(),
    query('end_time').optional().isISO8601(),
    query('aggregation').optional().isIn(['raw', 'hourly', 'daily']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 1000 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { device_id } = req.params;
        const {
            sensor_id,
            sensor_pin,
            sensor_type,
            start_time,
            end_time,
            aggregation = 'raw',
            page = 1,
            limit = 100
        } = req.query;

        const offset = (page - 1) * limit;

        // Build WHERE conditions
        const conditions = ['t.device_id = $1'];
        const params = [device_id];

        if (sensor_id) {
            conditions.push(`ds.id = $${params.length + 1}`);
            params.push(sensor_id);
        }

        if (sensor_pin) {
            conditions.push(`ds.pin = $${params.length + 1}`);
            params.push(sensor_pin);
        }

        if (sensor_type) {
            conditions.push(`st.name = $${params.length + 1}`);
            params.push(sensor_type);
        }

        if (start_time) {
            conditions.push(`t.timestamp >= $${params.length + 1}`);
            params.push(start_time);
        }

        if (end_time) {
            conditions.push(`t.timestamp <= $${params.length + 1}`);
            params.push(end_time);
        }

        const whereClause = 'WHERE ' + conditions.join(' AND ');

        let query, countQuery;

        if (aggregation === 'raw') {
            query = `
                SELECT
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
                ${whereClause}
                ORDER BY t.timestamp DESC
                LIMIT $${params.length + 1} OFFSET $${params.length + 2}
            `;
            params.push(limit, offset);

            countQuery = `
                SELECT COUNT(*) as total
                FROM telemetry t
                JOIN device_sensors ds ON t.device_sensor_id = ds.id
                JOIN sensor_types st ON ds.sensor_type_id = st.id
                ${whereClause}
            `;
        } else if (aggregation === 'hourly') {
            query = `
                SELECT
                    DATE_TRUNC('hour', t.timestamp) as timestamp,
                    ds.pin as sensor_pin,
                    ds.name as sensor_name,
                    st.name as sensor_type,
                    st.unit,
                    AVG(t.processed_value) as avg_value,
                    MIN(t.processed_value) as min_value,
                    MAX(t.processed_value) as max_value,
                    COUNT(*) as sample_count
                FROM telemetry t
                JOIN device_sensors ds ON t.device_sensor_id = ds.id
                JOIN sensor_types st ON ds.sensor_type_id = st.id
                ${whereClause}
                GROUP BY DATE_TRUNC('hour', t.timestamp), ds.pin, ds.name, st.name, st.unit
                ORDER BY timestamp DESC
                LIMIT $${params.length + 1} OFFSET $${params.length + 2}
            `;
            params.push(limit, offset);

            countQuery = `
                SELECT COUNT(DISTINCT DATE_TRUNC('hour', t.timestamp)) as total
                FROM telemetry t
                JOIN device_sensors ds ON t.device_sensor_id = ds.id
                JOIN sensor_types st ON ds.sensor_type_id = st.id
                ${whereClause}
            `;
        } else if (aggregation === 'daily') {
            query = `
                SELECT
                    DATE_TRUNC('day', t.timestamp) as timestamp,
                    ds.pin as sensor_pin,
                    ds.name as sensor_name,
                    st.name as sensor_type,
                    st.unit,
                    AVG(t.processed_value) as avg_value,
                    MIN(t.processed_value) as min_value,
                    MAX(t.processed_value) as max_value,
                    COUNT(*) as sample_count
                FROM telemetry t
                JOIN device_sensors ds ON t.device_sensor_id = ds.id
                JOIN sensor_types st ON ds.sensor_type_id = st.id
                ${whereClause}
                GROUP BY DATE_TRUNC('day', t.timestamp), ds.pin, ds.name, st.name, st.unit
                ORDER BY timestamp DESC
                LIMIT $${params.length + 1} OFFSET $${params.length + 2}
            `;
            params.push(limit, offset);

            countQuery = `
                SELECT COUNT(DISTINCT DATE_TRUNC('day', t.timestamp)) as total
                FROM telemetry t
                JOIN device_sensors ds ON t.device_sensor_id = ds.id
                JOIN sensor_types st ON ds.sensor_type_id = st.id
                ${whereClause}
            `;
        }

        const [telemetryResult, countResult] = await Promise.all([
            db.query(query, params.slice(0, -2).concat([limit, offset])),
            db.query(countQuery, params.slice(0, -2))
        ]);

        res.json({
            telemetry: telemetryResult.rows,
            pagination: {
                total: parseInt(countResult.rows[0].total),
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(countResult.rows[0].total / limit)
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
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { device_id } = req.params;

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
            WHERE t.device_id = $1 AND ds.enabled = true
            ORDER BY ds.id, t.timestamp DESC
        `, [device_id]);

        res.json({ latest_readings: result.rows });
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
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { device_id } = req.params;

        const result = await db.query(`
            SELECT
                ds.id,
                ds.pin,
                ds.name,
                ds.enabled,
                ds.calibration_offset,
                ds.calibration_multiplier,
                st.name as sensor_type,
                st.unit,
                st.min_value,
                st.max_value,
                st.description,
                st.icon,
                COUNT(t.id) as data_points,
                MAX(t.timestamp) as last_reading
            FROM device_sensors ds
            JOIN sensor_types st ON ds.sensor_type_id = st.id
            LEFT JOIN telemetry t ON ds.id = t.device_sensor_id
            WHERE ds.device_id = $1
            GROUP BY ds.id, ds.pin, ds.name, ds.enabled, ds.calibration_offset, ds.calibration_multiplier,
                     st.name, st.unit, st.min_value, st.max_value, st.description, st.icon
            ORDER BY ds.pin
        `, [device_id]);

        res.json({ sensors: result.rows });
    } catch (error) {
        logger.error('Get device sensors error:', error);
        res.status(500).json({ error: 'Failed to get device sensors' });
    }
});

// GET /api/telemetry/devices/:device_id/export - Export telemetry data as CSV
router.get('/devices/:device_id/export', [
    param('device_id').notEmpty(),
    query('start_time').optional().isISO8601(),
    query('end_time').optional().isISO8601(),
    query('sensor_id').optional().isInt(),
    query('format').optional().isIn(['csv', 'json'])
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { device_id } = req.params;
        const { start_time, end_time, sensor_id, format = 'csv' } = req.query;

        const conditions = ['t.device_id = $1'];
        const params = [device_id];

        if (sensor_id) {
            conditions.push(`ds.id = $${params.length + 1}`);
            params.push(sensor_id);
        }

        if (start_time) {
            conditions.push(`t.timestamp >= $${params.length + 1}`);
            params.push(start_time);
        }

        if (end_time) {
            conditions.push(`t.timestamp <= $${params.length + 1}`);
            params.push(end_time);
        }

        const whereClause = 'WHERE ' + conditions.join(' AND ');

        const result = await db.query(`
            SELECT
                t.timestamp,
                t.raw_value,
                t.processed_value as value,
                ds.pin as sensor_pin,
                ds.name as sensor_name,
                st.name as sensor_type,
                st.unit
            FROM telemetry t
            JOIN device_sensors ds ON t.device_sensor_id = ds.id
            JOIN sensor_types st ON ds.sensor_type_id = st.id
            ${whereClause}
            ORDER BY t.timestamp DESC
        `, params);

        if (format === 'json') {
            const filename = `telemetry_${device_id}_${new Date().toISOString().split('T')[0]}.json`;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.json({ telemetry: result.rows });
        } else {
            // CSV format
            const csvHeader = 'Timestamp,Raw Value,Processed Value,Sensor Pin,Sensor Name,Sensor Type,Unit\n';
            const csvData = result.rows.map(row =>
                `${row.timestamp},${row.raw_value},${row.value},${row.sensor_pin},"${row.sensor_name}","${row.sensor_type}",${row.unit}`
            ).join('\n');

            const filename = `telemetry_${device_id}_${new Date().toISOString().split('T')[0]}.csv`;
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(csvHeader + csvData);
        }
    } catch (error) {
        logger.error('Export telemetry error:', error);
        res.status(500).json({ error: 'Failed to export telemetry data' });
    }
});

// DELETE /api/telemetry/devices/:device_id - Delete telemetry data (cleanup)
router.delete('/devices/:device_id', [
    param('device_id').notEmpty(),
    query('older_than_days').optional().isInt({ min: 1 }),
    query('sensor_id').optional().isInt(),
    query('confirm').isBoolean()
], authenticateToken, requireAdmin, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { device_id } = req.params;
        const { older_than_days, sensor_id, confirm } = req.query;

        if (!confirm || confirm !== 'true') {
            return res.status(400).json({
                error: 'Confirmation required. Add ?confirm=true to proceed.'
            });
        }

        const conditions = ['device_id = $1'];
        const params = [device_id];

        if (older_than_days) {
            conditions.push(`timestamp < NOW() - INTERVAL '${older_than_days} days'`);
        }

        if (sensor_id) {
            conditions.push(`device_sensor_id = $${params.length + 1}`);
            params.push(sensor_id);
        }

        const whereClause = 'WHERE ' + conditions.join(' AND ');

        // Get count first
        const countResult = await db.query(`SELECT COUNT(*) as count FROM telemetry ${whereClause}`, params);
        const deletedCount = countResult.rows[0].count;

        // Delete the records
        await db.query(`DELETE FROM telemetry ${whereClause}`, params);

        logger.info(`Deleted ${deletedCount} telemetry records for device ${device_id} by ${req.user.email}`);

        res.json({
            message: `${deletedCount} telemetry records deleted successfully`,
            deleted_count: deletedCount,
            device_id
        });
    } catch (error) {
        logger.error('Delete telemetry error:', error);
        res.status(500).json({ error: 'Failed to delete telemetry data' });
    }
});

// GET /api/telemetry/statistics - Get telemetry statistics across all devices
router.get('/statistics', [
    query('start_time').optional().isISO8601(),
    query('end_time').optional().isISO8601(),
    query('device_type').optional()
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { start_time, end_time, device_type } = req.query;

        const conditions = [];
        const params = [];

        if (start_time) {
            conditions.push(`t.timestamp >= $${params.length + 1}`);
            params.push(start_time);
        }

        if (end_time) {
            conditions.push(`t.timestamp <= $${params.length + 1}`);
            params.push(end_time);
        }

        if (device_type) {
            conditions.push(`d.device_type = $${params.length + 1}`);
            params.push(device_type);
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        const [deviceStats, sensorStats] = await Promise.all([
            db.query(`
                SELECT
                    d.device_type,
                    COUNT(DISTINCT d.id) as device_count,
                    COUNT(t.id) as total_readings,
                    AVG(EXTRACT(EPOCH FROM (NOW() - MAX(t.timestamp)))) as avg_last_seen_seconds
                FROM telemetry t
                JOIN devices d ON t.device_id = d.id
                JOIN device_sensors ds ON t.device_sensor_id = ds.id
                ${whereClause}
                GROUP BY d.device_type
            `, params),

            db.query(`
                SELECT
                    st.name as sensor_type,
                    COUNT(DISTINCT ds.id) as sensor_count,
                    COUNT(t.id) as total_readings,
                    AVG(t.processed_value) as avg_value,
                    MIN(t.processed_value) as min_value,
                    MAX(t.processed_value) as max_value
                FROM telemetry t
                JOIN device_sensors ds ON t.device_sensor_id = ds.id
                JOIN sensor_types st ON ds.sensor_type_id = st.id
                JOIN devices d ON t.device_id = d.id
                ${whereClause}
                GROUP BY st.name
            `, params)
        ]);

        res.json({
            device_statistics: deviceStats.rows,
            sensor_statistics: sensorStats.rows
        });
    } catch (error) {
        logger.error('Get telemetry statistics error:', error);
        res.status(500).json({ error: 'Failed to get telemetry statistics' });
    }
});

module.exports = router;