#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266httpUpdate.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>
#include <EEPROM.h>
#include <cstring>
#include <DHT.h>
#include <Ultrasonic.h>
#include "device_config.h"

// Configuration structure
struct DeviceConfig {
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
#define FILTER_WINDOW_SIZE 10  // Moving average window size

struct SensorConfig {
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
struct SensorFilter {
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
WiFiClient wifiClient;
#if USE_HTTPS
WiFiClientSecure secureClient;
#endif

// Hardware instances (initialize based on configuration)
DHT* dht = nullptr;
Ultrasonic* ultrasonic = nullptr;

void setup() {
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
    if (config.ota_enabled) {
        checkForFirmwareUpdate();
    }

    // Send initial heartbeat with device info
    sendHeartbeat();
}

void loop() {
    // Check WiFi connection
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi disconnected, reconnecting...");
        connectToWiFi();
    }

    // Read sensors at regular intervals (every 5 seconds)
    if (millis() - lastSensorRead >= 5000) {
        readAndProcessSensors();
        lastSensorRead = millis();
    }

    // Send heartbeat at configured interval
    if (millis() - lastHeartbeat >= (config.heartbeat_interval * 1000)) {
        sendHeartbeat();
    }

    // Handle any pending OTA updates
    handleOTAUpdates();

    delay(1000);
}

void loadConfiguration() {
    // Use predefined configuration from device_config.h
    strcpy(config.wifi_ssid, WIFI_SSID);
    strcpy(config.wifi_password, WIFI_PASSWORD);
    strcpy(config.server_url, SERVER_URL);
    strcpy(config.device_id, DEVICE_ID);
    config.heartbeat_interval = HEARTBEAT_INTERVAL_SEC;
    config.armed = DEVICE_ARMED;
    config.ota_enabled = OTA_ENABLED;
    config.debug_mode = DEBUG_MODE;
    config.config_version = 2;  // Version 2 uses predefined config

    // Save to EEPROM for runtime updates if needed
    saveConfiguration();

    if (config.debug_mode) {
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

void saveConfiguration() {
    EEPROM.put(0, config);
    EEPROM.commit();
    Serial.println("Configuration saved to EEPROM");
}

void initializeSensors() {
    sensorCount = 0;

    if (config.debug_mode) {
        Serial.println("=== INITIALIZING SENSORS ===");
    }

    // Temperature & Humidity Sensor (DHT)
    #if SENSOR_DHT_ENABLED
    dht = new DHT(SENSOR_DHT_PIN, SENSOR_DHT_TYPE);
    dht->begin();
    pinMode(SENSOR_DHT_PIN, INPUT_PULLUP);

    sensors[sensorCount] = {SENSOR_DHT_PIN, "temperature", "Temperature", 0, 1, true, TEMP_THRESHOLD_MIN, TEMP_THRESHOLD_MAX};
    sensorCount++;

    sensors[sensorCount] = {SENSOR_DHT_PIN, "humidity", "Humidity", 0, 1, true, HUMIDITY_THRESHOLD_MIN, HUMIDITY_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode) {
        Serial.println("DHT sensor initialized on pin " + String(SENSOR_DHT_PIN));
    }
    #endif

    // Light Sensor (Photodiode/LDR)
    #if SENSOR_LIGHT_ENABLED
    sensors[sensorCount] = {SENSOR_LIGHT_PIN, "light", "Light Sensor", LIGHT_CALIBRATION_OFFSET, LIGHT_CALIBRATION_MULTIPLIER, true, LIGHT_THRESHOLD_MIN, LIGHT_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode) {
        Serial.println("Light sensor initialized on pin A0");
    }
    #endif

    // Motion Sensor (PIR)
    #if SENSOR_MOTION_ENABLED
    pinMode(SENSOR_MOTION_PIN, INPUT);
    sensors[sensorCount] = {SENSOR_MOTION_PIN, "motion", "Motion Detector", 0, 1, true, MOTION_THRESHOLD_MIN, MOTION_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode) {
        Serial.println("Motion sensor initialized on pin " + String(SENSOR_MOTION_PIN));
    }
    #endif

    // Distance Sensor (Ultrasonic)
    #if SENSOR_DISTANCE_ENABLED
    ultrasonic = new Ultrasonic(SENSOR_DISTANCE_TRIGGER_PIN, SENSOR_DISTANCE_ECHO_PIN);
    sensors[sensorCount] = {SENSOR_DISTANCE_TRIGGER_PIN, "distance", "Distance Sensor", 0, 1, true, DISTANCE_THRESHOLD_MIN, DISTANCE_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode) {
        Serial.println("Ultrasonic sensor initialized - Trigger: " + String(SENSOR_DISTANCE_TRIGGER_PIN) + ", Echo: " + String(SENSOR_DISTANCE_ECHO_PIN));
    }
    #endif

    // Sound Sensor
    #if SENSOR_SOUND_ENABLED
    sensors[sensorCount] = {SENSOR_SOUND_PIN, "sound", "Sound Level", 0, 1, true, SOUND_THRESHOLD_MIN, SOUND_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode) {
        Serial.println("Sound sensor initialized on pin A0");
    }
    #endif

    // Magnetic Door/Window Sensor
    #if SENSOR_MAGNETIC_ENABLED
    pinMode(SENSOR_MAGNETIC_PIN, INPUT_PULLUP);
    sensors[sensorCount] = {SENSOR_MAGNETIC_PIN, "magnetic", "Door/Window Sensor", 0, 1, true, MAGNETIC_THRESHOLD_MIN, MAGNETIC_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode) {
        Serial.println("Magnetic sensor initialized on pin " + String(SENSOR_MAGNETIC_PIN));
    }
    #endif

    // Vibration Sensor
    #if SENSOR_VIBRATION_ENABLED
    pinMode(SENSOR_VIBRATION_PIN, INPUT);
    sensors[sensorCount] = {SENSOR_VIBRATION_PIN, "vibration", "Vibration Sensor", 0, 1, true, VIBRATION_THRESHOLD_MIN, VIBRATION_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode) {
        Serial.println("Vibration sensor initialized on pin " + String(SENSOR_VIBRATION_PIN));
    }
    #endif

    // Gas Sensor
    #if SENSOR_GAS_ENABLED
    sensors[sensorCount] = {SENSOR_GAS_PIN, "gas", "Gas Sensor", 0, 1, true, GAS_THRESHOLD_MIN, GAS_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode) {
        Serial.println("Gas sensor initialized on pin A0");
    }
    #endif

    if (config.debug_mode) {
        Serial.println("Total sensors initialized: " + String(sensorCount));
        Serial.println("============================");
    }
}

/**
 * Initialize sensor filter for moving average
 */
void initializeSensorFilter(int sensorIndex) {
    SensorFilter* filter = &sensorFilters[sensorIndex];
    filter->readIndex = 0;
    filter->total = 0;
    filter->count = 0;
    filter->lastFiltered = 0;
    filter->initialized = true;

    for (int i = 0; i < FILTER_WINDOW_SIZE; i++) {
        filter->readings[i] = 0;
    }
}

/**
 * Apply moving average filter to sensor reading
 * This smooths out short-term spikes and noise
 */
float applyMovingAverageFilter(int sensorIndex, float newValue) {
    SensorFilter* filter = &sensorFilters[sensorIndex];

    if (!filter->initialized) {
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
    if (filter->count < FILTER_WINDOW_SIZE) {
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
float applyMedianFilter(int pin, bool isAnalog) {
    float readings[5];

    for (int i = 0; i < 5; i++) {
        if (isAnalog) {
            readings[i] = analogRead(pin);
        } else {
            readings[i] = digitalRead(pin);
        }
        delay(10); // Small delay between readings
    }

    // Simple bubble sort
    for (int i = 0; i < 4; i++) {
        for (int j = 0; j < 4 - i; j++) {
            if (readings[j] > readings[j + 1]) {
                float temp = readings[j];
                readings[j] = readings[j + 1];
                readings[j + 1] = temp;
            }
        }
    }

    // Return median (middle value)
    return readings[2];
}

void readAndProcessSensors() {
    StaticJsonDocument<1024> telemetryDoc;
    JsonArray sensorData = telemetryDoc.createNestedArray("sensors");

    for (int i = 0; i < sensorCount; i++) {
        if (!sensors[i].enabled) continue;

        float rawValue = 0;
        float filteredValue = 0;
        float processedValue = 0;
        bool hasReading = false;

        // Read sensor based on type with median filtering for analog sensors
        if (sensors[i].type == "light") {
            rawValue = applyMedianFilter(sensors[i].pin, true);
            filteredValue = applyMovingAverageFilter(i, rawValue);
            processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
            hasReading = true;

        } else if (sensors[i].type == "photodiode") {
            rawValue = applyMedianFilter(sensors[i].pin, true);
            filteredValue = applyMovingAverageFilter(i, rawValue);
            processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
            hasReading = true;

        } else if (sensors[i].type == "temperature" && dht != nullptr) {
            rawValue = dht->readTemperature();
            if (!isnan(rawValue)) {
                filteredValue = applyMovingAverageFilter(i, rawValue);
                processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
                hasReading = true;
            }

        } else if (sensors[i].type == "humidity" && dht != nullptr) {
            rawValue = dht->readHumidity();
            if (!isnan(rawValue)) {
                filteredValue = applyMovingAverageFilter(i, rawValue);
                processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
                hasReading = true;
            }

        } else if (sensors[i].type == "motion") {
            rawValue = digitalRead(sensors[i].pin);
            processedValue = rawValue;  // No filtering for binary sensors
            hasReading = true;

        } else if (sensors[i].type == "distance" && ultrasonic != nullptr) {
            rawValue = ultrasonic->read();
            filteredValue = applyMovingAverageFilter(i, rawValue);
            processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
            hasReading = true;

        } else if (sensors[i].type == "sound") {
            rawValue = applyMedianFilter(sensors[i].pin, true);
            filteredValue = applyMovingAverageFilter(i, rawValue);
            processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
            hasReading = true;

        } else if (sensors[i].type == "magnetic") {
            rawValue = digitalRead(sensors[i].pin);
            processedValue = rawValue;  // No filtering for binary sensors
            hasReading = true;

        } else if (sensors[i].type == "vibration") {
            rawValue = digitalRead(sensors[i].pin);
            processedValue = rawValue;  // No filtering for binary sensors
            hasReading = true;

        } else if (sensors[i].type == "gas") {
            rawValue = applyMedianFilter(sensors[i].pin, true);
            filteredValue = applyMovingAverageFilter(i, rawValue);
            processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
            hasReading = true;
        }

        if (hasReading) {
            JsonObject sensor = sensorData.createNestedObject();
            sensor["pin"] = sensors[i].pin;
            sensor["type"] = sensors[i].type;
            sensor["name"] = sensors[i].name;
            sensor["raw_value"] = rawValue;
            sensor["filtered_value"] = filteredValue;
            sensor["processed_value"] = processedValue;
            sensor["timestamp"] = WiFi.getTime();

            // Check for alarm conditions using filtered/processed value
            if (config.armed &&
                (processedValue < sensors[i].threshold_min ||
                 processedValue > sensors[i].threshold_max)) {
                sendAlarmEvent(i, processedValue);
            }

            if (config.debug_mode) {
                Serial.print("Sensor " + sensors[i].name + " - Raw: " + String(rawValue));
                if (filteredValue > 0) {
                    Serial.print(" | Filtered: " + String(filteredValue));
                }
                Serial.println(" | Processed: " + String(processedValue));
            }
        }
    }

    // Send telemetry data
    if (sensorData.size() > 0) {
        sendTelemetryData(telemetryDoc);
    }
}

void sendTelemetryData(const JsonDocument& telemetryDoc) {
    HTTPClient http;
    String endpoint = String(config.server_url) + "/api/devices/" + config.device_id + "/telemetry";
#if USE_HTTPS
    if (strlen(SERVER_FINGERPRINT) > 0) {
        secureClient.setFingerprint(SERVER_FINGERPRINT);
    } else {
        secureClient.setInsecure();
    }
    http.begin(secureClient, endpoint);
#else
    http.begin(wifiClient, endpoint);
#endif
    http.addHeader("Content-Type", "application/json");

    String payload;
    serializeJson(telemetryDoc, payload);

    int httpCode = http.POST(payload);
    if (httpCode != 200 && config.debug_mode) {
        Serial.println("Telemetry send failed: " + String(httpCode));
    }

    http.end();
}

void sendHeartbeat() {
    HTTPClient http;
    String endpoint = String(config.server_url) + "/api/devices/" + config.device_id + "/heartbeat";
#if USE_HTTPS
    if (strlen(SERVER_FINGERPRINT) > 0) {
        secureClient.setFingerprint(SERVER_FINGERPRINT);
    } else {
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

    if (config.debug_mode) {
        Serial.println("Sending heartbeat: " + payload);
    }

    int httpCode = http.POST(payload);

    if (httpCode > 0) {
        String response = http.getString();
        if (config.debug_mode) {
            Serial.println("Heartbeat response: " + response);
        }

        // Parse response for configuration updates
        parseServerResponse(response);
    }

    http.end();
    lastHeartbeat = millis();
}

void parseServerResponse(const String& response) {
    StaticJsonDocument<1024> doc;
    DeserializationError error = deserializeJson(doc, response);

    if (error) {
        Serial.println("Failed to parse server response");
        return;
    }

    // Check for configuration updates
    if (doc.containsKey("config_update")) {
        JsonObject configUpdate = doc["config_update"];

        bool configChanged = false;

        if (configUpdate.containsKey("heartbeat_interval")) {
            config.heartbeat_interval = configUpdate["heartbeat_interval"];
            configChanged = true;
        }

        if (configUpdate.containsKey("armed")) {
            config.armed = configUpdate["armed"];
            configChanged = true;
        }

        if (configUpdate.containsKey("debug_mode")) {
            config.debug_mode = configUpdate["debug_mode"];
            configChanged = true;
        }

        if (configChanged) {
            config.config_version++;
            saveConfiguration();
            Serial.println("Configuration updated from server");
        }
    }

    // Check for sensor configuration updates
    if (doc.containsKey("sensor_config")) {
        JsonArray sensorConfigs = doc["sensor_config"];
        updateSensorConfiguration(sensorConfigs);
    }

    // Check for OTA update request
    if (doc.containsKey("ota_update")) {
        JsonObject otaInfo = doc["ota_update"];
        if (config.ota_enabled && otaInfo["version"] != FIRMWARE_VERSION) {
            performOTAUpdate(otaInfo["url"].as<String>(), otaInfo["checksum"].as<String>());
        }
    }
}

void updateSensorConfiguration(JsonArray sensorConfigs) {
    for (int i = 0; i < sensorConfigs.size() && i < MAX_SENSORS; i++) {
        JsonObject sensorConfig = sensorConfigs[i];

        if (sensorConfig.containsKey("pin")) {
            int pin = sensorConfig["pin"];

            // Find matching sensor by pin
            for (int j = 0; j < sensorCount; j++) {
                if (sensors[j].pin == pin) {
                    if (sensorConfig.containsKey("threshold_min")) {
                        sensors[j].threshold_min = sensorConfig["threshold_min"];
                    }
                    if (sensorConfig.containsKey("threshold_max")) {
                        sensors[j].threshold_max = sensorConfig["threshold_max"];
                    }
                    if (sensorConfig.containsKey("enabled")) {
                        sensors[j].enabled = sensorConfig["enabled"];
                    }
                    if (sensorConfig.containsKey("calibration_offset")) {
                        sensors[j].calibration_offset = sensorConfig["calibration_offset"];
                    }
                    if (sensorConfig.containsKey("calibration_multiplier")) {
                        sensors[j].calibration_multiplier = sensorConfig["calibration_multiplier"];
                    }
                    break;
                }
            }
        }
    }

    Serial.println("Sensor configuration updated");
}

void performOTAUpdate(const String& firmwareUrl, const String& expectedChecksum) {
    Serial.println("Starting OTA update from: " + firmwareUrl);

    // Notify server that OTA is starting
    notifyOTAStatus("downloading", 0);

    WiFiClient otaClient;
    ESPhttpUpdate.setLedPin(LED_BUILTIN, LOW);

    // Set progress callback
    ESPhttpUpdate.onProgress([](int cur, int total) {
        int progress = (cur * 100) / total;
        Serial.printf("OTA Progress: %d%%\n", progress);

        // Update server every 10%
        static int lastReported = -1;
        if (progress - lastReported >= 10) {
            notifyOTAStatus("downloading", progress);
            lastReported = progress;
        }
    });

    t_httpUpdate_return ret = ESPhttpUpdate.update(otaClient, firmwareUrl);

    switch (ret) {
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

void notifyOTAStatus(const String& status, int progress, const String& errorMessage = "") {
    HTTPClient http;
    String endpoint = String(config.server_url) + "/api/devices/" + config.device_id + "/ota-status";
#if USE_HTTPS
    if (strlen(SERVER_FINGERPRINT) > 0) {
        secureClient.setFingerprint(SERVER_FINGERPRINT);
    } else {
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
    if (errorMessage.length() > 0) {
        doc["error_message"] = errorMessage;
    }

    String payload;
    serializeJson(doc, payload);

    http.POST(payload);
    http.end();
}

void sendAlarmEvent(int sensorIndex, float value) {
    HTTPClient http;
    String endpoint = String(config.server_url) + "/api/devices/" + config.device_id + "/alarm";
#if USE_HTTPS
    if (strlen(SERVER_FINGERPRINT) > 0) {
        secureClient.setFingerprint(SERVER_FINGERPRINT);
    } else {
        secureClient.setInsecure();
    }
    http.begin(secureClient, endpoint);
#else
    http.begin(wifiClient, endpoint);
#endif
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<384> doc;
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
    if (httpCode > 0) {
        Serial.println("Alarm sent successfully");
    } else {
        Serial.println("Failed to send alarm");
    }

    http.end();
}

void connectToWiFi() {
    WiFi.begin(config.wifi_ssid, config.wifi_password);
    Serial.print("Connecting to WiFi");

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(1000);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.println("WiFi connected!");
        Serial.println("IP: " + WiFi.localIP().toString());
        Serial.println("MAC: " + WiFi.macAddress());
    } else {
        Serial.println();
        Serial.println("Failed to connect to WiFi - restarting");
        delay(5000);
        ESP.restart();
    }
}

void checkForFirmwareUpdate() {
    HTTPClient http;
    String endpoint = String(config.server_url) + "/api/devices/" + config.device_id + "/ota-check";
#if USE_HTTPS
    if (strlen(SERVER_FINGERPRINT) > 0) {
        secureClient.setFingerprint(SERVER_FINGERPRINT);
    } else {
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

    if (httpCode == 200) {
        String response = http.getString();
        StaticJsonDocument<512> responseDoc;

        if (deserializeJson(responseDoc, response) == DeserializationError::Ok) {
            if (responseDoc["update_available"].as<bool>()) {
                String firmwareUrl = responseDoc["firmware_url"].as<String>();
                String checksum = responseDoc["checksum"].as<String>();

                if (config.debug_mode) {
                    Serial.println("Firmware update available: " + firmwareUrl);
                }

                performOTAUpdate(firmwareUrl, checksum);
            } else if (config.debug_mode) {
                Serial.println("Firmware is up to date");
            }
        }
    }

    http.end();
}

void handleOTAUpdates() {
    // Check for pending OTA updates in Redis cache
    HTTPClient http;
    String endpoint = String(config.server_url) + "/api/devices/" + config.device_id + "/ota-pending";
#if USE_HTTPS
    if (strlen(SERVER_FINGERPRINT) > 0) {
        secureClient.setFingerprint(SERVER_FINGERPRINT);
    } else {
        secureClient.setInsecure();
    }
    http.begin(secureClient, endpoint);
#else
    http.begin(wifiClient, endpoint);
#endif
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.GET();

    if (httpCode == 200) {
        String response = http.getString();
        StaticJsonDocument<512> doc;

        if (deserializeJson(doc, response) == DeserializationError::Ok) {
            if (doc["pending_update"].as<bool>()) {
                String firmwareUrl = doc["firmware_url"].as<String>();
                String checksum = doc["checksum"].as<String>();

                Serial.println("Processing pending OTA update...");
                performOTAUpdate(firmwareUrl, checksum);
            }
        }
    }

    http.end();
}
