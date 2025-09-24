// Greenhouse Monitor Configuration
// Copy this content to device_config.h and modify as needed

#ifndef DEVICE_CONFIG_H
#define DEVICE_CONFIG_H

// ========================================
// DEVICE IDENTIFICATION
// ========================================
#define DEVICE_ID "GREENHOUSE_001"
#define DEVICE_NAME "Greenhouse Monitor"
#define DEVICE_LOCATION "Backyard Greenhouse"
#define FIRMWARE_VERSION "2.1.0"

// ========================================
// WIFI CONFIGURATION
// ========================================
#define WIFI_SSID "GARDEN_WIFI"
#define WIFI_PASSWORD "greenhouse_monitor_2024"

// ========================================
// SERVER CONFIGURATION
// ========================================
#define SERVER_URL "https://your-garden-platform.com"
#define SERVER_API_KEY "garden_api_key_def456"
#define USE_HTTPS true
#define SERVER_FINGERPRINT ""

// ========================================
// DEVICE BEHAVIOR SETTINGS
// ========================================
#define HEARTBEAT_INTERVAL_SEC 300     // 5 minutes
#define SENSOR_READ_INTERVAL_MS 15000  // 15 seconds - plants need attention
#define TELEMETRY_BATCH_SIZE 4
#define DEVICE_ARMED true              // Monitor plant conditions
#define DEBUG_MODE false
#define OTA_ENABLED true

// ========================================
// SENSOR CONFIGURATION
// ========================================

// Temperature & Humidity - Critical for plant health
#define SENSOR_DHT_ENABLED true
#define SENSOR_DHT_PIN D4
#define SENSOR_DHT_TYPE DHT22
#define TEMP_THRESHOLD_MIN 12.0    // Too cold for most plants
#define TEMP_THRESHOLD_MAX 35.0    // Too hot for most plants
#define HUMIDITY_THRESHOLD_MIN 40.0 // Too dry for greenhouse
#define HUMIDITY_THRESHOLD_MAX 95.0 // Too humid (mold risk)

// Light Sensor - Monitor sunlight and artificial lighting
#define SENSOR_LIGHT_ENABLED true
#define SENSOR_LIGHT_PIN A0
#define LIGHT_THRESHOLD_MIN 100  // Too dark (need grow lights)
#define LIGHT_THRESHOLD_MAX 900  // Very bright sunlight
#define LIGHT_CALIBRATION_OFFSET 0.0
#define LIGHT_CALIBRATION_MULTIPLIER 1.0

// Motion Sensor - Security for greenhouse
#define SENSOR_MOTION_ENABLED true
#define SENSOR_MOTION_PIN D2
#define MOTION_THRESHOLD_MIN 0
#define MOTION_THRESHOLD_MAX 1
#define MOTION_DETECTION_TIMEOUT_MS 120000  // 2 minutes

// Distance Sensor - Monitor water tank level
#define SENSOR_DISTANCE_ENABLED true
#define SENSOR_DISTANCE_TRIGGER_PIN D5
#define SENSOR_DISTANCE_ECHO_PIN D6
#define DISTANCE_THRESHOLD_MIN 5.0   // Tank full
#define DISTANCE_THRESHOLD_MAX 50.0  // Tank empty - needs refill

// Sound Sensor - Not typically needed
#define SENSOR_SOUND_ENABLED false
#define SENSOR_SOUND_PIN A0
#define SOUND_THRESHOLD_MIN 100
#define SOUND_THRESHOLD_MAX 800

// Magnetic Sensor - Door open/close monitoring
#define SENSOR_MAGNETIC_ENABLED true
#define SENSOR_MAGNETIC_PIN D3
#define MAGNETIC_THRESHOLD_MIN 0
#define MAGNETIC_THRESHOLD_MAX 1

// Vibration Sensor - Wind or structural stress detection
#define SENSOR_VIBRATION_ENABLED true
#define SENSOR_VIBRATION_PIN D7
#define VIBRATION_THRESHOLD_MIN 0
#define VIBRATION_THRESHOLD_MAX 1

// Gas Sensor - CO2 monitoring for plant growth
#define SENSOR_GAS_ENABLED false  // Would conflict with light sensor
#define SENSOR_GAS_PIN A0
#define GAS_THRESHOLD_MIN 300   // Low CO2
#define GAS_THRESHOLD_MAX 1500  // High CO2

// ========================================
// GREENHOUSE SPECIFIC SETTINGS
// ========================================
#define PLANT_CARE_MODE true
#define IRRIGATION_CONTROL_PIN D8      // Optional irrigation relay
#define FAN_CONTROL_PIN D1             // Optional ventilation fan
#define HEATER_CONTROL_PIN D0          // Optional heating relay
#define GROW_LIGHT_CONTROL_PIN D3      // Optional grow light relay
#define SOIL_MOISTURE_MONITORING false // Would need additional sensors

// Growth phase specific thresholds
#define SEEDLING_TEMP_MIN 18.0
#define SEEDLING_TEMP_MAX 24.0
#define FLOWERING_TEMP_MIN 16.0
#define FLOWERING_TEMP_MAX 22.0

#endif // DEVICE_CONFIG_H