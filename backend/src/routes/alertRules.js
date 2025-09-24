const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const db = require('../models/database');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/alert-rules/templates - Get all alert rule templates
router.get('/templates', authenticateToken, async (req, res) => {
    try {
        const { sensorType, includeUser } = req.query;

        let query = `
            SELECT art.*, u.email as created_by_email
            FROM alert_rule_templates art
            LEFT JOIN users u ON art.created_by = u.id
            WHERE 1=1
        `;
        const params = [];

        if (sensorType) {
            query += ` AND (art.sensor_type = $${params.length + 1} OR art.sensor_type IS NULL)`;
            params.push(sensorType);
        }

        if (includeUser !== 'true') {
            query += ` AND (art.is_system_template = true OR art.created_by = $${params.length + 1})`;
            params.push(req.user.id);
        }

        query += ` ORDER BY art.is_system_template DESC, art.name`;

        const result = await db.query(query, params);

        res.json({
            success: true,
            templates: result.rows
        });
    } catch (error) {
        logger.error('Error fetching alert rule templates:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch alert rule templates'
        });
    }
});

// GET /api/alert-rules/templates/:id - Get specific template
router.get('/templates/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT art.*, u.email as created_by_email
            FROM alert_rule_templates art
            LEFT JOIN users u ON art.created_by = u.id
            WHERE art.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Alert rule template not found'
            });
        }

        res.json({
            success: true,
            template: result.rows[0]
        });
    } catch (error) {
        logger.error('Error fetching alert rule template:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch alert rule template'
        });
    }
});

// POST /api/alert-rules/templates - Create new rule template
router.post('/templates',
    authenticateToken,
    requireRole(['admin', 'operator']),
    [
        body('name').notEmpty().trim().isLength({ max: 255 }),
        body('description').optional().trim(),
        body('sensorType').optional().trim(),
        body('ruleConfig').isObject(),
        body('ruleConfig.conditions').isArray({ min: 1 }),
        body('ruleConfig.severity').isIn(['low', 'medium', 'high', 'critical']),
        body('ruleConfig.message').notEmpty().trim()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { name, description, sensorType, ruleConfig } = req.body;

            // Validate rule configuration
            const validationResult = validateRuleConfig(ruleConfig);
            if (!validationResult.valid) {
                return res.status(400).json({
                    success: false,
                    error: validationResult.error
                });
            }

            const result = await db.query(`
                INSERT INTO alert_rule_templates (name, description, sensor_type, rule_config, created_by)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [name, description, sensorType, JSON.stringify(ruleConfig), req.user.id]);

            logger.info(`Alert rule template created: ${name} by ${req.user.email}`);

            res.status(201).json({
                success: true,
                template: result.rows[0]
            });
        } catch (error) {
            logger.error('Error creating alert rule template:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create alert rule template'
            });
        }
    }
);

// PUT /api/alert-rules/templates/:id - Update rule template
router.put('/templates/:id',
    authenticateToken,
    requireRole(['admin', 'operator']),
    [
        body('name').notEmpty().trim().isLength({ max: 255 }),
        body('description').optional().trim(),
        body('sensorType').optional().trim(),
        body('ruleConfig').isObject()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { id } = req.params;
            const { name, description, sensorType, ruleConfig } = req.body;

            // Check if template exists and user has permission
            const templateResult = await db.query(
                'SELECT * FROM alert_rule_templates WHERE id = $1',
                [id]
            );

            if (templateResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Alert rule template not found'
                });
            }

            const template = templateResult.rows[0];

            // Only allow admins to edit system templates, or creators to edit their own
            if (template.is_system_template && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'Cannot modify system templates'
                });
            }

            if (!template.is_system_template && template.created_by !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'Cannot modify templates created by other users'
                });
            }

            // Validate rule configuration
            if (ruleConfig) {
                const validationResult = validateRuleConfig(ruleConfig);
                if (!validationResult.valid) {
                    return res.status(400).json({
                        success: false,
                        error: validationResult.error
                    });
                }
            }

            const result = await db.query(`
                UPDATE alert_rule_templates
                SET name = $1, description = $2, sensor_type = $3,
                    rule_config = $4, updated_at = CURRENT_TIMESTAMP
                WHERE id = $5
                RETURNING *
            `, [name, description, sensorType, JSON.stringify(ruleConfig), id]);

            logger.info(`Alert rule template updated: ${name} by ${req.user.email}`);

            res.json({
                success: true,
                template: result.rows[0]
            });
        } catch (error) {
            logger.error('Error updating alert rule template:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update alert rule template'
            });
        }
    }
);

// DELETE /api/alert-rules/templates/:id - Delete rule template
router.delete('/templates/:id',
    authenticateToken,
    requireRole(['admin']),
    async (req, res) => {
        try {
            const { id } = req.params;

            // Check if template exists
            const templateResult = await db.query(
                'SELECT name, is_system_template FROM alert_rule_templates WHERE id = $1',
                [id]
            );

            if (templateResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Alert rule template not found'
                });
            }

            const template = templateResult.rows[0];

            // Prevent deletion of system templates unless explicitly allowed
            if (template.is_system_template && req.query.force !== 'true') {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot delete system templates without force=true parameter'
                });
            }

            await db.query('DELETE FROM alert_rule_templates WHERE id = $1', [id]);

            logger.info(`Alert rule template deleted: ${template.name} by ${req.user.email}`);

            res.json({
                success: true,
                message: `Template "${template.name}" deleted successfully`
            });
        } catch (error) {
            logger.error('Error deleting alert rule template:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete alert rule template'
            });
        }
    }
);

// POST /api/alert-rules/apply-template/:templateId - Apply template to sensor
router.post('/apply-template/:templateId',
    authenticateToken,
    requireRole(['admin', 'operator']),
    [
        body('deviceSensorId').isInt({ min: 1 }),
        body('customizations').optional().isObject()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { templateId } = req.params;
            const { deviceSensorId, customizations = {} } = req.body;

            // Get template
            const templateResult = await db.query(
                'SELECT * FROM alert_rule_templates WHERE id = $1',
                [templateId]
            );

            if (templateResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Alert rule template not found'
                });
            }

            const template = templateResult.rows[0];

            // Get sensor info
            const sensorResult = await db.query(`
                SELECT ds.*, st.name as sensor_type, d.name as device_name
                FROM device_sensors ds
                JOIN sensor_types st ON ds.sensor_type_id = st.id
                JOIN devices d ON ds.device_id = d.id
                WHERE ds.id = $1
            `, [deviceSensorId]);

            if (sensorResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Device sensor not found'
                });
            }

            const sensor = sensorResult.rows[0];

            // Apply template with customizations
            let ruleConfig = { ...template.rule_config };
            if (customizations.severity) ruleConfig.severity = customizations.severity;
            if (customizations.message) ruleConfig.message = customizations.message;
            if (customizations.conditions) ruleConfig.conditions = customizations.conditions;

            // Create the rule
            const ruleResult = await db.query(`
                INSERT INTO sensor_rules (
                    device_sensor_id, rule_name, rule_type, enabled,
                    complex_conditions, evaluation_window_minutes,
                    consecutive_violations_required, cooldown_minutes,
                    severity, message, tags, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *
            `, [
                deviceSensorId,
                `${template.name} - ${sensor.device_name}`,
                'template',
                true,
                JSON.stringify(ruleConfig),
                customizations.evaluationWindow || 5,
                customizations.consecutiveViolations || 1,
                customizations.cooldownMinutes || 15,
                ruleConfig.severity,
                ruleConfig.message,
                customizations.tags || [template.name],
                req.user.id
            ]);

            logger.info(`Template ${template.name} applied to sensor ${sensor.name} by ${req.user.email}`);

            res.status(201).json({
                success: true,
                rule: ruleResult.rows[0],
                message: `Template "${template.name}" applied successfully`
            });

        } catch (error) {
            logger.error('Error applying alert rule template:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to apply alert rule template'
            });
        }
    }
);

// GET /api/alert-rules/evaluate/:ruleId - Test rule evaluation
router.get('/evaluate/:ruleId',
    authenticateToken,
    [
        query('testValue').optional().isFloat(),
        query('testConditions').optional().isJSON()
    ],
    async (req, res) => {
        try {
            const { ruleId } = req.params;
            const { testValue, testConditions } = req.query;

            // Get rule details
            const ruleResult = await db.query(`
                SELECT sr.*, ds.pin, ds.name as sensor_name, st.name as sensor_type,
                       d.name as device_name
                FROM sensor_rules sr
                JOIN device_sensors ds ON sr.device_sensor_id = ds.id
                JOIN sensor_types st ON ds.sensor_type_id = st.id
                JOIN devices d ON ds.device_id = d.id
                WHERE sr.id = $1
            `, [ruleId]);

            if (ruleResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Alert rule not found'
                });
            }

            const rule = ruleResult.rows[0];
            const conditions = rule.complex_conditions || {};

            // If test value provided, evaluate against it
            if (testValue !== undefined) {
                const evaluation = evaluateRuleConditions(conditions, parseFloat(testValue));

                res.json({
                    success: true,
                    rule: {
                        id: rule.id,
                        name: rule.rule_name,
                        sensorName: rule.sensor_name,
                        deviceName: rule.device_name
                    },
                    testValue: parseFloat(testValue),
                    evaluation: {
                        triggered: evaluation.triggered,
                        matchedConditions: evaluation.matchedConditions,
                        message: evaluation.triggered ? rule.message : 'Rule conditions not met'
                    }
                });
            } else {
                // Return rule configuration for inspection
                res.json({
                    success: true,
                    rule: {
                        id: rule.id,
                        name: rule.rule_name,
                        sensorName: rule.sensor_name,
                        deviceName: rule.device_name,
                        conditions: conditions,
                        severity: rule.severity,
                        message: rule.message,
                        evaluationWindow: rule.evaluation_window_minutes,
                        consecutiveViolations: rule.consecutive_violations_required,
                        cooldownMinutes: rule.cooldown_minutes
                    }
                });
            }

        } catch (error) {
            logger.error('Error evaluating alert rule:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to evaluate alert rule'
            });
        }
    }
);

// Helper Functions

function validateRuleConfig(config) {
    if (!config.conditions || !Array.isArray(config.conditions) || config.conditions.length === 0) {
        return { valid: false, error: 'Rule must have at least one condition' };
    }

    if (!config.severity || !['low', 'medium', 'high', 'critical'].includes(config.severity)) {
        return { valid: false, error: 'Rule must have a valid severity level' };
    }

    if (!config.message || typeof config.message !== 'string') {
        return { valid: false, error: 'Rule must have a message' };
    }

    // Validate each condition
    for (const condition of config.conditions) {
        if (!condition.type) {
            return { valid: false, error: 'Each condition must have a type' };
        }

        switch (condition.type) {
            case 'threshold':
                if (!condition.operator || !['>', '<', '>=', '<=', '==', '!='].includes(condition.operator)) {
                    return { valid: false, error: 'Threshold condition must have a valid operator' };
                }
                if (condition.value === undefined || condition.value === null) {
                    return { valid: false, error: 'Threshold condition must have a value' };
                }
                break;

            case 'range':
                if (condition.min === undefined && condition.max === undefined) {
                    return { valid: false, error: 'Range condition must have min or max value' };
                }
                if (condition.min !== undefined && condition.max !== undefined && condition.min >= condition.max) {
                    return { valid: false, error: 'Range condition min must be less than max' };
                }
                break;

            case 'change':
                if (!condition.changeType || !['increase', 'decrease', 'absolute'].includes(condition.changeType)) {
                    return { valid: false, error: 'Change condition must have a valid changeType' };
                }
                if (condition.threshold === undefined) {
                    return { valid: false, error: 'Change condition must have a threshold' };
                }
                break;

            case 'pattern':
                if (!condition.pattern || !['increasing', 'decreasing', 'stable', 'volatile'].includes(condition.pattern)) {
                    return { valid: false, error: 'Pattern condition must have a valid pattern type' };
                }
                break;

            default:
                return { valid: false, error: `Unknown condition type: ${condition.type}` };
        }
    }

    return { valid: true };
}

function evaluateRuleConditions(conditions, value, previousValues = []) {
    const results = {
        triggered: false,
        matchedConditions: []
    };

    if (!conditions.conditions || !Array.isArray(conditions.conditions)) {
        return results;
    }

    for (const condition of conditions.conditions) {
        let conditionMet = false;

        switch (condition.type) {
            case 'threshold':
                conditionMet = evaluateThresholdCondition(condition, value);
                break;

            case 'range':
                conditionMet = evaluateRangeCondition(condition, value);
                break;

            case 'change':
                conditionMet = evaluateChangeCondition(condition, value, previousValues);
                break;

            case 'pattern':
                conditionMet = evaluatePatternCondition(condition, value, previousValues);
                break;
        }

        if (conditionMet) {
            results.matchedConditions.push(condition);
        }
    }

    // Determine if rule is triggered based on logic operator (default: OR)
    const logicOperator = conditions.logic || 'OR';

    if (logicOperator === 'AND') {
        results.triggered = results.matchedConditions.length === conditions.conditions.length;
    } else { // OR
        results.triggered = results.matchedConditions.length > 0;
    }

    return results;
}

function evaluateThresholdCondition(condition, value) {
    const { operator, value: threshold } = condition;

    switch (operator) {
        case '>': return value > threshold;
        case '<': return value < threshold;
        case '>=': return value >= threshold;
        case '<=': return value <= threshold;
        case '==': return value === threshold;
        case '!=': return value !== threshold;
        default: return false;
    }
}

function evaluateRangeCondition(condition, value) {
    const { min, max } = condition;

    if (min !== undefined && value < min) return false;
    if (max !== undefined && value > max) return false;

    return true;
}

function evaluateChangeCondition(condition, value, previousValues) {
    if (previousValues.length === 0) return false;

    const previousValue = previousValues[previousValues.length - 1];
    const change = value - previousValue;
    const { changeType, threshold } = condition;

    switch (changeType) {
        case 'increase':
            return change > threshold;
        case 'decrease':
            return change < -threshold;
        case 'absolute':
            return Math.abs(change) > threshold;
        default:
            return false;
    }
}

function evaluatePatternCondition(condition, value, previousValues) {
    if (previousValues.length < 3) return false; // Need some history

    const { pattern } = condition;
    const recent = previousValues.slice(-5); // Look at last 5 values
    recent.push(value);

    switch (pattern) {
        case 'increasing':
            return isIncreasingPattern(recent);
        case 'decreasing':
            return isDecreasingPattern(recent);
        case 'stable':
            return isStablePattern(recent);
        case 'volatile':
            return isVolatilePattern(recent);
        default:
            return false;
    }
}

function isIncreasingPattern(values) {
    for (let i = 1; i < values.length; i++) {
        if (values[i] <= values[i - 1]) return false;
    }
    return true;
}

function isDecreasingPattern(values) {
    for (let i = 1; i < values.length; i++) {
        if (values[i] >= values[i - 1]) return false;
    }
    return true;
}

function isStablePattern(values) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Consider stable if standard deviation is less than 5% of average
    return stdDev < (avg * 0.05);
}

function isVolatilePattern(values) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Consider volatile if standard deviation is more than 20% of average
    return stdDev > (avg * 0.20);
}

module.exports = router;