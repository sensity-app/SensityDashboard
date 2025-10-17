-- =====================================================
-- Sensity Platform - Performance Optimization Indexes
-- Migration: 004
-- Purpose: Add database indexes for faster queries
-- Note: Only creates indexes for tables that exist
-- =====================================================

-- =====================================================
-- 1. DEVICES TABLE INDEXES
-- =====================================================

-- Status is frequently used in filters and WHERE clauses
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);

-- Location filtering
CREATE INDEX IF NOT EXISTS idx_devices_location ON devices(location_id);

-- Search by name (supports LIKE queries better)
CREATE INDEX IF NOT EXISTS idx_devices_name ON devices(name);

-- MAC address lookup (unique device identification)
CREATE INDEX IF NOT EXISTS idx_devices_mac ON devices(mac_address);

-- Created date for sorting and filtering
CREATE INDEX IF NOT EXISTS idx_devices_created ON devices(created_at DESC);

-- Last heartbeat for online/offline detection (note: column is last_heartbeat, not last_seen)
CREATE INDEX IF NOT EXISTS idx_devices_last_heartbeat ON devices(last_heartbeat DESC);

-- Composite index for common query pattern (status + location)
CREATE INDEX IF NOT EXISTS idx_devices_status_location ON devices(status, location_id);

-- =====================================================
-- 2. DEVICE SENSORS INDEXES
-- =====================================================

-- Device sensor lookups
CREATE INDEX IF NOT EXISTS idx_device_sensors_device ON device_sensors(device_id);

-- Sensor type filtering
CREATE INDEX IF NOT EXISTS idx_device_sensors_type ON device_sensors(sensor_type_id);

-- =====================================================
-- 3. ALERTS & NOTIFICATIONS INDEXES
-- =====================================================

-- Alert rules by device
CREATE INDEX IF NOT EXISTS idx_alert_rules_device ON alert_rules(device_id);

-- Active/enabled alerts
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled);

-- Alert history by device
CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts(device_id);

-- Recent alerts (for dashboard)
CREATE INDEX IF NOT EXISTS idx_alerts_created_desc ON alerts(triggered_at DESC);

-- Alert status filtering
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);

-- Alert severity filtering
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);

-- Composite severity + status index
CREATE INDEX IF NOT EXISTS idx_alerts_severity_status ON alerts(severity, status);

-- =====================================================
-- 4. AUDIT LOGS INDEXES
-- =====================================================

-- Audit logs by action type
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);

-- Audit logs by action category
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_category ON audit_logs(action_category);

-- Audit logs by user
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);

-- Audit logs by resource
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Recent audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- Audit logs by IP address
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address);

-- =====================================================
-- 5. LICENSE SYSTEM INDEXES
-- =====================================================

-- License keys by customer
CREATE INDEX IF NOT EXISTS idx_license_keys_customer ON license_keys(customer_email);

-- License keys by status
CREATE INDEX IF NOT EXISTS idx_license_keys_status ON license_keys(status);

-- License keys by expiration
CREATE INDEX IF NOT EXISTS idx_license_keys_expires ON license_keys(expires_at);

-- License key lookups
CREATE INDEX IF NOT EXISTS idx_license_keys_key ON license_keys(license_key);

-- License features by license
CREATE INDEX IF NOT EXISTS idx_license_features_license ON license_features(license_key_id);

-- License validations by key
CREATE INDEX IF NOT EXISTS idx_license_validations_key_id ON license_validations(license_key_id);

-- Recent license validations
CREATE INDEX IF NOT EXISTS idx_license_validations_validated_at ON license_validations(validated_at DESC);

-- =====================================================
-- 6. FIRMWARE VERSIONS INDEXES
-- =====================================================

-- Firmware versions by version number
CREATE INDEX IF NOT EXISTS idx_firmware_versions_version ON firmware_versions(version);

-- =====================================================
-- 7. FAILED LOGIN ATTEMPTS INDEXES
-- =====================================================

-- Failed logins by email
CREATE INDEX IF NOT EXISTS idx_failed_login_email ON failed_login_attempts(email);

-- Failed logins by IP
CREATE INDEX IF NOT EXISTS idx_failed_login_ip ON failed_login_attempts(ip_address);

-- Recent failed login attempts
CREATE INDEX IF NOT EXISTS idx_failed_login_attempted ON failed_login_attempts(attempted_at DESC);

-- =====================================================
-- 8. DEVICE COMMAND AUDIT INDEXES
-- =====================================================

-- Command audit by device
CREATE INDEX IF NOT EXISTS idx_device_command_device ON device_command_audit(device_id);

-- Command audit by status
CREATE INDEX IF NOT EXISTS idx_device_command_status ON device_command_audit(status);

-- Recent command audits
CREATE INDEX IF NOT EXISTS idx_device_command_sent ON device_command_audit(sent_at DESC);

-- Command audit by user
CREATE INDEX IF NOT EXISTS idx_device_command_user ON device_command_audit(user_id);

-- =====================================================
-- 9. CONFIG CHANGE AUDIT INDEXES
-- =====================================================

-- Config changes by category
CREATE INDEX IF NOT EXISTS idx_config_change_category ON config_change_audit(config_category);

-- Config changes by user
CREATE INDEX IF NOT EXISTS idx_config_change_user ON config_change_audit(user_id);

-- Recent config changes
CREATE INDEX IF NOT EXISTS idx_config_change_created ON config_change_audit(created_at DESC);

-- =====================================================
-- 10. DATA EXPORT AUDIT INDEXES
-- =====================================================

-- Data exports by user
CREATE INDEX IF NOT EXISTS idx_data_export_user ON data_export_audit(user_id);

-- Recent data exports
CREATE INDEX IF NOT EXISTS idx_data_export_created ON data_export_audit(created_at DESC);

-- =====================================================
-- CONDITIONAL INDEXES (only if tables exist)
-- These will be created by a separate migration after JS migrations run
-- =====================================================

-- Check if device_groups table exists (created by JS migration)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'device_groups') THEN
        -- Device groups by name
        CREATE INDEX IF NOT EXISTS idx_device_groups_name ON device_groups(name);

        -- Device group members by group
        CREATE INDEX IF NOT EXISTS idx_device_group_members_group ON device_group_members(group_id);

        -- Device group members by device
        CREATE INDEX IF NOT EXISTS idx_device_group_members_device ON device_group_members(device_id);
    END IF;
END $$;

-- Check if device_tags table exists (created by JS migration)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'device_tags') THEN
        -- Device tags by name
        CREATE INDEX IF NOT EXISTS idx_device_tags_name ON device_tags(name);

        -- Device tag assignments by tag
        CREATE INDEX IF NOT EXISTS idx_device_tag_assignments_tag ON device_tag_assignments(tag_id);

        -- Device tag assignments by device
        CREATE INDEX IF NOT EXISTS idx_device_tag_assignments_device ON device_tag_assignments(device_id);
    END IF;
END $$;

-- Check if telegram_config table exists (created by JS migration)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'telegram_config') THEN
        -- Telegram config (usually only one row, but index for completeness)
        CREATE INDEX IF NOT EXISTS idx_telegram_config_active ON telegram_config(is_active);
    END IF;
END $$;

-- =====================================================
-- FINAL STEP: ANALYZE TABLES
-- =====================================================

-- Update table statistics for query planner
ANALYZE devices;
ANALYZE device_sensors;
ANALYZE alerts;
ANALYZE alert_rules;
ANALYZE audit_logs;
ANALYZE license_keys;
ANALYZE license_features;
ANALYZE license_validations;
ANALYZE firmware_versions;
ANALYZE failed_login_attempts;
ANALYZE device_command_audit;
ANALYZE config_change_audit;
ANALYZE data_export_audit;

-- Conditional analyze for tables that might not exist yet
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'device_groups') THEN
        ANALYZE device_groups;
        ANALYZE device_group_members;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'device_tags') THEN
        ANALYZE device_tags;
        ANALYZE device_tag_assignments;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'telegram_config') THEN
        ANALYZE telegram_config;
        ANALYZE telegram_notifications;
    END IF;
END $$;

-- =====================================================
-- MIGRATION COMPLETED
-- =====================================================

-- Insert migration tracking record
INSERT INTO migrations (migration_name, migration_type)
VALUES ('004_add_performance_indexes.sql', 'sql')
ON CONFLICT (migration_name) DO NOTHING;

-- Success message
SELECT
    'Performance indexes migration completed successfully!' as status,
    'Created indexes on existing tables - conditional indexes will be added later' as summary;

