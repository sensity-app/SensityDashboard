-- Migration 008: Ensure Sensor Types Exist
-- This migration ensures all common sensor types are available in the database
-- It's safe to run multiple times (uses ON CONFLICT DO NOTHING)

-- Insert common sensor types with sensible defaults
INSERT INTO sensor_types (name, unit, icon, description, default_threshold_min, default_threshold_max)
VALUES
    ('Temperature', '°C', '🌡️', 'Temperature sensor', 15.0, 30.0),
    ('Humidity', '%', '💧', 'Humidity sensor', 30.0, 70.0),
    ('Light', 'lux', '💡', 'Light sensor', 0.0, 1000.0),
    ('Photodiode', '%', '💡', 'Photodiode light sensor', 100.0, 900.0),
    ('CO2', 'ppm', '💨', 'CO2 sensor', 300.0, 1000.0),
    ('Pressure', 'hPa', '🔽', 'Atmospheric pressure', 900.0, 1100.0),
    ('Motion', 'bool', '🏃', 'Motion/PIR sensor', 0.0, 1.0),
    ('Sound', 'dB', '🔊', 'Sound level', 0.0, 100.0),
    ('Smoke', 'ppm', '🔥', 'Smoke detector', 0.0, 100.0),
    ('Flame', 'bool', '🔥', 'Flame sensor', 0.0, 1.0),
    ('Distance', 'cm', '📏', 'Distance/ultrasonic sensor', 2.0, 400.0),
    ('Soil Moisture', '%', '🌱', 'Soil moisture sensor', 20.0, 80.0),
    ('Rain', 'bool', '🌧️', 'Rain detector', 0.0, 1.0),
    ('Gas', 'ppm', '⚠️', 'Gas sensor (generic)', 0.0, 1000.0),
    ('UV', 'index', '☀️', 'UV index sensor', 0.0, 11.0),
    ('Voltage', 'V', '⚡', 'Voltage sensor', 0.0, 5.0),
    ('Current', 'A', '⚡', 'Current sensor', 0.0, 10.0),
    ('Power', 'W', '⚡', 'Power sensor', 0.0, 1000.0),
    ('Energy', 'kWh', '⚡', 'Energy meter', 0.0, 10000.0),
    ('pH', 'pH', '🧪', 'pH sensor', 0.0, 14.0)
ON CONFLICT (name) DO NOTHING;

-- Update any existing sensor types that don't have defaults
UPDATE sensor_types
SET
    default_threshold_min = CASE name
        WHEN 'Temperature' THEN 15.0
        WHEN 'Humidity' THEN 30.0
        WHEN 'Light' THEN 0.0
        WHEN 'Photodiode' THEN 100.0
        WHEN 'CO2' THEN 300.0
        WHEN 'Pressure' THEN 900.0
        WHEN 'Motion' THEN 0.0
        WHEN 'Sound' THEN 0.0
        WHEN 'Smoke' THEN 0.0
        WHEN 'Flame' THEN 0.0
        WHEN 'Distance' THEN 2.0
        WHEN 'Soil Moisture' THEN 20.0
        WHEN 'Rain' THEN 0.0
        WHEN 'Gas' THEN 0.0
        WHEN 'UV' THEN 0.0
        WHEN 'Voltage' THEN 0.0
        WHEN 'Current' THEN 0.0
        WHEN 'Power' THEN 0.0
        WHEN 'Energy' THEN 0.0
        WHEN 'pH' THEN 0.0
        ELSE default_threshold_min
    END,
    default_threshold_max = CASE name
        WHEN 'Temperature' THEN 30.0
        WHEN 'Humidity' THEN 70.0
        WHEN 'Light' THEN 1000.0
        WHEN 'Photodiode' THEN 900.0
        WHEN 'CO2' THEN 1000.0
        WHEN 'Pressure' THEN 1100.0
        WHEN 'Motion' THEN 1.0
        WHEN 'Sound' THEN 100.0
        WHEN 'Smoke' THEN 100.0
        WHEN 'Flame' THEN 1.0
        WHEN 'Distance' THEN 400.0
        WHEN 'Soil Moisture' THEN 80.0
        WHEN 'Rain' THEN 1.0
        WHEN 'Gas' THEN 1000.0
        WHEN 'UV' THEN 11.0
        WHEN 'Voltage' THEN 5.0
        WHEN 'Current' THEN 10.0
        WHEN 'Power' THEN 1000.0
        WHEN 'Energy' THEN 10000.0
        WHEN 'pH' THEN 14.0
        ELSE default_threshold_max
    END
WHERE default_threshold_min IS NULL OR default_threshold_max IS NULL;

-- Verify sensor types
SELECT COUNT(*) as sensor_types_count FROM sensor_types;
