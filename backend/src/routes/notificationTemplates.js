const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/notification-templates - Get all notification templates
 * Role: admin, operator
 */
router.get('/', [
    authenticateToken,
    requireRole(['admin', 'operator']),
    query('channel').optional().isIn(['email', 'sms', 'telegram', 'whatsapp', 'webhook', 'all']),
    query('template_type').optional().isIn(['alert', 'device_status', 'system', 'custom']),
    query('is_active').optional().isBoolean().toBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { channel, template_type, is_active } = req.query;

        let query = 'SELECT * FROM notification_templates WHERE 1=1';
        const params = [];
        let paramCount = 1;

        if (channel) {
            query += ` AND channel = $${paramCount}`;
            params.push(channel);
            paramCount++;
        }

        if (template_type) {
            query += ` AND template_type = $${paramCount}`;
            params.push(template_type);
            paramCount++;
        }

        if (is_active !== undefined) {
            query += ` AND is_active = $${paramCount}`;
            params.push(is_active);
            paramCount++;
        }

        query += ' ORDER BY template_type, channel, name';

        const result = await db.query(query, params);

        res.json({
            templates: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        logger.error('Get notification templates error:', error);
        res.status(500).json({ error: 'Failed to fetch notification templates' });
    }
});

/**
 * GET /api/notification-templates/:id - Get single template
 * Role: admin, operator
 */
router.get('/:id', [
    authenticateToken,
    requireRole(['admin', 'operator']),
    param('id').isInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;

        const result = await db.query(
            'SELECT * FROM notification_templates WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.json({ template: result.rows[0] });
    } catch (error) {
        logger.error('Get notification template error:', error);
        res.status(500).json({ error: 'Failed to fetch notification template' });
    }
});

/**
 * POST /api/notification-templates - Create new template
 * Role: admin
 */
router.post('/', [
    authenticateToken,
    requireRole(['admin']),
    body('name').notEmpty().trim(),
    body('description').optional().trim(),
    body('template_type').isIn(['alert', 'device_status', 'system', 'custom']),
    body('channel').isIn(['email', 'sms', 'telegram', 'whatsapp', 'webhook', 'all']),
    body('subject_template').optional().trim(),
    body('body_template').notEmpty(),
    body('variables').optional().isObject(),
    body('is_active').optional().isBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const {
            name,
            description,
            template_type,
            channel,
            subject_template,
            body_template,
            variables,
            is_active
        } = req.body;

        // Check for duplicate name
        const existing = await db.query(
            'SELECT id FROM notification_templates WHERE name = $1',
            [name]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Template with this name already exists' });
        }

        const result = await db.query(
            `INSERT INTO notification_templates (
                name, description, template_type, channel,
                subject_template, body_template, variables, is_active, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`,
            [
                name,
                description,
                template_type,
                channel,
                subject_template,
                body_template,
                variables ? JSON.stringify(variables) : null,
                is_active !== false,
                req.user.userId
            ]
        );

        logger.info(`Notification template created: ${name} by user ${req.user.email}`);

        res.status(201).json({
            template: result.rows[0],
            message: 'Notification template created successfully'
        });
    } catch (error) {
        logger.error('Create notification template error:', error);
        res.status(500).json({ error: 'Failed to create notification template' });
    }
});

/**
 * PUT /api/notification-templates/:id - Update template
 * Role: admin
 */
router.put('/:id', [
    authenticateToken,
    requireRole(['admin']),
    param('id').isInt(),
    body('name').optional().notEmpty().trim(),
    body('description').optional().trim(),
    body('subject_template').optional().trim(),
    body('body_template').optional().notEmpty(),
    body('variables').optional().isObject(),
    body('is_active').optional().isBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const {
            name,
            description,
            subject_template,
            body_template,
            variables,
            is_active
        } = req.body;

        // Check if template exists
        const existing = await db.query(
            'SELECT * FROM notification_templates WHERE id = $1',
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }

        // Check for duplicate name (if name is being changed)
        if (name && name !== existing.rows[0].name) {
            const duplicate = await db.query(
                'SELECT id FROM notification_templates WHERE name = $1 AND id != $2',
                [name, id]
            );

            if (duplicate.rows.length > 0) {
                return res.status(400).json({ error: 'Template with this name already exists' });
            }
        }

        const result = await db.query(
            `UPDATE notification_templates
            SET name = COALESCE($1, name),
                description = COALESCE($2, description),
                subject_template = COALESCE($3, subject_template),
                body_template = COALESCE($4, body_template),
                variables = COALESCE($5, variables),
                is_active = COALESCE($6, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $7
            RETURNING *`,
            [
                name,
                description,
                subject_template,
                body_template,
                variables ? JSON.stringify(variables) : null,
                is_active,
                id
            ]
        );

        logger.info(`Notification template updated: ${result.rows[0].name} by user ${req.user.email}`);

        res.json({
            template: result.rows[0],
            message: 'Notification template updated successfully'
        });
    } catch (error) {
        logger.error('Update notification template error:', error);
        res.status(500).json({ error: 'Failed to update notification template' });
    }
});

/**
 * DELETE /api/notification-templates/:id - Delete template
 * Role: admin
 */
router.delete('/:id', [
    authenticateToken,
    requireRole(['admin']),
    param('id').isInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;

        // Check if template is system template
        const template = await db.query(
            'SELECT * FROM notification_templates WHERE id = $1',
            [id]
        );

        if (template.rows.length === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }

        if (template.rows[0].is_system) {
            return res.status(403).json({ error: 'Cannot delete system templates. You can only edit them.' });
        }

        await db.query('DELETE FROM notification_templates WHERE id = $1', [id]);

        logger.info(`Notification template deleted: ${template.rows[0].name} by user ${req.user.email}`);

        res.json({ message: 'Notification template deleted successfully' });
    } catch (error) {
        logger.error('Delete notification template error:', error);
        res.status(500).json({ error: 'Failed to delete notification template' });
    }
});

/**
 * POST /api/notification-templates/:id/test - Test template rendering
 * Role: admin, operator
 */
router.post('/:id/test', [
    authenticateToken,
    requireRole(['admin', 'operator']),
    param('id').isInt(),
    body('variables').isObject()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { variables } = req.body;

        const template = await db.query(
            'SELECT * FROM notification_templates WHERE id = $1',
            [id]
        );

        if (template.rows.length === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }

        const { subject_template, body_template } = template.rows[0];

        // Simple template rendering (replace {{variable}} with values)
        const renderTemplate = (templateStr, vars) => {
            if (!templateStr) return null;
            let rendered = templateStr;
            Object.keys(vars).forEach(key => {
                const regex = new RegExp(`{{${key}}}`, 'g');
                rendered = rendered.replace(regex, vars[key] || '');
            });
            return rendered;
        };

        const renderedSubject = renderTemplate(subject_template, variables);
        const renderedBody = renderTemplate(body_template, variables);

        res.json({
            subject: renderedSubject,
            body: renderedBody,
            original_subject: subject_template,
            original_body: body_template,
            variables_used: variables
        });
    } catch (error) {
        logger.error('Test notification template error:', error);
        res.status(500).json({ error: 'Failed to test notification template' });
    }
});

/**
 * GET /api/notification-templates/variables/list - Get available template variables
 * Role: admin, operator
 */
router.get('/variables/list', [
    authenticateToken,
    requireRole(['admin', 'operator'])
], async (req, res) => {
    try {
        const availableVariables = {
            alert: {
                device_name: 'Name of the device',
                device_id: 'Unique device identifier',
                location: 'Device location',
                sensor_name: 'Sensor name',
                sensor_type: 'Type of sensor',
                current_value: 'Current sensor reading',
                unit: 'Measurement unit',
                threshold_min: 'Minimum threshold value',
                threshold_max: 'Maximum threshold value',
                severity: 'Alert severity level',
                alert_name: 'Name of the alert',
                alert_message: 'Alert description',
                timestamp: 'Alert timestamp',
                dashboard_url: 'Dashboard base URL'
            },
            device_status: {
                device_name: 'Device name',
                device_id: 'Device ID',
                location: 'Device location',
                status: 'Device status',
                last_heartbeat: 'Last heartbeat timestamp',
                ip_address: 'Device IP address',
                firmware_version: 'Firmware version',
                uptime: 'Device uptime',
                dashboard_url: 'Dashboard base URL'
            },
            system: {
                system_name: 'System name',
                event_type: 'Event type',
                event_message: 'Event description',
                timestamp: 'Event timestamp',
                dashboard_url: 'Dashboard base URL'
            }
        };

        res.json({ variables: availableVariables });
    } catch (error) {
        logger.error('Get template variables error:', error);
        res.status(500).json({ error: 'Failed to fetch template variables' });
    }
});

module.exports = router;
