-- Migration: Add WiFi RSSI column to devices table
-- This allows storing WiFi signal strength reported by devices during heartbeat

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS wifi_signal_strength INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN devices.wifi_signal_strength IS 'WiFi signal strength in dBm (Received Signal Strength Indicator). Typical range: -30 (excellent) to -90 (poor)';

-- Create index for querying devices by signal strength
CREATE INDEX IF NOT EXISTS idx_devices_wifi_signal ON devices(wifi_signal_strength) WHERE wifi_signal_strength IS NOT NULL;
