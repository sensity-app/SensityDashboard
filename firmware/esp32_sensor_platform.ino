#include <WiFi.h>
#include <HTTPClient.h>
#include <Update.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>
#include <EEPROM.h>
#include <DHT.h>
#include <cstring>
#include <cstdio>
#if SENSOR_DISTANCE_ENABLED
#include <Ultrasonic.h>
#endif
#include "device_config.h"

#define OTA_CONFIG_CHUNK "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
#define OTA_CONFIG_BLOCK4 OTA_CONFIG_CHUNK OTA_CONFIG_CHUNK OTA_CONFIG_CHUNK OTA_CONFIG_CHUNK
#define OTA_CONFIG_BLOCK8 OTA_CONFIG_BLOCK4 OTA_CONFIG_BLOCK4
#define OTA_CONFIG_BLOCK16 OTA_CONFIG_BLOCK8 OTA_CONFIG_BLOCK8
#define OTA_CONFIG_BLOCK32 OTA_CONFIG_BLOCK16 OTA_CONFIG_BLOCK16

const char OTA_CONFIG_PLACEHOLDER[] =
    "__CONFIG_START__"
    OTA_CONFIG_BLOCK32
    "__CONFIG_END__";

#undef OTA_CONFIG_BLOCK32
#undef OTA_CONFIG_BLOCK16
#undef OTA_CONFIG_BLOCK8
#undef OTA_CONFIG_BLOCK4
#undef OTA_CONFIG_CHUNK

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
#define FILTER_WINDOW_SIZE 10

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
unsigned long lastWiFiCheck = 0;
const unsigned long WIFI_RECONNECT_INTERVAL = 15000; // 15 seconds
WiFiClient wifiClient;
#if USE_HTTPS
WiFiClientSecure secureClient;
#endif

// Hardware instances
DHT* dht = nullptr;
#if SENSOR_DISTANCE_ENABLED
Ultrasonic* ultrasonic = nullptr;
#endif

// Task handles for dual-core processing
TaskHandle_t sensorTaskHandle = NULL;
TaskHandle_t networkTaskHandle = NULL;

// Queue for sensor data
QueueHandle_t sensorDataQueue;

// Forward declarations
void saveConfiguration();
void parseServerResponse(const String& response);
void updateSensorConfiguration(JsonArray sensorConfigs);
void sendAlarmEvent(int sensorIndex, float value);
void notifyOTAStatus(const String& status, int progress, const String& errorMessage = "");
void handleOTAUpdates();
void performOTAUpdate(const String& firmwareUrl, const String& expectedChecksum = "");

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("Starting ESP32 Sensor Platform...");
    Serial.printf("Chip Model: %s\n", ESP.getChipModel());
    Serial.printf("Chip Revision: %d\n", ESP.getChipRevision());
    Serial.printf("CPU Frequency: %d MHz\n", ESP.getCpuFreqMHz());
    Serial.printf("Flash Size: %d bytes\n", ESP.getFlashChipSize());

    // Initialize EEPROM
    EEPROM.begin(1024);

    // Load configuration
    loadConfiguration();

    // Initialize sensors
    initializeSensors();

    // Create queue for sensor data
    sensorDataQueue = xQueueCreate(10, sizeof(String));

    // Connect to WiFi
    connectToWiFi();

    // Create tasks for dual-core processing
    xTaskCreatePinnedToCore(
        sensorTask,           // Task function
        "SensorTask",         // Task name
        10000,                // Stack size
        NULL,                 // Parameters
        1,                    // Priority
        &sensorTaskHandle,    // Task handle
        0                     // Core 0
    );

    xTaskCreatePinnedToCore(
        networkTask,          // Task function
        "NetworkTask",        // Task name
        10000,                // Stack size
        NULL,                 // Parameters
        1,                    // Priority
        &networkTaskHandle,   // Task handle
        1                     // Core 1
    );

    // Check for firmware updates
    if (config.ota_enabled) {
        checkForFirmwareUpdate();
    }

    // Send initial heartbeat
    sendHeartbeat();
}

void loop() {
    // Main loop can be used for other tasks
    vTaskDelay(100 / portTICK_PERIOD_MS);
}

// Sensor task running on Core 0
void sensorTask(void *parameter) {
    while (true) {
        if (millis() - lastSensorRead >= SENSOR_READ_INTERVAL_MS) {
            String sensorData = readAllSensors();
            xQueueSend(sensorDataQueue, &sensorData, portMAX_DELAY);
            lastSensorRead = millis();
        }
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

// Network task running on Core 1
void networkTask(void *parameter) {
    while (true) {
        // Check WiFi connection every 15 seconds
        if (millis() - lastWiFiCheck >= WIFI_RECONNECT_INTERVAL) {
            if (WiFi.status() != WL_CONNECTED) {
                Serial.println("========================================");
                Serial.println("WiFi disconnected! Attempting reconnection...");
                Serial.println("========================================");
                connectToWiFi();
            } else {
                if (config.debug_mode) {
                    Serial.println("WiFi status check: Connected");
                    Serial.printf("Signal strength: %d dBm\n", WiFi.RSSI());
                }
            }
            lastWiFiCheck = millis();
        }

        // Only perform network operations if WiFi is connected
        if (WiFi.status() == WL_CONNECTED) {
            // Process sensor data from queue
            String sensorData;
            if (xQueueReceive(sensorDataQueue, &sensorData, 0) == pdTRUE) {
                if (sensorData.length() > 0) {
                    sendTelemetryData(sensorData);
                }
            }

            // Send heartbeat
            if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL_SEC * 1000) {
                sendHeartbeat();
            }

            if (config.ota_enabled) {
                handleOTAUpdates();
            }
        } else {
            // Log warning if disconnected for too long
            if (config.debug_mode && (millis() - lastWiFiCheck) % 30000 < 1000) {
                Serial.println("WARNING: WiFi still disconnected, waiting for reconnection...");
            }
        }

        vTaskDelay(100 / portTICK_PERIOD_MS);
    }
}

void loadConfiguration() {
    snprintf(config.device_id, sizeof(config.device_id), "%s", DEVICE_ID);
    snprintf(config.wifi_ssid, sizeof(config.wifi_ssid), "%s", WIFI_SSID);
    snprintf(config.wifi_password, sizeof(config.wifi_password), "%s", WIFI_PASSWORD);
    snprintf(config.server_url, sizeof(config.server_url), "%s", SERVER_URL);
    config.heartbeat_interval = HEARTBEAT_INTERVAL_SEC;
    config.armed = DEVICE_ARMED;
    config.ota_enabled = OTA_ENABLED;
    config.debug_mode = DEBUG_MODE;
    config.config_version = 2;

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

    if (config.debug_mode) {
        Serial.println("DHT sensor initialized on pin " + String(SENSOR_DHT_PIN));
    }
    #endif

    // Light Sensor (Photodiode/LDR)
    #if SENSOR_LIGHT_ENABLED
    pinMode(SENSOR_LIGHT_PIN, INPUT);
    sensors[sensorCount] = {SENSOR_LIGHT_PIN, "light", "Light Sensor", LIGHT_CALIBRATION_OFFSET, LIGHT_CALIBRATION_MULTIPLIER, true, LIGHT_THRESHOLD_MIN, LIGHT_THRESHOLD_MAX};
    sensorCount++;

    if (config.debug_mode) {
        Serial.println("Light sensor initialized on pin " + String(SENSOR_LIGHT_PIN));
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
        Serial.println("Sound sensor initialized on pin " + String(SENSOR_SOUND_PIN));
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
        Serial.println("Gas sensor initialized on pin " + String(SENSOR_GAS_PIN));
    }
    #endif

    Serial.print("✅ Total sensors initialized: ");
    Serial.println(sensorCount);
    Serial.println("========================================");
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

    filter->total -= filter->readings[filter->readIndex];
    filter->readings[filter->readIndex] = newValue;
    filter->total += newValue;

    filter->readIndex = (filter->readIndex + 1) % FILTER_WINDOW_SIZE;

    if (filter->count < FILTER_WINDOW_SIZE) {
        filter->count++;
    }

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
        readings[i] = isAnalog ? analogRead(pin) : digitalRead(pin);
        delay(10);
    }

    for (int i = 0; i < 4; i++) {
        for (int j = 0; j < 4 - i; j++) {
            if (readings[j] > readings[j + 1]) {
                float temp = readings[j];
                readings[j] = readings[j + 1];
                readings[j + 1] = temp;
            }
        }
    }

    return readings[2];
}

void connectToWiFi() {
    Serial.printf("Connecting to WiFi: %s\n", config.wifi_ssid);
    WiFi.mode(WIFI_STA);
    WiFi.begin(config.wifi_ssid, config.wifi_password);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < WIFI_RECONNECT_ATTEMPTS) {
        delay(WIFI_RECONNECT_DELAY_MS);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi connected!");
        Serial.printf("IP Address: %s\n", WiFi.localIP().toString().c_str());
        Serial.printf("Signal Strength: %d dBm\n", WiFi.RSSI());
    } else {
        Serial.println("\nWiFi connection failed!");
    }
}

String readAllSensors() {
    if (config.debug_mode) {
        Serial.println("========================================");
        Serial.println("Reading sensors...");
    }

    StaticJsonDocument<1024> telemetryDoc;
    JsonArray sensorData = telemetryDoc.createNestedArray("sensors");

    for (int i = 0; i < sensorCount; i++) {
        if (!sensors[i].enabled) {
            if (config.debug_mode) {
                Serial.print("Skipping disabled sensor on pin ");
                Serial.println(sensors[i].pin);
            }
            continue;
        }

        float rawValue = 0;
        float filteredValue = 0;
        float processedValue = 0;
        bool hasReading = false;

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

        } else if (sensors[i].type == "temperature") {
    #if SENSOR_DHT_ENABLED
            if (dht != nullptr) {
                rawValue = dht->readTemperature();
                if (!isnan(rawValue)) {
                    filteredValue = applyMovingAverageFilter(i, rawValue);
                    processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
                    hasReading = true;
                }
            }
    #endif

        } else if (sensors[i].type == "humidity") {
    #if SENSOR_DHT_ENABLED
            if (dht != nullptr) {
                rawValue = dht->readHumidity();
                if (!isnan(rawValue)) {
                    filteredValue = applyMovingAverageFilter(i, rawValue);
                    processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
                    hasReading = true;
                }
            }
    #endif

        } else if (sensors[i].type == "motion") {
            rawValue = digitalRead(sensors[i].pin);
            processedValue = rawValue;
            hasReading = true;

        } else if (sensors[i].type == "distance") {
    #if SENSOR_DISTANCE_ENABLED
            if (ultrasonic != nullptr) {
                rawValue = ultrasonic->read();
                filteredValue = applyMovingAverageFilter(i, rawValue);
                processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
                hasReading = true;
            }
    #endif

        } else if (sensors[i].type == "sound") {
            rawValue = applyMedianFilter(sensors[i].pin, true);
            filteredValue = applyMovingAverageFilter(i, rawValue);
            processedValue = (filteredValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
            hasReading = true;

        } else if (sensors[i].type == "magnetic") {
            rawValue = digitalRead(sensors[i].pin);
            processedValue = rawValue;
            hasReading = true;

        } else if (sensors[i].type == "vibration") {
            rawValue = digitalRead(sensors[i].pin);
            processedValue = rawValue;
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
            sensor["timestamp"] = millis() / 1000;

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

    if (config.debug_mode) {
        if (sensorData.size() == 0) {
            Serial.println("No sensor data to send");
        }
        Serial.println("========================================");
    }

    if (sensorData.size() == 0) {
        return "";
    }

    String payload;
    serializeJson(telemetryDoc, payload);
    return payload;
}

void sendTelemetryData(const String& payload) {
    if (WiFi.status() != WL_CONNECTED || payload.length() == 0) {
        return;
    }

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

    if (config.debug_mode) {
        Serial.print("Sending telemetry to: ");
        Serial.println(endpoint);
        Serial.print("Payload size: ");
        Serial.print(payload.length());
        Serial.println(" bytes");
    }

    int httpCode = http.POST(payload);

    if (config.debug_mode) {
        Serial.print("HTTP Response Code: ");
        Serial.println(httpCode);
    }

    if (httpCode != 200) {
        Serial.print("⚠️  Telemetry send failed with code: ");
        Serial.println(httpCode);
        if (config.debug_mode && http.getString().length() > 0) {
            Serial.print("Response: ");
            Serial.println(http.getString());
        }
    } else if (config.debug_mode) {
        Serial.println("✅ Telemetry sent successfully");
    }

    http.end();
}

void sendHeartbeat() {
    if (WiFi.status() != WL_CONNECTED) {
        return;
    }

    if (config.debug_mode) {
        Serial.println("========================================");
        Serial.println("Sending heartbeat...");
    }

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
            Serial.print("HTTP Response Code: ");
            Serial.println(httpCode);
            Serial.print("Heartbeat response: ");
            Serial.println(response);
        }

        if (httpCode == 200 && response.length() > 0) {
            parseServerResponse(response);
        }
    } else {
        Serial.print("⚠️  Heartbeat failed with code: ");
        Serial.println(httpCode);
    }

    http.end();
    lastHeartbeat = millis();

    if (config.debug_mode) {
        Serial.println("========================================");
    }
}

void checkForFirmwareUpdate() {
    if (!config.ota_enabled || WiFi.status() != WL_CONNECTED) {
        return;
    }

    Serial.println("Checking for firmware updates...");

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
    doc["device_type"] = "esp32";

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
    static unsigned long lastCheck = 0;
    const unsigned long OTA_CHECK_INTERVAL = 60000; // 60 seconds

    if (!config.ota_enabled || WiFi.status() != WL_CONNECTED) {
        return;
    }

    if (millis() - lastCheck < OTA_CHECK_INTERVAL) {
        return;
    }
    lastCheck = millis();

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

void notifyOTAStatus(const String& status, int progress, const String& errorMessage) {
    if (WiFi.status() != WL_CONNECTED) {
        return;
    }

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

void performOTAUpdate(const String& firmwareUrl, const String& expectedChecksum) {
    Serial.println("Starting OTA update from: " + firmwareUrl);

    notifyOTAStatus("downloading", 0);

    HTTPClient http;
#if USE_HTTPS
    WiFiClientSecure otaClient;
    if (strlen(SERVER_FINGERPRINT) > 0) {
        otaClient.setFingerprint(SERVER_FINGERPRINT);
    } else {
        otaClient.setInsecure();
    }
    if (!http.begin(otaClient, firmwareUrl)) {
        Serial.println("Failed to initiate OTA request");
        notifyOTAStatus("failed", 0, "Failed to initiate OTA request");
        return;
    }
#else
    WiFiClient otaClient;
    if (!http.begin(otaClient, firmwareUrl)) {
        Serial.println("Failed to initiate OTA request");
        notifyOTAStatus("failed", 0, "Failed to initiate OTA request");
        return;
    }
#endif

    int httpCode = http.GET();

    if (httpCode != HTTP_CODE_OK) {
        Serial.print("OTA HTTP request failed with code: ");
        Serial.println(httpCode);
        notifyOTAStatus("failed", 0, "HTTP error " + String(httpCode));
        http.end();
        return;
    }

    int contentLength = http.getSize();
    if (contentLength <= 0) {
        Serial.println("Invalid OTA content length");
        notifyOTAStatus("failed", 0, "Invalid content length");
        http.end();
        return;
    }

    if (!Update.begin(contentLength)) {
        Serial.println("Not enough space for OTA update");
        notifyOTAStatus("failed", 0, "Not enough space for OTA");
        http.end();
        return;
    }

    if (expectedChecksum.length() == 32) {
        Update.setMD5(expectedChecksum.c_str());
    }

    Update.onProgress([](size_t progress, size_t total) {
        if (total == 0) {
            return;
        }
        int percent = (progress * 100) / total;
        static int lastReported = -1;
        if (percent - lastReported >= 10) {
            notifyOTAStatus("downloading", percent);
            lastReported = percent;
        }
    });

    WiFiClient* stream = http.getStreamPtr();
    size_t written = Update.writeStream(*stream);

    if (written != (size_t)contentLength) {
        Serial.println("OTA write incomplete");
        notifyOTAStatus("failed", 0, "Incomplete OTA write");
        Update.abort();
        http.end();
        return;
    }

    if (!Update.end()) {
        Serial.printf("OTA update failed: %d\n", Update.getError());
        notifyOTAStatus("failed", 0, "Update end failed");
        http.end();
        return;
    }

    if (!Update.isFinished()) {
        Serial.println("OTA update not finished");
        notifyOTAStatus("failed", 0, "Update not finished");
        http.end();
        return;
    }

    notifyOTAStatus("completed", 100);
    Serial.println("OTA Update completed successfully");
    http.end();
    ESP.restart();
}

void sendAlarmEvent(int sensorIndex, float value) {
    if (WiFi.status() != WL_CONNECTED) {
        return;
    }

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

void parseServerResponse(const String& response) {
    StaticJsonDocument<2048> doc;
    DeserializationError error = deserializeJson(doc, response);

    if (error) {
        Serial.println("Failed to parse server response");
        return;
    }

    if (doc.containsKey("config")) {
        JsonObject configObj = doc["config"];

        if (configObj.containsKey("sensors")) {
            JsonArray sensorConfigs = configObj["sensors"];
            if (sensorConfigs.size() > 0) {
                Serial.println("========================================");
                Serial.print("Received sensor configuration update with ");
                Serial.print(sensorConfigs.size());
                Serial.println(" sensors");
                updateSensorConfiguration(sensorConfigs);
                Serial.println("========================================");
            }
        }

        if (configObj.containsKey("heartbeat_interval")) {
            config.heartbeat_interval = configObj["heartbeat_interval"];
            Serial.print("Updated heartbeat interval: ");
            Serial.println(config.heartbeat_interval);
        }

        if (configObj.containsKey("armed")) {
            config.armed = configObj["armed"];
            Serial.print("Armed status: ");
            Serial.println(config.armed ? "true" : "false");
        }
    }

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
            Serial.println("Configuration updated from server (legacy format)");
        }
    }

    if (doc.containsKey("sensor_config")) {
        JsonArray sensorConfigs = doc["sensor_config"];
        updateSensorConfiguration(sensorConfigs);
    }

    if (doc.containsKey("ota_update")) {
        JsonObject otaInfo = doc["ota_update"];
        if (config.ota_enabled && otaInfo["version"] != FIRMWARE_VERSION) {
            performOTAUpdate(otaInfo["url"].as<String>(), otaInfo["checksum"].as<String>());
        }
    }
}

void updateSensorConfiguration(JsonArray sensorConfigs) {
    int updatedCount = 0;

    for (int i = 0; i < sensorConfigs.size() && i < MAX_SENSORS; i++) {
        JsonObject sensorConfig = sensorConfigs[i];

        if (sensorConfig.containsKey("pin")) {
            String pinStr = sensorConfig["pin"].as<String>();
            int pinNum = -1;

            if (pinStr.startsWith("GPIO")) {
                pinNum = pinStr.substring(4).toInt();
            } else if (pinStr.startsWith("D")) {
                pinNum = pinStr.substring(1).toInt();
            } else if (pinStr.startsWith("A")) {
                pinNum = A0;
            } else {
                pinNum = pinStr.toInt();
            }

            bool found = false;
            for (int j = 0; j < sensorCount; j++) {
                if (sensors[j].pin == pinNum) {
                    found = true;

                    if (config.debug_mode) {
                        Serial.print("Updating sensor on pin ");
                        Serial.print(pinStr);
                        Serial.print(" (");
                        Serial.print(sensors[j].name);
                        Serial.println(")");
                    }

                    if (sensorConfig.containsKey("name")) {
                        const char* nameStr = sensorConfig["name"];
                        if (nameStr != nullptr) {
                            sensors[j].name = nameStr;
                        }
                    }

                    if (sensorConfig.containsKey("threshold_min")) {
                        sensors[j].threshold_min = sensorConfig["threshold_min"];
                    }
                    if (sensorConfig.containsKey("threshold_max")) {
                        sensors[j].threshold_max = sensorConfig["threshold_max"];
                    }
                    if (sensorConfig.containsKey("enabled")) {
                        bool wasEnabled = sensors[j].enabled;
                        sensors[j].enabled = sensorConfig["enabled"];
                        if (wasEnabled != sensors[j].enabled) {
                            Serial.print("  Sensor ");
                            Serial.print(sensors[j].enabled ? "ENABLED" : "DISABLED");
                            Serial.println();
                        }
                    }
                    if (sensorConfig.containsKey("calibration_offset")) {
                        sensors[j].calibration_offset = sensorConfig["calibration_offset"];
                    }
                    if (sensorConfig.containsKey("calibration_multiplier")) {
                        sensors[j].calibration_multiplier = sensorConfig["calibration_multiplier"];
                    }

                    updatedCount++;
                    break;
                }
            }

            if (!found && config.debug_mode) {
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
