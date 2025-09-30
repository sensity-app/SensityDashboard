const mqtt = require('mqtt');
const logger = require('../utils/logger');
const db = require('../models/database');

class MQTTService {
    constructor(telemetryProcessor) {
        this.client = null;
        this.telemetryProcessor = telemetryProcessor;
        this.isConnected = false;
        this.subscriptions = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
    }

    /**
     * Initialize MQTT broker connection
     */
    async initialize() {
        try {
            const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
            const options = {
                clientId: `iot-platform-${Date.now()}`,
                clean: true,
                reconnectPeriod: 5000,
                connectTimeout: 30000,
            };

            // Add authentication if provided
            if (process.env.MQTT_USERNAME) {
                options.username = process.env.MQTT_USERNAME;
                options.password = process.env.MQTT_PASSWORD;
            }

            logger.info(`Connecting to MQTT broker: ${brokerUrl}`);
            this.client = mqtt.connect(brokerUrl, options);

            this.setupEventHandlers();

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('MQTT connection timeout'));
                }, 30000);

                this.client.once('connect', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                this.client.once('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
        } catch (error) {
            logger.error('Failed to initialize MQTT service:', error);
            throw error;
        }
    }

    /**
     * Setup MQTT event handlers
     */
    setupEventHandlers() {
        this.client.on('connect', async () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            logger.info('Successfully connected to MQTT broker');

            // Subscribe to device topics
            await this.subscribeToDeviceTopics();
        });

        this.client.on('reconnect', () => {
            this.reconnectAttempts++;
            logger.warn(`Reconnecting to MQTT broker (attempt ${this.reconnectAttempts})`);

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                logger.error('Max reconnect attempts reached, stopping MQTT client');
                this.client.end(true);
            }
        });

        this.client.on('disconnect', () => {
            this.isConnected = false;
            logger.warn('Disconnected from MQTT broker');
        });

        this.client.on('error', (error) => {
            logger.error('MQTT client error:', error);
        });

        this.client.on('message', async (topic, message) => {
            try {
                await this.handleMessage(topic, message);
            } catch (error) {
                logger.error(`Error handling MQTT message from topic ${topic}:`, error);
            }
        });

        this.client.on('close', () => {
            this.isConnected = false;
            logger.info('MQTT connection closed');
        });
    }

    /**
     * Subscribe to all device topics
     */
    async subscribeToDeviceTopics() {
        try {
            // Get all devices configured for MQTT
            const result = await db.query(`
                SELECT DISTINCT
                    ps.device_id,
                    ps.mqtt_topic_prefix,
                    ps.mqtt_qos
                FROM protocol_settings ps
                WHERE ps.protocol = 'mqtt'
                AND ps.mqtt_topic_prefix IS NOT NULL
            `);

            for (const device of result.rows) {
                await this.subscribeToDevice(
                    device.device_id,
                    device.mqtt_topic_prefix,
                    device.mqtt_qos
                );
            }

            // Subscribe to wildcard topic for any new devices
            const defaultPrefix = process.env.MQTT_TOPIC_PREFIX || 'iot';
            await this.subscribeToTopic(`${defaultPrefix}/+/telemetry`, 1);
            await this.subscribeToTopic(`${defaultPrefix}/+/heartbeat`, 1);
            await this.subscribeToTopic(`${defaultPrefix}/+/alarm`, 1);
            await this.subscribeToTopic(`${defaultPrefix}/+/status`, 1);

            logger.info(`Subscribed to MQTT topics for ${result.rows.length} devices`);
        } catch (error) {
            logger.error('Error subscribing to device topics:', error);
        }
    }

    /**
     * Subscribe to topics for a specific device
     */
    async subscribeToDevice(deviceId, topicPrefix, qos = 1) {
        const topics = [
            `${topicPrefix}/${deviceId}/telemetry`,
            `${topicPrefix}/${deviceId}/heartbeat`,
            `${topicPrefix}/${deviceId}/alarm`,
            `${topicPrefix}/${deviceId}/status`
        ];

        for (const topic of topics) {
            await this.subscribeToTopic(topic, qos);
        }
    }

    /**
     * Subscribe to a specific topic
     */
    subscribeToTopic(topic, qos = 1) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                return reject(new Error('MQTT client not connected'));
            }

            this.client.subscribe(topic, { qos }, (error) => {
                if (error) {
                    logger.error(`Failed to subscribe to topic ${topic}:`, error);
                    reject(error);
                } else {
                    this.subscriptions.set(topic, { qos, subscribedAt: Date.now() });
                    logger.debug(`Subscribed to MQTT topic: ${topic} (QoS ${qos})`);
                    resolve();
                }
            });
        });
    }

    /**
     * Unsubscribe from a topic
     */
    unsubscribeFromTopic(topic) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                return reject(new Error('MQTT client not connected'));
            }

            this.client.unsubscribe(topic, (error) => {
                if (error) {
                    logger.error(`Failed to unsubscribe from topic ${topic}:`, error);
                    reject(error);
                } else {
                    this.subscriptions.delete(topic);
                    logger.debug(`Unsubscribed from MQTT topic: ${topic}`);
                    resolve();
                }
            });
        });
    }

    /**
     * Handle incoming MQTT message
     */
    async handleMessage(topic, message) {
        try {
            const payload = JSON.parse(message.toString());
            const topicParts = topic.split('/');

            // Extract device ID from topic (format: prefix/deviceId/type)
            if (topicParts.length < 3) {
                logger.warn(`Invalid topic format: ${topic}`);
                return;
            }

            const deviceId = topicParts[topicParts.length - 2];
            const messageType = topicParts[topicParts.length - 1];

            logger.debug(`Received MQTT message from device ${deviceId}, type: ${messageType}`);

            switch (messageType) {
                case 'telemetry':
                    await this.handleTelemetryMessage(deviceId, payload);
                    break;

                case 'heartbeat':
                    await this.handleHeartbeatMessage(deviceId, payload);
                    break;

                case 'alarm':
                    await this.handleAlarmMessage(deviceId, payload);
                    break;

                case 'status':
                    await this.handleStatusMessage(deviceId, payload);
                    break;

                default:
                    logger.warn(`Unknown message type: ${messageType}`);
            }
        } catch (error) {
            logger.error(`Error parsing MQTT message from topic ${topic}:`, error);
        }
    }

    /**
     * Handle telemetry data from device
     */
    async handleTelemetryMessage(deviceId, payload) {
        try {
            // Expected payload format:
            // {
            //   sensors: [
            //     { pin: 'A0', type: 'temperature', raw_value: 512, processed_value: 25.3, name: 'Room Temp' },
            //     ...
            //   ]
            // }

            if (!payload.sensors || !Array.isArray(payload.sensors)) {
                logger.warn(`Invalid telemetry payload from device ${deviceId}`);
                return;
            }

            // Process telemetry through existing processor
            await this.telemetryProcessor.processTelemetryData(deviceId, payload.sensors);

            logger.debug(`Processed telemetry from device ${deviceId}: ${payload.sensors.length} sensors`);
        } catch (error) {
            logger.error(`Error handling telemetry message for device ${deviceId}:`, error);
        }
    }

    /**
     * Handle heartbeat from device
     */
    async handleHeartbeatMessage(deviceId, payload) {
        try {
            // Expected payload format:
            // {
            //   firmware_version: '1.0.0',
            //   uptime: 12345,
            //   free_heap: 25000,
            //   wifi_rssi: -65
            // }

            await db.query(`
                UPDATE devices
                SET last_heartbeat = CURRENT_TIMESTAMP,
                    status = 'online',
                    firmware_version = COALESCE($1, firmware_version),
                    uptime_seconds = COALESCE($2, uptime_seconds)
                WHERE id = $3
            `, [payload.firmware_version, payload.uptime, deviceId]);

            logger.debug(`Heartbeat received from device ${deviceId} via MQTT`);
        } catch (error) {
            logger.error(`Error handling heartbeat for device ${deviceId}:`, error);
        }
    }

    /**
     * Handle alarm from device
     */
    async handleAlarmMessage(deviceId, payload) {
        try {
            // Expected payload format:
            // {
            //   alarm_type: 'threshold_exceeded',
            //   message: 'Temperature too high',
            //   severity: 'high'
            // }

            await db.query(`
                INSERT INTO alerts (device_id, alert_type, severity, message, triggered_at)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            `, [
                deviceId,
                payload.alarm_type || 'device_alarm',
                payload.severity || 'high',
                payload.message || `Device ${deviceId} triggered alarm via MQTT`
            ]);

            logger.warn(`Alarm received from device ${deviceId} via MQTT: ${payload.alarm_type}`);
        } catch (error) {
            logger.error(`Error handling alarm for device ${deviceId}:`, error);
        }
    }

    /**
     * Handle status update from device
     */
    async handleStatusMessage(deviceId, payload) {
        try {
            // Expected payload format:
            // {
            //   status: 'online',
            //   metadata: { ... }
            // }

            await db.query(`
                UPDATE devices
                SET status = $1,
                    last_heartbeat = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [payload.status || 'online', deviceId]);

            logger.debug(`Status update received from device ${deviceId} via MQTT: ${payload.status}`);
        } catch (error) {
            logger.error(`Error handling status message for device ${deviceId}:`, error);
        }
    }

    /**
     * Publish message to device
     */
    publish(topic, message, options = {}) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                return reject(new Error('MQTT client not connected'));
            }

            const qos = options.qos || 1;
            const retain = options.retain || false;

            const payload = typeof message === 'string' ? message : JSON.stringify(message);

            this.client.publish(topic, payload, { qos, retain }, (error) => {
                if (error) {
                    logger.error(`Failed to publish to topic ${topic}:`, error);
                    reject(error);
                } else {
                    logger.debug(`Published message to topic ${topic}`);
                    resolve();
                }
            });
        });
    }

    /**
     * Publish command to device
     */
    async publishCommandToDevice(deviceId, command, payload) {
        try {
            // Get device's MQTT topic prefix
            const result = await db.query(`
                SELECT mqtt_topic_prefix, mqtt_qos
                FROM protocol_settings
                WHERE device_id = $1 AND protocol = 'mqtt'
            `, [deviceId]);

            if (result.rows.length === 0) {
                throw new Error(`Device ${deviceId} not configured for MQTT`);
            }

            const { mqtt_topic_prefix, mqtt_qos } = result.rows[0];
            const topic = `${mqtt_topic_prefix}/${deviceId}/command/${command}`;

            await this.publish(topic, payload, { qos: mqtt_qos });
            logger.info(`Command '${command}' published to device ${deviceId}`);
        } catch (error) {
            logger.error(`Error publishing command to device ${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Get service status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            subscriptions: Array.from(this.subscriptions.keys()),
            reconnectAttempts: this.reconnectAttempts
        };
    }

    /**
     * Shutdown MQTT service
     */
    async shutdown() {
        if (this.client) {
            logger.info('Shutting down MQTT service...');
            this.client.end(true);
            this.isConnected = false;
        }
    }
}

module.exports = MQTTService;
