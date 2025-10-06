# 📡 API Documentation

Complete REST API reference for the ESP8266 IoT Management Platform.

## 🔐 Authentication

All authenticated endpoints require a JWT token in the `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

### Base URL
```
Production: https://your-domain.com/api
Development: http://localhost:3001/api
```

## 📋 Table of Contents

- [Authentication](#authentication-endpoints)
- [Devices](#device-endpoints)
- [Telemetry](#telemetry-endpoints)
- [Alerts & Alert Rules](#alert-endpoints)
- [Firmware & OTA](#firmware-endpoints)
- [Firmware Builder](#firmware-builder-endpoints)
- [Users](#user-endpoints)
- [Locations](#location-endpoints)
- [Device Groups & Tags](#device-organization-endpoints)
- [Settings](#settings-endpoints)
- [Analytics](#analytics-endpoints)
- [Audit Logs](#audit-log-endpoints)
- [System](#system-endpoints)

---

## 🔐 Authentication Endpoints

### Check Setup Status
```http
GET /api/auth/setup-check
```
Check if initial setup is required (no users exist).

**Response:**
```json
{
  "needsSetup": true,
  "hasUsers": false
}
```

### Initial Setup
```http
POST /api/auth/initial-setup
```
Create the first admin user during initial setup.

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "securepassword",
  "fullName": "Admin User",
  "phone": "+1234567890",
  "preferredLanguage": "en"
}
```

**Response:**
```json
{
  "message": "Initial setup completed successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "role": "admin",
    "fullName": "Admin User",
    "preferred_language": "en"
  }
}
```

### Login
```http
POST /api/auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "admin",
    "fullName": "John Doe",
    "preferred_language": "en"
  }
}
```

### Password Reset Request
```http
POST /api/auth/forgot-password
```

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

### Reset Password
```http
POST /api/auth/reset-password
```

**Request Body:**
```json
{
  "token": "reset-token-from-email",
  "newPassword": "newpassword123"
}
```

---

## 🔧 Device Endpoints

### Get All Devices
```http
GET /api/devices
Authorization: Bearer <token>
```

**Query Parameters:**
- `location_id` (optional): Filter by location
- `status` (optional): Filter by status (online/offline)
- `device_type` (optional): Filter by device type

**Response:**
```json
{
  "devices": [
    {
      "id": "uuid",
      "device_id": "ESP-12345",
      "name": "Kitchen Sensor",
      "device_type": "kitchen_monitor",
      "status": "online",
      "location_id": "uuid",
      "location_name": "Kitchen",
      "ip_address": "192.168.1.100",
      "mac_address": "AA:BB:CC:DD:EE:FF",
      "firmware_version": "2.1.0",
      "last_seen": "2025-10-07T10:30:00Z",
      "groups": [...],
      "tags": [...],
      "health_status": "healthy"
    }
  ]
}
```

### Get Device by ID
```http
GET /api/devices/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "uuid",
  "device_id": "ESP-12345",
  "name": "Kitchen Sensor",
  "device_type": "kitchen_monitor",
  "status": "online",
  "location_name": "Kitchen",
  "timezone": "America/New_York",
  "sensors": [
    {
      "id": "uuid",
      "sensor_type": "temperature",
      "name": "Room Temperature",
      "pin": "D4",
      "enabled": true,
      "offset": 0.0,
      "multiplier": 1.0,
      "threshold_min": 18.0,
      "threshold_max": 26.0
    }
  ],
  "groups": [...],
  "tags": [...]
}
```

### Register Device (Device Endpoint)
```http
POST /api/devices/register
Authorization: Device <api_key>
```

**Request Body:**
```json
{
  "device_id": "ESP-12345",
  "firmware_version": "2.1.0",
  "device_type": "kitchen_monitor",
  "ip_address": "192.168.1.100",
  "mac_address": "AA:BB:CC:DD:EE:FF"
}
```

### Update Device
```http
PUT /api/devices/:id
Authorization: Bearer <token>
Role: operator, admin
```

**Request Body:**
```json
{
  "name": "Updated Kitchen Sensor",
  "location_id": "uuid",
  "notes": "Relocated to main kitchen area"
}
```

### Delete Device
```http
DELETE /api/devices/:id
Authorization: Bearer <token>
Role: admin
```

### Get Device Sensors
```http
GET /api/devices/:id/sensors
Authorization: Bearer <token>
```

**Response:**
```json
{
  "sensors": [
    {
      "id": "uuid",
      "device_id": "uuid",
      "sensor_type": "temperature",
      "name": "Room Temperature",
      "pin": "D4",
      "enabled": true,
      "offset": -1.5,
      "multiplier": 1.0,
      "threshold_min": 18.0,
      "threshold_max": 26.0,
      "created_at": "2025-10-01T10:00:00Z"
    }
  ]
}
```

### Update Sensor Configuration
```http
PUT /api/devices/:deviceId/sensors/:sensorId
Authorization: Bearer <token>
Role: operator, admin
```

**Request Body:**
```json
{
  "name": "Updated Sensor Name",
  "enabled": true,
  "offset": -1.5,
  "multiplier": 1.0,
  "threshold_min": 18.0,
  "threshold_max": 26.0,
  "triggerOta": true
}
```

**Response:**
```json
{
  "message": "Sensor updated successfully",
  "sensor": {...},
  "otaTriggered": true
}
```

---

## 📊 Telemetry Endpoints

### Submit Telemetry Data (Device Endpoint)
```http
POST /api/telemetry
Authorization: Device <api_key>
```

**Request Body:**
```json
{
  "device_id": "ESP-12345",
  "telemetry": [
    {
      "sensor_type": "temperature",
      "value": 23.5
    },
    {
      "sensor_type": "humidity",
      "value": 65.2
    }
  ],
  "health": {
    "uptime": 86400,
    "free_memory": 25600,
    "wifi_signal": -45,
    "cpu_temp": 45.2
  }
}
```

**Response:**
```json
{
  "message": "Telemetry data received",
  "device_status": "online",
  "alerts_triggered": 0,
  "configuration_update": {
    "sensors": [...]
  }
}
```

### Get Telemetry Data
```http
GET /api/telemetry/:deviceId
Authorization: Bearer <token>
```

**Query Parameters:**
- `sensor_type` (optional): Filter by sensor type
- `start_date` (optional): ISO date string
- `end_date` (optional): ISO date string
- `limit` (optional): Number of records (default: 1000)

**Response:**
```json
{
  "telemetry": [
    {
      "id": "uuid",
      "device_id": "uuid",
      "sensor_type": "temperature",
      "value": 23.5,
      "timestamp": "2025-10-07T10:30:00Z"
    }
  ]
}
```

### Export Telemetry Data (CSV)
```http
GET /api/telemetry/:deviceId/export
Authorization: Bearer <token>
```

**Query Parameters:**
- `sensor_type` (optional)
- `start_date` (required)
- `end_date` (required)

**Response:** CSV file download

---

## 🚨 Alert Endpoints

### Get Alerts
```http
GET /api/alerts
Authorization: Bearer <token>
```

**Query Parameters:**
- `device_id` (optional)
- `severity` (optional): low, medium, high, critical
- `status` (optional): active, acknowledged, resolved
- `limit` (optional): default 100

**Response:**
```json
{
  "alerts": [
    {
      "id": "uuid",
      "device_id": "uuid",
      "device_name": "Kitchen Sensor",
      "sensor_type": "temperature",
      "alert_type": "threshold_exceeded",
      "severity": "high",
      "value": 28.5,
      "threshold": 26.0,
      "message": "Temperature exceeded threshold",
      "status": "active",
      "created_at": "2025-10-07T10:30:00Z"
    }
  ]
}
```

### Acknowledge Alert
```http
POST /api/alerts/:id/acknowledge
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "notes": "Investigating the issue"
}
```

### Resolve Alert
```http
POST /api/alerts/:id/resolve
Authorization: Bearer <token>
```

### Get Alert Rules
```http
GET /api/alert-rules
Authorization: Bearer <token>
```

**Response:**
```json
{
  "rules": [
    {
      "id": "uuid",
      "device_id": "uuid",
      "sensor_type": "temperature",
      "rule_type": "threshold",
      "threshold_min": 18.0,
      "threshold_max": 26.0,
      "severity": "high",
      "notification_channels": ["email", "sms"],
      "enabled": true
    }
  ]
}
```

### Create Alert Rule
```http
POST /api/alert-rules
Authorization: Bearer <token>
Role: operator, admin
```

**Request Body:**
```json
{
  "device_id": "uuid",
  "sensor_type": "temperature",
  "rule_type": "threshold",
  "threshold_min": 18.0,
  "threshold_max": 26.0,
  "severity": "high",
  "notification_channels": ["email", "sms"],
  "notification_emails": ["admin@example.com"],
  "enabled": true
}
```

### Update Alert Rule
```http
PUT /api/alert-rules/:id
Authorization: Bearer <token>
Role: operator, admin
```

### Delete Alert Rule
```http
DELETE /api/alert-rules/:id
Authorization: Bearer <token>
Role: operator, admin
```

---

## 💾 Firmware Endpoints

### Trigger OTA Update
```http
POST /api/firmware/ota/:deviceId
Authorization: Bearer <token>
Role: operator, admin
```

**Request Body:**
```json
{
  "firmware_url": "https://example.com/firmware.bin",
  "version": "2.2.0"
}
```

### Check OTA Status
```http
GET /api/firmware/ota/:deviceId/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": "in_progress",
  "progress": 45,
  "current_version": "2.1.0",
  "target_version": "2.2.0",
  "started_at": "2025-10-07T10:30:00Z"
}
```

---

## 🛠️ Firmware Builder Endpoints

### Get Firmware Templates
```http
GET /api/firmware-templates
Authorization: Bearer <token>
```

**Response:**
```json
{
  "templates": [
    {
      "id": "kitchen_monitor",
      "name": "Kitchen Monitor",
      "description": "Monitor temperature, humidity, motion, light, and gas in kitchen",
      "sensors": ["temperature", "humidity", "motion", "light", "gas"],
      "pin_layout": {
        "temperature": "D4",
        "motion": "D2",
        "light": "A0"
      }
    }
  ]
}
```

### Build Firmware
```http
POST /api/firmware-builder/build
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "device_name": "My Kitchen Sensor",
  "wifi_ssid": "MyWiFi",
  "wifi_password": "password123",
  "server_url": "https://my-server.com",
  "template_id": "kitchen_monitor",
  "sensors": [
    {
      "type": "temperature",
      "pin": "D4",
      "threshold_min": 18.0,
      "threshold_max": 26.0
    }
  ]
}
```

**Response:**
```json
{
  "message": "Firmware built successfully",
  "download_url": "/api/firmware-builder/download/abc123",
  "build_id": "abc123"
}
```

### Download Firmware Package
```http
GET /api/firmware-builder/download/:buildId
Authorization: Bearer <token>
```

**Response:** ZIP file containing firmware and documentation

---

## 👥 User Endpoints

### Get All Users
```http
GET /api/users
Authorization: Bearer <token>
Role: admin
```

**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "John Doe",
      "role": "operator",
      "phone": "+1234567890",
      "preferred_language": "en",
      "created_at": "2025-10-01T10:00:00Z"
    }
  ]
}
```

### Create User
```http
POST /api/users
Authorization: Bearer <token>
Role: admin
```

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "securepassword",
  "full_name": "Jane Smith",
  "role": "operator",
  "phone": "+1234567890",
  "preferred_language": "en"
}
```

### Update User
```http
PUT /api/users/:id
Authorization: Bearer <token>
Role: admin (or self for own profile)
```

### Delete User
```http
DELETE /api/users/:id
Authorization: Bearer <token>
Role: admin
```

---

## 📍 Location Endpoints

### Get All Locations
```http
GET /api/locations
Authorization: Bearer <token>
```

### Create Location
```http
POST /api/locations
Authorization: Bearer <token>
Role: operator, admin
```

**Request Body:**
```json
{
  "name": "Kitchen",
  "description": "Main kitchen area",
  "timezone": "America/New_York",
  "latitude": 40.7128,
  "longitude": -74.0060
}
```

### Update Location
```http
PUT /api/locations/:id
Authorization: Bearer <token>
Role: operator, admin
```

### Delete Location
```http
DELETE /api/locations/:id
Authorization: Bearer <token>
Role: admin
```

---

## 🏷️ Device Organization Endpoints

### Device Groups

#### Get All Groups
```http
GET /api/device-groups
Authorization: Bearer <token>
```

#### Create Group
```http
POST /api/device-groups
Authorization: Bearer <token>
Role: operator, admin
```

**Request Body:**
```json
{
  "name": "Ground Floor",
  "description": "All ground floor sensors",
  "color": "#3B82F6"
}
```

#### Add Device to Group
```http
POST /api/device-groups/:groupId/devices
Authorization: Bearer <token>
Role: operator, admin
```

**Request Body:**
```json
{
  "device_id": "uuid"
}
```

### Device Tags

#### Get All Tags
```http
GET /api/device-tags
Authorization: Bearer <token>
```

#### Create Tag
```http
POST /api/device-tags
Authorization: Bearer <token>
Role: operator, admin
```

**Request Body:**
```json
{
  "name": "Critical",
  "color": "#EF4444"
}
```

#### Assign Tag to Device
```http
POST /api/device-tags/:tagId/assign
Authorization: Bearer <token>
Role: operator, admin
```

**Request Body:**
```json
{
  "device_id": "uuid"
}
```

---

## ⚙️ Settings Endpoints

### Get Settings
```http
GET /api/settings
Authorization: Bearer <token>
```

**Response:**
```json
{
  "smtp_host": "smtp.gmail.com",
  "smtp_port": 587,
  "smtp_secure": true,
  "smtp_from": "alerts@example.com",
  "twilio_enabled": false,
  "telegram_enabled": false,
  "offline_timeout_minutes": 15,
  "data_retention_days": 90
}
```

### Update Settings
```http
PUT /api/settings
Authorization: Bearer <token>
Role: admin
```

**Request Body:** Same as GET response

### Test Email Settings
```http
POST /api/settings/test-email
Authorization: Bearer <token>
Role: admin
```

**Request Body:**
```json
{
  "recipient": "test@example.com"
}
```

---

## 📈 Analytics Endpoints

### Get Device Statistics
```http
GET /api/analytics/devices/stats
Authorization: Bearer <token>
```

**Response:**
```json
{
  "total_devices": 25,
  "online_devices": 23,
  "offline_devices": 2,
  "by_type": {
    "kitchen_monitor": 10,
    "security_node": 8,
    "greenhouse_monitor": 7
  }
}
```

### Get Alert Statistics
```http
GET /api/analytics/alerts/stats
Authorization: Bearer <token>
```

**Query Parameters:**
- `start_date` (optional)
- `end_date` (optional)

**Response:**
```json
{
  "total_alerts": 145,
  "by_severity": {
    "critical": 5,
    "high": 20,
    "medium": 60,
    "low": 60
  },
  "by_status": {
    "active": 12,
    "acknowledged": 8,
    "resolved": 125
  }
}
```

---

## 🛡️ Audit Log Endpoints

### Get Audit Logs
```http
GET /api/audit-logs
Authorization: Bearer <token>
Role: admin
```

**Query Parameters:**
- `user_id` (optional): Filter by user ID
- `device_id` (optional): Filter by device ID
- `action_type` (optional): Exact action type (e.g., 'user.login', 'device.update')
- `action_category` (optional): Category (authentication, device, sensor, alert, system, user)
- `action_result` (optional): Result (success, failure, error)
- `start_date` (optional): ISO date string
- `end_date` (optional): ISO date string
- `search` (optional): Search term (searches user email, resource name, action type)
- `limit` (optional): Results per page (default: 100, max: 1000)
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "logs": [
    {
      "id": 12345,
      "user_id": 1,
      "user_email": "admin@example.com",
      "user_role": "admin",
      "device_id": "ESP-12345",
      "device_name": "Kitchen Sensor",
      "action_type": "device.update",
      "action_category": "device",
      "action_result": "success",
      "resource_type": "device",
      "resource_id": "ESP-12345",
      "resource_name": "Kitchen Sensor",
      "changes": {
        "after": {
          "name": "Updated Kitchen Sensor"
        }
      },
      "metadata": {
        "updatedFields": ["name"]
      },
      "ip_address": "192.168.1.100",
      "user_agent": "Mozilla/5.0...",
      "request_method": "PUT",
      "request_url": "/api/devices/ESP-12345",
      "created_at": "2025-10-07T10:30:00Z"
    }
  ],
  "total": 1234,
  "limit": 100,
  "offset": 0,
  "hasMore": true
}
```

### Get Audit Statistics
```http
GET /api/audit-logs/stats
Authorization: Bearer <token>
Role: admin
```

**Query Parameters:**
- `start_date` (optional): ISO date string
- `end_date` (optional): ISO date string

**Response:**
```json
{
  "byCategory": [
    {
      "action_category": "authentication",
      "action_result": "success",
      "count": 145
    }
  ],
  "topUsers": [
    {
      "user_email": "admin@example.com",
      "action_count": 523
    }
  ],
  "totals": {
    "total_actions": 1234,
    "unique_users": 5,
    "unique_devices": 25,
    "successful_actions": 1180,
    "failed_actions": 45,
    "error_actions": 9
  }
}
```

### Get Session History
```http
GET /api/audit-logs/session-history
Authorization: Bearer <token>
```

**Query Parameters:**
- `user_id` (optional): User ID (admin only, users can view own sessions)
- `limit` (optional): Results per page (default: 50, max: 100)
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "sessions": [
    {
      "id": 789,
      "user_id": 1,
      "user_email": "admin@example.com",
      "session_start": "2025-10-07T08:00:00Z",
      "session_end": "2025-10-07T12:00:00Z",
      "session_duration": 14400,
      "ip_address": "192.168.1.100",
      "user_agent": "Mozilla/5.0...",
      "browser": "Chrome",
      "os": "Windows",
      "device_type": "desktop",
      "last_activity": "2025-10-07T12:00:00Z",
      "actions_count": 42,
      "logout_type": "manual"
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

### Get Failed Login Attempts
```http
GET /api/audit-logs/failed-logins
Authorization: Bearer <token>
Role: admin
```

**Query Parameters:**
- `limit` (optional): Results per page (default: 100, max: 500)
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "attempts": [
    {
      "id": 456,
      "email": "user@example.com",
      "ip_address": "203.0.113.0",
      "user_agent": "Mozilla/5.0...",
      "failure_reason": "invalid_password",
      "attempted_at": "2025-10-07T10:30:00Z",
      "consecutive_failures": 3,
      "account_locked": false
    }
  ],
  "stats": {
    "total_attempts": 123,
    "unique_emails": 15,
    "unique_ips": 42,
    "locked_accounts": 2,
    "last_24h": 15
  },
  "limit": 100,
  "offset": 0
}
```

### Get Data Export History
```http
GET /api/audit-logs/data-exports
Authorization: Bearer <token>
```

**Query Parameters:**
- `user_id` (optional): User ID (admin only)
- `limit` (optional): Results per page (default: 50, max: 100)
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "exports": [
    {
      "id": 321,
      "user_id": 1,
      "user_email": "admin@example.com",
      "export_type": "csv",
      "resource_type": "telemetry",
      "device_ids": ["ESP-12345", "ESP-67890"],
      "date_range_start": "2025-10-01T00:00:00Z",
      "date_range_end": "2025-10-07T23:59:59Z",
      "filters": {
        "sensor_type": "temperature"
      },
      "records_count": 10000,
      "file_size_bytes": 524288,
      "file_name": "telemetry_export_20251007.csv",
      "ip_address": "192.168.1.100",
      "created_at": "2025-10-07T10:30:00Z"
    }
  ],
  "limit": 50,
  "offset": 0
}
```

### Get Configuration Changes
```http
GET /api/audit-logs/config-changes
Authorization: Bearer <token>
Role: admin
```

**Query Parameters:**
- `category` (optional): Config category (email, smtp, system, security)
- `limit` (optional): Results per page (default: 100, max: 200)
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "changes": [
    {
      "id": 654,
      "user_id": 1,
      "user_email": "admin@example.com",
      "config_category": "smtp",
      "config_key": "smtp_host",
      "old_value": "smtp.oldserver.com",
      "new_value": "smtp.newserver.com",
      "value_encrypted": false,
      "change_reason": "Migrating to new email provider",
      "ip_address": "192.168.1.100",
      "created_at": "2025-10-07T10:30:00Z"
    }
  ],
  "limit": 100,
  "offset": 0
}
```

### Get Device Command History
```http
GET /api/audit-logs/device-commands
Authorization: Bearer <token>
Role: admin, operator
```

**Query Parameters:**
- `device_id` (optional): Filter by device
- `status` (optional): Command status (pending, sent, acknowledged, completed, failed)
- `limit` (optional): Results per page (default: 100, max: 200)
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "commands": [
    {
      "id": 987,
      "user_id": 1,
      "user_email": "admin@example.com",
      "device_id": "ESP-12345",
      "device_name": "Kitchen Sensor",
      "command_type": "ota_update",
      "command_data": {
        "firmware_version": "2.2.0",
        "firmware_url": "https://example.com/firmware.bin"
      },
      "status": "completed",
      "device_response": {
        "success": true,
        "message": "Update completed successfully"
      },
      "sent_at": "2025-10-07T10:00:00Z",
      "acknowledged_at": "2025-10-07T10:00:15Z",
      "completed_at": "2025-10-07T10:05:00Z",
      "duration_seconds": 300
    }
  ],
  "limit": 100,
  "offset": 0
}
```

### Get Single Audit Log
```http
GET /api/audit-logs/:id
Authorization: Bearer <token>
Role: admin
```

**Response:**
```json
{
  "id": 12345,
  "user_id": 1,
  "user_email": "admin@example.com",
  "action_type": "device.update",
  "action_category": "device",
  "action_result": "success",
  "resource_type": "device",
  "resource_id": "ESP-12345",
  "changes": { ... },
  "metadata": { ... },
  "ip_address": "192.168.1.100",
  "created_at": "2025-10-07T10:30:00Z"
}
```

### Cleanup Old Audit Logs
```http
DELETE /api/audit-logs/cleanup
Authorization: Bearer <token>
Role: admin
```

Manually trigger cleanup of old audit logs based on retention policies.

**Response:**
```json
{
  "message": "Audit log cleanup completed successfully"
}
```

---

## 🖥️ System Endpoints

### Get System Info
```http
GET /api/system/info
Authorization: Bearer <token>
Role: admin
```

**Response:**
```json
{
  "version": "2.2.0",
  "uptime": 86400,
  "database_status": "healthy",
  "redis_status": "healthy",
  "mqtt_status": "connected"
}
```

### Check for Updates
```http
GET /api/system/check-updates
Authorization: Bearer <token>
Role: admin
```

**Response:**
```json
{
  "updateAvailable": true,
  "currentCommit": "abc123",
  "remoteCommit": "def456",
  "commitsBehind": 5,
  "changes": [
    {
      "commit": "def456",
      "message": "Add new feature",
      "date": "2025-10-06"
    }
  ]
}
```

### Update System
```http
POST /api/system/update
Authorization: Bearer <token>
Role: admin
```

**Response:**
```json
{
  "message": "Update started",
  "status": "in_progress"
}
```

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-07T10:30:00Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "mqtt": "connected"
  }
}
```

---

## 🔒 Authorization Roles

- **viewer**: Read-only access to devices and data
- **operator**: Can manage devices, sensors, and alerts
- **admin**: Full system access including user management and settings

---

## ⚠️ Error Responses

All endpoints return standard error responses:

### 400 Bad Request
```json
{
  "error": "Invalid input",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "error": "Not found",
  "message": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "An unexpected error occurred"
}
```

---

## 🔄 Rate Limiting

API endpoints are rate-limited to prevent abuse:
- **Window**: 15 minutes
- **Max Requests**: 1000 per IP
- **Response Header**: `X-RateLimit-Remaining`

When rate limit is exceeded:
```json
{
  "error": "Too many requests from this IP",
  "retryAfter": 900
}
```

---

## 📡 WebSocket API

### Connection
```javascript
const socket = io('https://your-domain.com', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### Events

#### Subscribe to Device Updates
```javascript
socket.emit('subscribe:device', { deviceId: 'uuid' });
```

#### Real-time Telemetry
```javascript
socket.on('telemetry:update', (data) => {
  console.log(data);
  // {
  //   device_id: 'uuid',
  //   sensor_type: 'temperature',
  //   value: 23.5,
  //   timestamp: '2025-10-07T10:30:00Z'
  // }
});
```

#### Alert Notifications
```javascript
socket.on('alert:new', (alert) => {
  console.log(alert);
});
```

---

## 📝 Notes

- All timestamps are in ISO 8601 format (UTC)
- Device authentication uses API keys in the format: `Device <api_key>`
- User authentication uses JWT tokens in the format: `Bearer <jwt_token>`
- File uploads use `multipart/form-data` encoding
- Query parameters should be URL-encoded

---

**Last Updated**: October 2025
**API Version**: 2.2.0
