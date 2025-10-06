-- Migration: Add Audit Logging System
-- Date: 2025-10-07
-- Description: Comprehensive audit trail for user actions and system events

-- Audit Logs table - stores all user and system actions
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,

    -- Who performed the action
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_email VARCHAR(255), -- Cached for deleted users
    user_role VARCHAR(20),

    -- Device actions (if applicable)
    device_id VARCHAR(50) REFERENCES devices(id) ON DELETE SET NULL,
    device_name VARCHAR(255), -- Cached for deleted devices

    -- Action details
    action_type VARCHAR(100) NOT NULL, -- 'user.login', 'device.create', 'sensor.update', etc.
    action_category VARCHAR(50) NOT NULL, -- 'authentication', 'device', 'sensor', 'alert', 'system', 'user'
    action_result VARCHAR(20) NOT NULL DEFAULT 'success', -- 'success', 'failure', 'error'

    -- What changed
    resource_type VARCHAR(50), -- 'device', 'sensor', 'user', 'alert_rule', etc.
    resource_id VARCHAR(255), -- ID of the affected resource
    resource_name VARCHAR(255), -- Name for easier reading

    -- Change details
    changes JSONB, -- Before/after values for updates: {"before": {...}, "after": {...}}
    metadata JSONB, -- Additional context: IP, user agent, request details

    -- Request information
    ip_address INET,
    user_agent TEXT,
    request_method VARCHAR(10), -- GET, POST, PUT, DELETE
    request_url VARCHAR(500),

    -- Error information (if applicable)
    error_message TEXT,
    error_code VARCHAR(50),

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Retention
    expires_at TIMESTAMP -- For automatic cleanup
);

-- Session Audit - track user sessions
CREATE TABLE IF NOT EXISTS session_audit (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    user_email VARCHAR(255),

    -- Session details
    session_token VARCHAR(255), -- JWT token hash
    session_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    session_end TIMESTAMP,
    session_duration INTEGER, -- seconds

    -- Connection details
    ip_address INET,
    user_agent TEXT,
    browser VARCHAR(100),
    os VARCHAR(100),
    device_type VARCHAR(50), -- 'desktop', 'mobile', 'tablet'

    -- Activity
    last_activity TIMESTAMP,
    actions_count INTEGER DEFAULT 0,

    -- Logout details
    logout_type VARCHAR(50), -- 'manual', 'timeout', 'force', 'token_expired'
    logout_reason TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Failed Login Attempts - security monitoring
CREATE TABLE IF NOT EXISTS failed_login_attempts (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    user_agent TEXT,

    -- Failure details
    failure_reason VARCHAR(100), -- 'invalid_password', 'user_not_found', 'account_locked'
    password_hash_attempted VARCHAR(255), -- For forensics (hashed)

    -- Geo-location (optional)
    country VARCHAR(2),
    city VARCHAR(100),

    -- Timestamps
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Account lockout tracking
    consecutive_failures INTEGER DEFAULT 1,
    account_locked BOOLEAN DEFAULT false
);

-- Data Export Audit - track who exported what data
CREATE TABLE IF NOT EXISTS data_export_audit (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_email VARCHAR(255),

    -- Export details
    export_type VARCHAR(50) NOT NULL, -- 'csv', 'json', 'pdf'
    resource_type VARCHAR(50) NOT NULL, -- 'telemetry', 'devices', 'alerts'

    -- What was exported
    device_ids TEXT[], -- Array of device IDs
    date_range_start TIMESTAMP,
    date_range_end TIMESTAMP,
    filters JSONB, -- Export filters applied

    -- Export results
    records_count INTEGER,
    file_size_bytes BIGINT,
    file_name VARCHAR(255),

    -- Request details
    ip_address INET,
    user_agent TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System Configuration Changes - track all settings changes
CREATE TABLE IF NOT EXISTS config_change_audit (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_email VARCHAR(255),

    -- What changed
    config_category VARCHAR(50) NOT NULL, -- 'email', 'smtp', 'twilio', 'system', 'security'
    config_key VARCHAR(100) NOT NULL,

    -- Values
    old_value TEXT,
    new_value TEXT,
    value_encrypted BOOLEAN DEFAULT false, -- True if values contain sensitive data

    -- Change details
    change_reason TEXT,
    ip_address INET,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Device Command Audit - track commands sent to devices
CREATE TABLE IF NOT EXISTS device_command_audit (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    device_id VARCHAR(50) REFERENCES devices(id) ON DELETE SET NULL,

    -- Command details
    command_type VARCHAR(50) NOT NULL, -- 'ota_update', 'restart', 'config_update', 'calibration'
    command_data JSONB,

    -- Result
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'acknowledged', 'completed', 'failed'
    device_response JSONB,
    error_message TEXT,

    -- Timing
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_seconds INTEGER,

    -- Request details
    ip_address INET
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_device_id ON audit_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_category ON audit_logs(action_category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address);

CREATE INDEX IF NOT EXISTS idx_session_audit_user ON session_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_session_audit_start ON session_audit(session_start DESC);
CREATE INDEX IF NOT EXISTS idx_session_audit_ip ON session_audit(ip_address);

CREATE INDEX IF NOT EXISTS idx_failed_login_email ON failed_login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_failed_login_ip ON failed_login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_failed_login_attempted ON failed_login_attempts(attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_export_user ON data_export_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_data_export_created ON data_export_audit(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_config_change_user ON config_change_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_config_change_category ON config_change_audit(config_category);
CREATE INDEX IF NOT EXISTS idx_config_change_created ON config_change_audit(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_command_user ON device_command_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_device_command_device ON device_command_audit(device_id);
CREATE INDEX IF NOT EXISTS idx_device_command_status ON device_command_audit(status);
CREATE INDEX IF NOT EXISTS idx_device_command_sent ON device_command_audit(sent_at DESC);

-- Create function to automatically clean up old audit logs (optional)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs() RETURNS void AS $$
BEGIN
    -- Delete audit logs older than 1 year (or based on expires_at)
    DELETE FROM audit_logs
    WHERE created_at < NOW() - INTERVAL '1 year'
       OR (expires_at IS NOT NULL AND expires_at < NOW());

    -- Delete old session audit
    DELETE FROM session_audit
    WHERE created_at < NOW() - INTERVAL '6 months';

    -- Delete old failed login attempts
    DELETE FROM failed_login_attempts
    WHERE attempted_at < NOW() - INTERVAL '3 months';

    -- Delete old data export audit
    DELETE FROM data_export_audit
    WHERE created_at < NOW() - INTERVAL '1 year';

    -- Delete old config changes (keep longer for compliance)
    DELETE FROM config_change_audit
    WHERE created_at < NOW() - INTERVAL '2 years';

    -- Delete old device commands
    DELETE FROM device_command_audit
    WHERE sent_at < NOW() - INTERVAL '6 months';
END;
$$ LANGUAGE plpgsql;

-- Optional: Create a scheduled job to run cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-audit-logs', '0 2 * * 0', 'SELECT cleanup_old_audit_logs()');

COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail of all user actions and system events';
COMMENT ON TABLE session_audit IS 'User session tracking for security and compliance';
COMMENT ON TABLE failed_login_attempts IS 'Failed authentication attempts for security monitoring';
COMMENT ON TABLE data_export_audit IS 'Track all data exports for compliance and security';
COMMENT ON TABLE config_change_audit IS 'Track all system configuration changes';
COMMENT ON TABLE device_command_audit IS 'Track all commands sent to devices';
