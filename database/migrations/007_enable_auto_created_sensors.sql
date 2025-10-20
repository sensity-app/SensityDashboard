-- Migration: Enable auto-created sensors that are currently disabled
-- Issue: Sensors were auto-created as disabled when they first sent telemetry,
-- causing them to not appear in the device UI even though alerts could trigger.
-- This migration enables all sensors that have sent telemetry data.

-- Enable all sensors that have telemetry data (meaning they're actively reporting)
UPDATE device_sensors
SET enabled = true
WHERE enabled = false
  AND id IN (
    SELECT DISTINCT device_sensor_id
    FROM telemetry
  );

-- Log the number of sensors enabled
DO $$
DECLARE
    sensors_enabled INTEGER;
BEGIN
    GET DIAGNOSTICS sensors_enabled = ROW_COUNT;
    RAISE NOTICE 'Enabled % sensors that have telemetry data', sensors_enabled;
END $$;
