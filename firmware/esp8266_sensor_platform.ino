#include "device_config.h"
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266httpUpdate.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>
#include <EEPROM.h>
#include <cstring>

#define OTA_CONFIG_CHUNK "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
#define OTA_CONFIG_BLOCK4 OTA_CONFIG_CHUNK OTA_CONFIG_CHUNK OTA_CONFIG_CHUNK OTA_CONFIG_CHUNK
#define OTA_CONFIG_BLOCK8 OTA_CONFIG_BLOCK4 OTA_CONFIG_BLOCK4
#define OTA_CONFIG_BLOCK16 OTA_CONFIG_BLOCK8 OTA_CONFIG_BLOCK8
#define OTA_CONFIG_BLOCK32 OTA_CONFIG_BLOCK16 OTA_CONFIG_BLOCK16

const char OTA_CONFIG_PLACEHOLDER[] =
    "__CONFIG_START__" OTA_CONFIG_BLOCK32
    "__CONFIG_END__";

#undef OTA_CONFIG_BLOCK32
#undef OTA_CONFIG_BLOCK16
#undef OTA_CONFIG_BLOCK8
#undef OTA_CONFIG_BLOCK4
#undef OTA_CONFIG_CHUNK

// Conditional sensor library includes
#if SENSOR_DHT_ENABLED
#include <DHT.h>
#endif

#if SENSOR_DISTANCE_ENABLED
#include <Ultrasonic.h>
#endif

// Configuration structure
struct DeviceConfig
{
    char wifi_ssid[64];
    char wifi_password[64];
    char server_url[128];
    char device_id[32];
    int heartbeat_interval;
    bool armed;
    bool ota_enabled;
    bool debug_mode;
    int config_version;
};

// Sensor definitions
#define MAX_SENSORS 8
#define FILTER_WINDOW_SIZE 10 // Moving average window size

struct SensorConfig
{
    int pin;
    String type;
    String name;
    float calibration_offset;
    float calibration_multiplier;
    bool enabled;
    float threshold_min;
    float threshold_max;
};

// Sensor filtering data structures
struct SensorFilter
{
    float readings[FILTER_WINDOW_SIZE];
    int readIndex;
    float total;
    int count;
    float lastFiltered;
    bool initialized;
};

SensorFilter sensorFilters[MAX_SENSORS];

// Global variables
DeviceConfig config;
SensorConfig sensors[MAX_SENSORS];
int sensorCount = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastSensorRead = 0;
unsigned long lastTelemetrySend = 0;
unsigned long lastConsoleOutput = 0; // NEW: Track when we last printed sensor values
unsigned long lastWiFiCheck = 0;
const unsigned long WIFI_RECONNECT_INTERVAL = 15000; // 15 seconds
const unsigned long CONSOLE_OUTPUT_INTERVAL = 5000;  // NEW: Print sensor values every 5 seconds
WiFiClient wifiClient;
#if USE_HTTPS
WiFiClientSecure secureClient;
#endif

// Sensor threshold tracking
struct ThresholdState
{
    bool wasAboveMax;
    bool wasBelowMin;
    unsigned long lastAlertTime;
};
ThresholdState thresholdStates[MAX_SENSORS];

// Hardware instances (initialize based on configuration)
#if SENSOR_DHT_ENABLED
DHT *dht = nullptr;
#endif

#if SENSOR_DISTANCE_ENABLED
Ultrasonic *ultrasonic = nullptr;
#endif

// Forward declarations
void loadConfiguration();
void saveConfiguration();
void initializeSensors();
void connectToWiFi();
void checkForFirmwareUpdate();
void sendHeartbeat();
void handleOTAUpdates();
void readAndProcessSensors(bool sendTelemetry = false);
void sendTelemetryData(const JsonDocument &telemetryDoc);
void parseServerResponse(const String &response);
void updateSensorConfiguration(JsonArray sensorConfigs);
void performOTAUpdate(const String &firmwareUrl, const String &expectedChecksum);
void notifyOTAStatus(const String &status, int progress, const String &errorMessage = "");
void printSensorValuesToConsole();
void sendAlarmEvent(int sensorIndex, float value);
void sendImmediateThresholdAlert(int sensorIndex, float value, const String &alertType);

void setup()
{
    Serial.begin(115200);
    delay(1000);

    Serial.println("Starting Enhanced ESP8266 Sensor Platform...");

    // Initialize EEPROM for configuration storage
    EEPROM.begin(1024);

    // Load configuration from EEPROM or use defaults
    loadConfiguration();

    // Initialize sensors based on configuration
    initializeSensors();

    // Connect to WiFi
    connectToWiFi();

    // Check for firmware updates if enabled
    if (config.ota_enabled)
    {
        checkForFirmwareUpdate();
    }

    // Send initial heartbeat with device info
    sendHeartbeat();
}

void loop()
{
    // Check WiFi connection every 15 seconds
    if (millis() - lastWiFiCheck >= WIFI_RECONNECT_INTERVAL)
    {
        if (WiFi.status() != WL_CONNECTED)
        {
            Serial.println("========================================");
            Serial.println("WiFi disconnected! Attempting reconnection...");
            Serial.println("========================================");
            connectToWiFi();
        }
        else
        {
            if (config.debug_mode)
            {
                Serial.println("WiFi status check: Connected");
                Serial.print("Signal strength: ");
                Serial.print(WiFi.RSSI());
                Serial.println(" dBm");
            }
        }
        lastWiFiCheck = millis();
    }

    // Only perform network operations if WiFi is connected
    if (WiFi.status() == WL_CONNECTED)
    {
        // Read sensors at fast interval (1 second for real-time threshold monitoring)
        if (millis() - lastSensorRead >= SENSOR_READ_INTERVAL_MS)
        {
            // Read sensors and check thresholds, but DON'T send telemetry yet
            bool shouldSendTelemetry = (millis() - lastTelemetrySend >= TELEMETRY_SEND_INTERVAL_MS);
            readAndProcessSensors(shouldSendTelemetry);
            lastSensorRead = millis();

            // Update telemetry timestamp only if we actually sent it
            if (shouldSendTelemetry)
            {
                lastTelemetrySend = millis();
            }
        }

        // Print sensor values to console every 5 seconds for debugging
        if (millis() - lastConsoleOutput >= CONSOLE_OUTPUT_INTERVAL)
        {
            printSensorValuesToConsole();
            lastConsoleOutput = millis();
        }

        // Send heartbeat at configured interval
        if (millis() - lastHeartbeat >= (config.heartbeat_interval * 1000))
        {
            sendHeartbeat();
        }

        // Handle any pending OTA updates
        handleOTAUpdates();
    }
    else
    {
        // Log warning if disconnected for too long
        if (config.debug_mode && (millis() - lastWiFiCheck) % 30000 < 1000)
        {
            Serial.println("WARNING: WiFi still disconnected, waiting for reconnection...");
        }
    }

    delay(100); // Reduced delay for faster response
}

void loadConfiguration()
{
    // Use predefined configuration from device_config.h
    strcpy(config.wifi_ssid, WIFI_SSID);
    strcpy(config.wifi_password, WIFI_PASSWORD);
    strcpy(config.server_url, SERVER_URL);
    strcpy(config.device_id, DEVICE_ID);
    config.heartbeat_interval = HEARTBEAT_INTERVAL_SEC;
    config.armed = DEVICE_ARMED;
    config.ota_enabled = OTA_ENABLED;
    config.debug_mode = DEBUG_MODE;
    config.config_version = 2; // Version 2 uses predefined config

    // Save to EEPROM for runtime updates if needed
    saveConfiguration();

    if (config.debug_mode)
    {
        Serial.println("=== DEVICE CONFIGURATION ===");
        Serial.println("Device ID: " + String(config.device_id));
        Serial.println("Location: " + String(DEVICE_LOCATION));
        Serial.println("WiFi SSID: " + String(config.wifi_ssid));
        Serial.println("Server: " + String(config.server_url));
        Serial.println("Heartbeat interval: " + String(config.heartbeat_interval) + "s");
        Serial.println("Armed: " + String(config.armed ? "Yes" : "No"));
        Serial.println("OTA Enabled: " + String(config.ota_enabled ? "Yes" : "No"));
        Serial.println("===========================");
    }
}

void saveConfiguration()
{
    EEPROM.put(0, config);
    EEPROM.commit();
    Serial.println("Configuration saved to EEPROM");
}

void initializeSensors()
{
    sensorCount = 0;

    Serial.println("========================================");
    Serial.println("INITIALIZING SENSORS");
    Serial.println("========================================");

// Temperature & Humidity Sensor (DHT)
#if SENSOR_DHT_ENABLED
    dht = new DHT(SENSOR_DHT_PIN, SENSOR_DHT_TYPE);
    dht->begin();
    pinMode(SENSOR_DHT_PIN, INPUT_PULLUP);

    sensors[sensorCount] = {SENSOR_DHT_PIN, "temperature", "Temperature", 0, 1, true, TEMP_THRESHOLD_MIN, TEMP_THRESHOLD_MAX};
    sensorCount++;

    sensors[sensorCount] = {SENSOR_DHT_PIN, "humidity", "Humidity", 0, 1, true, HUMIDITY_THRESHOLD_MIN, HUMIDITY_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode)
    {
        Serial.println("DHT sensor initialized on pin " + String(SENSOR_DHT_PIN));
    }
#endif

// Light Sensor (Photodiode/LDR)
#if SENSOR_LIGHT_ENABLED
    sensors[sensorCount] = {SENSOR_LIGHT_PIN, "light", "Light Sensor", LIGHT_CALIBRATION_OFFSET, LIGHT_CALIBRATION_MULTIPLIER, true, LIGHT_THRESHOLD_MIN, LIGHT_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode)
    {
        Serial.println("Light sensor initialized on pin A0");
    }
#endif

// Motion Sensor (PIR)
#if SENSOR_MOTION_ENABLED
    pinMode(SENSOR_MOTION_PIN, INPUT);
    sensors[sensorCount] = {SENSOR_MOTION_PIN, "motion", "Motion Detector", 0, 1, true, MOTION_THRESHOLD_MIN, MOTION_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode)
    {
        Serial.println("Motion sensor initialized on pin " + String(SENSOR_MOTION_PIN));
    }
#endif

// Distance Sensor (Ultrasonic)
#if SENSOR_DISTANCE_ENABLED
    ultrasonic = new Ultrasonic(SENSOR_DISTANCE_TRIGGER_PIN, SENSOR_DISTANCE_ECHO_PIN);
    sensors[sensorCount] = {SENSOR_DISTANCE_TRIGGER_PIN, "distance", "Distance Sensor", 0, 1, true, DISTANCE_THRESHOLD_MIN, DISTANCE_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode)
    {
        Serial.println("Ultrasonic sensor initialized - Trigger: " + String(SENSOR_DISTANCE_TRIGGER_PIN) + ", Echo: " + String(SENSOR_DISTANCE_ECHO_PIN));
    }
#endif

// Sound Sensor
#if SENSOR_SOUND_ENABLED
    sensors[sensorCount] = {SENSOR_SOUND_PIN, "sound", "Sound Level", 0, 1, true, SOUND_THRESHOLD_MIN, SOUND_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode)
    {
        Serial.println("Sound sensor initialized on pin A0");
    }
#endif

// Magnetic Door/Window Sensor
#if SENSOR_MAGNETIC_ENABLED
    pinMode(SENSOR_MAGNETIC_PIN, INPUT_PULLUP);
    sensors[sensorCount] = {SENSOR_MAGNETIC_PIN, "magnetic", "Door/Window Sensor", 0, 1, true, MAGNETIC_THRESHOLD_MIN, MAGNETIC_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode)
    {
        Serial.println("Magnetic sensor initialized on pin " + String(SENSOR_MAGNETIC_PIN));
    }
#endif

// Vibration Sensor
#if SENSOR_VIBRATION_ENABLED
    pinMode(SENSOR_VIBRATION_PIN, INPUT);
    sensors[sensorCount] = {SENSOR_VIBRATION_PIN, "vibration", "Vibration Sensor", 0, 1, true, VIBRATION_THRESHOLD_MIN, VIBRATION_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode)
    {
        Serial.println("Vibration sensor initialized on pin " + String(SENSOR_VIBRATION_PIN));
    }
#endif

// Gas Sensor
#if SENSOR_GAS_ENABLED
    sensors[sensorCount] = {SENSOR_GAS_PIN, "gas", "Gas Sensor", 0, 1, true, GAS_THRESHOLD_MIN, GAS_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode)
    {
        Serial.println("Gas sensor initialized on pin A0");
    }
#endif

    Serial.print("✅ Total sensors initialized: ");
    Serial.println(sensorCount);
    Serial.println("========================================");
}

/**
 * Initialize sensor filter for moving average
 */
void initializeSensorFilter(int sensorIndex)
{
    SensorFilter *filter = &sensorFilters[sensorIndex];
    filter->readIndex = 0;
    filter->total = 0;
    filter->count = 0;
    filter->lastFiltered = 0;
    filter->initialized = true;

    for (int i = 0; i < FILTER_WINDOW_SIZE; i++)
    {
        filter->readings[i] = 0;
    }
}

/**
 * Apply moving average filter to sensor reading
 * This smooths out short-term spikes and noise
 */
float applyMovingAverageFilter(int sensorIndex, float newValue)
{
    SensorFilter *filter = &sensorFilters[sensorIndex];

    if (!filter->initialized)
    {
        initializeSensorFilter(sensorIndex);
    }

    // Subtract the oldest reading from the total
    filter->total -= filter->readings[filter->readIndex];

    // Add the new reading to the array
    filter->readings[filter->readIndex] = newValue;
    filter->total += newValue;

    // Advance to the next position in the array
    filter->readIndex = (filter->readIndex + 1) % FILTER_WINDOW_SIZE;

    // Increment count until window is full
    if (filter->count < FILTER_WINDOW_SIZE)
    {
        filter->count++;
    }

    // Calculate and store the average
    filter->lastFiltered = filter->total / filter->count;
    return filter->lastFiltered;
}

/**
 * Apply median filter for spike rejection
 * Takes 5 quick readings and returns the median
 */
float applyMedianFilter(int pin, bool isAnalog)
{
    float readings[5];

    for (int i = 0; i < 5; i++)
    {
        if (isAnalog)
        {
            readings[i] = analogRead(pin);
        }
        else
        {
            readings[i] = digitalRead(pin);
        }
        delay(10); // Small delay between readings
    }

    // Simple bubble sort
    for (int i = 0; i < 4; i++)
    {
        for (int j = 0; j < 4 - i; j++)
        {
            if (readings[j] > readings[j + 1])
            {
                float temp = readings[j];
                readings[j] = readings[j + 1];
                readings[j + 1] = temp;
            }
        }
    }

    // Return median (middle value)
    return readings[2];
}

void readAndProcessSensors(bool sendTelemetry)
{
    if (config.debug_mode && sendTelemetry)
    {
        Serial.println("========================================");
        Serial.println("Reading sensors and sending telemetry...");
    }

    StaticJsonDocument<1024> telemetryDoc;
    JsonArray sensorData = telemetryDoc.createNestedArray("sensors");

    for (int i = 0; i < sensorCount; i++)
    {
        if (!sensors[i].enabled)
        {
            if (config.debug_mode)
            {
                Serial.print("Skipping disabled sensor on pin ");
                Serial.println(sensors[i].pin);
            }
            continue;
        }

        float rawValue = 0;
        float filteredValue = 0;
        float processedValue = 0;
        bool hasReading = false;

        // Read sensor based on type with median filtering for analog sensors
        if (sensors[i].type == "light")
        {
            rawValue = applyMedianFilter(sensors[i].pin, true);
            filteredValue = applyMovingAverageFilter(i, rawValue);
            processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
            hasReading = true;
        }
        else if (sensors[i].type == "photodiode")
        {
            rawValue = applyMedianFilter(sensors[i].pin, true);
            filteredValue = applyMovingAverageFilter(i, rawValue);
            processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
            hasReading = true;
        }
        else if (sensors[i].type == "temperature")
        {
#if SENSOR_DHT_ENABLED
            if (dht != nullptr)
            {
                rawValue = dht->readTemperature();
                if (!isnan(rawValue))
                {
                    filteredValue = applyMovingAverageFilter(i, rawValue);
                    processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
                    hasReading = true;
                }
            }
#endif
        }
        else if (sensors[i].type == "humidity")
        {
#if SENSOR_DHT_ENABLED
            if (dht != nullptr)
            {
                rawValue = dht->readHumidity();
                if (!isnan(rawValue))
                {
                    filteredValue = applyMovingAverageFilter(i, rawValue);
                    processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
                    hasReading = true;
                }
            }
#endif
        }
        else if (sensors[i].type == "motion")
        {
            rawValue = digitalRead(sensors[i].pin);
            processedValue = rawValue; // No filtering for binary sensors
            hasReading = true;
        }
        else if (sensors[i].type == "distance")
        {
#if SENSOR_DISTANCE_ENABLED
            if (ultrasonic != nullptr)
            {
                rawValue = ultrasonic->read();
                filteredValue = applyMovingAverageFilter(i, rawValue);
                processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
                hasReading = true;
            }
#endif
        }
        else if (sensors[i].type == "sound")
        {
            rawValue = applyMedianFilter(sensors[i].pin, true);
            filteredValue = applyMovingAverageFilter(i, rawValue);
            processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
            hasReading = true;
        }
        else if (sensors[i].type == "magnetic")
        {
            rawValue = digitalRead(sensors[i].pin);
            processedValue = rawValue; // No filtering for binary sensors
            hasReading = true;
        }
        else if (sensors[i].type == "vibration")
        {
            rawValue = digitalRead(sensors[i].pin);
            processedValue = rawValue; // No filtering for binary sensors
            hasReading = true;
        }
        else if (sensors[i].type == "gas")
        {
            rawValue = applyMedianFilter(sensors[i].pin, true);
            filteredValue = applyMovingAverageFilter(i, rawValue);
            processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
            hasReading = true;
        }

        if (hasReading)
        {
            JsonObject sensor = sensorData.createNestedObject();
            sensor["pin"] = sensors[i].pin;
            sensor["type"] = sensors[i].type;
            sensor["name"] = sensors[i].name;
            sensor["raw_value"] = rawValue;
            sensor["filtered_value"] = filteredValue;
            sensor["processed_value"] = processedValue;
            sensor["timestamp"] = millis() / 1000; // Use uptime in seconds

// Check for threshold crossings with immediate alert
#if THRESHOLD_ALERT_ENABLED
            bool thresholdCrossed = false;
            String alertType = "";

            // Check if crossed above maximum threshold
            if (processedValue > sensors[i].threshold_max && !thresholdStates[i].wasAboveMax)
            {
                thresholdCrossed = true;
                thresholdStates[i].wasAboveMax = true;
                alertType = "above_max";
            }
            // Check if returned below maximum threshold
            else if (processedValue <= sensors[i].threshold_max && thresholdStates[i].wasAboveMax)
            {
                thresholdStates[i].wasAboveMax = false;
            }

            // Check if crossed below minimum threshold
            if (processedValue < sensors[i].threshold_min && !thresholdStates[i].wasBelowMin)
            {
                thresholdCrossed = true;
                thresholdStates[i].wasBelowMin = true;
                alertType = "below_min";
            }
            // Check if returned above minimum threshold
            else if (processedValue >= sensors[i].threshold_min && thresholdStates[i].wasBelowMin)
            {
                thresholdStates[i].wasBelowMin = false;
            }

            // Send immediate alert if threshold crossed
            if (thresholdCrossed && config.armed)
            {
                if (config.debug_mode)
                {
                    Serial.println("!!! THRESHOLD CROSSED: " + sensors[i].name + " " + alertType + " !!!");
                }
                sendImmediateThresholdAlert(i, processedValue, alertType);
            }
#endif

            if (config.debug_mode)
            {
                Serial.print("Sensor " + sensors[i].name + " - Raw: " + String(rawValue));
                if (filteredValue > 0)
                {
                    Serial.print(" | Filtered: " + String(filteredValue));
                }
                Serial.println(" | Processed: " + String(processedValue));
            }
        }
    }

    // Send telemetry data only when scheduled (every 5 seconds)
    if (sendTelemetry && sensorData.size() > 0)
    {
        if (config.debug_mode)
        {
            Serial.print("Sending telemetry for ");
            Serial.print(sensorData.size());
            Serial.println(" sensors");
        }
        sendTelemetryData(telemetryDoc);
    }
    else if (config.debug_mode && !sendTelemetry)
    {
        Serial.println("Sensors read, waiting for next telemetry interval...");
    }
    else
    {
        if (config.debug_mode)
        {
            Serial.println("No sensor data to send");
        }
    }

    if (config.debug_mode)
    {
        Serial.println("========================================");
    }
}

void sendTelemetryData(const JsonDocument &telemetryDoc)
{
    HTTPClient http;
    String endpoint = String(config.server_url) + "/api/devices/" + config.device_id + "/telemetry";

    if (config.debug_mode)
    {
        Serial.print("Sending telemetry to: ");
        Serial.println(endpoint);
    }

#if USE_HTTPS
    if (strlen(SERVER_FINGERPRINT) > 0)
    {
        secureClient.setFingerprint(SERVER_FINGERPRINT);
    }
    else
    {
        secureClient.setInsecure();
    }
    http.begin(secureClient, endpoint);
#else
    http.begin(wifiClient, endpoint);
#endif
    http.addHeader("Content-Type", "application/json");

    String payload;
    serializeJson(telemetryDoc, payload);

    if (config.debug_mode)
    {
        Serial.print("Payload size: ");
        Serial.print(payload.length());
        Serial.println(" bytes");
    }

    int httpCode = http.POST(payload);

    if (config.debug_mode)
    {
        Serial.print("HTTP Response Code: ");
        Serial.println(httpCode);
    }

    if (httpCode != 200)
    {
        Serial.print("⚠️  Telemetry send failed with code: ");
        Serial.println(httpCode);
        if (config.debug_mode && http.getString().length() > 0)
        {
            Serial.print("Response: ");
            Serial.println(http.getString());
        }
    }
    else if (config.debug_mode)
    {
        Serial.println("✅ Telemetry sent successfully");
    }

    http.end();
}

void sendHeartbeat()
{
    if (config.debug_mode)
    {
        Serial.println("========================================");
        Serial.println("Sending heartbeat...");
    }

    HTTPClient http;
    String endpoint = String(config.server_url) + "/api/devices/" + config.device_id + "/heartbeat";
#if USE_HTTPS
    if (strlen(SERVER_FINGERPRINT) > 0)
    {
        secureClient.setFingerprint(SERVER_FINGERPRINT);
    }
    else
    {
        secureClient.setInsecure();
    }
    http.begin(secureClient, endpoint);
#else
    http.begin(wifiClient, endpoint);
#endif
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<512> doc;
    doc["device_id"] = config.device_id;
    doc["device_name"] = DEVICE_NAME;
    doc["device_location"] = DEVICE_LOCATION;
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["uptime"] = millis() / 1000;
    doc["free_heap"] = ESP.getFreeHeap();
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["ip_address"] = WiFi.localIP().toString();
    doc["mac_address"] = WiFi.macAddress();
    doc["config_version"] = config.config_version;
    doc["sensor_count"] = sensorCount;

    String payload;
    serializeJson(doc, payload);

    if (config.debug_mode)
    {
        Serial.println("Sending heartbeat: " + payload);
    }

    int httpCode = http.POST(payload);

    if (httpCode > 0)
    {
        String response = http.getString();
        if (config.debug_mode)
        {
            Serial.print("HTTP Response Code: ");
            Serial.println(httpCode);
            Serial.print("Heartbeat response: ");
            Serial.println(response);
        }

        // Parse response for configuration updates
        parseServerResponse(response);
    }
    else
    {
        Serial.print("⚠️  Heartbeat failed with code: ");
        Serial.println(httpCode);
    }

    http.end();
    lastHeartbeat = millis();

    if (config.debug_mode)
    {
        Serial.println("========================================");
    }
}

void parseServerResponse(const String &response)
{
    StaticJsonDocument<2048> doc; // Increased size for sensor config
    DeserializationError error = deserializeJson(doc, response);

    if (error)
    {
        Serial.println("Failed to parse server response");
        return;
    }

    // Check for configuration updates in "config" object (new format)
    if (doc.containsKey("config"))
    {
        JsonObject configObj = doc["config"];

        // Update sensor configuration from heartbeat response
        if (configObj.containsKey("sensors"))
        {
            JsonArray sensorConfigs = configObj["sensors"];
            if (sensorConfigs.size() > 0)
            {
                Serial.println("========================================");
                Serial.print("Received sensor configuration update with ");
                Serial.print(sensorConfigs.size());
                Serial.println(" sensors");
                updateSensorConfiguration(sensorConfigs);
                Serial.println("========================================");
            }
        }

        // Update other device configs if present
        if (configObj.containsKey("heartbeat_interval"))
        {
            config.heartbeat_interval = configObj["heartbeat_interval"];
            Serial.print("Updated heartbeat interval: ");
            Serial.println(config.heartbeat_interval);
        }

        if (configObj.containsKey("armed"))
        {
            config.armed = configObj["armed"];
            Serial.print("Armed status: ");
            Serial.println(config.armed ? "true" : "false");
        }
    }

    // Legacy format support
    if (doc.containsKey("config_update"))
    {
        JsonObject configUpdate = doc["config_update"];

        bool configChanged = false;

        if (configUpdate.containsKey("heartbeat_interval"))
        {
            config.heartbeat_interval = configUpdate["heartbeat_interval"];
            configChanged = true;
        }

        if (configUpdate.containsKey("armed"))
        {
            config.armed = configUpdate["armed"];
            configChanged = true;
        }

        if (configUpdate.containsKey("debug_mode"))
        {
            config.debug_mode = configUpdate["debug_mode"];
            configChanged = true;
        }

        if (configChanged)
        {
            config.config_version++;
            saveConfiguration();
            Serial.println("Configuration updated from server (legacy format)");
        }
    }

    // Legacy sensor config format
    if (doc.containsKey("sensor_config"))
    {
        JsonArray sensorConfigs = doc["sensor_config"];
        updateSensorConfiguration(sensorConfigs);
    }

    // Check for OTA update request
    if (doc.containsKey("ota_update"))
    {
        JsonObject otaInfo = doc["ota_update"];
        if (config.ota_enabled && otaInfo["version"] != FIRMWARE_VERSION)
        {
            performOTAUpdate(otaInfo["url"].as<String>(), otaInfo["checksum"].as<String>());
        }
    }
}

void updateSensorConfiguration(JsonArray sensorConfigs)
{
    int updatedCount = 0;

    for (int i = 0; i < sensorConfigs.size() && i < MAX_SENSORS; i++)
    {
        JsonObject sensorConfig = sensorConfigs[i];

        if (sensorConfig.containsKey("pin"))
        {
            // Handle both string pins (like "D1") and numeric pins
            String pinStr = sensorConfig["pin"].as<String>();
            int pinNum = -1;

            // Convert pin string to number if needed
            if (pinStr.startsWith("D"))
            {
                pinNum = pinStr.substring(1).toInt();
            }
            else if (pinStr.startsWith("A"))
            {
                pinNum = A0; // Analog pin
            }
            else
            {
                pinNum = pinStr.toInt();
            }

            // Find matching sensor by pin
            bool found = false;
            for (int j = 0; j < sensorCount; j++)
            {
                if (sensors[j].pin == pinNum)
                {
                    found = true;

                    if (config.debug_mode)
                    {
                        Serial.print("Updating sensor on pin ");
                        Serial.print(pinStr);
                        Serial.print(" (");
                        Serial.print(sensors[j].name);
                        Serial.println(")");
                    }

                    if (sensorConfig.containsKey("name"))
                    {
                        const char *nameStr = sensorConfig["name"];
                        if (nameStr != nullptr)
                        {
                            sensors[j].name = nameStr;
                        }
                    }

                    if (sensorConfig.containsKey("threshold_min"))
                    {
                        sensors[j].threshold_min = sensorConfig["threshold_min"];
                    }
                    if (sensorConfig.containsKey("threshold_max"))
                    {
                        sensors[j].threshold_max = sensorConfig["threshold_max"];
                    }
                    if (sensorConfig.containsKey("enabled"))
                    {
                        bool wasEnabled = sensors[j].enabled;
                        sensors[j].enabled = sensorConfig["enabled"];
                        if (wasEnabled != sensors[j].enabled)
                        {
                            Serial.print("  Sensor ");
                            Serial.print(sensors[j].enabled ? "ENABLED" : "DISABLED");
                            Serial.println();
                        }
                    }
                    if (sensorConfig.containsKey("calibration_offset"))
                    {
                        sensors[j].calibration_offset = sensorConfig["calibration_offset"];
                    }
                    if (sensorConfig.containsKey("calibration_multiplier"))
                    {
                        sensors[j].calibration_multiplier = sensorConfig["calibration_multiplier"];
                    }

                    updatedCount++;
                    break;
                }
            }

            if (!found && config.debug_mode)
            {
                Serial.print("Warning: Sensor config received for pin ");
                Serial.print(pinStr);
                Serial.println(" but no matching sensor found in firmware");
            }
        }
    }

    Serial.print("✅ Updated ");
    Serial.print(updatedCount);
    Serial.println(" sensor(s) from server configuration");
}

void performOTAUpdate(const String &firmwareUrl, const String &expectedChecksum)
{
    Serial.println("Starting OTA update from: " + firmwareUrl);

    // Notify server that OTA is starting
    notifyOTAStatus("downloading", 0);

    WiFiClient otaClient;
    ESPhttpUpdate.setLedPin(LED_BUILTIN, LOW);

    // Set progress callback
    ESPhttpUpdate.onProgress([&](int cur, int total)
                             {
        int progress = (cur * 100) / total;
        Serial.printf("OTA Progress: %d%%\n", progress);

        // Update server every 10%
        static int lastReported = -1;
        if (progress - lastReported >= 10) {
            notifyOTAStatus("downloading", progress);
            lastReported = progress;
        } });

    t_httpUpdate_return ret = ESPhttpUpdate.update(otaClient, firmwareUrl);

    switch (ret)
    {
    case HTTP_UPDATE_FAILED:
        Serial.println("OTA Update failed: " + ESPhttpUpdate.getLastErrorString());
        notifyOTAStatus("failed", 0, ESPhttpUpdate.getLastErrorString());
        break;

    case HTTP_UPDATE_NO_UPDATES:
        Serial.println("No OTA updates available");
        notifyOTAStatus("completed", 100);
        break;

    case HTTP_UPDATE_OK:
        Serial.println("OTA Update completed successfully");
        notifyOTAStatus("completed", 100);
        ESP.restart();
        break;
    }
}

void notifyOTAStatus(const String &status, int progress, const String &errorMessage)
{
    HTTPClient http;
    String endpoint = String(config.server_url) + "/api/devices/" + config.device_id + "/ota-status";
#if USE_HTTPS
    if (strlen(SERVER_FINGERPRINT) > 0)
    {
        secureClient.setFingerprint(SERVER_FINGERPRINT);
    }
    else
    {
        secureClient.setInsecure();
    }
    http.begin(secureClient, endpoint);
#else
    http.begin(wifiClient, endpoint);
#endif
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> doc;
    doc["status"] = status;
    doc["progress"] = progress;
    if (errorMessage.length() > 0)
    {
        doc["error_message"] = errorMessage;
    }

    String payload;
    serializeJson(doc, payload);

    http.POST(payload);
    http.end();
}

// Print sensor values to serial console for debugging
void printSensorValuesToConsole()
{
    Serial.println("========================================");
    Serial.println("📊 SENSOR VALUES (5-second snapshot)");
    Serial.print("⏱️  Uptime: ");
    Serial.print(millis() / 1000);
    Serial.println(" seconds");
    Serial.println("========================================");

    bool hasSensors = false;
    for (int i = 0; i < sensorCount; i++)
    {
        if (!sensors[i].enabled)
        {
            continue;
        }

        hasSensors = true;
        float rawValue = 0;
        float processedValue = 0;
        bool hasReading = false;
        String unit = "";

        // Read sensor based on type
        if (sensors[i].type == "light" || sensors[i].type == "photodiode")
        {
            rawValue = analogRead(sensors[i].pin);
            processedValue = (rawValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
            hasReading = true;
            unit = "%";
        }
        else if (sensors[i].type == "temperature")
        {
#if SENSOR_DHT_ENABLED
            if (dht != nullptr)
            {
                rawValue = dht->readTemperature();
                if (!isnan(rawValue))
                {
                    processedValue = (rawValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
                    hasReading = true;
                    unit = "°C";
                }
            }
#endif
        }
        else if (sensors[i].type == "humidity")
        {
#if SENSOR_DHT_ENABLED
            if (dht != nullptr)
            {
                rawValue = dht->readHumidity();
                if (!isnan(rawValue))
                {
                    processedValue = (rawValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
                    hasReading = true;
                    unit = "%";
                }
            }
#endif
        }
        else if (sensors[i].type == "motion")
        {
            rawValue = digitalRead(sensors[i].pin);
            processedValue = rawValue;
            hasReading = true;
            unit = rawValue ? "DETECTED" : "NONE";
        }

        if (hasReading)
        {
            Serial.print("  🔹 ");
            Serial.print(sensors[i].name);
            Serial.print(" (Pin ");
            Serial.print(sensors[i].pin);
            Serial.print(")");
            Serial.println();
            Serial.print("     Raw: ");
            Serial.print(rawValue, 2);
            Serial.print(" | Processed: ");
            Serial.print(processedValue, 2);
            Serial.print(" ");
            Serial.println(unit);
            Serial.print("     Thresholds: ");
            Serial.print(sensors[i].threshold_min, 2);
            Serial.print(" - ");
            Serial.println(sensors[i].threshold_max, 2);
        }
    }

    if (!hasSensors)
    {
        Serial.println("  ⚠️  No enabled sensors configured");
    }

    Serial.println("========================================");
    Serial.println();
}

void sendAlarmEvent(int sensorIndex, float value)
{
    HTTPClient http;
    String endpoint = String(config.server_url) + "/api/devices/" + config.device_id + "/alarm";
#if USE_HTTPS
    if (strlen(SERVER_FINGERPRINT) > 0)
    {
        secureClient.setFingerprint(SERVER_FINGERPRINT);
    }
    else
    {
        secureClient.setInsecure();
    }
    http.begin(secureClient, endpoint);
#else
    http.begin(wifiClient, endpoint);
#endif
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<512> doc;
    doc["device_id"] = config.device_id;
    doc["sensor_pin"] = sensors[sensorIndex].pin;
    doc["sensor_type"] = sensors[sensorIndex].type;
    doc["sensor_name"] = sensors[sensorIndex].name;
    doc["value"] = value;
    doc["threshold_min"] = sensors[sensorIndex].threshold_min;
    doc["threshold_max"] = sensors[sensorIndex].threshold_max;
    doc["alert_type"] = "THRESHOLD_BREACH";
    doc["severity"] = (value > sensors[sensorIndex].threshold_max * 1.5) ? "high" : "medium";

    String message = sensors[sensorIndex].name + " value " + String(value) +
                     " exceeds threshold (" + String(sensors[sensorIndex].threshold_min) +
                     " - " + String(sensors[sensorIndex].threshold_max) + ")";
    doc["message"] = message;

    String payload;
    serializeJson(doc, payload);

    Serial.println("ALARM: " + message);

    int httpCode = http.POST(payload);
    if (httpCode > 0)
    {
        Serial.println("Alarm sent successfully");
    }
    else
    {
        Serial.println("Failed to send alarm");
    }

    http.end();
}

void sendImmediateThresholdAlert(int sensorIndex, float value, const String &alertType)
{
    HTTPClient http;
    String endpoint = String(config.server_url) + "/api/devices/" + config.device_id + "/threshold-alert";

#if USE_HTTPS
    if (strlen(SERVER_FINGERPRINT) > 0)
    {
        secureClient.setFingerprint(SERVER_FINGERPRINT);
    }
    else
    {
        secureClient.setInsecure();
    }
    http.begin(secureClient, endpoint);
#else
    http.begin(wifiClient, endpoint);
#endif
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<512> doc;
    doc["sensor_pin"] = sensors[sensorIndex].pin;
    doc["sensor_type"] = sensors[sensorIndex].type;
    doc["sensor_name"] = sensors[sensorIndex].name;
    doc["value"] = value;
    doc["threshold_min"] = sensors[sensorIndex].threshold_min;
    doc["threshold_max"] = sensors[sensorIndex].threshold_max;
    doc["alert_type"] = alertType; // "above_max" or "below_min"
    doc["timestamp"] = millis() / 1000;

    String payload;
    serializeJson(doc, payload);

    if (config.debug_mode)
    {
        Serial.println("Sending immediate threshold alert:");
        Serial.println(payload);
    }

    int httpCode = http.POST(payload);

    if (httpCode > 0)
    {
        if (config.debug_mode)
        {
            Serial.print("Threshold alert sent - Response code: ");
            Serial.println(httpCode);
        }
    }
    else
    {
        if (config.debug_mode)
        {
            Serial.print("Threshold alert failed - Error: ");
            Serial.println(http.errorToString(httpCode));
        }
    }

    http.end();
}

void connectToWiFi()
{
    WiFi.begin(config.wifi_ssid, config.wifi_password);
    Serial.print("Connecting to WiFi");

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30)
    {
        delay(1000);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED)
    {
        Serial.println();
        Serial.println("========================================");
        Serial.println("     WiFi Connection Established");
        Serial.println("========================================");
        Serial.println("WiFi Network: " + String(config.wifi_ssid));
        Serial.println("Local IP:     " + WiFi.localIP().toString());
        Serial.println("MAC Address:  " + WiFi.macAddress());
        Serial.println("Firmware Ver: " + String(FIRMWARE_VERSION));
        Serial.println("Device ID:    " + String(DEVICE_ID));
        Serial.println("Server URL:   " + String(config.server_url));
        Serial.println("========================================");
    }
    else
    {
        Serial.println();
        Serial.println("Failed to connect to WiFi - restarting");
        delay(5000);
        ESP.restart();
    }
}

void checkForFirmwareUpdate()
{
    HTTPClient http;
    String endpoint = String(config.server_url) + "/api/devices/" + config.device_id + "/ota-check";
#if USE_HTTPS
    if (strlen(SERVER_FINGERPRINT) > 0)
    {
        secureClient.setFingerprint(SERVER_FINGERPRINT);
    }
    else
    {
        secureClient.setInsecure();
    }
    http.begin(secureClient, endpoint);
#else
    http.begin(wifiClient, endpoint);
#endif
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> doc;
    doc["current_version"] = FIRMWARE_VERSION;
    doc["device_type"] = "esp8266";

    String payload;
    serializeJson(doc, payload);

    int httpCode = http.POST(payload);

    if (httpCode == 200)
    {
        String response = http.getString();
        StaticJsonDocument<512> responseDoc;

        if (deserializeJson(responseDoc, response) == DeserializationError::Ok)
        {
            if (responseDoc["update_available"].as<bool>())
            {
                String firmwareUrl = responseDoc["firmware_url"].as<String>();
                String checksum = responseDoc["checksum"].as<String>();

                if (config.debug_mode)
                {
                    Serial.println("Firmware update available: " + firmwareUrl);
                }

                performOTAUpdate(firmwareUrl, checksum);
            }
            else if (config.debug_mode)
            {
                Serial.println("Firmware is up to date");
            }
        }
    }

    http.end();
}

void handleOTAUpdates()
{
    // Check for pending OTA updates in Redis cache
    HTTPClient http;
    String endpoint = String(config.server_url) + "/api/devices/" + config.device_id + "/ota-pending";
#if USE_HTTPS
    if (strlen(SERVER_FINGERPRINT) > 0)
    {
        secureClient.setFingerprint(SERVER_FINGERPRINT);
    }
    else
    {
        secureClient.setInsecure();
    }
    http.begin(secureClient, endpoint);
#else
    http.begin(wifiClient, endpoint);
#endif
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.GET();

    if (httpCode == 200)
    {
        String response = http.getString();
        StaticJsonDocument<512> doc;

        if (deserializeJson(doc, response) == DeserializationError::Ok)
        {
            if (doc["pending_update"].as<bool>())
            {
                String firmwareUrl = doc["firmware_url"].as<String>();
                String checksum = doc["checksum"].as<String>();

                Serial.println("Processing pending OTA update...");
                performOTAUpdate(firmwareUrl, checksum);
            }
        }
    }

    http.end();
}
