const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

// Get all sensor rules with filtering
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { scope, entity_id, sensor_type } = req.query;

        let query = `
            SELECT 
                sr.id,
                sr.device_sensor_id,
                sr.threshold_min,
                sr.threshold_max,
                sr.severity,
                sr.enabled,
                sr.rule_name,
                sr.created_at,
                sr.updated_at,
                ds.name as sensor_name,
                ds.sensor_type,
                ds.pin,
                d.id as device_id,
                d.name as device_name,
                d.location_id,
                l.name as location_name,
                COALESCE(sr.scope, 'device') as scope
            FROM sensor_rules sr
            JOIN device_sensors ds ON sr.device_sensor_id = ds.id
            JOIN devices d ON ds.device_id = d.id
            LEFT JOIN locations l ON d.location_id = l.id
            WHERE d.user_id = $1
        `;

        const params = [req.user.userId];
        let paramIndex = 2;

        if (scope && scope !== 'all') {
            query += ` AND COALESCE(sr.scope, 'device') = $${paramIndex}`;
            params.push(scope);
            paramIndex++;
        }

        if (entity_id) {
            if (scope === 'device') {
                query += ` AND d.id = $${paramIndex}`;
                params.push(entity_id);
                paramIndex++;
            } else if (scope === 'location') {
                query += ` AND d.location_id = $${paramIndex}`;
                params.push(entity_id);
                paramIndex++;
            }
        }

        if (sensor_type && sensor_type !== 'all') {
            query += ` AND ds.sensor_type = $${paramIndex}`;
            params.push(sensor_type);
            paramIndex++;
        }

        query += ` ORDER BY sr.created_at DESC`;

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching sensor rules:', error);
        res.status(500).json({ error: 'Failed to fetch sensor rules' });
    }
});

// Get sensor rules for a specific device
router.get('/device/:deviceId', authenticateToken, async (req, res) => {
    try {
        const { deviceId } = req.params;

        const result = await db.query(`
            SELECT 
                sr.id,
                sr.device_sensor_id,
                sr.threshold_min,
                sr.threshold_max,
                sr.severity,
                sr.enabled,
                sr.rule_name,
                sr.created_at,
                sr.updated_at,
                ds.name as sensor_name,
                ds.sensor_type,
                ds.pin,
                d.id as device_id,
                d.name as device_name
            FROM sensor_rules sr
            JOIN device_sensors ds ON sr.device_sensor_id = ds.id
            JOIN devices d ON ds.device_id = d.id
            WHERE d.id = $1 AND d.user_id = $2
            ORDER BY ds.pin
        `, [deviceId, req.user.userId]);

        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching device sensor rules:', error);
        res.status(500).json({ error: 'Failed to fetch device sensor rules' });
    }
});

// Get sensor rules for a specific location
router.get('/location/:locationId', authenticateToken, async (req, res) => {
    try {
        const { locationId } = req.params;

        const result = await db.query(`
            SELECT 
                sr.id,
                sr.device_sensor_id,
                sr.threshold_min,
                sr.threshold_max,
                sr.severity,
                sr.enabled,
                sr.rule_name,
                sr.scope,
                sr.created_at,
                sr.updated_at,
                ds.name as sensor_name,
                ds.sensor_type,
                ds.pin,
                d.id as device_id,
                d.name as device_name,
                l.name as location_name
            FROM sensor_rules sr
            JOIN device_sensors ds ON sr.device_sensor_id = ds.id
            JOIN devices d ON ds.device_id = d.id
            JOIN locations l ON d.location_id = l.id
            WHERE d.location_id = $1 AND d.user_id = $2
            ORDER BY d.name, ds.pin
        `, [locationId, req.user.userId]);

        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching location sensor rules:', error);
        res.status(500).json({ error: 'Failed to fetch location sensor rules' });
    }
});

// Get all available sensor types
router.get('/sensor-types', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT DISTINCT sensor_type as name
            FROM device_sensors ds
            JOIN devices d ON ds.device_id = d.id
            WHERE d.user_id = $1
            ORDER BY sensor_type
        `, [req.user.userId]);

        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching sensor types:', error);
        res.status(500).json({ error: 'Failed to fetch sensor types' });
    }
});

module.exports = router;
