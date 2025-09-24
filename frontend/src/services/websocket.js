import { io } from 'socket.io-client';

class WebSocketService {
    constructor() {
        this.socket = null;
        this.subscribers = new Map();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
    }

    connect(serverPath = process.env.REACT_APP_WS_URL || 'http://localhost:3001') {
        if (this.socket) {
            return;
        }

        const token = localStorage.getItem('auth_token');

        this.socket = io(serverPath, {
            auth: {
                token: token
            },
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: this.reconnectDelay,
            timeout: 20000,
        });

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            console.log('WebSocket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.emit('connection_status', { connected: true });
        });

        this.socket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
            this.isConnected = false;
            this.emit('connection_status', { connected: false, reason });
        });

        this.socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
            this.reconnectAttempts++;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('Max reconnection attempts reached');
                this.emit('connection_error', { error: 'Max reconnection attempts reached' });
            }
        });

        this.socket.on('auth_error', (error) => {
            console.error('WebSocket authentication error:', error);
            localStorage.removeItem('auth_token');
            window.location.href = '/login';
        });

        // Handle real-time events
        this.socket.on('telemetry_update', (data) => {
            this.emit(`device:${data.device_id}:telemetry`, data);
        });

        this.socket.on('device_status_update', (data) => {
            this.emit(`device:${data.device_id}:updated`, data);
        });

        this.socket.on('config_update', (data) => {
            this.emit(`device:${data.device_id}:config_updated`, data);
        });

        this.socket.on('new_alert', (data) => {
            this.emit('new_alert', data);
            if (data.device_id) {
                this.emit(`device:${data.device_id}:alert`, data);
            }
        });

        this.socket.on('ota_progress', (data) => {
            this.emit(`device:${data.device_id}:ota_progress`, data);
        });

        this.socket.on('device_heartbeat', (data) => {
            this.emit(`device:${data.device_id}:heartbeat`, data);
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.subscribers.clear();
        }
    }

    // Subscribe to device updates
    subscribe(type, id) {
        if (!this.socket || !this.isConnected) {
            console.warn('WebSocket not connected, cannot subscribe');
            return;
        }

        const subscriptionKey = `${type}:${id}`;

        if (this.subscribers.has(subscriptionKey)) {
            return; // Already subscribed
        }

        this.socket.emit('subscribe', { type, id });
        this.subscribers.set(subscriptionKey, true);
        console.log(`Subscribed to ${subscriptionKey}`);
    }

    // Unsubscribe from device updates
    unsubscribe(type, id) {
        if (!this.socket) {
            return;
        }

        const subscriptionKey = `${type}:${id}`;

        if (this.subscribers.has(subscriptionKey)) {
            this.socket.emit('unsubscribe', { type, id });
            this.subscribers.delete(subscriptionKey);
            console.log(`Unsubscribed from ${subscriptionKey}`);
        }
    }

    // Event listener management
    on(event, callback) {
        if (!this.socket) {
            console.warn('WebSocket not initialized');
            return;
        }
        this.socket.on(event, callback);
    }

    off(event, callback) {
        if (!this.socket) {
            return;
        }
        this.socket.off(event, callback);
    }

    // Emit events
    emit(event, data) {
        if (!this.socket || !this.isConnected) {
            console.warn('WebSocket not connected, cannot emit event');
            return;
        }
        this.socket.emit(event, data);
    }

    // Send telemetry data (if needed for testing)
    sendTelemetry(deviceId, sensorData) {
        this.emit('telemetry', { device_id: deviceId, ...sensorData });
    }

    // Send device command
    sendCommand(deviceId, command, params = {}) {
        this.emit('device_command', {
            device_id: deviceId,
            command,
            parameters: params,
            timestamp: new Date().toISOString()
        });
    }

    // Get connection status
    isConnectedToServer() {
        return this.isConnected && this.socket && this.socket.connected;
    }

    // Reconnect manually
    reconnect() {
        if (this.socket) {
            this.socket.connect();
        }
    }

    // Get list of active subscriptions
    getActiveSubscriptions() {
        return Array.from(this.subscribers.keys());
    }
}

// Create a singleton instance
const websocketService = new WebSocketService();

export { websocketService };
export default websocketService;