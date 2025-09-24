const jwt = require('jsonwebtoken');
const db = require('../models/database');
const logger = require('../utils/logger');

class WebSocketService {
    constructor(io, redis) {
        this.io = io;
        this.redis = redis;
        this.connections = new Map();
        this.userConnections = new Map();
    }

    async authenticateSocket(socket, next) {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication error'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const result = await db.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);

            if (result.rows.length === 0) {
                return next(new Error('User not found'));
            }

            socket.user = result.rows[0];
            next();
        } catch (error) {
            next(new Error('Authentication error'));
        }
    }

    async handleConnection(socket) {
        const userId = socket.user.id;
        const connectionId = socket.id;

        // Store connection
        this.connections.set(connectionId, {
            socket: socket,
            userId: userId,
            connectedAt: new Date()
        });

        // Track user connections
        if (!this.userConnections.has(userId)) {
            this.userConnections.set(userId, new Set());
        }
        this.userConnections.get(userId).add(connectionId);

        logger.info(`WebSocket connected: User ${userId} (${socket.user.email}), Connection ${connectionId}`);

        // Join user to their personal room
        socket.join(`user:${userId}`);

        // Join user to global alerts room
        socket.join('alerts:global');

        // Send initial connection confirmation
        socket.emit('connection:confirmed', {
            userId,
            connectionId,
            timestamp: new Date().toISOString()
        });

        // Handle client subscriptions
        socket.on('subscribe', async (data) => {
            await this.handleSubscription(socket, data);
        });

        socket.on('unsubscribe', async (data) => {
            await this.handleUnsubscription(socket, data);
        });

        // Handle real-time commands
        socket.on('device:update_config', async (data) => {
            await this.handleDeviceConfigUpdate(socket, data);
        });

        socket.on('alert:acknowledge', async (data) => {
            await this.handleAlertAcknowledge(socket, data);
        });

        socket.on('alert:resolve', async (data) => {
            await this.handleAlertResolve(socket, data);
        });

        socket.on('ping', () => {
            socket.emit('pong');
        });

        // Handle disconnection
        socket.on('disconnect', async () => {
            await this.handleDisconnection(connectionId);
        });
    }

    async handleSubscription(socket, data) {
        try {
            const { type, target } = data;

            switch (type) {
                case 'device':
                    const deviceResult = await db.query('SELECT id FROM devices WHERE id = $1', [target]);
                    if (deviceResult.rows.length > 0) {
                        socket.join(`device:${target}`);
                        socket.emit('subscription:confirmed', { type, target });
                    } else {
                        socket.emit('subscription:error', { type, target, error: 'Device not found' });
                    }
                    break;

                case 'location':
                    const locationResult = await db.query('SELECT id FROM locations WHERE id = $1', [target]);
                    if (locationResult.rows.length > 0) {
                        socket.join(`location:${target}`);
                        socket.emit('subscription:confirmed', { type, target });
                    } else {
                        socket.emit('subscription:error', { type, target, error: 'Location not found' });
                    }
                    break;

                case 'alerts':
                    socket.join('alerts:global');
                    socket.emit('subscription:confirmed', { type, target: 'global' });
                    break;

                default:
                    socket.emit('subscription:error', { type, target, error: 'Unknown subscription type' });
            }
        } catch (error) {
            logger.error('Subscription error:', error);
            socket.emit('subscription:error', { error: 'Subscription failed' });
        }
    }

    async handleUnsubscription(socket, data) {
        try {
            const { type, target } = data;

            switch (type) {
                case 'device':
                    socket.leave(`device:${target}`);
                    break;
                case 'location':
                    socket.leave(`location:${target}`);
                    break;
                case 'alerts':
                    socket.leave('alerts:global');
                    break;
            }

            socket.emit('unsubscription:confirmed', { type, target });
        } catch (error) {
            logger.error('Unsubscription error:', error);
            socket.emit('unsubscription:error', { error: 'Unsubscription failed' });
        }
    }

    async handleDeviceConfigUpdate(socket, data) {
        try {
            if (socket.user.role !== 'admin' && socket.user.role !== 'operator') {
                socket.emit('device:config_error', { error: 'Insufficient permissions' });
                return;
            }

            const { deviceId, config } = data;

            // Update device configuration in database
            await db.query(`
                UPDATE device_configs
                SET armed = $2, config_version = config_version + 1, updated_at = CURRENT_TIMESTAMP
                WHERE device_id = $1
            `, [deviceId, config.armed]);

            // Broadcast configuration update
            this.io.to(`device:${deviceId}`).emit('device:config_updated', {
                deviceId,
                config,
                updatedBy: socket.user.email,
                timestamp: new Date()
            });

            logger.info(`Device config updated: ${deviceId} by ${socket.user.email}`);
        } catch (error) {
            logger.error('Device config update error:', error);
            socket.emit('device:config_error', { error: 'Failed to update device configuration' });
        }
    }

    async handleAlertAcknowledge(socket, data) {
        try {
            const { alertId, notes } = data;

            const result = await db.query(`
                UPDATE alerts
                SET status = 'acknowledged',
                    acknowledged_at = CURRENT_TIMESTAMP,
                    acknowledged_by = $1,
                    notes = $2
                WHERE id = $3 AND status = 'active'
                RETURNING *
            `, [socket.user.id, notes, alertId]);

            if (result.rows.length > 0) {
                this.io.to('alerts:global').emit('alert:acknowledged', {
                    alertId,
                    acknowledgedBy: socket.user.email
                });

                logger.logAlert(alertId, 'acknowledged', { by: socket.user.email });
            } else {
                socket.emit('alert:acknowledge_error', { error: 'Alert not found or already acknowledged' });
            }
        } catch (error) {
            logger.error('Alert acknowledge error:', error);
            socket.emit('alert:acknowledge_error', { error: 'Failed to acknowledge alert' });
        }
    }

    async handleAlertResolve(socket, data) {
        try {
            const { alertId, resolutionNotes } = data;

            const result = await db.query(`
                UPDATE alerts
                SET status = 'resolved',
                    resolved_at = CURRENT_TIMESTAMP,
                    resolved_by = $1,
                    resolution_notes = $2
                WHERE id = $3 AND status IN ('active', 'acknowledged')
                RETURNING *
            `, [socket.user.id, resolutionNotes, alertId]);

            if (result.rows.length > 0) {
                this.io.to('alerts:global').emit('alert:resolved', {
                    alertId,
                    resolvedBy: socket.user.email
                });

                logger.logAlert(alertId, 'resolved', { by: socket.user.email });
            } else {
                socket.emit('alert:resolve_error', { error: 'Alert not found or already resolved' });
            }
        } catch (error) {
            logger.error('Alert resolve error:', error);
            socket.emit('alert:resolve_error', { error: 'Failed to resolve alert' });
        }
    }

    async handleDisconnection(connectionId) {
        try {
            const connection = this.connections.get(connectionId);
            if (connection) {
                const userId = connection.userId;

                // Remove from tracking
                this.connections.delete(connectionId);
                if (this.userConnections.has(userId)) {
                    this.userConnections.get(userId).delete(connectionId);
                    if (this.userConnections.get(userId).size === 0) {
                        this.userConnections.delete(userId);
                    }
                }

                logger.info(`WebSocket disconnected: User ${userId}, Connection ${connectionId}`);
            }
        } catch (error) {
            logger.error('Disconnection handling error:', error);
        }
    }

    // Broadcast methods for external use
    broadcastDeviceUpdate(deviceId, data) {
        this.io.to(`device:${deviceId}`).emit('device:updated', {
            deviceId,
            ...data,
            timestamp: new Date().toISOString()
        });
    }

    broadcastTelemetryData(deviceId, telemetryData) {
        this.io.to(`device:${deviceId}`).emit('telemetry:data', {
            deviceId,
            data: telemetryData,
            timestamp: new Date().toISOString()
        });
    }

    broadcastNewAlert(alert) {
        this.io.to('alerts:global').emit('alert:new', {
            ...alert,
            timestamp: new Date().toISOString()
        });

        if (alert.device_id) {
            this.io.to(`device:${alert.device_id}`).emit('device:alert', {
                ...alert,
                timestamp: new Date().toISOString()
            });
        }
    }

    broadcastToUser(userId, event, data) {
        this.io.to(`user:${userId}`).emit(event, data);
    }

    broadcastToLocation(locationId, event, data) {
        this.io.to(`location:${locationId}`).emit(event, data);
    }

    getConnectionStats() {
        return {
            totalConnections: this.connections.size,
            uniqueUsers: this.userConnections.size,
            connectionsByUser: Array.from(this.userConnections.entries()).map(([userId, connections]) => ({
                userId,
                connectionCount: connections.size
            }))
        };
    }
}

module.exports = WebSocketService;