const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const logDir = process.env.LOG_DIR || './logs';

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4
};

// Define colors for each level
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white'
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which level to log based on environment
const level = () => {
    const env = process.env.NODE_ENV || 'development';
    const isDevelopment = env === 'development';
    return isDevelopment ? 'debug' : 'info';
};

// Define custom format
const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`
    )
);

// Define file format (without colors)
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Define transports
const transports = [
    // Console transport
    new winston.transports.Console({
        format: format,
        level: level(),
        handleExceptions: true,
        handleRejections: true
    }),

    // Error log file
    new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        format: fileFormat,
        handleExceptions: true,
        handleRejections: true,
        maxsize: 10485760, // 10MB
        maxFiles: 5
    }),

    // Combined log file
    new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        format: fileFormat,
        level: level(),
        maxsize: 10485760, // 10MB
        maxFiles: 5
    })
];

// Create the logger
const logger = winston.createLogger({
    level: level(),
    levels,
    format: fileFormat,
    transports,
    exitOnError: false
});

// Add request logging functionality
logger.logRequest = (req, res, responseTime) => {
    const logData = {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        responseTime: `${responseTime}ms`,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress,
        userId: req.user ? req.user.userId : null,
        userEmail: req.user ? req.user.email : null
    };

    if (res.statusCode >= 400) {
        logger.warn('HTTP Request', logData);
    } else {
        logger.http('HTTP Request', logData);
    }
};

// Add database query logging
logger.logQuery = (query, params, duration) => {
    if (process.env.LOG_QUERIES === 'true') {
        logger.debug('Database Query', {
            query: query.replace(/\s+/g, ' ').trim(),
            params,
            duration: `${duration}ms`
        });
    }
};

// Add security event logging
logger.logSecurity = (event, details) => {
    logger.warn('Security Event', {
        event,
        ...details,
        timestamp: new Date().toISOString()
    });
};

// Add device event logging
logger.logDevice = (deviceId, event, data) => {
    logger.info('Device Event', {
        deviceId,
        event,
        data,
        timestamp: new Date().toISOString()
    });
};

// Add alert logging
logger.logAlert = (alertId, event, data) => {
    logger.info('Alert Event', {
        alertId,
        event,
        data,
        timestamp: new Date().toISOString()
    });
};

// Add escalation logging
logger.logEscalation = (alertId, escalationLevel, method, recipients) => {
    logger.warn('Alert Escalation', {
        alertId,
        escalationLevel,
        method,
        recipients: recipients ? recipients.length : 0,
        timestamp: new Date().toISOString()
    });
};

// Create logs directory on startup
const fs = require('fs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Add missing logger methods that are referenced in the codebase
logger.logDeviceActivity = (deviceId, activity, metadata = {}) => {
    logger.info('Device Activity', {
        deviceId,
        activity,
        timestamp: new Date().toISOString(),
        ...metadata,
        type: 'device_activity'
    });
};

logger.logOTAEvent = (deviceId, event, metadata = {}) => {
    logger.info('OTA Event', {
        deviceId,
        event,
        timestamp: new Date().toISOString(),
        ...metadata,
        type: 'ota_event'
    });
};

module.exports = logger;