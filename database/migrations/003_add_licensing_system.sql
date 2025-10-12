-- Licensing System Database Schema
-- This migration adds licensing support to the Sensity platform

-- License keys table (stored on license server)
CREATE TABLE IF NOT EXISTS license_keys (
    id SERIAL PRIMARY KEY,
    license_key VARCHAR(255) UNIQUE NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255),
    company_name VARCHAR(255),

    -- License type and tier
    license_type VARCHAR(50) NOT NULL, -- 'trial', 'starter', 'professional', 'enterprise', 'lifetime'

    -- Feature limits
    max_devices INTEGER NOT NULL DEFAULT 10,
    max_users INTEGER NOT NULL DEFAULT 3,
    features JSONB DEFAULT '{}', -- {"audit_logging": true, "analytics_advanced": false, "white_label": false}

    -- Hardware binding (optional - for node-locked licenses)
    hardware_id VARCHAR(255), -- MAC address, CPU ID, or custom hardware fingerprint
    instance_id VARCHAR(255), -- Unique instance identifier
    installation_domain VARCHAR(255), -- Domain where it's installed

    -- Validity period
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP, -- NULL for lifetime licenses
    activated_at TIMESTAMP,
    last_validated_at TIMESTAMP,

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'expired', 'suspended', 'revoked'
    suspension_reason TEXT,

    -- Usage tracking
    validation_count INTEGER DEFAULT 0,
    current_device_count INTEGER DEFAULT 0,
    current_user_count INTEGER DEFAULT 0,

    -- Metadata
    notes TEXT,
    purchase_order_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- License validation logs (for audit trail on license server)
CREATE TABLE IF NOT EXISTS license_validations (
    id BIGSERIAL PRIMARY KEY,
    license_key_id INTEGER REFERENCES license_keys(id) ON DELETE CASCADE,
    license_key VARCHAR(255) NOT NULL,

    -- Validation details
    validated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    validation_result VARCHAR(50) NOT NULL, -- 'valid', 'expired', 'suspended', 'invalid', 'limit_exceeded'

    -- Client information
    client_ip INET,
    instance_id VARCHAR(255),
    hardware_id VARCHAR(255),
    platform_version VARCHAR(50),

    -- Usage at time of validation
    reported_device_count INTEGER,
    reported_user_count INTEGER,

    -- Response
    response_data JSONB, -- Full response sent to client
    error_message TEXT
);

-- Local license cache (stored on client installation)
CREATE TABLE IF NOT EXISTS local_license_info (
    id SERIAL PRIMARY KEY,
    license_key VARCHAR(255) NOT NULL,

    -- Cached license data
    license_type VARCHAR(50) NOT NULL,
    max_devices INTEGER NOT NULL,
    max_users INTEGER NOT NULL,
    features JSONB DEFAULT '{}',

    -- Validity
    expires_at TIMESTAMP,
    activated_at TIMESTAMP,
    last_validated_at TIMESTAMP,
    next_validation_due TIMESTAMP,

    -- Grace period tracking
    validation_failures INTEGER DEFAULT 0,
    grace_period_started_at TIMESTAMP,
    grace_period_ends_at TIMESTAMP,

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    is_offline_mode BOOLEAN DEFAULT false,

    -- Metadata
    instance_id VARCHAR(255),
    hardware_id VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Only one active license per installation
    CONSTRAINT one_active_license UNIQUE (id)
);

-- License feature flags (what features are enabled)
CREATE TABLE IF NOT EXISTS license_features (
    id SERIAL PRIMARY KEY,
    license_key_id INTEGER REFERENCES license_keys(id) ON DELETE CASCADE,
    feature_name VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    limit_value INTEGER, -- For numeric limits (e.g., API calls per day)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(license_key_id, feature_name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_license_keys_key ON license_keys(license_key);
CREATE INDEX IF NOT EXISTS idx_license_keys_email ON license_keys(customer_email);
CREATE INDEX IF NOT EXISTS idx_license_keys_status ON license_keys(status);
CREATE INDEX IF NOT EXISTS idx_license_keys_expires ON license_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_license_validations_key_id ON license_validations(license_key_id);
CREATE INDEX IF NOT EXISTS idx_license_validations_validated_at ON license_validations(validated_at DESC);

-- Function to check if license is valid
CREATE OR REPLACE FUNCTION is_license_valid(p_license_key VARCHAR)
RETURNS TABLE (
    valid BOOLEAN,
    license_type VARCHAR,
    max_devices INTEGER,
    max_users INTEGER,
    features JSONB,
    expires_at TIMESTAMP,
    status VARCHAR,
    message TEXT
) AS $$
DECLARE
    v_license RECORD;
BEGIN
    SELECT * INTO v_license
    FROM license_keys
    WHERE license_key = p_license_key;

    -- License not found
    IF NOT FOUND THEN
        RETURN QUERY SELECT
            false,
            NULL::VARCHAR,
            NULL::INTEGER,
            NULL::INTEGER,
            NULL::JSONB,
            NULL::TIMESTAMP,
            'invalid'::VARCHAR,
            'License key not found'::TEXT;
        RETURN;
    END IF;

    -- Check if suspended or revoked
    IF v_license.status IN ('suspended', 'revoked') THEN
        RETURN QUERY SELECT
            false,
            v_license.license_type,
            v_license.max_devices,
            v_license.max_users,
            v_license.features,
            v_license.expires_at,
            v_license.status,
            COALESCE(v_license.suspension_reason, 'License is ' || v_license.status)::TEXT;
        RETURN;
    END IF;

    -- Check if expired
    IF v_license.expires_at IS NOT NULL AND v_license.expires_at < CURRENT_TIMESTAMP THEN
        RETURN QUERY SELECT
            false,
            v_license.license_type,
            v_license.max_devices,
            v_license.max_users,
            v_license.features,
            v_license.expires_at,
            'expired'::VARCHAR,
            'License has expired'::TEXT;
        RETURN;
    END IF;

    -- License is valid
    RETURN QUERY SELECT
        true,
        v_license.license_type,
        v_license.max_devices,
        v_license.max_users,
        v_license.features,
        v_license.expires_at,
        v_license.status,
        'License is valid'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to update last validation timestamp
CREATE OR REPLACE FUNCTION update_license_validation(p_license_key VARCHAR)
RETURNS VOID AS $$
BEGIN
    UPDATE license_keys
    SET
        last_validated_at = CURRENT_TIMESTAMP,
        validation_count = validation_count + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE license_key = p_license_key;
END;
$$ LANGUAGE plpgsql;

-- Sample trial license for testing
INSERT INTO license_keys (
    license_key,
    customer_email,
    customer_name,
    license_type,
    max_devices,
    max_users,
    features,
    expires_at,
    status
) VALUES (
    'TRIAL-' || MD5(random()::text || CURRENT_TIMESTAMP::text)::VARCHAR(20),
    'trial@example.com',
    'Trial User',
    'trial',
    10,
    3,
    '{"audit_logging": false, "analytics_advanced": false, "white_label": false, "api_access": true}'::JSONB,
    CURRENT_TIMESTAMP + INTERVAL '30 days',
    'active'
) ON CONFLICT DO NOTHING;

COMMENT ON TABLE license_keys IS 'Stores all issued license keys and their configuration';
COMMENT ON TABLE license_validations IS 'Audit log of all license validation attempts';
COMMENT ON TABLE local_license_info IS 'Cached license information on client installations';
COMMENT ON TABLE license_features IS 'Feature flags and limits for each license';
