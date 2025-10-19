-- Migration 005: Add missing columns to device_sensors and devices tables
-- This fixes issues with sensor updates and device health monitoring

-- Add updated_at column to device_sensors table
ALTER TABLE device_sensors
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns to devices table for health monitoring
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS wifi_signal_strength INTEGER,
ADD COLUMN IF NOT EXISTS memory_usage_percent DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS battery_level DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS cpu_temperature DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS free_heap_bytes INTEGER,
ADD COLUMN IF NOT EXISTS wifi_quality_percent DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS boot_time TIMESTAMP,
ADD COLUMN IF NOT EXISTS reset_reason VARCHAR(100);

-- Add device_sensor_id to alerts table for better tracking
ALTER TABLE alerts
ADD COLUMN IF NOT EXISTS device_sensor_id INTEGER REFERENCES device_sensors(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create device_health_history table for trend analysis
CREATE TABLE IF NOT EXISTS device_health_history (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(50) REFERENCES devices(id) ON DELETE CASCADE,
    memory_usage_percent DECIMAL(5, 2),
    wifi_signal_strength INTEGER,
    battery_level DECIMAL(5, 2),
    cpu_temperature DECIMAL(5, 2),
    free_heap_bytes INTEGER,
    wifi_quality_percent DECIMAL(5, 2),
    uptime_seconds INTEGER,
    reset_reason VARCHAR(100),
    ping_response_time INTEGER,
    packet_loss_percent DECIMAL(5, 2),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for device health history queries
CREATE INDEX IF NOT EXISTS idx_device_health_history_device_time
ON device_health_history(device_id, timestamp DESC);

-- Create index for device_sensor_id in alerts
CREATE INDEX IF NOT EXISTS idx_alerts_device_sensor
ON alerts(device_sensor_id);

-- Comments for documentation
COMMENT ON COLUMN device_sensors.updated_at IS 'Timestamp when sensor configuration was last updated';
COMMENT ON COLUMN devices.wifi_signal_strength IS 'WiFi signal strength in dBm (typically -100 to 0)';
COMMENT ON COLUMN devices.memory_usage_percent IS 'Device memory usage percentage';
COMMENT ON COLUMN devices.battery_level IS 'Battery level percentage (0-100)';
COMMENT ON COLUMN devices.cpu_temperature IS 'CPU/chip temperature in Celsius';
COMMENT ON COLUMN devices.free_heap_bytes IS 'Free heap memory in bytes';
COMMENT ON COLUMN devices.boot_time IS 'Last boot/restart timestamp';
COMMENT ON COLUMN devices.reset_reason IS 'Reason for last device reset/reboot';
COMMENT ON TABLE device_health_history IS 'Historical device health metrics for trend analysis';
