-- Add WhatsApp number and notification preferences to users table

ALTER TABLE users
ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS whatsapp_notifications_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email": true, "whatsapp": false, "alerts": ["critical", "high"]}'::jsonb;

-- Add comment
COMMENT ON COLUMN users.whatsapp_number IS 'WhatsApp phone number in international format (e.g., +1234567890)';
COMMENT ON COLUMN users.whatsapp_notifications_enabled IS 'Whether to send WhatsApp notifications to this user';
COMMENT ON COLUMN users.notification_preferences IS 'JSON object with notification settings';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_whatsapp_enabled ON users(whatsapp_notifications_enabled) WHERE whatsapp_notifications_enabled = true;
