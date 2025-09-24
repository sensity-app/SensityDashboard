#ifndef DEVICE_CONFIG_H
#define DEVICE_CONFIG_H

// ========================================
// DEVICE IDENTIFICATION
// ========================================
#define DEVICE_ID "ESP8266_001"
#define DEVICE_NAME "Kitchen Sensor Node"
#define DEVICE_LOCATION "Kitchen"
#define FIRMWARE_VERSION "2.1.0"

// ========================================
// WIFI CONFIGURATION
// ========================================
#define WIFI_SSID "YOUR_WIFI_NETWORK"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// WiFi connection settings
#define WIFI_CONNECT_TIMEOUT_SEC 30
#define WIFI_RECONNECT_ATTEMPTS 3
#define WIFI_RECONNECT_DELAY_MS 5000

// ========================================
// SERVER CONFIGURATION
// ========================================
#define SERVER_URL "https://your-iot-platform.com"
#define SERVER_API_KEY "your-api-key-here"  // Optional API key
#define USE_HTTPS true
#define SERVER_FINGERPRINT ""  // SSL fingerprint if needed

// ========================================
// DEVICE BEHAVIOR SETTINGS
// ========================================
#define HEARTBEAT_INTERVAL_SEC 300     // Send heartbeat every 5 minutes
#define SENSOR_READ_INTERVAL_MS 5000   // Read sensors every 5 seconds
#define TELEMETRY_BATCH_SIZE 5         // Send data after collecting 5 readings
#define DEVICE_ARMED true              // Enable alarm monitoring
#define DEBUG_MODE false               // Enable serial debug output
#define OTA_ENABLED true               // Enable over-the-air updates

// ========================================
// SENSOR CONFIGURATION
// ========================================
// Define which sensors are connected and their settings

// Temperature & Humidity Sensor (DHT22)
#define SENSOR_DHT_ENABLED true
#define SENSOR_DHT_PIN D4
#define SENSOR_DHT_TYPE DHT22
#define TEMP_THRESHOLD_MIN -10.0
#define TEMP_THRESHOLD_MAX 40.0
#define HUMIDITY_THRESHOLD_MIN 20.0
#define HUMIDITY_THRESHOLD_MAX 80.0

// Light Sensor (Photodiode/LDR on analog pin)
#define SENSOR_LIGHT_ENABLED true
#define SENSOR_LIGHT_PIN A0
#define LIGHT_THRESHOLD_MIN 100
#define LIGHT_THRESHOLD_MAX 900
#define LIGHT_CALIBRATION_OFFSET 0.0
#define LIGHT_CALIBRATION_MULTIPLIER 1.0

// Motion Sensor (PIR)
#define SENSOR_MOTION_ENABLED true
#define SENSOR_MOTION_PIN D2
#define MOTION_THRESHOLD_MIN 0
#define MOTION_THRESHOLD_MAX 1
#define MOTION_DETECTION_TIMEOUT_MS 30000  // 30 seconds

// Distance Sensor (Ultrasonic HC-SR04)
#define SENSOR_DISTANCE_ENABLED true
#define SENSOR_DISTANCE_TRIGGER_PIN D5
#define SENSOR_DISTANCE_ECHO_PIN D6
#define DISTANCE_THRESHOLD_MIN 5.0   // cm
#define DISTANCE_THRESHOLD_MAX 200.0 // cm

// Sound Level Sensor (Microphone)
#define SENSOR_SOUND_ENABLED false
#define SENSOR_SOUND_PIN A0
#define SOUND_THRESHOLD_MIN 100
#define SOUND_THRESHOLD_MAX 800

// Magnetic Door/Window Sensor
#define SENSOR_MAGNETIC_ENABLED false
#define SENSOR_MAGNETIC_PIN D3
#define MAGNETIC_THRESHOLD_MIN 0
#define MAGNETIC_THRESHOLD_MAX 1

// Vibration Sensor
#define SENSOR_VIBRATION_ENABLED false
#define SENSOR_VIBRATION_PIN D7
#define VIBRATION_THRESHOLD_MIN 0
#define VIBRATION_THRESHOLD_MAX 1

// Gas Sensor (MQ series)
#define SENSOR_GAS_ENABLED false
#define SENSOR_GAS_PIN A0
#define GAS_THRESHOLD_MIN 100
#define GAS_THRESHOLD_MAX 600

// ========================================
// PIN ASSIGNMENTS REFERENCE
// ========================================
// ESP8266 NodeMCU Pin Mapping:
// D0  = GPIO16  (LED_BUILTIN, no PWM, no interrupt)
// D1  = GPIO5   (SCL)
// D2  = GPIO4   (SDA)
// D3  = GPIO0   (FLASH button, pull-up required)
// D4  = GPIO2   (LED_BUILTIN on some boards, pull-up required)
// D5  = GPIO14  (SCK)
// D6  = GPIO12  (MISO)
// D7  = GPIO13  (MOSI)
// D8  = GPIO15  (SS, pull-down required)
// A0  = ADC0    (Analog input, 0-1V, use voltage divider for 3.3V)

// ========================================
// ADVANCED SETTINGS
// ========================================
#define WATCHDOG_TIMEOUT_MS 30000      // Reset if no activity for 30 seconds
#define CONFIG_EEPROM_ADDR 0           // EEPROM address for configuration
#define CONFIG_MAGIC_NUMBER 0x12345678 // Used to validate EEPROM config
#define MAX_FAILED_CONNECTIONS 5       // Max consecutive connection failures before restart

// Data transmission settings
#define USE_JSON_COMPRESSION false     // Enable gzip compression for JSON data
#define MAX_RETRY_ATTEMPTS 3           // Max retry attempts for HTTP requests
#define HTTP_REQUEST_TIMEOUT_MS 10000  // 10 second timeout for HTTP requests

// Power management (for battery-powered devices)
#define DEEP_SLEEP_ENABLED false       // Enable deep sleep mode
#define DEEP_SLEEP_DURATION_SEC 300    // Sleep for 5 minutes between readings
#define BATTERY_MONITORING_ENABLED false
#define LOW_BATTERY_THRESHOLD_V 3.2    // Voltage threshold for low battery alert

// ========================================
// DEVICE-SPECIFIC CONFIGURATIONS
// ========================================
// Uncomment one of the following presets, or create your own

// Preset 1: Kitchen Monitoring
// #define PRESET_KITCHEN
#ifdef PRESET_KITCHEN
  #undef DEVICE_ID
  #undef DEVICE_NAME
  #undef DEVICE_LOCATION
  #define DEVICE_ID "KITCHEN_001"
  #define DEVICE_NAME "Kitchen Monitor"
  #define DEVICE_LOCATION "Kitchen"
  #undef SENSOR_MOTION_ENABLED
  #define SENSOR_MOTION_ENABLED false
  #undef TEMP_THRESHOLD_MAX
  #define TEMP_THRESHOLD_MAX 35.0  // Higher temperature threshold for kitchen
#endif

// Preset 2: Security Node
// #define PRESET_SECURITY
#ifdef PRESET_SECURITY
  #undef DEVICE_ID
  #undef DEVICE_NAME
  #undef DEVICE_LOCATION
  #define DEVICE_ID "SECURITY_001"
  #define DEVICE_NAME "Security Sensor"
  #define DEVICE_LOCATION "Front Door"
  #undef SENSOR_DHT_ENABLED
  #define SENSOR_DHT_ENABLED false
  #undef SENSOR_MAGNETIC_ENABLED
  #define SENSOR_MAGNETIC_ENABLED true
  #undef HEARTBEAT_INTERVAL_SEC
  #define HEARTBEAT_INTERVAL_SEC 60  // More frequent heartbeats for security
#endif

// Preset 3: Environmental Monitor
// #define PRESET_ENVIRONMENTAL
#ifdef PRESET_ENVIRONMENTAL
  #undef DEVICE_ID
  #undef DEVICE_NAME
  #undef DEVICE_LOCATION
  #define DEVICE_ID "ENV_001"
  #define DEVICE_NAME "Environmental Monitor"
  #define DEVICE_LOCATION "Living Room"
  #undef SENSOR_MOTION_ENABLED
  #define SENSOR_MOTION_ENABLED false
  #undef SENSOR_DISTANCE_ENABLED
  #define SENSOR_DISTANCE_ENABLED false
  #undef SENSOR_GAS_ENABLED
  #define SENSOR_GAS_ENABLED true
#endif

// ========================================
// VALIDATION AND WARNINGS
// ========================================
#if !defined(WIFI_SSID) || !defined(WIFI_PASSWORD)
  #error "WiFi credentials must be configured in WIFI_SSID and WIFI_PASSWORD"
#endif

#if !defined(SERVER_URL)
  #error "Server URL must be configured in SERVER_URL"
#endif

#if SENSOR_LIGHT_ENABLED && SENSOR_SOUND_ENABLED
  #warning "Light and Sound sensors both use A0 - only one can be enabled"
#endif

#if SENSOR_LIGHT_ENABLED && SENSOR_GAS_ENABLED
  #warning "Light and Gas sensors both use A0 - only one can be enabled"
#endif

#endif // DEVICE_CONFIG_H