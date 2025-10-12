-- =====================================================
-- Sensity Dashboard - Performance Optimization Indexes
-- Version: 1.2.0
-- Description: Adds indexes for faster queries and improved performance
-- =====================================================

-- =====================================================
-- 1. DEVICE INDEXES
-- =====================================================

-- Index for device status queries (common filter)
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);

-- Index for location-based queries
CREATE INDEX IF NOT EXISTS idx_devices_location ON devices(location_id);

-- Index for firmware version queries
CREATE INDEX IF NOT EXISTS idx_devices_firmware ON devices(firmware_version);

-- Index for last seen queries (sorting and filtering)
CREATE INDEX IF NOT EXISTS idx_devices_last_heartbeat ON devices(last_heartbeat DESC);

-- Index for MAC address lookups
CREATE INDEX IF NOT EXISTS idx_devices_mac ON devices(mac_address);

-- Index for IP address lookups
CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip_address);

-- Index for device type queries
CREATE INDEX IF NOT EXISTS idx_devices_type ON devices(device_type);

-- Composite index for common queries (status + location)
CREATE INDEX IF NOT EXISTS idx_devices_status_location ON devices(status, location_id);

-- Index for device name search (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_devices_name_lower ON devices(LOWER(name));

COMMENT ON INDEX idx_devices_status IS 'Speeds up device status filtering';
COMMENT ON INDEX idx_devices_location IS 'Speeds up location-based device queries';
COMMENT ON INDEX idx_devices_last_heartbeat IS 'Optimizes device activity sorting';

-- =====================================================
-- 2. TELEMETRY DATA INDEXES
-- =====================================================

-- Index for timestamp-based queries (most common)
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_data(timestamp DESC);

-- Composite index for device telemetry queries
CREATE INDEX IF NOT EXISTS idx_telemetry_device_timestamp ON telemetry_data(device_id, timestamp DESC);

-- Partial index for recent data (last 7 days)
CREATE INDEX IF NOT EXISTS idx_telemetry_recent ON telemetry_data(timestamp DESC)
WHERE timestamp > NOW() - INTERVAL '7 days';

COMMENT ON INDEX idx_telemetry_timestamp IS 'Optimizes time-series queries';
COMMENT ON INDEX idx_telemetry_device_timestamp IS 'Speeds up device-specific telemetry retrieval';
COMMENT ON INDEX idx_telemetry_recent IS 'Partial index for recent data queries';

-- =====================================================
-- 3. AUDIT LOGS INDEXES
-- =====================================================

-- Index for timestamp-based log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- Index for user activity logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);

-- Index for action type filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action_type);

-- Composite index for user + action queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON audit_logs(user_id, action_type, created_at DESC);

COMMENT ON INDEX idx_audit_logs_created IS 'Speeds up audit log retrieval';
COMMENT ON INDEX idx_audit_logs_user IS 'Optimizes user activity tracking';

-- =====================================================
-- 4. ALERT RULES & ALERTS INDEXES
-- =====================================================

-- Index for active alert rules
CREATE INDEX IF NOT EXISTS idx_alert_rules_active ON alert_rules(is_active) WHERE is_active = true;

-- Index for device-specific alert rules
CREATE INDEX IF NOT EXISTS idx_alert_rules_device ON alert_rules(device_id);

-- Index for alert status filtering
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);

-- Index for alert severity (for priority sorting)
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);

-- Composite index for alert queries
CREATE INDEX IF NOT EXISTS idx_alerts_status_created ON alerts(status, created_at DESC);

-- Index for unacknowledged alerts
CREATE INDEX IF NOT EXISTS idx_alerts_unacknowledged ON alerts(acknowledged) WHERE acknowledged = false;

-- Index for device-specific alerts
CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts(device_id, created_at DESC);

COMMENT ON INDEX idx_alert_rules_active IS 'Speeds up active rule evaluation';
COMMENT ON INDEX idx_alerts_unacknowledged IS 'Optimizes unacknowledged alert queries';

-- =====================================================
-- 5. USER & SESSION INDEXES
-- =====================================================

-- Index for email lookups (login)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index for username lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Index for active users
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active) WHERE is_active = true;

COMMENT ON INDEX idx_users_email IS 'Speeds up login queries';

-- =====================================================
-- 6. DEVICE GROUPS & TAGS INDEXES
-- =====================================================

-- Index for group membership queries
CREATE INDEX IF NOT EXISTS idx_device_group_members_device ON device_group_members(device_id);
CREATE INDEX IF NOT EXISTS idx_device_group_members_group ON device_group_members(group_id);

-- Composite index for group-device relationship
CREATE INDEX IF NOT EXISTS idx_device_group_members_both ON device_group_members(group_id, device_id);

-- Index for device tags
CREATE INDEX IF NOT EXISTS idx_device_tag_assignments_device ON device_tag_assignments(device_id);
CREATE INDEX IF NOT EXISTS idx_device_tag_assignments_tag ON device_tag_assignments(tag_id);

COMMENT ON INDEX idx_device_group_members_device IS 'Speeds up device group lookups';
COMMENT ON INDEX idx_device_tag_assignments_device IS 'Optimizes device tag queries';

-- =====================================================
-- 7. FIRMWARE & OTA INDEXES
-- =====================================================

-- Index for firmware lookups
CREATE INDEX IF NOT EXISTS idx_firmware_version ON firmware(version);
CREATE INDEX IF NOT EXISTS idx_firmware_device_type ON firmware(device_type);

-- Index for active firmware
CREATE INDEX IF NOT EXISTS idx_firmware_is_active ON firmware(is_active) WHERE is_active = true;

-- Index for OTA update status
CREATE INDEX IF NOT EXISTS idx_ota_updates_status ON ota_updates(status);
CREATE INDEX IF NOT EXISTS idx_ota_updates_device ON ota_updates(device_id, created_at DESC);

-- Index for pending OTA updates
CREATE INDEX IF NOT EXISTS idx_ota_updates_pending ON ota_updates(status)
WHERE status IN ('pending', 'in_progress');

COMMENT ON INDEX idx_ota_updates_pending IS 'Speeds up pending update queries';

-- =====================================================
-- 8. LOCATIONS INDEXES
-- =====================================================

-- Index for location name search
CREATE INDEX IF NOT EXISTS idx_locations_name_lower ON locations(LOWER(name));

-- Index for active locations
CREATE INDEX IF NOT EXISTS idx_locations_is_active ON locations(is_active) WHERE is_active = true;

-- =====================================================
-- 9. ESCALATION POLICIES INDEXES
-- =====================================================

-- Index for active escalation policies
CREATE INDEX IF NOT EXISTS idx_escalation_policies_active ON escalation_policies(is_active)
WHERE is_active = true;

-- Index for alert rule escalations
CREATE INDEX IF NOT EXISTS idx_escalation_policies_alert_rule ON escalation_policies(alert_rule_id);

-- =====================================================
-- 10. FULL-TEXT SEARCH SETUP (PostgreSQL)
-- =====================================================

-- Enable pg_trgm extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_devices_search ON devices USING gin(
  to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
);

CREATE INDEX IF NOT EXISTS idx_locations_search ON locations USING gin(
  to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
);

-- Trigram index for fuzzy name matching
CREATE INDEX IF NOT EXISTS idx_devices_name_trgm ON devices USING gin(name gin_trgm_ops);

COMMENT ON INDEX idx_devices_search IS 'Full-text search on device name and description';

-- =====================================================
-- 11. STATISTICS UPDATE
-- =====================================================

-- Analyze tables to update statistics
ANALYZE devices;
ANALYZE telemetry_data;
ANALYZE audit_logs;
ANALYZE alerts;
ANALYZE alert_rules;
ANALYZE users;
ANALYZE device_groups;
ANALYZE device_group_members;
ANALYZE device_tags;
ANALYZE device_tag_assignments;
ANALYZE firmware;
ANALYZE ota_updates;
ANALYZE locations;

-- =====================================================
-- 12. PERFORMANCE VIEWS
-- =====================================================

-- Materialized view for device statistics (refresh periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS device_statistics AS
SELECT
    COUNT(*) as total_devices,
    COUNT(*) FILTER (WHERE status = 'online') as online_devices,
    COUNT(*) FILTER (WHERE status = 'offline') as offline_devices,
    COUNT(*) FILTER (WHERE status = 'error') as error_devices,
    COUNT(DISTINCT location_id) as total_locations,
    COUNT(DISTINCT firmware_version) as firmware_versions,
    AVG(uptime_seconds) FILTER (WHERE uptime_seconds IS NOT NULL) as avg_uptime,
    MAX(last_heartbeat) as last_activity
FROM devices;

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_statistics_refresh ON device_statistics(total_devices);

-- Materialized view for alert statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS alert_statistics AS
SELECT
    COUNT(*) as total_alerts,
    COUNT(*) FILTER (WHERE status = 'active') as active_alerts,
    COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged_alerts,
    COUNT(*) FILTER (WHERE status = 'resolved') as resolved_alerts,
    COUNT(*) FILTER (WHERE severity = 'critical') as critical_alerts,
    COUNT(*) FILTER (WHERE severity = 'error') as error_alerts,
    COUNT(*) FILTER (WHERE severity = 'warning') as warning_alerts,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as alerts_24h
FROM alerts;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_statistics_refresh ON alert_statistics(total_alerts);

COMMENT ON MATERIALIZED VIEW device_statistics IS 'Cached device statistics for dashboard';
COMMENT ON MATERIALIZED VIEW alert_statistics IS 'Cached alert statistics for dashboard';

-- =====================================================
-- 13. REFRESH FUNCTION FOR MATERIALIZED VIEWS
-- =====================================================

CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY device_statistics;
    REFRESH MATERIALIZED VIEW CONCURRENTLY alert_statistics;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_materialized_views IS 'Refreshes all materialized views for performance';

-- =====================================================
-- 14. VACUUM AND ANALYZE RECOMMENDATIONS
-- =====================================================

-- Vacuum high-traffic tables
VACUUM ANALYZE devices;
VACUUM ANALYZE telemetry_data;
VACUUM ANALYZE audit_logs;
VACUUM ANALYZE alerts;

-- =====================================================
-- 15. WEBHOOK DELIVERIES TABLE & INDEX
-- =====================================================

-- Create table for webhook delivery logs (if not exists)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id BIGSERIAL PRIMARY KEY,
    webhook_url VARCHAR(255) NOT NULL,
    webhook_type VARCHAR(50) NOT NULL, -- slack, discord, teams, telegram, custom
    payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL, -- success, failed
    http_status INTEGER,
    error_message TEXT,
    delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_delivered ON webhook_deliveries(delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_type ON webhook_deliveries(webhook_type);

COMMENT ON TABLE webhook_deliveries IS 'Logs all webhook delivery attempts';

-- =====================================================
-- 16. WEBHOOK CONFIGURATIONS TABLE & INDEX
-- =====================================================

-- Create table for webhook configurations (if not exists)
CREATE TABLE IF NOT EXISTS webhook_configurations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    webhook_type VARCHAR(50) NOT NULL, -- slack, discord, teams, telegram, custom
    webhook_url TEXT NOT NULL,
    bot_token TEXT, -- For Telegram
    chat_id VARCHAR(100), -- For Telegram
    event_types JSONB DEFAULT '["alert.created"]'::jsonb,
    custom_headers JSONB,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_configs_active ON webhook_configurations(is_active)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_webhook_configs_type ON webhook_configurations(webhook_type);

COMMENT ON TABLE webhook_configurations IS 'Webhook integration configurations';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Display index summary
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND tablename IN ('devices', 'telemetry_data', 'audit_logs', 'alerts')
ORDER BY pg_relation_size(indexrelid) DESC;

-- =====================================================
-- PERFORMANCE MONITORING QUERIES
-- =====================================================

-- View index usage statistics (run periodically):
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;

-- Find unused indexes:
-- SELECT schemaname, tablename, indexname, idx_scan
-- FROM pg_stat_user_indexes
-- WHERE idx_scan = 0 AND schemaname = 'public'
-- ORDER BY tablename, indexname;

-- Check table sizes:
-- SELECT schemaname, tablename,
--        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- =====================================================
-- NOTES
-- =====================================================
--
-- To apply this migration:
-- psql -d sensity_dashboard -f 005_add_performance_indexes.sql
--
-- Or use the migration system:
-- node backend/migrations/migrate.js
--
-- To refresh materialized views (run periodically via cron):
-- psql -d sensity_dashboard -c "SELECT refresh_materialized_views();"
--
-- Recommended refresh schedule:
-- - device_statistics: Every 5 minutes
-- - alert_statistics: Every 5 minutes
--
-- Example cron job:
-- */5 * * * * psql -d sensity_dashboard -c "SELECT refresh_materialized_views();"
--
-- =====================================================

SELECT 'Performance indexes migration completed successfully!' as status,
       'Created ' || COUNT(*) || ' indexes' as summary
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%';
