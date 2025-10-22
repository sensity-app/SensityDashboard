-- Migration 009: Seed Initial Audit Logs
-- This creates some initial audit log entries to demonstrate the feature

-- Insert system startup event
INSERT INTO audit_logs (
    user_id,
    action,
    action_category,
    resource_type,
    action_result,
    ip_address,
    user_agent,
    metadata,
    timestamp
)
SELECT
    1, -- Assumes admin user with ID 1 exists
    'system.startup',
    'system',
    'system',
    'success',
    '127.0.0.1',
    'System',
    '{"event": "platform_initialization", "version": "1.0.0"}',
    CURRENT_TIMESTAMP - INTERVAL '1 hour'
WHERE EXISTS (SELECT 1 FROM users WHERE id = 1)
ON CONFLICT DO NOTHING;

-- Insert database migration event
INSERT INTO audit_logs (
    user_id,
    action,
    action_category,
    resource_type,
    action_result,
    ip_address,
    user_agent,
    metadata,
    timestamp
)
SELECT
    1,
    'system.database_migration',
    'system',
    'database',
    'success',
    '127.0.0.1',
    'Migration Script',
    '{"migration": "009_seed_initial_audit_logs", "description": "Initial audit log setup"}',
    CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM users WHERE id = 1)
ON CONFLICT DO NOTHING;

-- Optionally log admin user actions if they exist
INSERT INTO audit_logs (
    user_id,
    action,
    action_category,
    resource_type,
    resource_id,
    resource_name,
    action_result,
    ip_address,
    user_agent,
    metadata,
    timestamp
)
SELECT
    u.id,
    'user.login',
    'authentication',
    'user',
    u.id::text,
    u.email,
    'success',
    '127.0.0.1',
    'Browser',
    '{"loginMethod": "initial_setup"}',
    CURRENT_TIMESTAMP - INTERVAL '30 minutes'
FROM users u
WHERE u.role = 'admin'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Verify audit logs
SELECT COUNT(*) as audit_log_count FROM audit_logs;

-- Show recent audit logs
SELECT
    al.id,
    al.action,
    al.action_category,
    u.email as user_email,
    al.timestamp
FROM audit_logs al
LEFT JOIN users u ON al.user_id = u.id
ORDER BY al.timestamp DESC
LIMIT 5;
