const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const Redis = require('ioredis');
require('dotenv').config();

// Import enhanced routes and services
const authRoutes = require('./src/routes/auth');
const deviceRoutes = require('./src/routes/devices');
const alertRoutes = require('./src/routes/alerts');
const locationRoutes = require('./src/routes/locations');
const userRoutes = require('./src/routes/users');
const firmwareRoutes = require('./src/routes/firmware');
const telemetryRoutes = require('./src/routes/telemetry');
const escalationRoutes = require('./src/routes/escalation');
const analyticsRoutes = require('./src/routes/analytics');
const deviceGroupRoutes = require('./src/routes/deviceGroups');
const deviceTagRoutes = require('./src/routes/deviceTags');
const alertRuleRoutes = require('./src/routes/alertRules');
const firmwareBuilderRoutes = require('./src/routes/firmwareBuilder');
const firmwareTemplateRoutes = require('./src/routes/firmwareTemplates');
const settingsRoutes = require('./src/routes/settings');
const silentModeRoutes = require('./src/routes/silentMode');
const protocolSettingsRoutes = require('./src/routes/protocolSettings');
const systemRoutes = require('./src/routes/system');
const telegramRoutes = require('./src/routes/telegram');
const thresholdCalibrationRoutes = require('./src/routes/thresholdCalibration');
const securityRoutes = require('./src/routes/security');
const webhookRoutes = require('./src/routes/webhooks');
const licenseRoutes = require('./src/routes/license');

const WebSocketService = require('./src/services/websocketService');
const AlertEscalationService = require('./src/services/alertEscalationService');
const TelemetryProcessor = require('./src/services/telemetryProcessor');
const MQTTService = require('./src/services/mqttService');
const licenseService = require('./src/services/licenseService');
const UserRateLimiter = require('./src/middleware/userRateLimit');
const logger = require('./src/utils/logger');
const db = require('./src/models/database');
const {
    requireValidLicense,
    addLicenseHeaders,
    requireFeature
} = require('./src/middleware/licenseMiddleware');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

// Initialize Redis for real-time data caching
const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    retryDelayOnFailover: 100,
    enableOfflineQueue: false,
});

// Initialize services
const websocketService = new WebSocketService(io, redis);
const alertEscalationService = new AlertEscalationService();
const telemetryProcessor = new TelemetryProcessor(redis, websocketService);
const mqttService = new MQTTService(telemetryProcessor);
const userRateLimiter = new UserRateLimiter(redis);
const rateLimitRoutes = require('./src/routes/rateLimit')(userRateLimiter);

const PORT = process.env.PORT || 3000;

// Trust proxy - needed when behind nginx reverse proxy
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// IP-based rate limiting - generous limits for development
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5000, // Increased from 1000 to 5000 requests per window
    message: 'Too many requests from this IP',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// Attach services to request object for use in routes
app.use((req, res, next) => {
    req.telemetryProcessor = telemetryProcessor;
    req.websocketService = websocketService;
    req.alertEscalationService = alertEscalationService;
    next();
});

// Routes - Authentication (no user rate limiting on login to avoid blocking legitimate users)
app.use('/api/auth', authRoutes);

// License management routes (accessible without active license for activation/status)
// No user rate limiting here to allow license activation without being blocked
app.use('/api/license', licenseRoutes);

// Attach license metadata to responses
app.use(addLicenseHeaders);

// Apply user-based rate limiting to all other API routes
// This comes after auth and license routes to avoid blocking license activation
app.use('/api/', userRateLimiter.middleware());

// Routes that require a valid license
const protectedRoutes = [
    ['/api/sensor-types', deviceRoutes, 'device_management'], // Sensor types endpoint (in devices router)
    ['/api/devices', deviceRoutes, 'device_management'],
    ['/api/alerts', alertRoutes, 'basic_monitoring'],
    ['/api/locations', locationRoutes, 'device_management'],
    ['/api/users', userRoutes],
    ['/api/firmware', firmwareRoutes, 'device_management'],
    ['/api/telemetry', telemetryRoutes, 'basic_monitoring'],
    ['/api/escalation', escalationRoutes, 'basic_monitoring'],
    ['/api/analytics', analyticsRoutes, 'analytics_advanced'],
    ['/api/device-groups', deviceGroupRoutes, 'device_management'],
    ['/api/device-tags', deviceTagRoutes, 'device_management'],
    ['/api/alert-rules', alertRuleRoutes, 'analytics_basic'],
    ['/api/firmware-builder', firmwareBuilderRoutes, 'device_management'],
    ['/api/firmware-templates', firmwareTemplateRoutes, 'device_management'],
    ['/api/settings', settingsRoutes],
    ['/api/silent-mode', silentModeRoutes, 'analytics_basic'],
    ['/api/protocol-settings', protocolSettingsRoutes, 'custom_integrations'],
    ['/api/system', systemRoutes],
    ['/api/telegram', telegramRoutes, 'custom_integrations'],
    ['/api/threshold-calibration', thresholdCalibrationRoutes, 'analytics_advanced'],
    ['/api/security', securityRoutes, 'audit_logging'],
    ['/api/webhooks', webhookRoutes, 'custom_integrations'],
    ['/api/rate-limits', rateLimitRoutes]
];

for (const [path, router, feature] of protectedRoutes) {
    if (feature) {
        app.use(path, requireValidLicense, requireFeature(feature), router);
    } else {
        app.use(path, requireValidLicense, router);
    }
}

// WebSocket authentication middleware
io.use(websocketService.authenticateSocket);

// WebSocket connection handling
io.on('connection', (socket) => {
    websocketService.handleConnection(socket);
});

// Scheduled tasks
// Alert escalation check every minute
cron.schedule('* * * * *', async () => {
    try {
        await alertEscalationService.processEscalations();
    } catch (error) {
        logger.error('Alert escalation cron error:', error);
    }
});

// Device offline check every 5 minutes
cron.schedule('*/5 * * * *', async () => {
    try {
        await telemetryProcessor.checkOfflineDevices();
    } catch (error) {
        logger.error('Offline device check error:', error);
    }
});

// Cleanup old telemetry data daily at 2 AM
cron.schedule('0 2 * * *', async () => {
    try {
        await telemetryProcessor.cleanupOldTelemetry();
    } catch (error) {
        logger.error('Telemetry cleanup error:', error);
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        uptime: process.uptime(),
        services: {
            mqtt: mqttService.getStatus()
        }
    });
});

// Error handling
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await mqttService.shutdown();
    server.close(() => {
        redis.disconnect();
        process.exit(0);
    });
});

server.listen(PORT, async () => {
    logger.info(`Enhanced ESP8266 Platform server running on port ${PORT}`);

    // Initialize database and run migrations
    try {
        await db.initialize();
        logger.info('Database initialization completed');
    } catch (error) {
        logger.error('Database initialization failed:', error);
    }

    // Initialize license service (validation, grace period timers)
    try {
        await licenseService.initialize();
        logger.info('License service initialized');
    } catch (error) {
        logger.error('License service initialization failed:', error);
    }

    // Initialize MQTT service if enabled
    if (process.env.MQTT_ENABLED !== 'false') {
        try {
            await mqttService.initialize();
            logger.info('MQTT service initialized successfully');
        } catch (error) {
            logger.warn('MQTT service initialization failed (this is optional):', error.message);
            logger.info('HTTP protocol will continue to work normally');
        }
    } else {
        logger.info('MQTT service disabled via configuration');
    }
});

module.exports = { app, server, io, redis };
