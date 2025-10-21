-- Migration 007: Add notification message templates
-- This allows customization of notification messages for different channels

-- Create notification_templates table
CREATE TABLE IF NOT EXISTS notification_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    template_type VARCHAR(50) NOT NULL, -- 'alert', 'device_status', 'system', 'custom'
    channel VARCHAR(20) NOT NULL, -- 'email', 'sms', 'telegram', 'whatsapp', 'webhook'
    subject_template TEXT, -- For email
    body_template TEXT NOT NULL,
    variables JSONB, -- Available variables for this template
    is_system BOOLEAN DEFAULT false, -- System templates cannot be deleted
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT check_channel CHECK (channel IN ('email', 'sms', 'telegram', 'whatsapp', 'webhook', 'all'))
);

-- Create index for quick lookup
CREATE INDEX IF NOT EXISTS idx_notification_templates_type_channel
ON notification_templates(template_type, channel, is_active);

-- Insert default email templates
INSERT INTO notification_templates (name, description, template_type, channel, subject_template, body_template, variables, is_system, is_active) VALUES
(
    'alert_email_threshold',
    'Email notification for threshold alerts',
    'alert',
    'email',
    'Alert: {{sensor_name}} threshold exceeded on {{device_name}}',
    E'<h2>Sensor Alert</h2>\n<p>Device: <strong>{{device_name}}</strong> ({{device_id}})</p>\n<p>Location: <strong>{{location}}</strong></p>\n<p>Sensor: <strong>{{sensor_name}}</strong></p>\n<p>Current Value: <strong>{{current_value}} {{unit}}</strong></p>\n<p>Threshold: <strong>{{threshold_min}} - {{threshold_max}}</strong></p>\n<p>Severity: <strong>{{severity}}</strong></p>\n<p>Time: <strong>{{timestamp}}</strong></p>\n<p><a href="{{dashboard_url}}/devices/{{device_id}}">View Device Details</a></p>',
    '{"device_name": "Name of the device", "device_id": "Device ID", "location": "Device location", "sensor_name": "Sensor name", "current_value": "Current sensor value", "unit": "Measurement unit", "threshold_min": "Minimum threshold", "threshold_max": "Maximum threshold", "severity": "Alert severity", "timestamp": "Alert timestamp", "dashboard_url": "Dashboard base URL"}',
    true,
    true
),
(
    'alert_email_custom',
    'Email notification for custom alerts',
    'alert',
    'email',
    'Alert: {{alert_name}}',
    E'<h2>{{alert_name}}</h2>\n<p>{{alert_message}}</p>\n<p>Device: <strong>{{device_name}}</strong></p>\n<p>Time: <strong>{{timestamp}}</strong></p>\n<p><a href="{{dashboard_url}}/alerts">View All Alerts</a></p>',
    '{"alert_name": "Alert name", "alert_message": "Alert description", "device_name": "Device name", "timestamp": "Alert timestamp", "dashboard_url": "Dashboard base URL"}',
    true,
    true
),
(
    'device_offline_email',
    'Email notification when device goes offline',
    'device_status',
    'email',
    'Device Offline: {{device_name}}',
    E'<h2>Device Offline Alert</h2>\n<p>The device <strong>{{device_name}}</strong> has gone offline.</p>\n<p>Location: <strong>{{location}}</strong></p>\n<p>Last Seen: <strong>{{last_heartbeat}}</strong></p>\n<p>IP Address: <strong>{{ip_address}}</strong></p>\n<p><a href="{{dashboard_url}}/devices/{{device_id}}">Check Device Status</a></p>',
    '{"device_name": "Device name", "device_id": "Device ID", "location": "Device location", "last_heartbeat": "Last heartbeat timestamp", "ip_address": "Device IP", "dashboard_url": "Dashboard base URL"}',
    true,
    true
);

-- Insert default SMS templates
INSERT INTO notification_templates (name, description, template_type, channel, subject_template, body_template, variables, is_system, is_active) VALUES
(
    'alert_sms_threshold',
    'SMS notification for threshold alerts',
    'alert',
    'sms',
    NULL,
    'ALERT: {{device_name}} - {{sensor_name}}: {{current_value}}{{unit}} (Threshold: {{threshold_min}}-{{threshold_max}}). Severity: {{severity}}',
    '{"device_name": "Device name", "sensor_name": "Sensor name", "current_value": "Current value", "unit": "Unit", "threshold_min": "Min threshold", "threshold_max": "Max threshold", "severity": "Severity"}',
    true,
    true
),
(
    'device_offline_sms',
    'SMS notification when device goes offline',
    'device_status',
    'sms',
    NULL,
    'DEVICE OFFLINE: {{device_name}} at {{location}}. Last seen: {{last_heartbeat}}',
    '{"device_name": "Device name", "location": "Location", "last_heartbeat": "Last heartbeat"}',
    true,
    true
);

-- Insert default Telegram templates
INSERT INTO notification_templates (name, description, template_type, channel, subject_template, body_template, variables, is_system, is_active) VALUES
(
    'alert_telegram_threshold',
    'Telegram notification for threshold alerts',
    'alert',
    'telegram',
    NULL,
    E'🚨 *Alert: Threshold Exceeded*\n\n*Device:* {{device_name}}\n*Location:* {{location}}\n*Sensor:* {{sensor_name}}\n*Value:* {{current_value}} {{unit}}\n*Threshold:* {{threshold_min}} - {{threshold_max}}\n*Severity:* {{severity}}\n*Time:* {{timestamp}}',
    '{"device_name": "Device name", "location": "Location", "sensor_name": "Sensor name", "current_value": "Current value", "unit": "Unit", "threshold_min": "Min threshold", "threshold_max": "Max threshold", "severity": "Severity", "timestamp": "Timestamp"}',
    true,
    true
),
(
    'device_offline_telegram',
    'Telegram notification when device goes offline',
    'device_status',
    'telegram',
    NULL,
    E'⚠️ *Device Offline*\n\n*Device:* {{device_name}}\n*Location:* {{location}}\n*Last Seen:* {{last_heartbeat}}\n*IP:* {{ip_address}}',
    '{"device_name": "Device name", "location": "Location", "last_heartbeat": "Last heartbeat", "ip_address": "IP address"}',
    true,
    true
);

-- Insert default WhatsApp templates
INSERT INTO notification_templates (name, description, template_type, channel, subject_template, body_template, variables, is_system, is_active) VALUES
(
    'alert_whatsapp_threshold',
    'WhatsApp notification for threshold alerts',
    'alert',
    'whatsapp',
    NULL,
    E'*🚨 Alert: Threshold Exceeded*\n\n*Device:* {{device_name}}\n*Sensor:* {{sensor_name}}\n*Value:* {{current_value}} {{unit}}\n*Threshold:* {{threshold_min}} - {{threshold_max}}\n*Severity:* {{severity}}',
    '{"device_name": "Device name", "sensor_name": "Sensor name", "current_value": "Current value", "unit": "Unit", "threshold_min": "Min threshold", "threshold_max": "Max threshold", "severity": "Severity"}',
    true,
    true
);

-- Comments for documentation
COMMENT ON TABLE notification_templates IS 'Customizable message templates for different notification channels';
COMMENT ON COLUMN notification_templates.template_type IS 'Type of notification: alert, device_status, system, custom';
COMMENT ON COLUMN notification_templates.channel IS 'Notification channel: email, sms, telegram, whatsapp, webhook, all';
COMMENT ON COLUMN notification_templates.subject_template IS 'Subject line template (email only)';
COMMENT ON COLUMN notification_templates.body_template IS 'Message body template with {{variable}} placeholders';
COMMENT ON COLUMN notification_templates.variables IS 'JSON object describing available template variables';
COMMENT ON COLUMN notification_templates.is_system IS 'System templates cannot be deleted, only edited';
COMMENT ON COLUMN notification_templates.is_active IS 'Whether this template is currently active';
