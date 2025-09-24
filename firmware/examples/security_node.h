// Security Node Configuration
// Copy this content to device_config.h and modify as needed

#ifndef DEVICE_CONFIG_H
#define DEVICE_CONFIG_H

// ========================================
// DEVICE IDENTIFICATION
// ========================================
#define DEVICE_ID "SECURITY_001"
#define DEVICE_NAME "Security Monitor"
#define DEVICE_LOCATION "Front Door"
#define FIRMWARE_VERSION "2.1.0"

// ========================================
// WIFI CONFIGURATION
// ========================================
#define WIFI_SSID "YOUR_SECURITY_WIFI"
#define WIFI_PASSWORD "secure_password_456"

// ========================================
// SERVER CONFIGURATION
// ========================================
#define SERVER_URL "https://your-security-platform.com"
#define SERVER_API_KEY "sec_api_key_xyz789"
#define USE_HTTPS true
#define SERVER_FINGERPRINT ""

// ========================================
// DEVICE BEHAVIOR SETTINGS
// ========================================
#define HEARTBEAT_INTERVAL_SEC 60      // 1 minute - frequent for security
#define SENSOR_READ_INTERVAL_MS 2000   // 2 seconds - fast response
#define TELEMETRY_BATCH_SIZE 1         // Immediate transmission
#define DEVICE_ARMED true              // Always armed for security
#define DEBUG_MODE false               // No debug in production
#define OTA_ENABLED true

// ========================================
// SENSOR CONFIGURATION
// ========================================

// Temperature & Humidity - Basic environmental monitoring
#define SENSOR_DHT_ENABLED true
#define SENSOR_DHT_PIN D4
#define SENSOR_DHT_TYPE DHT22
#define TEMP_THRESHOLD_MIN -5.0    // Extreme cold
#define TEMP_THRESHOLD_MAX 45.0    // Extreme heat
#define HUMIDITY_THRESHOLD_MIN 10.0
#define HUMIDITY_THRESHOLD_MAX 95.0

// Light Sensor - Detect day/night and unusual lighting
#define SENSOR_LIGHT_ENABLED true
#define SENSOR_LIGHT_PIN A0
#define LIGHT_THRESHOLD_MIN 20   // Very dark
#define LIGHT_THRESHOLD_MAX 980  // Very bright (flashlight?)
#define LIGHT_CALIBRATION_OFFSET 0.0
#define LIGHT_CALIBRATION_MULTIPLIER 1.0

// Motion Sensor - Primary security sensor
#define SENSOR_MOTION_ENABLED true
#define SENSOR_MOTION_PIN D2
#define MOTION_THRESHOLD_MIN 0
#define MOTION_THRESHOLD_MAX 1
#define MOTION_DETECTION_TIMEOUT_MS 10000  // 10 seconds

// Distance Sensor - Detect approach/proximity
#define SENSOR_DISTANCE_ENABLED true
#define SENSOR_DISTANCE_TRIGGER_PIN D5
#define SENSOR_DISTANCE_ECHO_PIN D6
#define DISTANCE_THRESHOLD_MIN 10.0   // Too close
#define DISTANCE_THRESHOLD_MAX 100.0  // Detection range

// Sound Sensor - Detect breaking glass, shouting, etc.
#define SENSOR_SOUND_ENABLED false  // Would conflict with light sensor
#define SENSOR_SOUND_PIN A0
#define SOUND_THRESHOLD_MIN 100
#define SOUND_THRESHOLD_MAX 900

// Magnetic Sensor - Door/window open detection
#define SENSOR_MAGNETIC_ENABLED true
#define SENSOR_MAGNETIC_PIN D3
#define MAGNETIC_THRESHOLD_MIN 0
#define MAGNETIC_THRESHOLD_MAX 1

// Vibration Sensor - Detect forced entry, breaking
#define SENSOR_VIBRATION_ENABLED true
#define SENSOR_VIBRATION_PIN D7
#define VIBRATION_THRESHOLD_MIN 0
#define VIBRATION_THRESHOLD_MAX 1

// Gas Sensor - Not typically needed for security
#define SENSOR_GAS_ENABLED false
#define SENSOR_GAS_PIN A0
#define GAS_THRESHOLD_MIN 100
#define GAS_THRESHOLD_MAX 600

// ========================================
// SECURITY SPECIFIC SETTINGS
// ========================================
#define SECURITY_MODE true
#define INTRUSION_COOLDOWN_MS 60000    // 1 minute between alerts
#define TAMPER_DETECTION true
#define SILENT_ALARM_PIN D8            // Optional silent alarm output

#endif // DEVICE_CONFIG_H