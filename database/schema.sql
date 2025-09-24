-- Enhanced Users table with notification preferences
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer',
    phone VARCHAR(20),
    full_name VARCHAR(255),
    notification_email BOOLEAN DEFAULT true,
    notification_sms BOOLEAN DEFAULT false,
    notification_push BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User invitations table for invite-only registration
CREATE TABLE user_invitations (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer',
    full_name VARCHAR(255) NOT NULL,
    token VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    invited_by INTEGER REFERENCES users(id),
    used_at TIMESTAMP,
    used_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enhanced Locations table
CREATE TABLE locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    timezone VARCHAR(50) DEFAULT 'UTC',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enhanced Devices table with firmware versioning
CREATE TABLE devices (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location_id INTEGER REFERENCES locations(id),
    device_type VARCHAR(50) DEFAULT 'esp8266',
    firmware_version VARCHAR(20),
    target_firmware_version VARCHAR(20),
    hardware_version VARCHAR(20),
    wifi_ssid VARCHAR(255),
    wifi_password VARCHAR(255),
    last_heartbeat TIMESTAMP,
    status VARCHAR(20) DEFAULT 'offline',
    ip_address INET,
    mac_address MACADDR,
    uptime_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sensor types definition
CREATE TABLE sensor_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    unit VARCHAR(20),
    min_value DECIMAL(10, 4),
    max_value DECIMAL(10, 4),
    description TEXT,
    icon VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Device sensors (multiple sensors per device)
CREATE TABLE device_sensors (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) REFERENCES devices(id) ON DELETE CASCADE,
    sensor_type_id INTEGER REFERENCES sensor_types(id),
    pin VARCHAR(10) NOT NULL, -- A0, D1, D2, etc.
    name VARCHAR(100) NOT NULL,
    calibration_offset DECIMAL(10, 4) DEFAULT 0,
    calibration_multiplier DECIMAL(10, 4) DEFAULT 1,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_id, pin)
);

-- Enhanced device configuration with rule-based alerting
CREATE TABLE device_configs (
    device_id VARCHAR(50) PRIMARY KEY REFERENCES devices(id),
    armed BOOLEAN DEFAULT true,
    heartbeat_interval INTEGER DEFAULT 300, -- seconds
    config_version INTEGER DEFAULT 1,
    ota_enabled BOOLEAN DEFAULT true,
    debug_mode BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sensor thresholds and rules
CREATE TABLE sensor_rules (
    id SERIAL PRIMARY KEY,
    device_sensor_id INTEGER REFERENCES device_sensors(id) ON DELETE CASCADE,
    rule_name VARCHAR(100) NOT NULL,
    rule_type VARCHAR(20) NOT NULL, -- 'threshold', 'rate_of_change', 'pattern'
    condition VARCHAR(20) NOT NULL, -- 'greater_than', 'less_than', 'equals', 'between'
    threshold_min DECIMAL(10, 4),
    threshold_max DECIMAL(10, 4),
    time_window_minutes INTEGER DEFAULT 1,
    severity VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enhanced telemetry with multiple sensor support
CREATE TABLE telemetry (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(50) REFERENCES devices(id),
    device_sensor_id INTEGER REFERENCES device_sensors(id),
    raw_value DECIMAL(10, 4) NOT NULL,
    processed_value DECIMAL(10, 4) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB -- Additional sensor-specific data
);

-- Enhanced alerts with escalation
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) REFERENCES devices(id),
    device_sensor_id INTEGER REFERENCES device_sensors(id),
    sensor_rule_id INTEGER REFERENCES sensor_rules(id),
    alert_type VARCHAR(20) NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium',
    message TEXT,
    status VARCHAR(20) DEFAULT 'OPEN',
    escalation_level INTEGER DEFAULT 0,
    last_escalated TIMESTAMP,
    acknowledged_by INTEGER REFERENCES users(id),
    acknowledged_at TIMESTAMP,
    resolved_by INTEGER REFERENCES users(id),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- Escalation rules
CREATE TABLE escalation_rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    location_id INTEGER REFERENCES locations(id),
    escalation_delay_minutes INTEGER NOT NULL,
    max_escalation_level INTEGER DEFAULT 3,
    notification_methods JSONB, -- ['email', 'sms', 'push']
    recipients JSONB, -- Array of user IDs or external contacts
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Firmware versions and OTA management
CREATE TABLE firmware_versions (
    id SERIAL PRIMARY KEY,
    version VARCHAR(20) NOT NULL UNIQUE,
    device_type VARCHAR(50) NOT NULL,
    binary_data BYTEA,
    binary_url VARCHAR(500),
    checksum VARCHAR(64),
    file_size INTEGER,
    release_notes TEXT,
    is_stable BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OTA update tracking
CREATE TABLE ota_updates (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) REFERENCES devices(id),
    firmware_version_id INTEGER REFERENCES firmware_versions(id),
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'downloading', 'installing', 'completed', 'failed'
    progress_percent INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WebSocket connections tracking
CREATE TABLE websocket_connections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    connection_id VARCHAR(255) NOT NULL,
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_ping TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default sensor types
INSERT INTO sensor_types (name, unit, min_value, max_value, description, icon) VALUES
('Photodiode', 'lux', 0, 1024, 'Light intensity sensor', 'sun'),
('Temperature', '°C', -40, 125, 'Temperature sensor', 'thermometer'),
('Humidity', '%', 0, 100, 'Relative humidity sensor', 'droplets'),
('Motion', 'boolean', 0, 1, 'PIR motion detector', 'activity'),
('Sound', 'dB', 0, 130, 'Sound level sensor', 'volume-2'),
('Pressure', 'hPa', 300, 1100, 'Atmospheric pressure sensor', 'gauge'),
('Gas', 'ppm', 0, 1000, 'Gas concentration sensor', 'wind'),
('Magnetic', 'boolean', 0, 1, 'Magnetic field detector', 'magnet'),
('Vibration', 'g', 0, 16, 'Vibration/acceleration sensor', 'zap'),
('Distance', 'cm', 0, 400, 'Ultrasonic distance sensor', 'ruler');

-- Create indexes for performance
CREATE INDEX idx_telemetry_device_sensor_time ON telemetry(device_id, device_sensor_id, timestamp DESC);
CREATE INDEX idx_telemetry_timestamp ON telemetry(timestamp DESC);
CREATE INDEX idx_alerts_severity_status ON alerts(severity, status);
CREATE INDEX idx_alerts_created_desc ON alerts(created_at DESC);
CREATE INDEX idx_websocket_user ON websocket_connections(user_id);
CREATE INDEX idx_ota_device_status ON ota_updates(device_id, status);