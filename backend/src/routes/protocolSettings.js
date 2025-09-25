const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { query: dbQuery } = require('../models/database');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/protocol-settings - Get all protocol settings
router.get('/', authenticateToken, async (req, res) => {
    try {
        const result = await dbQuery(`
            SELECT
                ps.*,
                d.name as device_name
            FROM protocol_settings ps
            LEFT JOIN devices d ON ps.device_id = d.id
            ORDER BY d.name
        `);

        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching protocol settings:', error);
        res.status(500).json({ error: 'Failed to fetch protocol settings' });
    }
});

// GET /api/protocol-settings/:deviceId - Get protocol settings for specific device
router.get('/:deviceId', authenticateToken, [
    param('deviceId').isString()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { deviceId } = req.params;

        const result = await dbQuery(`
            SELECT
                ps.*,
                d.name as device_name
            FROM protocol_settings ps
            JOIN devices d ON ps.device_id = d.id
            WHERE ps.device_id = $1
        `, [deviceId]);

        if (result.rows.length === 0) {
            // Return default HTTP settings for devices without configuration
            return res.json({
                device_id: deviceId,
                protocol: 'http',
                http_endpoint: process.env.API_BASE_URL || 'http://localhost:3001/api',
                heartbeat_interval: 300,
                created_at: null,
                updated_at: null
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Error fetching protocol settings for device:', error);
        res.status(500).json({ error: 'Failed to fetch protocol settings' });
    }
});

// POST /api/protocol-settings - Create or update protocol settings for device
router.post('/', authenticateToken, requireRole(['admin']), [
    body('deviceId').isString().notEmpty(),
    body('protocol').isIn(['http', 'mqtt']),
    body('mqttBrokerHost').optional().isString(),
    body('mqttBrokerPort').optional().isInt({ min: 1, max: 65535 }),
    body('mqttUsername').optional().isString(),
    body('mqttPassword').optional().isString(),
    body('mqttTopicPrefix').optional().isString(),
    body('mqttQos').optional().isIn([0, 1, 2]),
    body('httpEndpoint').optional().isURL(),
    body('heartbeatInterval').optional().isInt({ min: 30, max: 3600 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const {
            deviceId,
            protocol,
            mqttBrokerHost,
            mqttBrokerPort = 1883,
            mqttUsername,
            mqttPassword,
            mqttTopicPrefix = 'iot',
            mqttQos = 1,
            httpEndpoint,
            heartbeatInterval = 300
        } = req.body;

        // Validate protocol-specific requirements
        if (protocol === 'mqtt') {
            if (!mqttBrokerHost) {
                return res.status(400).json({ error: 'MQTT broker host is required for MQTT protocol' });
            }
        }

        if (protocol === 'http') {
            if (!httpEndpoint) {
                return res.status(400).json({
                    error: 'HTTP endpoint is required for HTTP protocol'
                });
            }
        }

        // Check if device exists
        const deviceCheck = await dbQuery('SELECT id FROM devices WHERE id = $1', [deviceId]);
        if (deviceCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Upsert protocol settings
        const result = await dbQuery(`
            INSERT INTO protocol_settings (
                device_id, protocol, mqtt_broker_host, mqtt_broker_port,
                mqtt_username, mqtt_password, mqtt_topic_prefix, mqtt_qos,
                http_endpoint, heartbeat_interval
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (device_id) DO UPDATE SET
                protocol = EXCLUDED.protocol,
                mqtt_broker_host = EXCLUDED.mqtt_broker_host,
                mqtt_broker_port = EXCLUDED.mqtt_broker_port,
                mqtt_username = EXCLUDED.mqtt_username,
                mqtt_password = EXCLUDED.mqtt_password,
                mqtt_topic_prefix = EXCLUDED.mqtt_topic_prefix,
                mqtt_qos = EXCLUDED.mqtt_qos,
                http_endpoint = EXCLUDED.http_endpoint,
                heartbeat_interval = EXCLUDED.heartbeat_interval,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [
            deviceId,
            protocol,
            mqttBrokerHost || null,
            mqttBrokerPort,
            mqttUsername || null,
            mqttPassword || null,
            mqttTopicPrefix,
            mqttQos,
            httpEndpoint || null,
            heartbeatInterval
        ]);

        logger.info(`Protocol settings updated for device ${deviceId}: ${protocol}`);
        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Error updating protocol settings:', error);
        res.status(500).json({ error: 'Failed to update protocol settings' });
    }
});

// DELETE /api/protocol-settings/:deviceId - Reset device to default HTTP settings
router.delete('/:deviceId', authenticateToken, requireRole(['admin']), [
    param('deviceId').isString()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { deviceId } = req.params;

        const result = await dbQuery(
            'DELETE FROM protocol_settings WHERE device_id = $1 RETURNING *',
            [deviceId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Protocol settings not found for this device' });
        }

        logger.info(`Protocol settings reset to default for device: ${deviceId}`);
        res.json({
            message: 'Protocol settings reset to default HTTP configuration',
            deletedSettings: result.rows[0]
        });
    } catch (error) {
        logger.error('Error deleting protocol settings:', error);
        res.status(500).json({ error: 'Failed to delete protocol settings' });
    }
});

// GET /api/protocol-settings/mqtt/config - Get global MQTT broker configuration
router.get('/mqtt/config', authenticateToken, async (req, res) => {
    try {
        // Return default MQTT configuration that can be used by devices
        const mqttConfig = {
            defaultBrokerHost: process.env.MQTT_BROKER_HOST || 'localhost',
            defaultBrokerPort: parseInt(process.env.MQTT_BROKER_PORT) || 1883,
            defaultTopicPrefix: process.env.MQTT_TOPIC_PREFIX || 'iot',
            defaultQos: parseInt(process.env.MQTT_DEFAULT_QOS) || 1,
            availableQosLevels: [
                { value: 0, label: 'At most once (0)' },
                { value: 1, label: 'At least once (1)' },
                { value: 2, label: 'Exactly once (2)' }
            ]
        };

        res.json(mqttConfig);
    } catch (error) {
        logger.error('Error fetching MQTT config:', error);
        res.status(500).json({ error: 'Failed to fetch MQTT configuration' });
    }
});

// POST /api/protocol-settings/test-connection - Test protocol connection
router.post('/test-connection', authenticateToken, requireRole(['admin']), [
    body('protocol').isIn(['http', 'mqtt']),
    body('httpEndpoint').optional().isURL(),
    body('mqttBrokerHost').optional().isString(),
    body('mqttBrokerPort').optional().isInt({ min: 1, max: 65535 }),
    body('mqttUsername').optional().isString(),
    body('mqttPassword').optional().isString()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const {
            protocol,
            httpEndpoint,
            mqttBrokerHost,
            mqttBrokerPort = 1883,
            mqttUsername,
            mqttPassword
        } = req.body;

        let testResult = { success: false, message: '', details: {} };

        if (protocol === 'http') {
            try {
                // Test HTTP connection
                const axios = require('axios');
                const testUrl = `${httpEndpoint}/health`;

                const response = await axios.get(testUrl, { timeout: 5000 });
                testResult = {
                    success: true,
                    message: 'HTTP connection successful',
                    details: {
                        statusCode: response.status,
                        responseTime: Date.now() - new Date().getTime()
                    }
                };
            } catch (error) {
                testResult = {
                    success: false,
                    message: 'HTTP connection failed',
                    details: {
                        error: error.message,
                        code: error.code
                    }
                };
            }
        } else if (protocol === 'mqtt') {
            try {
                // Test MQTT connection
                const mqtt = require('mqtt');

                const connectOptions = {
                    host: mqttBrokerHost,
                    port: mqttBrokerPort,
                    connectTimeout: 5000
                };

                if (mqttUsername) {
                    connectOptions.username = mqttUsername;
                    connectOptions.password = mqttPassword;
                }

                const client = mqtt.connect(connectOptions);

                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        client.end();
                        reject(new Error('Connection timeout'));
                    }, 5000);

                    client.on('connect', () => {
                        clearTimeout(timeout);
                        client.end();
                        testResult = {
                            success: true,
                            message: 'MQTT connection successful',
                            details: {
                                broker: `${mqttBrokerHost}:${mqttBrokerPort}`,
                                authenticated: !!mqttUsername
                            }
                        };
                        resolve();
                    });

                    client.on('error', (error) => {
                        clearTimeout(timeout);
                        client.end();
                        testResult = {
                            success: false,
                            message: 'MQTT connection failed',
                            details: {
                                error: error.message,
                                broker: `${mqttBrokerHost}:${mqttBrokerPort}`
                            }
                        };
                        reject(error);
                    });
                });
            } catch (error) {
                testResult = {
                    success: false,
                    message: 'MQTT connection test failed',
                    details: {
                        error: error.message
                    }
                };
            }
        }

        res.json(testResult);
    } catch (error) {
        logger.error('Error testing connection:', error);
        res.status(500).json({
            success: false,
            message: 'Connection test failed',
            details: { error: error.message }
        });
    }
});

module.exports = router;