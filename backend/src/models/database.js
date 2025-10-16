const { Pool } = require('pg');
const logger = require('../utils/logger');

// Database configuration
const config = {
    user: process.env.DB_USER || 'sensityapp',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'sensity_platform',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,

    // Connection pool settings
    max: parseInt(process.env.DB_POOL_MAX) || 20,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 2000,

    // SSL configuration
    ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
    } : false
};

// Create connection pool
const pool = new Pool(config);

// Handle pool errors
pool.on('error', (err, client) => {
    logger.error('Unexpected error on idle client:', err);
    process.exit(-1);
});

// Enhanced query function with logging and error handling
const query = async (text, params = []) => {
    const start = Date.now();
    const client = await pool.connect();

    try {
        const result = await client.query(text, params);
        const duration = Date.now() - start;

        // Log query if enabled
        logger.logQuery(text, params, duration);

        return result;
    } catch (error) {
        const duration = Date.now() - start;
        logger.error('Database query error:', {
            error: error.message,
            query: text.replace(/\s+/g, ' ').trim(),
            params,
            duration: `${duration}ms`
        });
        throw error;
    } finally {
        client.release();
    }
};

// Transaction wrapper
const transaction = async (callback) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Transaction error:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Database health check
const healthCheck = async () => {
    try {
        const result = await query('SELECT NOW() as current_time, version() as version');
        return {
            status: 'healthy',
            timestamp: result.rows[0].current_time,
            version: result.rows[0].version,
            pool_total: pool.totalCount,
            pool_idle: pool.idleCount,
            pool_waiting: pool.waitingCount
        };
    } catch (error) {
        logger.error('Database health check failed:', error);
        return {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
};

// Initialize database (create tables if they don't exist)
const initialize = async () => {
    try {
        logger.info('Initializing database...');

        // Check if users table exists, if not create all tables
        const tableCheck = await query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'users'
            );
        `);

        if (!tableCheck.rows[0].exists) {
            logger.info('Creating database tables...');
            await createTables();
            logger.info('Database tables created successfully');
        } else {
            logger.info('Database tables already exist');
        }

        // Run migrations if needed
        await runMigrations();

        logger.info('Database initialization completed');
    } catch (error) {
        logger.error('Database initialization failed:', error);
        throw error;
    }
};

// Create all database tables
const createTables = async () => {
    const createTablesSQL = `
        -- Users table with notification preferences
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'viewer',
            phone VARCHAR(20),
            full_name VARCHAR(255),
            notification_email BOOLEAN DEFAULT true,
            notification_sms BOOLEAN DEFAULT false,
            notification_push BOOLEAN DEFAULT true,
            preferred_language VARCHAR(5) DEFAULT 'en',
            telegram_chat_id VARCHAR(255),
            notification_telegram BOOLEAN DEFAULT false,
            telegram_enabled BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- User invitations table
        CREATE TABLE IF NOT EXISTS user_invitations (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL,
            full_name VARCHAR(255) NOT NULL,
            token VARCHAR(255) UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP,
            used_by INTEGER REFERENCES users(id),
            invited_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Locations table
        CREATE TABLE IF NOT EXISTS locations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            timezone VARCHAR(50) DEFAULT 'UTC',
            latitude DECIMAL(10, 8),
            longitude DECIMAL(11, 8),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Devices table with firmware versioning
        CREATE TABLE IF NOT EXISTS devices (
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
            memory_usage_percent FLOAT,
            wifi_signal_strength INTEGER,
            battery_level FLOAT,
            cpu_temperature FLOAT,
            free_heap_bytes INTEGER,
            wifi_quality_percent FLOAT,
            reset_reason VARCHAR(100),
            boot_time TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE devices ADD COLUMN IF NOT EXISTS memory_usage_percent FLOAT;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS wifi_signal_strength INTEGER;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_level FLOAT;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS cpu_temperature FLOAT;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS free_heap_bytes INTEGER;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS wifi_quality_percent FLOAT;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS reset_reason VARCHAR(100);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS boot_time TIMESTAMP;

        -- Device health history for trend analysis
        CREATE TABLE IF NOT EXISTS device_health_history (
            id BIGSERIAL PRIMARY KEY,
            device_id VARCHAR(50) REFERENCES devices(id) ON DELETE CASCADE,
            memory_usage_percent FLOAT,
            wifi_signal_strength INTEGER,
            battery_level FLOAT,
            cpu_temperature FLOAT,
            free_heap_bytes INTEGER,
            wifi_quality_percent FLOAT,
            uptime_seconds INTEGER,
            reset_reason VARCHAR(100),
            ping_response_time INTEGER,
            packet_loss_percent FLOAT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Sensor types definition
        CREATE TABLE IF NOT EXISTS sensor_types (
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
        CREATE TABLE IF NOT EXISTS device_sensors (
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

        -- Enhanced telemetry with multiple sensor support
        CREATE TABLE IF NOT EXISTS telemetry (
            id BIGSERIAL PRIMARY KEY,
            device_id VARCHAR(50) REFERENCES devices(id),
            device_sensor_id INTEGER REFERENCES device_sensors(id),
            raw_value DECIMAL(10, 4) NOT NULL,
            processed_value DECIMAL(10, 4) NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            metadata JSONB -- Additional sensor-specific data
        );

        -- Sensor thresholds and rules
        CREATE TABLE IF NOT EXISTS sensor_rules (
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

        -- Device configurations
        CREATE TABLE IF NOT EXISTS device_configs (
            device_id VARCHAR(50) PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
            armed BOOLEAN DEFAULT true,
            heartbeat_interval INTEGER DEFAULT 300,
            config_version INTEGER DEFAULT 1,
            ota_enabled BOOLEAN DEFAULT true,
            debug_mode BOOLEAN DEFAULT false,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Alert rules and thresholds
        CREATE TABLE IF NOT EXISTS alert_rules (
            id SERIAL PRIMARY KEY,
            device_id VARCHAR(50) REFERENCES devices(id) ON DELETE CASCADE,
            sensor_pin INTEGER NOT NULL,
            sensor_type VARCHAR(50) NOT NULL,
            condition_type VARCHAR(20) NOT NULL, -- 'greater_than', 'less_than', 'equals', 'not_equals'
            threshold_value NUMERIC NOT NULL,
            severity VARCHAR(20) NOT NULL DEFAULT 'medium',
            enabled BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Alerts generated by the system
        CREATE TABLE IF NOT EXISTS alerts (
            id SERIAL PRIMARY KEY,
            device_id VARCHAR(50) REFERENCES devices(id) ON DELETE CASCADE,
            device_sensor_id INTEGER REFERENCES device_sensors(id),
            sensor_rule_id INTEGER REFERENCES sensor_rules(id),
            alert_type VARCHAR(100) NOT NULL,
            severity VARCHAR(20) NOT NULL,
            message TEXT NOT NULL,
            sensor_pin INTEGER,
            sensor_value NUMERIC,
            threshold_value NUMERIC,
            status VARCHAR(20) DEFAULT 'active',
            escalation_level INTEGER DEFAULT 0,
            last_escalated TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            acknowledged_at TIMESTAMP,
            acknowledged_by INTEGER REFERENCES users(id),
            resolved_at TIMESTAMP,
            resolved_by INTEGER REFERENCES users(id),
            notes TEXT,
            resolution_notes TEXT
        );

        ALTER TABLE alerts ADD COLUMN IF NOT EXISTS device_sensor_id INTEGER REFERENCES device_sensors(id);
        ALTER TABLE alerts ADD COLUMN IF NOT EXISTS sensor_rule_id INTEGER REFERENCES sensor_rules(id);
        ALTER TABLE alerts ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0;
        ALTER TABLE alerts ADD COLUMN IF NOT EXISTS last_escalated TIMESTAMP;
        ALTER TABLE alerts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

        -- Password reset tokens
        CREATE TABLE IF NOT EXISTS password_resets (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            token VARCHAR(255) UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- User location access permissions
        CREATE TABLE IF NOT EXISTS user_location_access (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
            granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            UNIQUE(user_id, location_id)
        );

        -- Escalation rules
        CREATE TABLE IF NOT EXISTS escalation_rules (
            id SERIAL PRIMARY KEY,
            alert_type VARCHAR(100) NOT NULL,
            severity VARCHAR(20) NOT NULL,
            device_id VARCHAR(50) REFERENCES devices(id),
            location_id INTEGER REFERENCES locations(id),
            escalation_delay_minutes INTEGER NOT NULL,
            max_escalation_level INTEGER DEFAULT 3,
            notification_methods JSONB,
            recipients JSONB,
            enabled BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Escalation history
        CREATE TABLE IF NOT EXISTS escalation_history (
            id SERIAL PRIMARY KEY,
            alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
            escalation_rule_id INTEGER REFERENCES escalation_rules(id),
            escalation_level INTEGER NOT NULL,
            escalated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            notification_methods JSONB,
            recipients JSONB,
            manual_trigger BOOLEAN DEFAULT false,
            triggered_by INTEGER REFERENCES users(id),
            notes TEXT
        );

        -- Firmware versions and OTA management
        CREATE TABLE IF NOT EXISTS firmware_versions (
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
        CREATE TABLE IF NOT EXISTS ota_updates (
            id SERIAL PRIMARY KEY,
            device_id VARCHAR(50) REFERENCES devices(id) ON DELETE CASCADE,
            firmware_version_id INTEGER REFERENCES firmware_versions(id),
            status VARCHAR(20) DEFAULT 'pending',
            progress_percent INTEGER DEFAULT 0,
            error_message TEXT,
            started_at TIMESTAMP,
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- WebSocket connections tracking
        CREATE TABLE IF NOT EXISTS websocket_connections (
            id SERIAL PRIMARY KEY,
            connection_id VARCHAR(255) UNIQUE NOT NULL,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_ping TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            user_agent TEXT,
            ip_address INET
        );

        -- Telegram configuration
        CREATE TABLE IF NOT EXISTS telegram_config (
            id SERIAL PRIMARY KEY,
            bot_token VARCHAR(255),
            bot_username VARCHAR(255),
            bot_name VARCHAR(255),
            enabled BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Telegram notifications log
        CREATE TABLE IF NOT EXISTS telegram_notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            chat_id VARCHAR(255) NOT NULL,
            message_text TEXT NOT NULL,
            notification_type VARCHAR(50),
            alert_id INTEGER REFERENCES alerts(id) ON DELETE SET NULL,
            device_id VARCHAR(50) REFERENCES devices(id) ON DELETE SET NULL,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN DEFAULT true,
            error_message TEXT
        );

        -- Silent mode schedules for quiet hours
        CREATE TABLE IF NOT EXISTS silent_mode_schedules (
            id SERIAL PRIMARY KEY,
            device_id VARCHAR(50) REFERENCES devices(id) ON DELETE CASCADE,
            location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            days_of_week INTEGER[] NOT NULL, -- Array of integers 0-6 (0=Sunday, 6=Saturday)
            timezone VARCHAR(50) DEFAULT 'UTC',
            enabled BOOLEAN DEFAULT true,
            alert_types TEXT[], -- Array of alert types to silence, NULL means all
            severity_threshold VARCHAR(20) DEFAULT NULL, -- Only silence alerts below this severity
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT check_severity CHECK (severity_threshold IS NULL OR severity_threshold IN ('low', 'medium', 'high', 'critical'))
        );

        -- System communication protocol settings
        CREATE TABLE IF NOT EXISTS protocol_settings (
            id SERIAL PRIMARY KEY,
            device_id VARCHAR(50) REFERENCES devices(id) ON DELETE CASCADE UNIQUE,
            protocol VARCHAR(10) NOT NULL DEFAULT 'http', -- 'http' or 'mqtt'
            mqtt_broker_host VARCHAR(255),
            mqtt_broker_port INTEGER DEFAULT 1883,
            mqtt_username VARCHAR(100),
            mqtt_password VARCHAR(255),
            mqtt_topic_prefix VARCHAR(100) DEFAULT 'iot',
            mqtt_qos INTEGER DEFAULT 1,
            http_endpoint VARCHAR(500),
            heartbeat_interval INTEGER DEFAULT 300, -- seconds
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT check_protocol CHECK (protocol IN ('http', 'mqtt')),
            CONSTRAINT check_qos CHECK (mqtt_qos >= 0 AND mqtt_qos <= 2)
        );

        -- Device Groups for organizing devices
        CREATE TABLE IF NOT EXISTS device_groups (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            description TEXT,
            color VARCHAR(7) DEFAULT '#3B82F6', -- hex color code
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Device Group Membership (many-to-many relationship)
        CREATE TABLE IF NOT EXISTS device_group_members (
            id SERIAL PRIMARY KEY,
            group_id INTEGER REFERENCES device_groups(id) ON DELETE CASCADE,
            device_id VARCHAR(50) REFERENCES devices(id) ON DELETE CASCADE,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(group_id, device_id)
        );

        -- Device Tags for flexible device labeling
        CREATE TABLE IF NOT EXISTS device_tags (
            id SERIAL PRIMARY KEY,
            name VARCHAR(50) NOT NULL UNIQUE,
            color VARCHAR(7) DEFAULT '#6B7280', -- hex color code
            description TEXT,
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Device Tag Assignments (many-to-many relationship)
        CREATE TABLE IF NOT EXISTS device_tag_assignments (
            id SERIAL PRIMARY KEY,
            tag_id INTEGER REFERENCES device_tags(id) ON DELETE CASCADE,
            device_id VARCHAR(50) REFERENCES devices(id) ON DELETE CASCADE,
            assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(tag_id, device_id)
        );

        -- Create indexes for better performance
        CREATE INDEX IF NOT EXISTS idx_telemetry_device_sensor_time ON telemetry(device_id, device_sensor_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_alerts_device_status ON alerts(device_id, status);
        CREATE INDEX IF NOT EXISTS idx_alerts_severity_status ON alerts(severity, status);
        CREATE INDEX IF NOT EXISTS idx_alerts_created_desc ON alerts(triggered_at DESC);
        CREATE INDEX IF NOT EXISTS idx_alerts_escalation ON alerts(status, escalation_level);
        CREATE INDEX IF NOT EXISTS idx_websocket_user ON websocket_connections(user_id);
        CREATE INDEX IF NOT EXISTS idx_ota_device_status ON ota_updates(device_id, status);
        CREATE INDEX IF NOT EXISTS idx_escalation_history_alert ON escalation_history(alert_id);
        CREATE INDEX IF NOT EXISTS idx_escalation_rules_device_location ON escalation_rules(device_id, location_id);
        CREATE INDEX IF NOT EXISTS idx_silent_mode_device_enabled ON silent_mode_schedules(device_id, enabled);
        CREATE INDEX IF NOT EXISTS idx_silent_mode_location_enabled ON silent_mode_schedules(location_id, enabled);
        CREATE INDEX IF NOT EXISTS idx_protocol_settings_device ON protocol_settings(device_id);
        CREATE INDEX IF NOT EXISTS idx_telegram_notifications_user_id ON telegram_notifications(user_id);
        CREATE INDEX IF NOT EXISTS idx_telegram_notifications_sent_at ON telegram_notifications(sent_at);

        -- Indexes for new tables
        CREATE INDEX IF NOT EXISTS idx_device_group_members_group ON device_group_members(group_id);
        CREATE INDEX IF NOT EXISTS idx_device_group_members_device ON device_group_members(device_id);
        CREATE INDEX IF NOT EXISTS idx_device_tag_assignments_tag ON device_tag_assignments(tag_id);
        CREATE INDEX IF NOT EXISTS idx_device_tag_assignments_device ON device_tag_assignments(device_id);
        CREATE INDEX IF NOT EXISTS idx_device_health_history_device_time ON device_health_history(device_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_user_location_access_user ON user_location_access(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_location_access_location ON user_location_access(location_id);
    `;

    await query(createTablesSQL);

    // Ensure language preference column exists even if schema migrations fail later
    try {
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) DEFAULT 'en'`);
    } catch (error) {
        logger.warn('Unable to ensure preferred_language column on users table:', error.message);
    }

    // Insert default sensor types if they don't exist
    const sensorTypeCheck = await query('SELECT COUNT(*) as count FROM sensor_types');
    if (parseInt(sensorTypeCheck.rows[0].count) === 0) {
        await query(`
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
            ('Distance', 'cm', 0, 400, 'Ultrasonic distance sensor', 'ruler')
        `);
        logger.info('Default sensor types created');
    }

    // Seed Telegram configuration with a disabled default entry if missing
    try {
        await query(`
            INSERT INTO telegram_config (enabled)
            SELECT false
            WHERE NOT EXISTS (SELECT 1 FROM telegram_config)
        `);
    } catch (error) {
        logger.warn('Unable to seed telegram_config table:', error.message);
    }
};

// Run database migrations
const runMigrations = async () => {
    // Check if migrations table exists
    const migrationTableCheck = await query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'migrations'
        );
    `);

    if (!migrationTableCheck.rows[0].exists) {
        // Create migrations table
        await query(`
            CREATE TABLE migrations (
                id SERIAL PRIMARY KEY,
                migration_name VARCHAR(255) UNIQUE NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
    }

    // Add any future migrations here
    const migrations = [
        // Example migration
        // {
        //     name: '001_add_device_location_index',
        //     sql: 'CREATE INDEX IF NOT EXISTS idx_devices_location ON devices(location_id);'
        // }
        {
            name: '001_add_alert_rule_templates',
            sql: `
                -- Alert Rule Templates table for reusable alert configurations
                CREATE TABLE IF NOT EXISTS alert_rule_templates (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    sensor_type VARCHAR(50),
                    rule_config JSONB NOT NULL,
                    is_system_template BOOLEAN DEFAULT false,
                    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                -- Update sensor_rules table to support complex conditions
                ALTER TABLE sensor_rules
                ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true,
                ADD COLUMN IF NOT EXISTS complex_conditions JSONB,
                ADD COLUMN IF NOT EXISTS evaluation_window_minutes INTEGER DEFAULT 5,
                ADD COLUMN IF NOT EXISTS consecutive_violations_required INTEGER DEFAULT 1,
                ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER DEFAULT 15,
                ADD COLUMN IF NOT EXISTS message TEXT,
                ADD COLUMN IF NOT EXISTS tags TEXT[],
                ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

                -- Create indexes for alert rule templates
                CREATE INDEX IF NOT EXISTS idx_alert_rule_templates_sensor_type ON alert_rule_templates(sensor_type);
                CREATE INDEX IF NOT EXISTS idx_alert_rule_templates_system ON alert_rule_templates(is_system_template);
                CREATE INDEX IF NOT EXISTS idx_sensor_rules_device_sensor ON sensor_rules(device_sensor_id);
            `
        },
        {
            name: '002_add_user_preferred_language',
            sql: `
                ALTER TABLE IF EXISTS users
                    ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) DEFAULT 'en';

                UPDATE users
                    SET preferred_language = COALESCE(preferred_language, 'en');
            `
        },
        {
            name: '003_update_alert_columns',
            sql: `
                ALTER TABLE IF EXISTS alerts
                    ADD COLUMN IF NOT EXISTS last_escalated TIMESTAMP,
                    ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

                UPDATE alerts
                    SET escalation_level = COALESCE(escalation_level, 0);
            `
        },
        {
            name: '004_add_telegram_support',
            sql: `
                ALTER TABLE IF EXISTS users
                    ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS notification_telegram BOOLEAN DEFAULT false,
                    ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN DEFAULT false;

                CREATE TABLE IF NOT EXISTS telegram_config (
                    id SERIAL PRIMARY KEY,
                    bot_token VARCHAR(255),
                    bot_username VARCHAR(255),
                    bot_name VARCHAR(255),
                    enabled BOOLEAN DEFAULT false,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS telegram_notifications (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    chat_id VARCHAR(255) NOT NULL,
                    message_text TEXT NOT NULL,
                    notification_type VARCHAR(50),
                    alert_id INTEGER REFERENCES alerts(id) ON DELETE SET NULL,
                    device_id VARCHAR(50) REFERENCES devices(id) ON DELETE SET NULL,
                    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    success BOOLEAN DEFAULT true,
                    error_message TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_telegram_notifications_user_id ON telegram_notifications(user_id);
                CREATE INDEX IF NOT EXISTS idx_telegram_notifications_sent_at ON telegram_notifications(sent_at);

                INSERT INTO telegram_config (enabled)
                SELECT false
                WHERE NOT EXISTS (SELECT 1 FROM telegram_config);
            `
        },
        {
            name: '005_add_local_license_cache',
            sql: `
                CREATE TABLE IF NOT EXISTS local_license_info (
                    id SERIAL PRIMARY KEY,
                    license_key VARCHAR(255) NOT NULL,
                    license_type VARCHAR(50) NOT NULL,
                    max_devices INTEGER NOT NULL,
                    max_users INTEGER NOT NULL,
                    features JSONB DEFAULT '{}',
                    expires_at TIMESTAMP,
                    activated_at TIMESTAMP,
                    last_validated_at TIMESTAMP,
                    next_validation_due TIMESTAMP,
                    status VARCHAR(50) NOT NULL DEFAULT 'active',
                    is_offline_mode BOOLEAN DEFAULT false,
                    validation_failures INTEGER DEFAULT 0,
                    grace_period_started_at TIMESTAMP,
                    grace_period_ends_at TIMESTAMP,
                    instance_id VARCHAR(255),
                    hardware_id VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_local_license_info_status ON local_license_info(status);
            `
        }
    ];

    for (const migration of migrations) {
        const migrationCheck = await query(
            'SELECT id FROM migrations WHERE migration_name = $1',
            [migration.name]
        );

        if (migrationCheck.rows.length === 0) {
            logger.info(`Running migration: ${migration.name}`);
            try {
                await query(migration.sql);
                await query(
                    'INSERT INTO migrations (migration_name) VALUES ($1)',
                    [migration.name]
                );
                logger.info(`Migration completed: ${migration.name}`);
            } catch (error) {
                logger.warn(`Migration ${migration.name} failed: ${error.message}`);
            }
        }
    }
};

// Create default admin user if no users exist
const createDefaultUser = async () => {
    try {
        const userCount = await query('SELECT COUNT(*) as count FROM users');

        if (parseInt(userCount.rows[0].count) === 0) {
            const bcrypt = require('bcryptjs');
            const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
            const passwordHash = await bcrypt.hash(defaultPassword, 12);

            await query(`
                INSERT INTO users (email, password_hash, role, preferred_language)
                VALUES ($1, $2, $3, $4)
            `, ['admin@example.com', passwordHash, 'admin', process.env.DEFAULT_ADMIN_LANGUAGE || 'en']);

            logger.warn('Default admin user created:', {
                email: 'admin@example.com',
                password: defaultPassword
            });
        }
    } catch (error) {
        logger.error('Error creating default user:', error);
    }
};

// Graceful shutdown
const gracefulShutdown = async () => {
    try {
        logger.info('Closing database connection pool...');
        await pool.end();
        logger.info('Database connection pool closed');
    } catch (error) {
        logger.error('Error during database shutdown:', error);
    }
};

// Handle process termination
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Get a client from the pool for advanced operations
const getClient = async () => {
    return await pool.connect();
};

module.exports = {
    query,
    transaction,
    healthCheck,
    initialize,
    createDefaultUser,
    gracefulShutdown,
    getClient,
    pool
};
