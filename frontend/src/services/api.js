import axios from 'axios';

const resolveApiBaseUrl = () => {
    if (process.env.REACT_APP_API_URL) {
        return process.env.REACT_APP_API_URL;
    }

    if (typeof window !== 'undefined' && window.location) {
        const { origin, hostname } = window.location;
        const normalizedOrigin = origin.replace(/\/+$/, '');

        // During local development keep talking to the API server on port 3001
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'http://localhost:3001/api';
        }

        // In production default to the same origin
        return `${normalizedOrigin}/api`;
    }

    // Fallback for non-browser environments (tests, SSR)
    return 'http://localhost:3001/api';
};

const API_BASE_URL = resolveApiBaseUrl();

let authToken = null;

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
        const token = authToken || localStorage.getItem('token');
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
            localStorage.removeItem('token');
            authToken = null;
            if (window.location.pathname !== '/login' &&
                window.location.pathname !== '/register' &&
                !window.location.pathname.startsWith('/register?')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export const apiService = {
    // Set auth token
    setAuthToken: (token) => {
        authToken = token;
    },

    // Authentication
    login: (credentials) => apiClient.post('/auth/login', credentials),
    logout: () => apiClient.post('/auth/logout'),
    register: (userData) => apiClient.post('/auth/register', userData),
    forgotPassword: (email) => apiClient.post('/auth/forgot-password', { email }),
    resetPassword: (token, password) => apiClient.post('/auth/reset-password', { token, password }),

    // Setup and invitations
    checkSetup: () => apiClient.get('/auth/setup-check'),
    initialSetup: (userData) => apiClient.post('/auth/initial-setup', userData),
    verifyInvitation: (token) => apiClient.get(`/auth/invite/${token}`),
    inviteUser: (userData) => apiClient.post('/auth/invite', userData),
    getInvitations: () => apiClient.get('/auth/invitations'),
    cancelInvitation: (invitationId) => apiClient.delete(`/auth/invitations/${invitationId}`),

    // User profile
    getCurrentUser: () => apiClient.get('/auth/me'),
    updatePreferredLanguage: (preferredLanguage) =>
        apiClient.put('/auth/profile', { preferred_language: preferredLanguage }),

    // Devices
    getDevices: () => apiClient.get('/devices'),
    getDevice: (deviceId) => apiClient.get(`/devices/${deviceId}`),
    createDevice: (deviceData) => apiClient.post('/devices', deviceData),
    updateDevice: (deviceId, deviceData) => apiClient.put(`/devices/${deviceId}`, deviceData),
    deleteDevice: (deviceId) => apiClient.delete(`/devices/${deviceId}`),
    updateDeviceConfig: (deviceId, config) => apiClient.put(`/devices/${deviceId}/config`, config),
    exportDevices: (filters = {}) =>
        apiClient.get('/devices/export', {
            params: filters,
            responseType: 'blob'
        }),

    // Device Sensors
    getDeviceSensors: (deviceId) => apiClient.get(`/devices/${deviceId}/sensors`),
    createSensor: (deviceId, sensorData) => apiClient.post(`/devices/${deviceId}/sensors`, sensorData),
    updateSensor: (deviceId, sensorId, sensorData) => apiClient.put(`/devices/${deviceId}/sensors/${sensorId}`, sensorData),
    deleteSensor: (deviceId, sensorId) => apiClient.delete(`/devices/${deviceId}/sensors/${sensorId}`),
    getSensorTypes: () => apiClient.get('/sensor-types'),

    // Sensor Rules - using correct device-based endpoints
    getSensorRules: (deviceId, sensorId) => apiClient.get(`/devices/${deviceId}/sensors/${sensorId}/rules`),
    createSensorRule: (deviceId, sensorId, ruleData) => apiClient.post(`/devices/${deviceId}/sensors/${sensorId}/rules`, ruleData),
    createOrUpdateSensorRule: (deviceId, sensorId, ruleData) => apiClient.post(`/devices/${deviceId}/sensors/${sensorId}/rules`, ruleData),
    getThresholdSuggestions: (deviceId, sensorId, days = 7) =>
        apiClient.get(`/devices/${deviceId}/sensors/${sensorId}/threshold-suggestions`, { params: { days } }),

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
    deleteUser: (userId) => apiClient.delete(`/users/${userId}`),
    changePassword: (currentPassword, newPassword) =>
        apiClient.post('/auth/change-password', { currentPassword, newPassword }),
    getUserLocations: (userId) => apiClient.get(`/users/${userId}/locations`),
    updateUserLocations: (userId, locationIds) => apiClient.post(`/users/${userId}/locations`, { locationIds }),

    // Alerts (for dashboard)
    getRecentAlerts: (limit = 10) => apiClient.get('/alerts', { params: { limit, status: 'active' } }),

    // Analytics
    getSensorRecommendations: (deviceId, sensorPin, timeRange = '30d') =>
        apiClient.get(`/analytics/sensor-recommendations/${deviceId}/${sensorPin}`, { params: { timeRange } }),
    getAnomalies: (deviceId, sensorPin, timeRange = '24h') =>
        apiClient.get(`/analytics/anomalies/${deviceId}/${sensorPin}`, { params: { timeRange } }),
    getDeviceAnalyticsSummary: (deviceId, timeRange = '24h') =>
        apiClient.get(`/analytics/device-summary/${deviceId}`, { params: { timeRange } }),
    clearAnalyticsCache: () => apiClient.post('/analytics/clear-cache'),

    // Device Groups
    getDeviceGroups: () => apiClient.get('/device-groups'),
    getDeviceGroup: (groupId) => apiClient.get(`/device-groups/${groupId}`),
    createDeviceGroup: (groupData) => apiClient.post('/device-groups', groupData),
    updateDeviceGroup: (groupId, groupData) => apiClient.put(`/device-groups/${groupId}`, groupData),
    deleteDeviceGroup: (groupId) => apiClient.delete(`/device-groups/${groupId}`),
    addDeviceToGroup: (groupId, deviceId) => apiClient.post(`/device-groups/${groupId}/add-device`, { deviceId }),
    removeDeviceFromGroup: (groupId, deviceId) => apiClient.delete(`/device-groups/${groupId}/remove-device/${deviceId}`),

    // Device Tags
    getDeviceTags: () => apiClient.get('/device-tags'),
    getDeviceTag: (tagId) => apiClient.get(`/device-tags/${tagId}`),
    createDeviceTag: (tagData) => apiClient.post('/device-tags', tagData),
    updateDeviceTag: (tagId, tagData) => apiClient.put(`/device-tags/${tagId}`, tagData),
    deleteDeviceTag: (tagId) => apiClient.delete(`/device-tags/${tagId}`),
    assignTagToDevice: (tagId, deviceId) => apiClient.post(`/device-tags/${tagId}/assign-device`, { deviceId }),
    unassignTagFromDevice: (tagId, deviceId) => apiClient.delete(`/device-tags/${tagId}/unassign-device/${deviceId}`),
    getDeviceTagsForDevice: (deviceId) => apiClient.get(`/device-tags/device/${deviceId}`),

    // Device Health
    getDeviceHealth: (deviceId) => apiClient.get(`/devices/${deviceId}/health`),
    getDeviceHealthHistory: (deviceId, timeRange = '24h', metrics) =>
        apiClient.get(`/devices/${deviceId}/health/history`, { params: { timeRange, metrics } }),
    updateDeviceHealth: (deviceId, healthData) => apiClient.post(`/devices/${deviceId}/health`, healthData),

    // Alert Rules
    getAlertRuleTemplates: (sensorType, includeUser = false) =>
        apiClient.get('/alert-rules/templates', { params: { sensorType, includeUser } }),
    getAlertRuleTemplate: (templateId) => apiClient.get(`/alert-rules/templates/${templateId}`),
    createAlertRuleTemplate: (templateData) => apiClient.post('/alert-rules/templates', templateData),
    updateAlertRuleTemplate: (templateId, templateData) => apiClient.put(`/alert-rules/templates/${templateId}`, templateData),
    deleteAlertRuleTemplate: (templateId, force = false) => apiClient.delete(`/alert-rules/templates/${templateId}`, { params: { force } }),
    applyRuleTemplate: (templateId, deviceSensorId, customizations = {}) =>
        apiClient.post(`/alert-rules/apply-template/${templateId}`, { deviceSensorId, customizations }),
    evaluateAlertRule: (ruleId, testValue) =>
        apiClient.get(`/alert-rules/evaluate/${ruleId}`, { params: { testValue } }),

    // Alert Management
    acknowledgeAlert: (alertId, note) => apiClient.post(`/alerts/${alertId}/acknowledge`, { note }),
    resolveAlert: (alertId, note) => apiClient.post(`/alerts/${alertId}/resolve`, { note }),

    // Audit Logs
    getAuditLogs: (filters = {}) => apiClient.get('/audit-logs', { params: filters }),
    getAuditLog: (logId) => apiClient.get(`/audit-logs/${logId}`),

    // Users (for filtering)
    getUsers: () => apiClient.get('/users'),

    // System
    getSystemInfo: () => apiClient.get('/system/info'),
    getSystemHealth: () => apiClient.get('/system/health'),
    getSystemVersion: () => apiClient.get('/system/version'),
    getUpdateStatus: () => apiClient.get('/system/update-status'),
    getUpdateProgress: () => apiClient.get('/system/update-progress'),
    updatePlatform: () => apiClient.post('/system/update'),

    // Export data
    exportTelemetryData: (deviceId, startDate, endDate, format = 'csv') =>
        apiClient.get(`/devices/${deviceId}/telemetry/export`, {
            params: { start_date: startDate, end_date: endDate, format },
            responseType: 'blob'
        }),

    // Settings
    getSettings: () => apiClient.get('/settings'),
    updateSettings: (settings) => apiClient.put('/settings', settings),
    uploadLogo: (formData) => apiClient.post('/settings/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    removeLogo: () => apiClient.delete('/settings/logo'),

    // Environment Variables
    getEnvironmentVariables: () => apiClient.get('/settings/environment'),
    updateEnvironmentVariables: (variables, requireRestart = false) =>
        apiClient.put('/settings/environment', { variables, requireRestart }),
    validateEnvironmentVariables: (variables) =>
        apiClient.post('/settings/environment/validate', { variables }),
    getEnvironmentBackups: () => apiClient.get('/settings/environment/backups'),

    // Silent Mode
    getSilentModeSchedules: (deviceId, locationId) => apiClient.get('/silent-mode', { params: { deviceId, locationId } }),
    getSilentModeSchedule: (scheduleId) => apiClient.get(`/silent-mode/${scheduleId}`),
    createSilentModeSchedule: (scheduleData) => apiClient.post('/silent-mode', scheduleData),
    updateSilentModeSchedule: (scheduleId, scheduleData) => apiClient.put(`/silent-mode/${scheduleId}`, scheduleData),
    deleteSilentModeSchedule: (scheduleId) => apiClient.delete(`/silent-mode/${scheduleId}`),
    checkSilentMode: (deviceId, alertType, severity) => apiClient.get(`/silent-mode/check/${deviceId}`, { params: { alertType, severity } }),

    // Protocol Settings
    getProtocolSettings: () => apiClient.get('/protocol-settings'),
    getDeviceProtocolSettings: (deviceId) => apiClient.get(`/protocol-settings/${deviceId}`),
    updateProtocolSettings: (protocolData) => apiClient.post('/protocol-settings', protocolData),
    deleteProtocolSettings: (deviceId) => apiClient.delete(`/protocol-settings/${deviceId}`),
    getMqttConfig: () => apiClient.get('/protocol-settings/mqtt/config'),
    testProtocolConnection: (connectionData) => apiClient.post('/protocol-settings/test-connection', connectionData),

    // OTA Updates
    triggerOTA: (deviceId) => apiClient.post(`/devices/${deviceId}/ota`),

    // Sensor Rules Management
    getAllSensorRules: (filters = {}) => apiClient.get('/sensor-rules', { params: filters }),
    getSensorRulesForDevice: (deviceId) => apiClient.get(`/sensor-rules/device/${deviceId}`),
    getSensorRulesForLocation: (locationId) => apiClient.get(`/sensor-rules/location/${locationId}`),
    getSensorRulesForGroup: (groupId) => apiClient.get(`/sensor-rules/group/${groupId}`),
    getSensorRule: (deviceId, sensorId, ruleId) => apiClient.get(`/devices/${deviceId}/sensors/${sensorId}/rules/${ruleId}`),
    updateSensorRule: (deviceId, sensorId, ruleId, ruleData) => apiClient.put(`/devices/${deviceId}/sensors/${sensorId}/rules/${ruleId}`, ruleData),
    deleteSensorRule: (deviceId, sensorId, ruleId) => apiClient.delete(`/devices/${deviceId}/sensors/${sensorId}/rules/${ruleId}`),

    // License Management
    getLicenseStatus: () => apiClient.get('/license/status'),
    getLicenseInfo: () => apiClient.get('/license/info'),
    getLicenseFeatures: () => apiClient.get('/license/features'),
    getLicenseLimits: () => apiClient.get('/license/limits'),
    activateLicense: (licenseKey) => apiClient.post('/license/activate', { license_key: licenseKey }),
    validateLicense: () => apiClient.post('/license/validate'),
    removeLicense: () => apiClient.delete('/license'),

    // Rate Limit Management
    getRateLimitStats: () => apiClient.get('/rate-limits/stats'),
    getRateLimitConfig: () => apiClient.get('/rate-limits/config'),
    getBlockedUsers: () => apiClient.get('/rate-limits/blocked'),
    getUserRateLimitStatus: (userId, role) => apiClient.get(`/rate-limits/status/${userId}`, { params: { role } }),
    resetRateLimit: (userId, role, endpointType) => apiClient.post(`/rate-limits/reset/${userId}`, { role, endpointType }),
    updateRoleLimitConfig: (role, config) => apiClient.put(`/rate-limits/config/${role}`, config),
    updateEndpointLimitConfig: (endpointType, config) => apiClient.put(`/rate-limits/endpoint-config/${endpointType}`, config),
};

export default apiService;
