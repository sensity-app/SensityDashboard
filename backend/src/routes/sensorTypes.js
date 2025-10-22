const express = require('express');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/sensor-types - Get all available sensor types
router.get('/', authenticateToken, async (_req, res) => {
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

module.exports = router;
