-- Migration: Add device groups, tags, and health monitoring
-- Version: 002
-- Description: Adds device groups, tags system, and device health monitoring

-- Create device groups table
CREATE TABLE IF NOT EXISTS device_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#3B82F6', -- Hex color for UI
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create device tags table
CREATE TABLE IF NOT EXISTS device_tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(7) DEFAULT '#6B7280', -- Hex color for UI
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for device-group relationships (many-to-many)
CREATE TABLE IF NOT EXISTS device_group_members (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) REFERENCES devices(id) ON DELETE CASCADE,
    group_id INTEGER REFERENCES device_groups(id) ON DELETE CASCADE,
    added_by INTEGER REFERENCES users(id),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_id, group_id)
);

-- Junction table for device-tag relationships (many-to-many)
CREATE TABLE IF NOT EXISTS device_tag_assignments (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) REFERENCES devices(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES device_tags(id) ON DELETE CASCADE,
    assigned_by INTEGER REFERENCES users(id),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_id, tag_id)
);

-- Enhance devices table with health monitoring fields
ALTER TABLE devices ADD COLUMN IF NOT EXISTS memory_usage_percent DECIMAL(5,2);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS wifi_signal_strength INTEGER; -- RSSI in dBm
ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_level DECIMAL(5,2); -- For battery-powered devices
ALTER TABLE devices ADD COLUMN IF NOT EXISTS cpu_temperature DECIMAL(5,2); -- Internal temperature in Celsius
ALTER TABLE devices ADD COLUMN IF NOT EXISTS free_heap_bytes INTEGER; -- Available RAM in bytes
ALTER TABLE devices ADD COLUMN IF NOT EXISTS wifi_quality_percent DECIMAL(5,2); -- WiFi quality percentage
ALTER TABLE devices ADD COLUMN IF NOT EXISTS boot_time TIMESTAMP; -- Last boot/restart time
ALTER TABLE devices ADD COLUMN IF NOT EXISTS reset_reason VARCHAR(50); -- Reason for last reset

-- Create device health history table for trend analysis
CREATE TABLE IF NOT EXISTS device_health_history (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) REFERENCES devices(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    memory_usage_percent DECIMAL(5,2),
    wifi_signal_strength INTEGER,
    battery_level DECIMAL(5,2),
    cpu_temperature DECIMAL(5,2),
    free_heap_bytes INTEGER,
    wifi_quality_percent DECIMAL(5,2),
    uptime_seconds BIGINT,
    -- Network connectivity metrics
    ping_response_time INTEGER, -- ms
    packet_loss_percent DECIMAL(5,2)
);

-- Create alert rule templates table for advanced rules
CREATE TABLE IF NOT EXISTS alert_rule_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sensor_type VARCHAR(50), -- NULL means applies to any sensor type
    rule_config JSONB NOT NULL, -- Stores the complex rule configuration
    is_system_template BOOLEAN DEFAULT false, -- System vs user-created templates
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enhanced sensor rules table for complex conditions
ALTER TABLE sensor_rules ADD COLUMN IF NOT EXISTS rule_type VARCHAR(50) DEFAULT 'simple'; -- 'simple', 'complex', 'template'
ALTER TABLE sensor_rules ADD COLUMN IF NOT EXISTS complex_conditions JSONB; -- For advanced rule logic
ALTER TABLE sensor_rules ADD COLUMN IF NOT EXISTS evaluation_window_minutes INTEGER DEFAULT 5; -- Time window for rule evaluation
ALTER TABLE sensor_rules ADD COLUMN IF NOT EXISTS consecutive_violations_required INTEGER DEFAULT 1; -- Reduce false positives
ALTER TABLE sensor_rules ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER DEFAULT 15; -- Cooldown period after alert
ALTER TABLE sensor_rules ADD COLUMN IF NOT EXISTS tags TEXT[]; -- Array of tags for rule categorization

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_device_groups_name ON device_groups(name);
CREATE INDEX IF NOT EXISTS idx_device_tags_name ON device_tags(name);
CREATE INDEX IF NOT EXISTS idx_device_group_members_device ON device_group_members(device_id);
CREATE INDEX IF NOT EXISTS idx_device_group_members_group ON device_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_device_tag_assignments_device ON device_tag_assignments(device_id);
CREATE INDEX IF NOT EXISTS idx_device_tag_assignments_tag ON device_tag_assignments(tag_id);
CREATE INDEX IF NOT EXISTS idx_device_health_history_device_time ON device_health_history(device_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_alert_rule_templates_sensor_type ON alert_rule_templates(sensor_type);
CREATE INDEX IF NOT EXISTS idx_sensor_rules_device_sensor ON sensor_rules(device_sensor_id);

-- Insert some default device tags
INSERT INTO device_tags (name, color, description) VALUES
    ('Production', '#EF4444', 'Production environment devices'),
    ('Development', '#10B981', 'Development/testing devices'),
    ('Indoor', '#3B82F6', 'Indoor sensors and devices'),
    ('Outdoor', '#F59E0B', 'Outdoor sensors and devices'),
    ('Critical', '#DC2626', 'Mission-critical devices'),
    ('Monitoring', '#8B5CF6', 'Dedicated monitoring devices'),
    ('IoT-Hub', '#EC4899', 'Central hub devices'),
    ('Sensor-Node', '#06B6D4', 'Individual sensor nodes')
ON CONFLICT (name) DO NOTHING;

-- Insert some default alert rule templates
INSERT INTO alert_rule_templates (name, description, sensor_type, rule_config, is_system_template) VALUES
    (
        'Temperature Comfort Zone',
        'Alerts when temperature goes outside comfortable range (18-26°C)',
        'temperature',
        '{"conditions":[{"type":"range","min":18,"max":26}],"severity":"medium","message":"Temperature outside comfort zone"}',
        true
    ),
    (
        'High Humidity Alert',
        'Alerts for humidity levels that may cause mold (>70%)',
        'humidity',
        '{"conditions":[{"type":"threshold","operator":">","value":70}],"severity":"high","message":"High humidity detected - mold risk"}',
        true
    ),
    (
        'Motion Detection',
        'Alerts when motion is detected',
        'motion',
        '{"conditions":[{"type":"threshold","operator":">","value":0}],"severity":"low","message":"Motion detected"}',
        true
    ),
    (
        'Air Quality Poor',
        'Alerts for poor air quality (CO2 > 1000 ppm)',
        'co2',
        '{"conditions":[{"type":"threshold","operator":">","value":1000}],"severity":"medium","message":"Poor air quality detected"}',
        true
    )
ON CONFLICT DO NOTHING;