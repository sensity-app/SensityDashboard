-- Migration 006: Add threshold columns to device_sensors table
-- This allows sensors to have direct threshold values for firmware sync

-- Add threshold columns to device_sensors
ALTER TABLE device_sensors
ADD COLUMN IF NOT EXISTS threshold_min DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS threshold_max DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS last_calibration TIMESTAMP,
ADD COLUMN IF NOT EXISTS auto_calibration_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS calibration_interval_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS calibration_metadata JSONB;

-- Add comments for documentation
COMMENT ON COLUMN device_sensors.threshold_min IS 'Minimum threshold value for alerts';
COMMENT ON COLUMN device_sensors.threshold_max IS 'Maximum threshold value for alerts';
COMMENT ON COLUMN device_sensors.last_calibration IS 'Timestamp of last calibration';
COMMENT ON COLUMN device_sensors.auto_calibration_enabled IS 'Whether automatic calibration is enabled';
COMMENT ON COLUMN device_sensors.calibration_interval_hours IS 'Hours between automatic calibrations';
COMMENT ON COLUMN device_sensors.calibration_metadata IS 'Calibration history and metadata';

-- Update existing sensors with default threshold values based on sensor type
-- These are reasonable defaults that can be customized per sensor
UPDATE device_sensors ds
SET
    threshold_min = CASE
        WHEN st.name = 'Temperature' THEN 15.0
        WHEN st.name = 'Humidity' THEN 30.0
        WHEN st.name = 'Light' THEN 0.0
        WHEN st.name = 'Photodiode' THEN 0.0
        WHEN st.name = 'Motion' THEN 0.0
        WHEN st.name = 'Distance' THEN 0.0
        WHEN st.name = 'Sound' THEN 0.0
        WHEN st.name = 'Magnetic' THEN 0.0
        WHEN st.name = 'Vibration' THEN 0.0
        WHEN st.name = 'Gas' THEN 0.0
        ELSE 0.0
    END,
    threshold_max = CASE
        WHEN st.name = 'Temperature' THEN 30.0
        WHEN st.name = 'Humidity' THEN 70.0
        WHEN st.name = 'Light' THEN 1000.0
        WHEN st.name = 'Photodiode' THEN 1000.0
        WHEN st.name = 'Motion' THEN 1.0
        WHEN st.name = 'Distance' THEN 500.0
        WHEN st.name = 'Sound' THEN 800.0
        WHEN st.name = 'Magnetic' THEN 1.0
        WHEN st.name = 'Vibration' THEN 1.0
        WHEN st.name = 'Gas' THEN 500.0
        ELSE 100.0
    END
FROM sensor_types st
WHERE ds.sensor_type_id = st.id
AND ds.threshold_min IS NULL
AND ds.threshold_max IS NULL;
