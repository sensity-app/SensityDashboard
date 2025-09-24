// Kitchen Monitor Configuration
// Copy this content to device_config.h and modify as needed

#ifndef DEVICE_CONFIG_H
#define DEVICE_CONFIG_H

// ========================================
// DEVICE IDENTIFICATION
// ========================================
#define DEVICE_ID "KITCHEN_001"
#define DEVICE_NAME "Kitchen Monitor"
#define DEVICE_LOCATION "Kitchen"
#define FIRMWARE_VERSION "2.1.0"

// ========================================
// WIFI CONFIGURATION
// ========================================
#define WIFI_SSID "YOUR_HOME_WIFI"
#define WIFI_PASSWORD "your_wifi_password_123"

// ========================================
// SERVER CONFIGURATION
// ========================================
#define SERVER_URL "https://your-iot-platform.herokuapp.com"
#define SERVER_API_KEY ""
#define USE_HTTPS true
#define SERVER_FINGERPRINT ""

// ========================================
// DEVICE BEHAVIOR SETTINGS
// ========================================
#define HEARTBEAT_INTERVAL_SEC 300     // 5 minutes
#define SENSOR_READ_INTERVAL_MS 10000  // 10 seconds (kitchen changes frequently)
#define TELEMETRY_BATCH_SIZE 3
#define DEVICE_ARMED true
#define DEBUG_MODE false
#define OTA_ENABLED true

// ========================================
// SENSOR CONFIGURATION
// ========================================

// Temperature & Humidity - Important for kitchen monitoring
#define SENSOR_DHT_ENABLED true
#define SENSOR_DHT_PIN D4
#define SENSOR_DHT_TYPE DHT22
#define TEMP_THRESHOLD_MIN 10.0      // Kitchen can get cold
#define TEMP_THRESHOLD_MAX 40.0      // Alert if too hot (fire risk)
#define HUMIDITY_THRESHOLD_MIN 30.0  // Too dry
#define HUMIDITY_THRESHOLD_MAX 90.0  // Too humid (ventilation needed)

// Light Sensor - Detect if lights are on/off
#define SENSOR_LIGHT_ENABLED true
#define SENSOR_LIGHT_PIN A0
#define LIGHT_THRESHOLD_MIN 50   // Very dark
#define LIGHT_THRESHOLD_MAX 950  // Very bright
#define LIGHT_CALIBRATION_OFFSET 0.0
#define LIGHT_CALIBRATION_MULTIPLIER 1.0

// Motion Sensor - Detect activity in kitchen
#define SENSOR_MOTION_ENABLED true
#define SENSOR_MOTION_PIN D2
#define MOTION_THRESHOLD_MIN 0
#define MOTION_THRESHOLD_MAX 1
#define MOTION_DETECTION_TIMEOUT_MS 60000  // 1 minute

// Gas Sensor - Detect cooking gas leaks
#define SENSOR_GAS_ENABLED true
#define SENSOR_GAS_PIN A0  // Note: Conflicts with light - choose one
#define GAS_THRESHOLD_MIN 100
#define GAS_THRESHOLD_MAX 500  // Alert on gas detection

// Distance Sensor - Not typically needed in kitchen
#define SENSOR_DISTANCE_ENABLED false
#define SENSOR_DISTANCE_TRIGGER_PIN D5
#define SENSOR_DISTANCE_ECHO_PIN D6
#define DISTANCE_THRESHOLD_MIN 5.0
#define DISTANCE_THRESHOLD_MAX 200.0

// Sound Sensor - Detect unusual kitchen sounds
#define SENSOR_SOUND_ENABLED false
#define SENSOR_SOUND_PIN A0
#define SOUND_THRESHOLD_MIN 100
#define SOUND_THRESHOLD_MAX 800

// Magnetic Sensor - Monitor cabinet doors
#define SENSOR_MAGNETIC_ENABLED true
#define SENSOR_MAGNETIC_PIN D3
#define MAGNETIC_THRESHOLD_MIN 0
#define MAGNETIC_THRESHOLD_MAX 1

// Vibration Sensor - Not typically needed in kitchen
#define SENSOR_VIBRATION_ENABLED false
#define SENSOR_VIBRATION_PIN D7
#define VIBRATION_THRESHOLD_MIN 0
#define VIBRATION_THRESHOLD_MAX 1

#endif // DEVICE_CONFIG_H