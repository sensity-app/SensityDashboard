const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, requireRole, requireAdmin } = require('../middleware/auth');

const router = express.Router();


// GET /api/locations - Get all locations
router.get('/', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                l.*,
                COUNT(d.id) as device_count,
                COUNT(CASE WHEN d.status = 'online' THEN 1 END) as online_devices,
                COUNT(CASE WHEN d.status = 'offline' THEN 1 END) as offline_devices
            FROM locations l
            LEFT JOIN devices d ON l.id = d.location_id
            GROUP BY l.id
            ORDER BY l.name
        `);

        res.json({ locations: result.rows });
    } catch (error) {
        logger.error('Get locations error:', error);
        res.status(500).json({ error: 'Failed to get locations' });
    }
});

// GET /api/locations/:id - Get location by ID
router.get('/:id', [
    param('id').isInt({ min: 1 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const [locationResult, devicesResult] = await Promise.all([
            db.query(`
                SELECT
                    l.*,
                    COUNT(d.id) as device_count,
                    COUNT(CASE WHEN d.status = 'online' THEN 1 END) as online_devices,
                    COUNT(CASE WHEN d.status = 'offline' THEN 1 END) as offline_devices
                FROM locations l
                LEFT JOIN devices d ON l.id = d.location_id
                WHERE l.id = $1
                GROUP BY l.id
            `, [id]),

            db.query(`
                SELECT id, name, status, last_heartbeat, device_type
                FROM devices
                WHERE location_id = $1
                ORDER BY name
            `, [id])
        ]);

        if (locationResult.rows.length === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        const location = locationResult.rows[0];
        location.devices = devicesResult.rows;

        res.json({ location });
    } catch (error) {
        logger.error('Get location error:', error);
        res.status(500).json({ error: 'Failed to get location' });
    }
});

// POST /api/locations - Create new location
router.post('/', [
    body('name').notEmpty().isLength({ min: 1, max: 255 }),
    body('description').optional({ nullable: true }).isLength({ max: 1000 }),
    body('timezone').optional({ nullable: true }).isLength({ max: 50 }),
    body('latitude').optional({ nullable: true }).custom((value) => {
        if (value === null || value === undefined || value === '') return true;
        const num = parseFloat(value);
        if (isNaN(num) || num < -90 || num > 90) {
            throw new Error('Latitude must be between -90 and 90');
        }
        return true;
    }),
    body('longitude').optional({ nullable: true }).custom((value) => {
        if (value === null || value === undefined || value === '') return true;
        const num = parseFloat(value);
        if (isNaN(num) || num < -180 || num > 180) {
            throw new Error('Longitude must be between -180 and 180');
        }
        return true;
    })
], authenticateToken, requireRole(['admin', 'operator']), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const {
            name,
            description,
            timezone = 'UTC',
            latitude,
            longitude
        } = req.body;

        // Check if location name already exists
        const existingLocation = await db.query('SELECT id FROM locations WHERE name = $1', [name]);
        if (existingLocation.rows.length > 0) {
            return res.status(409).json({ error: 'Location name already exists' });
        }

        const result = await db.query(`
            INSERT INTO locations (name, description, timezone, latitude, longitude)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [name, description, timezone, latitude, longitude]);

        const location = result.rows[0];
        logger.info(`Location created: ${location.id} (${name}) by ${req.user.email}`);

        res.status(201).json({
            message: 'Location created successfully',
            location
        });
    } catch (error) {
        logger.error('Create location error:', error);
        res.status(500).json({ error: 'Failed to create location' });
    }
});

// PUT /api/locations/:id - Update location
router.put('/:id', [
    param('id').isInt({ min: 1 }),
    body('name').optional().notEmpty().isLength({ min: 1, max: 255 }),
    body('description').optional({ nullable: true }).isLength({ max: 1000 }),
    body('timezone').optional({ nullable: true }).isLength({ max: 50 }),
    body('latitude').optional({ nullable: true }).custom((value) => {
        if (value === null || value === undefined || value === '') return true;
        const num = parseFloat(value);
        if (isNaN(num) || num < -90 || num > 90) {
            throw new Error('Latitude must be between -90 and 90');
        }
        return true;
    }),
    body('longitude').optional({ nullable: true }).custom((value) => {
        if (value === null || value === undefined || value === '') return true;
        const num = parseFloat(value);
        if (isNaN(num) || num < -180 || num > 180) {
            throw new Error('Longitude must be between -180 and 180');
        }
        return true;
    })
], authenticateToken, requireRole(['admin', 'operator']), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { name, description, timezone, latitude, longitude } = req.body;

        // Check if new name conflicts with existing locations (excluding current one)
        if (name) {
            const existingLocation = await db.query(
                'SELECT id FROM locations WHERE name = $1 AND id != $2',
                [name, id]
            );
            if (existingLocation.rows.length > 0) {
                return res.status(409).json({ error: 'Location name already exists' });
            }
        }

        const result = await db.query(`
            UPDATE locations
            SET name = COALESCE($1, name),
                description = COALESCE($2, description),
                timezone = COALESCE($3, timezone),
                latitude = COALESCE($4, latitude),
                longitude = COALESCE($5, longitude),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING *
        `, [name, description, timezone, latitude, longitude, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        const location = result.rows[0];
        logger.info(`Location updated: ${id} by ${req.user.email}`);

        res.json({
            message: 'Location updated successfully',
            location
        });
    } catch (error) {
        logger.error('Update location error:', error);
        res.status(500).json({ error: 'Failed to update location' });
    }
});

// DELETE /api/locations/:id - Delete location
router.delete('/:id', [
    param('id').isInt({ min: 1 })
], authenticateToken, requireAdmin, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;

        // Check if location has devices
        const devicesResult = await db.query('SELECT COUNT(*) as count FROM devices WHERE location_id = $1', [id]);
        const deviceCount = parseInt(devicesResult.rows[0].count);

        if (deviceCount > 0) {
            return res.status(400).json({
                error: `Cannot delete location with ${deviceCount} devices. Move or delete devices first.`
            });
        }

        const result = await db.query('DELETE FROM locations WHERE id = $1 RETURNING id, name', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        const deletedLocation = result.rows[0];
        logger.info(`Location deleted: ${id} (${deletedLocation.name}) by ${req.user.email}`);

        res.json({ message: 'Location deleted successfully' });
    } catch (error) {
        logger.error('Delete location error:', error);
        res.status(500).json({ error: 'Failed to delete location' });
    }
});

// GET /api/locations/:id/devices - Get all devices for a location
router.get('/:id/devices', [
    param('id').isInt({ min: 1 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;

        // Verify location exists
        const locationResult = await db.query('SELECT id, name FROM locations WHERE id = $1', [id]);
        if (locationResult.rows.length === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        const devicesResult = await db.query(`
            SELECT
                d.*,
                EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - d.last_heartbeat)) as seconds_since_heartbeat,
                COUNT(a.id) as active_alerts
            FROM devices d
            LEFT JOIN alerts a ON d.id = a.device_id AND a.status = 'active'
            WHERE d.location_id = $1
            GROUP BY d.id
            ORDER BY d.name
        `, [id]);

        const devices = devicesResult.rows.map(device => ({
            ...device,
            is_online: device.seconds_since_heartbeat < 600, // 10 minutes
            status: device.seconds_since_heartbeat < 600 ? 'online' : 'offline'
        }));

        res.json({
            location: locationResult.rows[0],
            devices
        });
    } catch (error) {
        logger.error('Get location devices error:', error);
        res.status(500).json({ error: 'Failed to get location devices' });
    }
});

// GET /api/locations/:id/alerts - Get all alerts for devices in a location
router.get('/:id/alerts', [
    param('id').isInt({ min: 1 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { status = 'active' } = req.query;

        // Verify location exists
        const locationResult = await db.query('SELECT id, name FROM locations WHERE id = $1', [id]);
        if (locationResult.rows.length === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        const alertsResult = await db.query(`
            SELECT
                a.*,
                d.name as device_name
            FROM alerts a
            JOIN devices d ON a.device_id = d.id
            WHERE d.location_id = $1 AND a.status = $2
            ORDER BY a.triggered_at DESC
        `, [id, status]);

        res.json({
            location: locationResult.rows[0],
            alerts: alertsResult.rows
        });
    } catch (error) {
        logger.error('Get location alerts error:', error);
        res.status(500).json({ error: 'Failed to get location alerts' });
    }
});

// GET /api/locations/:id/statistics - Get statistics for a location
router.get('/:id/statistics', [
    param('id').isInt({ min: 1 })
], authenticateToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;

        // Verify location exists
        const locationResult = await db.query('SELECT id, name FROM locations WHERE id = $1', [id]);
        if (locationResult.rows.length === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        const [deviceStats, alertStats, recentActivity] = await Promise.all([
            // Device statistics
            db.query(`
                SELECT
                    COUNT(*) as total_devices,
                    COUNT(CASE WHEN status = 'online' THEN 1 END) as online_devices,
                    COUNT(CASE WHEN status = 'offline' THEN 1 END) as offline_devices,
                    COUNT(CASE WHEN device_type = 'esp8266' THEN 1 END) as esp8266_devices,
                    COUNT(CASE WHEN device_type = 'esp32' THEN 1 END) as esp32_devices,
                    AVG(uptime_seconds) as avg_uptime
                FROM devices
                WHERE location_id = $1
            `, [id]),

            // Alert statistics (last 7 days)
            db.query(`
                SELECT
                    COUNT(*) as total_alerts,
                    COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_alerts,
                    COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_alerts,
                    COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_alerts,
                    COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_alerts,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_alerts
                FROM alerts a
                JOIN devices d ON a.device_id = d.id
                WHERE d.location_id = $1 AND a.triggered_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
            `, [id]),

            // Recent activity
            db.query(`
                SELECT
                    'alert' as type,
                    a.id,
                    a.alert_type as title,
                    a.message as description,
                    a.triggered_at as timestamp,
                    d.name as device_name
                FROM alerts a
                JOIN devices d ON a.device_id = d.id
                WHERE d.location_id = $1 AND a.triggered_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
                ORDER BY a.triggered_at DESC
                LIMIT 10
            `, [id])
        ]);

        res.json({
            location: locationResult.rows[0],
            devices: deviceStats.rows[0],
            alerts: alertStats.rows[0],
            recent_activity: recentActivity.rows
        });
    } catch (error) {
        logger.error('Get location statistics error:', error);
        res.status(500).json({ error: 'Failed to get location statistics' });
    }
});

module.exports = router;