const db = require('../models/database');
const logger = require('../utils/logger');

/**
 * Audit Service - Comprehensive audit logging for all user actions and system events
 */
class AuditService {
    /**
     * Log a user action to the audit trail
     * @param {Object} params - Audit log parameters
     * @param {number} params.userId - User ID performing the action
     * @param {string} params.userEmail - User email (cached for deleted users)
     * @param {string} params.userRole - User role at time of action
     * @param {string} params.actionType - Type of action (e.g., 'user.login', 'device.update')
     * @param {string} params.actionCategory - Category (authentication, device, sensor, alert, system, user)
     * @param {string} params.actionResult - Result (success, failure, error)
     * @param {string} params.resourceType - Type of resource affected
     * @param {string} params.resourceId - ID of resource affected
     * @param {string} params.resourceName - Name of resource affected
     * @param {Object} params.changes - Before/after values for updates
     * @param {Object} params.metadata - Additional context
     * @param {string} params.ipAddress - IP address of requester
     * @param {string} params.userAgent - User agent string
     * @param {string} params.requestMethod - HTTP method
     * @param {string} params.requestUrl - Request URL
     * @param {string} params.errorMessage - Error message if action failed
     * @param {string} params.errorCode - Error code if action failed
     * @param {string} params.deviceId - Device ID if action involves a device
     * @param {string} params.deviceName - Device name
     * @param {Date} params.expiresAt - Expiration date for auto-cleanup
     */
    async logAction(params) {
        try {
            const {
                userId = null,
                userEmail = null,
                userRole = null,
                actionType,
                actionCategory,
                actionResult = 'success',
                resourceType = null,
                resourceId = null,
                resourceName = null,
                changes = null,
                metadata = null,
                ipAddress = null,
                userAgent = null,
                requestMethod = null,
                requestUrl = null,
                errorMessage = null,
                errorCode = null,
                deviceId = null,
                deviceName = null,
                expiresAt = null
            } = params;

            await db.query(
                `INSERT INTO audit_logs (
                    user_id, user_email, user_role, device_id, device_name,
                    action_type, action_category, action_result,
                    resource_type, resource_id, resource_name,
                    changes, metadata,
                    ip_address, user_agent, request_method, request_url,
                    error_message, error_code, expires_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
                [
                    userId, userEmail, userRole, deviceId, deviceName,
                    actionType, actionCategory, actionResult,
                    resourceType, resourceId, resourceName,
                    changes ? JSON.stringify(changes) : null,
                    metadata ? JSON.stringify(metadata) : null,
                    ipAddress, userAgent, requestMethod, requestUrl,
                    errorMessage, errorCode, expiresAt
                ]
            );

            logger.info(`Audit: ${actionType} by ${userEmail || 'system'}`, {
                userId,
                actionCategory,
                actionResult,
                resourceType,
                resourceId
            });
        } catch (error) {
            // Don't fail the request if audit logging fails
            logger.error('Audit logging error:', error);
        }
    }

    /**
     * Helper method to log actions from Express request
     */
    async logFromRequest(req, actionType, actionCategory, additionalParams = {}) {
        const params = {
            userId: req.user?.userId || null,
            userEmail: req.user?.email || null,
            userRole: req.user?.role || null,
            actionType,
            actionCategory,
            ipAddress: req.ip || req.connection?.remoteAddress || null,
            userAgent: req.get('User-Agent') || null,
            requestMethod: req.method,
            requestUrl: req.originalUrl || req.url,
            ...additionalParams
        };

        return this.logAction(params);
    }

    /**
     * Log user login
     */
    async logLogin(user, req, success = true, failureReason = null) {
        await this.logAction({
            userId: success ? user.id : null,
            userEmail: user.email,
            userRole: success ? user.role : null,
            actionType: success ? 'user.login' : 'user.login.failed',
            actionCategory: 'authentication',
            actionResult: success ? 'success' : 'failure',
            resourceType: 'user',
            resourceId: success ? user.id?.toString() : null,
            ipAddress: req.ip || req.connection?.remoteAddress,
            userAgent: req.get('User-Agent'),
            requestMethod: req.method,
            requestUrl: req.originalUrl,
            errorMessage: failureReason,
            metadata: {
                loginMethod: 'email_password'
            }
        });

        // Track failed login attempts
        if (!success) {
            await this.logFailedLogin(user.email, req, failureReason);
        }
    }

    /**
     * Log failed login attempt
     */
    async logFailedLogin(email, req, reason) {
        try {
            const ipAddress = req.ip || req.connection?.remoteAddress;
            const userAgent = req.get('User-Agent');

            // Check recent failures from this IP/email combination
            const recentFailures = await db.query(
                `SELECT COUNT(*) as count FROM failed_login_attempts
                 WHERE email = $1 AND ip_address = $2
                 AND attempted_at > NOW() - INTERVAL '1 hour'`,
                [email, ipAddress]
            );

            const consecutiveFailures = parseInt(recentFailures.rows[0].count) + 1;
            const accountLocked = consecutiveFailures >= 5; // Lock after 5 failures

            await db.query(
                `INSERT INTO failed_login_attempts (
                    email, ip_address, user_agent, failure_reason,
                    consecutive_failures, account_locked
                ) VALUES ($1, $2, $3, $4, $5, $6)`,
                [email, ipAddress, userAgent, reason, consecutiveFailures, accountLocked]
            );

            if (accountLocked) {
                logger.warn(`Account locked due to failed login attempts: ${email}`, {
                    email,
                    ipAddress,
                    consecutiveFailures
                });
            }
        } catch (error) {
            logger.error('Failed login logging error:', error);
        }
    }

    /**
     * Log user logout
     */
    async logLogout(user, req, logoutType = 'manual', logoutReason = null) {
        await this.logAction({
            userId: user.id,
            userEmail: user.email,
            userRole: user.role,
            actionType: 'user.logout',
            actionCategory: 'authentication',
            actionResult: 'success',
            resourceType: 'user',
            resourceId: user.id?.toString(),
            ipAddress: req.ip || req.connection?.remoteAddress,
            userAgent: req.get('User-Agent'),
            metadata: {
                logoutType,
                logoutReason
            }
        });
    }

    /**
     * Start user session tracking
     */
    async startSession(user, req, sessionToken) {
        try {
            const userAgent = req.get('User-Agent') || '';
            const browser = this.extractBrowser(userAgent);
            const os = this.extractOS(userAgent);
            const deviceType = this.extractDeviceType(userAgent);

            await db.query(
                `INSERT INTO session_audit (
                    user_id, user_email, session_token, ip_address,
                    user_agent, browser, os, device_type, last_activity
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
                [
                    user.id,
                    user.email,
                    this.hashToken(sessionToken),
                    req.ip || req.connection?.remoteAddress,
                    userAgent,
                    browser,
                    os,
                    deviceType
                ]
            );
        } catch (error) {
            logger.error('Session tracking error:', error);
        }
    }

    /**
     * End user session
     */
    async endSession(sessionToken, logoutType = 'manual', logoutReason = null) {
        try {
            const hashedToken = this.hashToken(sessionToken);

            await db.query(
                `UPDATE session_audit
                 SET session_end = NOW(),
                     session_duration = EXTRACT(EPOCH FROM (NOW() - session_start))::INTEGER,
                     logout_type = $2,
                     logout_reason = $3
                 WHERE session_token = $1 AND session_end IS NULL`,
                [hashedToken, logoutType, logoutReason]
            );
        } catch (error) {
            logger.error('End session error:', error);
        }
    }

    /**
     * Update session activity
     */
    async updateSessionActivity(sessionToken) {
        try {
            const hashedToken = this.hashToken(sessionToken);

            await db.query(
                `UPDATE session_audit
                 SET last_activity = NOW(),
                     actions_count = actions_count + 1
                 WHERE session_token = $1 AND session_end IS NULL`,
                [hashedToken]
            );
        } catch (error) {
            // Silent fail - not critical
        }
    }

    /**
     * Log data export
     */
    async logDataExport(user, req, exportDetails) {
        try {
            const {
                exportType,
                resourceType,
                deviceIds = [],
                dateRangeStart,
                dateRangeEnd,
                filters = {},
                recordsCount,
                fileSizeBytes,
                fileName
            } = exportDetails;

            await db.query(
                `INSERT INTO data_export_audit (
                    user_id, user_email, export_type, resource_type,
                    device_ids, date_range_start, date_range_end, filters,
                    records_count, file_size_bytes, file_name,
                    ip_address, user_agent
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                [
                    user.id,
                    user.email,
                    exportType,
                    resourceType,
                    deviceIds,
                    dateRangeStart,
                    dateRangeEnd,
                    JSON.stringify(filters),
                    recordsCount,
                    fileSizeBytes,
                    fileName,
                    req.ip || req.connection?.remoteAddress,
                    req.get('User-Agent')
                ]
            );

            logger.info(`Data export: ${exportType} by ${user.email}`, {
                resourceType,
                recordsCount,
                deviceCount: deviceIds.length
            });
        } catch (error) {
            logger.error('Data export audit error:', error);
        }
    }

    /**
     * Log configuration change
     */
    async logConfigChange(user, req, configCategory, configKey, oldValue, newValue, changeReason = null) {
        try {
            // Don't log sensitive values in plain text
            const sensitiveKeys = ['password', 'secret', 'token', 'api_key', 'smtp_pass'];
            const isSensitive = sensitiveKeys.some(key => configKey.toLowerCase().includes(key));

            await db.query(
                `INSERT INTO config_change_audit (
                    user_id, user_email, config_category, config_key,
                    old_value, new_value, value_encrypted, change_reason, ip_address
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    user.id,
                    user.email,
                    configCategory,
                    configKey,
                    isSensitive ? '[ENCRYPTED]' : oldValue,
                    isSensitive ? '[ENCRYPTED]' : newValue,
                    isSensitive,
                    changeReason,
                    req.ip || req.connection?.remoteAddress
                ]
            );

            logger.info(`Config change: ${configCategory}.${configKey} by ${user.email}`);
        } catch (error) {
            logger.error('Config change audit error:', error);
        }
    }

    /**
     * Log device command
     */
    async logDeviceCommand(userId, deviceId, commandType, commandData, ipAddress = null) {
        try {
            const result = await db.query(
                `INSERT INTO device_command_audit (
                    user_id, device_id, command_type, command_data, ip_address
                ) VALUES ($1, $2, $3, $4, $5)
                 RETURNING id`,
                [userId, deviceId, commandType, JSON.stringify(commandData), ipAddress]
            );

            return result.rows[0].id;
        } catch (error) {
            logger.error('Device command audit error:', error);
            return null;
        }
    }

    /**
     * Update device command status
     */
    async updateDeviceCommand(commandId, status, deviceResponse = null, errorMessage = null) {
        try {
            const updates = { status };

            if (status === 'acknowledged') {
                await db.query(
                    `UPDATE device_command_audit
                     SET status = $1, acknowledged_at = NOW(), device_response = $2
                     WHERE id = $3`,
                    [status, deviceResponse ? JSON.stringify(deviceResponse) : null, commandId]
                );
            } else if (status === 'completed' || status === 'failed') {
                await db.query(
                    `UPDATE device_command_audit
                     SET status = $1, completed_at = NOW(),
                         duration_seconds = EXTRACT(EPOCH FROM (NOW() - sent_at))::INTEGER,
                         device_response = $2, error_message = $3
                     WHERE id = $4`,
                    [status, deviceResponse ? JSON.stringify(deviceResponse) : null, errorMessage, commandId]
                );
            }
        } catch (error) {
            logger.error('Device command update error:', error);
        }
    }

    /**
     * Get audit logs with filters
     */
    async getAuditLogs(filters = {}, limit = 100, offset = 0) {
        try {
            const {
                userId,
                deviceId,
                actionType,
                actionCategory,
                actionResult,
                startDate,
                endDate,
                searchTerm
            } = filters;

            let query = `
                SELECT * FROM audit_logs
                WHERE 1=1
            `;
            const params = [];
            let paramCount = 1;

            if (userId) {
                query += ` AND user_id = $${paramCount}`;
                params.push(userId);
                paramCount++;
            }

            if (deviceId) {
                query += ` AND device_id = $${paramCount}`;
                params.push(deviceId);
                paramCount++;
            }

            if (actionType) {
                query += ` AND action_type = $${paramCount}`;
                params.push(actionType);
                paramCount++;
            }

            if (actionCategory) {
                query += ` AND action_category = $${paramCount}`;
                params.push(actionCategory);
                paramCount++;
            }

            if (actionResult) {
                query += ` AND action_result = $${paramCount}`;
                params.push(actionResult);
                paramCount++;
            }

            if (startDate) {
                query += ` AND created_at >= $${paramCount}`;
                params.push(startDate);
                paramCount++;
            }

            if (endDate) {
                query += ` AND created_at <= $${paramCount}`;
                params.push(endDate);
                paramCount++;
            }

            if (searchTerm) {
                query += ` AND (user_email ILIKE $${paramCount} OR resource_name ILIKE $${paramCount} OR action_type ILIKE $${paramCount})`;
                params.push(`%${searchTerm}%`);
                paramCount++;
            }

            query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
            params.push(limit, offset);

            const result = await db.query(query, params);

            // Get total count - rebuild query without LIMIT/OFFSET
            let countQuery = `SELECT COUNT(*) FROM audit_logs WHERE 1=1`;
            const countParams = [];
            let countParamCount = 1;

            if (userId) {
                countQuery += ` AND user_id = $${countParamCount}`;
                countParams.push(userId);
                countParamCount++;
            }

            if (deviceId) {
                countQuery += ` AND device_id = $${countParamCount}`;
                countParams.push(deviceId);
                countParamCount++;
            }

            if (actionType) {
                countQuery += ` AND action_type = $${countParamCount}`;
                countParams.push(actionType);
                countParamCount++;
            }

            if (actionCategory) {
                countQuery += ` AND action_category = $${countParamCount}`;
                countParams.push(actionCategory);
                countParamCount++;
            }

            if (actionResult) {
                countQuery += ` AND action_result = $${countParamCount}`;
                countParams.push(actionResult);
                countParamCount++;
            }

            if (startDate) {
                countQuery += ` AND created_at >= $${countParamCount}`;
                countParams.push(startDate);
                countParamCount++;
            }

            if (endDate) {
                countQuery += ` AND created_at <= $${countParamCount}`;
                countParams.push(endDate);
                countParamCount++;
            }

            if (searchTerm) {
                countQuery += ` AND (user_email ILIKE $${countParamCount} OR resource_name ILIKE $${countParamCount} OR action_type ILIKE $${countParamCount})`;
                countParams.push(`%${searchTerm}%`);
                countParamCount++;
            }

            const countResult = await db.query(countQuery, countParams);
            const total = parseInt(countResult.rows[0].count);

            return {
                logs: result.rows,
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            };
        } catch (error) {
            logger.error('Get audit logs error:', error);
            throw error;
        }
    }

    /**
     * Helper: Hash session token for storage
     */
    hashToken(token) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    /**
     * Helper: Extract browser from user agent
     */
    extractBrowser(userAgent) {
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Safari')) return 'Safari';
        if (userAgent.includes('Edge')) return 'Edge';
        if (userAgent.includes('Opera')) return 'Opera';
        return 'Unknown';
    }

    /**
     * Helper: Extract OS from user agent
     */
    extractOS(userAgent) {
        if (userAgent.includes('Windows')) return 'Windows';
        if (userAgent.includes('Mac')) return 'macOS';
        if (userAgent.includes('Linux')) return 'Linux';
        if (userAgent.includes('Android')) return 'Android';
        if (userAgent.includes('iOS')) return 'iOS';
        return 'Unknown';
    }

    /**
     * Helper: Extract device type from user agent
     */
    extractDeviceType(userAgent) {
        if (userAgent.includes('Mobile')) return 'mobile';
        if (userAgent.includes('Tablet')) return 'tablet';
        return 'desktop';
    }
}

module.exports = new AuditService();
