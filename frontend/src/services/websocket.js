import { io } from 'socket.io-client';

class WebSocketService {
    constructor() {
        this.socket = null;
        this.subscribers = new Map();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.localListeners = new Map();
    }

    isLocallyEmitted(event) {
        return event === 'connection_status'
            || event === 'connection_error'
            || event.startsWith('device:')
            || event === 'new_alert';
    }

    addLocalListener(event, callback) {
        if (!this.localListeners.has(event)) {
            this.localListeners.set(event, new Set());
        }
        this.localListeners.get(event).add(callback);
    }

    removeLocalListener(event, callback) {
        if (!this.localListeners.has(event)) {
            return;
        }
        const listeners = this.localListeners.get(event);
        listeners.delete(callback);
        if (listeners.size === 0) {
            this.localListeners.delete(event);
        }
    }

    notifyLocal(event, data) {
        if (!this.localListeners.has(event)) {
            return;
        }

        for (const callback of this.localListeners.get(event)) {
            try {
                callback(data);
            } catch (error) {
                console.error(`WebSocket local listener error for event "${event}":`, error);
            }
        }
    }

    connect(serverPath = process.env.REACT_APP_WS_URL || 'http://localhost:3001') {
        if (this.socket) {
            if (!this.socket.connected) {
                this.socket.connect();
            }
            return;
        }

        const token = localStorage.getItem('token');

        this.socket = io(serverPath, {
            auth: {
                token
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
            this.notifyLocal('connection_status', { connected: true });

            for (const { type, id } of this.subscribers.values()) {
                if (type && typeof id !== 'undefined') {
                    this.socket.emit('subscribe', { type, id });
                }
            }
        });

        this.socket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
            this.isConnected = false;
            this.notifyLocal('connection_status', { connected: false, reason });
        });

        this.socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
            this.reconnectAttempts++;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('Max reconnection attempts reached');
                this.notifyLocal('connection_error', { error: 'Max reconnection attempts reached' });
            }
        });

        this.socket.on('auth_error', (error) => {
            console.error('WebSocket authentication error:', error);
            localStorage.removeItem('token');
            this.notifyLocal('connection_status', { connected: false, reason: 'auth_error' });
            window.location.href = '/login';
        });

        // Handle real-time events
        this.socket.on('telemetry_update', (data) => {
            this.notifyLocal(`device:${data.device_id}:telemetry`, data);
        });

        this.socket.on('device_status_update', (data) => {
            this.notifyLocal(`device:${data.device_id}:updated`, data);
        });

        this.socket.on('config_update', (data) => {
            this.notifyLocal(`device:${data.device_id}:config_updated`, data);
        });

        this.socket.on('new_alert', (data) => {
            this.notifyLocal('new_alert', data);
            if (data.device_id) {
                this.notifyLocal(`device:${data.device_id}:alert`, data);
            }
        });

        this.socket.on('ota_progress', (data) => {
            this.notifyLocal(`device:${data.device_id}:ota_progress`, data);
        });

        this.socket.on('device_heartbeat', (data) => {
            this.notifyLocal(`device:${data.device_id}:heartbeat`, data);
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.notifyLocal('connection_status', { connected: false, reason: 'manual_disconnect' });
            this.subscribers.clear();
        }
    }

    // Subscribe to device updates
    subscribe(type, id) {
        if (!this.socket) {
            this.connect();
        }

        if (!this.socket) {
            console.warn('WebSocket not initialized, unable to subscribe');
            return;
        }

        const subscriptionKey = `${type}:${id}`;

        if (this.subscribers.has(subscriptionKey)) {
            return; // Already subscribed
        }

        this.socket.emit('subscribe', { type, id });
        this.subscribers.set(subscriptionKey, { type, id });
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
        if (typeof callback !== 'function') {
            console.warn('WebSocket listener must be a function');
            return;
        }

        this.addLocalListener(event, callback);

        if (this.isLocallyEmitted(event)) {
            return;
        }

        if (!this.socket) {
            console.warn('WebSocket not initialized');
            return;
        }
        this.socket.on(event, callback);
    }

    off(event, callback) {
        if (typeof callback !== 'function') {
            return;
        }

        this.removeLocalListener(event, callback);

        if (this.isLocallyEmitted(event) || !this.socket) {
            return;
        }
        this.socket.off(event, callback);
    }

    // Emit events to the server
    emitToServer(event, data) {
        if (!this.socket) {
            this.connect();
        }

        if (!this.socket) {
            console.warn('WebSocket not initialized, cannot emit event');
            return;
        }

        this.socket.emit(event, data);
    }

    // Send telemetry data (if needed for testing)
    sendTelemetry(deviceId, sensorData) {
        this.emitToServer('telemetry', { device_id: deviceId, ...sensorData });
    }

    // Send device command
    sendCommand(deviceId, command, params = {}) {
        this.emitToServer('device_command', {
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
        this.connect();
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
