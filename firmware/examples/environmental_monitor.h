// Environmental Monitor Configuration
// Copy this content to device_config.h and modify as needed

#ifndef DEVICE_CONFIG_H
#define DEVICE_CONFIG_H

// ========================================
// DEVICE IDENTIFICATION
// ========================================
#define DEVICE_ID "ENV_001"
#define DEVICE_NAME "Environmental Monitor"
#define DEVICE_LOCATION "Living Room"
#define FIRMWARE_VERSION "2.1.0"

// ========================================
// WIFI CONFIGURATION
// ========================================
#define WIFI_SSID "HOME_NETWORK"
#define WIFI_PASSWORD "environment_sensor_789"

// ========================================
// SERVER CONFIGURATION
// ========================================
#define SERVER_URL "https://your-environmental-platform.com"
#define SERVER_API_KEY "env_api_key_abc123"
#define USE_HTTPS true
#define SERVER_FINGERPRINT ""

// ========================================
// DEVICE BEHAVIOR SETTINGS
// ========================================
#define HEARTBEAT_INTERVAL_SEC 600     // 10 minutes - less critical
#define SENSOR_READ_INTERVAL_MS 30000  // 30 seconds - slower readings
#define TELEMETRY_BATCH_SIZE 10        // Batch data for efficiency
#define DEVICE_ARMED true              // Monitor environmental conditions
#define DEBUG_MODE false
#define OTA_ENABLED true

// ========================================
// SENSOR CONFIGURATION
// ========================================

// Temperature & Humidity - Primary environmental sensors
#define SENSOR_DHT_ENABLED true
#define SENSOR_DHT_PIN D4
#define SENSOR_DHT_TYPE DHT22
#define TEMP_THRESHOLD_MIN 16.0    // Too cold for comfort
#define TEMP_THRESHOLD_MAX 28.0    // Too hot for comfort
#define HUMIDITY_THRESHOLD_MIN 30.0 // Too dry
#define HUMIDITY_THRESHOLD_MAX 70.0 // Too humid

// Light Sensor - Monitor natural and artificial lighting
#define SENSOR_LIGHT_ENABLED true
#define SENSOR_LIGHT_PIN A0
#define LIGHT_THRESHOLD_MIN 30   // Very dark
#define LIGHT_THRESHOLD_MAX 950  // Very bright
#define LIGHT_CALIBRATION_OFFSET 0.0
#define LIGHT_CALIBRATION_MULTIPLIER 1.0

// Motion Sensor - Optional occupancy detection
#define SENSOR_MOTION_ENABLED false
#define SENSOR_MOTION_PIN D2
#define MOTION_THRESHOLD_MIN 0
#define MOTION_THRESHOLD_MAX 1
#define MOTION_DETECTION_TIMEOUT_MS 300000  // 5 minutes

// Distance Sensor - Not needed for environmental monitoring
#define SENSOR_DISTANCE_ENABLED false
#define SENSOR_DISTANCE_TRIGGER_PIN D5
#define SENSOR_DISTANCE_ECHO_PIN D6
#define DISTANCE_THRESHOLD_MIN 5.0
#define DISTANCE_THRESHOLD_MAX 200.0

// Sound Sensor - Monitor noise levels
#define SENSOR_SOUND_ENABLED false  // Would conflict with light sensor
#define SENSOR_SOUND_PIN A0
#define SOUND_THRESHOLD_MIN 200  // Quiet environment
#define SOUND_THRESHOLD_MAX 700  // Too noisy

// Magnetic Sensor - Not typically needed
#define SENSOR_MAGNETIC_ENABLED false
#define SENSOR_MAGNETIC_PIN D3
#define MAGNETIC_THRESHOLD_MIN 0
#define MAGNETIC_THRESHOLD_MAX 1

// Vibration Sensor - Not typically needed
#define SENSOR_VIBRATION_ENABLED false
#define SENSOR_VIBRATION_PIN D7
#define VIBRATION_THRESHOLD_MIN 0
#define VIBRATION_THRESHOLD_MAX 1

// Gas Sensor - Air quality monitoring
#define SENSOR_GAS_ENABLED false  // Would conflict with light sensor
#define SENSOR_GAS_PIN A0
#define GAS_THRESHOLD_MIN 100
#define GAS_THRESHOLD_MAX 400  // Poor air quality

// ========================================
// ENVIRONMENTAL SPECIFIC SETTINGS
// ========================================
#define AIR_QUALITY_MONITORING true
#define COMFORT_ZONE_ALERTING true
#define TREND_ANALYSIS true
#define SEASONAL_ADJUSTMENT true

#endif // DEVICE_CONFIG_H