import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Create axios instance with default config
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add request interceptor for authentication
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('auth_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add response interceptor for error handling
apiClient.interceptors.response.use(
    (response) => response.data,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('auth_token');
            window.location.href = '/login';
        }
        return Promise.reject(error.response?.data || error.message);
    }
);

export const apiService = {
    // Authentication
    login: (credentials) => apiClient.post('/auth/login', credentials),
    logout: () => apiClient.post('/auth/logout'),
    register: (userData) => apiClient.post('/auth/register', userData),

    // Devices
    getDevices: () => apiClient.get('/devices'),
    getDevice: (deviceId) => apiClient.get(`/devices/${deviceId}`),
    createDevice: (deviceData) => apiClient.post('/devices', deviceData),
    updateDevice: (deviceId, deviceData) => apiClient.put(`/devices/${deviceId}`, deviceData),
    deleteDevice: (deviceId) => apiClient.delete(`/devices/${deviceId}`),
    updateDeviceConfig: (deviceId, config) => apiClient.put(`/devices/${deviceId}/config`, config),

    // Device Sensors
    getDeviceSensors: (deviceId) => apiClient.get(`/devices/${deviceId}/sensors`),
    createSensor: (deviceId, sensorData) => apiClient.post(`/devices/${deviceId}/sensors`, sensorData),
    updateSensor: (deviceId, sensorId, sensorData) => apiClient.put(`/devices/${deviceId}/sensors/${sensorId}`, sensorData),
    deleteSensor: (deviceId, sensorId) => apiClient.delete(`/devices/${deviceId}/sensors/${sensorId}`),

    // Sensor Rules
    getSensorRules: (sensorId) => apiClient.get(`/sensors/${sensorId}/rules`),
    updateSensorRules: (sensorId, rules) => apiClient.put(`/sensors/${sensorId}/rules`, { rules }),
    createSensorRule: (sensorId, ruleData) => apiClient.post(`/sensors/${sensorId}/rules`, ruleData),
    updateSensorRule: (sensorId, ruleId, ruleData) => apiClient.put(`/sensors/${sensorId}/rules/${ruleId}`, ruleData),
    deleteSensorRule: (sensorId, ruleId) => apiClient.delete(`/sensors/${sensorId}/rules/${ruleId}`),

    // Telemetry
    getLatestTelemetry: (deviceId) => apiClient.get(`/devices/${deviceId}/telemetry/latest`),
    getHistoricalTelemetry: (deviceId, sensorPin, startDate, endDate, aggregation = 'raw') =>
        apiClient.get(`/devices/${deviceId}/telemetry/history`, {
            params: { sensor_pin: sensorPin, start_date: startDate, end_date: endDate, aggregation }
        }),
    getTelemetryStats: (deviceId, timeRange = '24h') =>
        apiClient.get(`/devices/${deviceId}/telemetry/stats`, { params: { range: timeRange } }),

    // Device Statistics
    getDeviceStats: (deviceId, timeRange = '24h') =>
        apiClient.get(`/devices/${deviceId}/stats`, { params: { range: timeRange } }),

    // Alerts
    getAlerts: (filters = {}) => apiClient.get('/alerts', { params: filters }),
    getDeviceAlerts: (deviceId, limit = 10) =>
        apiClient.get(`/devices/${deviceId}/alerts`, { params: { limit } }),
    acknowledgeAlert: (alertId) => apiClient.put(`/alerts/${alertId}/acknowledge`),
    closeAlert: (alertId) => apiClient.put(`/alerts/${alertId}/close`),

    // OTA Updates
    getFirmwareVersions: (deviceType = 'esp8266') =>
        apiClient.get('/firmware/versions', { params: { device_type: deviceType } }),
    uploadFirmware: (formData) =>
        apiClient.post('/firmware/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }),
    getOTAStatus: (deviceId) => apiClient.get(`/devices/${deviceId}/ota/status`),
    scheduleOTAUpdate: (deviceId, firmwareVersionId, forced = false) =>
        apiClient.post(`/devices/${deviceId}/ota/schedule`, {
            firmware_version_id: firmwareVersionId,
            forced
        }),
    cancelOTAUpdate: (deviceId) => apiClient.delete(`/devices/${deviceId}/ota/cancel`),

    // Locations
    getLocations: () => apiClient.get('/locations'),
    createLocation: (locationData) => apiClient.post('/locations', locationData),
    updateLocation: (locationId, locationData) => apiClient.put(`/locations/${locationId}`, locationData),
    deleteLocation: (locationId) => apiClient.delete(`/locations/${locationId}`),

    // Users
    getUsers: () => apiClient.get('/users'),
    getUser: (userId) => apiClient.get(`/users/${userId}`),
    updateUser: (userId, userData) => apiClient.put(`/users/${userId}`, userData),
    changePassword: (oldPassword, newPassword) =>
        apiClient.put('/auth/change-password', { old_password: oldPassword, new_password: newPassword }),

    // System
    getSystemInfo: () => apiClient.get('/system/info'),
    getSystemHealth: () => apiClient.get('/system/health'),

    // Export data
    exportTelemetryData: (deviceId, startDate, endDate, format = 'csv') =>
        apiClient.get(`/devices/${deviceId}/telemetry/export`, {
            params: { start_date: startDate, end_date: endDate, format },
            responseType: 'blob'
        }),
};

export default apiService;