const auditService = require('../services/auditService');
const logger = require('../utils/logger');

/**
 * Audit Middleware - Automatically log API requests
 * This middleware captures all requests and logs them to the audit trail
 */

/**
 * Audit logging middleware
 * Logs all requests to sensitive endpoints
 */
const auditLogger = (options = {}) => {
    const {
        skipPaths = ['/health', '/api/auth/setup-check'], // Paths to skip
        skipMethods = ['GET'], // Methods to skip (can be overridden)
        logGetRequests = false // Whether to log GET requests
    } = options;

    return async (req, res, next) => {
        // Skip paths that don't need auditing
        if (skipPaths.some(path => req.path.startsWith(path))) {
            return next();
        }

        // Skip GET requests unless explicitly enabled
        if (!logGetRequests && req.method === 'GET') {
            return next();
        }

        // Store original methods
        const originalJson = res.json;
        const originalSend = res.send;
        const originalEnd = res.end;

        let responseBody = null;
        let responseSent = false;

        // Intercept response to capture result
        const captureResponse = (body) => {
            if (!responseSent && body) {
                try {
                    responseBody = typeof body === 'string' ? JSON.parse(body) : body;
                } catch (e) {
                    responseBody = body;
                }
            }
            return body;
        };

        // Override res.json
        res.json = function (body) {
            if (!responseSent) {
                responseSent = true;
                captureResponse(body);
                logAuditTrail(req, res, body);
            }
            return originalJson.call(this, body);
        };

        // Override res.send
        res.send = function (body) {
            if (!responseSent) {
                responseSent = true;
                captureResponse(body);
                logAuditTrail(req, res, body);
            }
            return originalSend.call(this, body);
        };

        // Override res.end
        res.end = function (chunk, encoding) {
            if (!responseSent) {
                responseSent = true;
                logAuditTrail(req, res, chunk);
            }
            return originalEnd.call(this, chunk, encoding);
        };

        next();
    };
};

/**
 * Log the audit trail based on request/response
 */
function logAuditTrail(req, res, responseBody) {
    try {
        const actionDetails = determineActionDetails(req, res, responseBody);

        if (actionDetails) {
            // Don't await - fire and forget
            auditService.logFromRequest(req, actionDetails.actionType, actionDetails.actionCategory, {
                actionResult: res.statusCode < 400 ? 'success' : 'failure',
                resourceType: actionDetails.resourceType,
                resourceId: actionDetails.resourceId,
                resourceName: actionDetails.resourceName,
                changes: actionDetails.changes,
                metadata: actionDetails.metadata,
                errorMessage: actionDetails.errorMessage,
                errorCode: actionDetails.errorCode,
                deviceId: actionDetails.deviceId,
                deviceName: actionDetails.deviceName
            }).catch(err => {
                logger.error('Audit logging failed:', err);
            });
        }
    } catch (error) {
        logger.error('Audit trail error:', error);
    }
}

/**
 * Determine action details based on request path and method
 */
function determineActionDetails(req, res, responseBody) {
    const path = req.path;
    const method = req.method;
    const params = req.params;
    const body = req.body || {};
    const isSuccess = res.statusCode < 400;

    // Authentication actions
    if (path.includes('/api/auth/login')) {
        return {
            actionType: isSuccess ? 'user.login' : 'user.login.failed',
            actionCategory: 'authentication',
            resourceType: 'user',
            resourceId: responseBody?.user?.id,
            metadata: { loginMethod: 'email_password' }
        };
    }

    if (path.includes('/api/auth/logout')) {
        return {
            actionType: 'user.logout',
            actionCategory: 'authentication',
            resourceType: 'user'
        };
    }

    if (path.includes('/api/auth/forgot-password')) {
        return {
            actionType: 'user.password_reset_request',
            actionCategory: 'authentication',
            resourceType: 'user',
            metadata: { email: body.email }
        };
    }

    if (path.includes('/api/auth/reset-password')) {
        return {
            actionType: 'user.password_reset',
            actionCategory: 'authentication',
            resourceType: 'user'
        };
    }

    // User management actions
    if (path.match(/^\/api\/users$/)) {
        if (method === 'POST') {
            return {
                actionType: 'user.create',
                actionCategory: 'user',
                resourceType: 'user',
                resourceId: responseBody?.user?.id,
                resourceName: body.email,
                metadata: { role: body.role }
            };
        }
    }

    if (path.match(/^\/api\/users\/\d+$/)) {
        if (method === 'PUT') {
            return {
                actionType: 'user.update',
                actionCategory: 'user',
                resourceType: 'user',
                resourceId: params.id,
                changes: buildChanges(body),
                metadata: { updatedFields: Object.keys(body) }
            };
        }
        if (method === 'DELETE') {
            return {
                actionType: 'user.delete',
                actionCategory: 'user',
                resourceType: 'user',
                resourceId: params.id
            };
        }
    }

    // Device actions
    if (path.match(/^\/api\/devices$/)) {
        if (method === 'POST') {
            return {
                actionType: 'device.create',
                actionCategory: 'device',
                resourceType: 'device',
                resourceId: responseBody?.device?.id,
                resourceName: body.name || body.device_id,
                deviceId: responseBody?.device?.id,
                deviceName: body.name
            };
        }
    }

    if (path.match(/^\/api\/devices\/.+$/)) {
        const deviceId = params.id || params.deviceId;

        if (method === 'PUT') {
            return {
                actionType: 'device.update',
                actionCategory: 'device',
                resourceType: 'device',
                resourceId: deviceId,
                deviceId,
                changes: buildChanges(body),
                metadata: { updatedFields: Object.keys(body) }
            };
        }
        if (method === 'DELETE') {
            return {
                actionType: 'device.delete',
                actionCategory: 'device',
                resourceType: 'device',
                resourceId: deviceId,
                deviceId
            };
        }
    }

    // Sensor actions
    if (path.match(/^\/api\/devices\/.+\/sensors\/.+$/)) {
        const deviceId = params.deviceId;
        const sensorId = params.sensorId;

        if (method === 'PUT') {
            return {
                actionType: 'sensor.update',
                actionCategory: 'sensor',
                resourceType: 'sensor',
                resourceId: sensorId,
                deviceId,
                changes: buildChanges(body),
                metadata: {
                    triggerOta: body.triggerOta,
                    updatedFields: Object.keys(body)
                }
            };
        }
    }

    // Alert rule actions
    if (path.match(/^\/api\/alert-rules$/)) {
        if (method === 'POST') {
            return {
                actionType: 'alert_rule.create',
                actionCategory: 'alert',
                resourceType: 'alert_rule',
                resourceId: responseBody?.rule?.id,
                deviceId: body.device_id,
                metadata: { severity: body.severity, sensorType: body.sensor_type }
            };
        }
    }

    if (path.match(/^\/api\/alert-rules\/\d+$/)) {
        if (method === 'PUT') {
            return {
                actionType: 'alert_rule.update',
                actionCategory: 'alert',
                resourceType: 'alert_rule',
                resourceId: params.id,
                changes: buildChanges(body)
            };
        }
        if (method === 'DELETE') {
            return {
                actionType: 'alert_rule.delete',
                actionCategory: 'alert',
                resourceType: 'alert_rule',
                resourceId: params.id
            };
        }
    }

    // Alert acknowledgment/resolution
    if (path.includes('/alerts/') && path.includes('/acknowledge')) {
        return {
            actionType: 'alert.acknowledge',
            actionCategory: 'alert',
            resourceType: 'alert',
            resourceId: params.id,
            metadata: { notes: body.notes }
        };
    }

    if (path.includes('/alerts/') && path.includes('/resolve')) {
        return {
            actionType: 'alert.resolve',
            actionCategory: 'alert',
            resourceType: 'alert',
            resourceId: params.id,
            metadata: { resolutionNotes: body.resolution_notes }
        };
    }

    // Settings changes
    if (path.match(/^\/api\/settings$/)) {
        if (method === 'PUT') {
            return {
                actionType: 'settings.update',
                actionCategory: 'system',
                resourceType: 'settings',
                changes: buildChanges(body),
                metadata: { updatedFields: Object.keys(body) }
            };
        }
    }

    // System update
    if (path.includes('/api/system/update')) {
        return {
            actionType: 'system.update',
            actionCategory: 'system',
            resourceType: 'system',
            metadata: { updateType: 'platform_update' }
        };
    }

    // OTA firmware update
    if (path.includes('/firmware/ota/')) {
        return {
            actionType: 'firmware.ota_trigger',
            actionCategory: 'device',
            resourceType: 'ota_update',
            deviceId: params.deviceId,
            metadata: {
                firmwareVersion: body.version,
                firmwareUrl: body.firmware_url
            }
        };
    }

    // Telemetry export
    if (path.includes('/telemetry/') && path.includes('/export')) {
        return {
            actionType: 'data.export',
            actionCategory: 'system',
            resourceType: 'telemetry',
            deviceId: params.deviceId,
            metadata: {
                exportType: 'csv',
                startDate: body.start_date,
                endDate: body.end_date
            }
        };
    }

    // Default - return null to skip logging
    return null;
}

/**
 * Build changes object for before/after comparison
 * Note: This only captures "after" values. For full before/after,
 * you'd need to fetch the resource before updating
 */
function buildChanges(body) {
    if (!body || Object.keys(body).length === 0) return null;

    return {
        after: body
        // before: would need to be fetched from database
    };
}

/**
 * Middleware specifically for auditing device commands
 */
const auditDeviceCommand = async (req, res, next) => {
    const originalJson = res.json;
    const deviceId = req.params.deviceId || req.params.id;
    const commandType = req.body.command_type || req.path.split('/').pop();

    res.json = async function (body) {
        try {
            const commandId = await auditService.logDeviceCommand(
                req.user?.userId,
                deviceId,
                commandType,
                req.body,
                req.ip || req.connection?.remoteAddress
            );

            // Attach command ID to response for status tracking
            if (body && commandId) {
                body.auditCommandId = commandId;
            }
        } catch (error) {
            logger.error('Device command audit error:', error);
        }

        return originalJson.call(this, body);
    };

    next();
};

module.exports = {
    auditLogger,
    auditDeviceCommand
};
