#include <WiFi.h>
#include <HTTPClient.h>
#include <Update.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>
#include <EEPROM.h>
#include <DHT.h>
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

// Task handles for dual-core processing
TaskHandle_t sensorTaskHandle = NULL;
TaskHandle_t networkTaskHandle = NULL;

// Queue for sensor data
QueueHandle_t sensorDataQueue;

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
        if (config.armed && (millis() - lastSensorRead >= SENSOR_READ_INTERVAL_MS)) {
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
                sendSensorData(sensorData);
            }

            // Send heartbeat
            if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL_SEC * 1000) {
                sendHeartbeat();
                lastHeartbeat = millis();
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
    strncpy(config.device_id, DEVICE_ID, sizeof(config.device_id));
    strncpy(config.wifi_ssid, WIFI_SSID, sizeof(config.wifi_ssid));
    strncpy(config.wifi_password, WIFI_PASSWORD, sizeof(config.wifi_password));
    strncpy(config.server_url, SERVER_URL, sizeof(config.server_url));
    config.heartbeat_interval = HEARTBEAT_INTERVAL_SEC;
    config.armed = DEVICE_ARMED;
    config.ota_enabled = OTA_ENABLED;
    config.debug_mode = DEBUG_MODE;

    Serial.println("Configuration loaded:");
    Serial.printf("Device ID: %s\n", config.device_id);
    Serial.printf("WiFi SSID: %s\n", config.wifi_ssid);
    Serial.printf("Server URL: %s\n", config.server_url);
}

void initializeSensors() {
    Serial.println("Initializing sensors...");

    #if SENSOR_DHT_ENABLED
    dht = new DHT(SENSOR_DHT_PIN, SENSOR_DHT_TYPE);
    dht->begin();
    sensors[sensorCount++] = {SENSOR_DHT_PIN, "temperature_humidity", "DHT22", 0, 1, true, TEMP_THRESHOLD_MIN, TEMP_THRESHOLD_MAX};
    Serial.printf("DHT22 initialized on pin %d\n", SENSOR_DHT_PIN);
    #endif

    #if SENSOR_LIGHT_ENABLED
    pinMode(SENSOR_LIGHT_PIN, INPUT);
    sensors[sensorCount++] = {SENSOR_LIGHT_PIN, "light", "Light Sensor", LIGHT_CALIBRATION_OFFSET, LIGHT_CALIBRATION_MULTIPLIER, true, LIGHT_THRESHOLD_MIN, LIGHT_THRESHOLD_MAX};
    Serial.printf("Light sensor initialized on pin %d\n", SENSOR_LIGHT_PIN);
    #endif

    #if SENSOR_MOTION_ENABLED
    pinMode(SENSOR_MOTION_PIN, INPUT);
    sensors[sensorCount++] = {SENSOR_MOTION_PIN, "motion", "Motion Sensor", 0, 1, true, MOTION_THRESHOLD_MIN, MOTION_THRESHOLD_MAX};
    Serial.printf("Motion sensor initialized on pin %d\n", SENSOR_MOTION_PIN);
    #endif

    Serial.printf("Total sensors initialized: %d\n", sensorCount);
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
    DynamicJsonDocument doc(2048);
    JsonArray data = doc.createNestedArray("data");

    for (int i = 0; i < sensorCount; i++) {
        if (!sensors[i].enabled) continue;

        JsonObject reading = data.createNestedObject();
        reading["sensor_type"] = sensors[i].type;
        reading["sensor_name"] = sensors[i].name;
        reading["timestamp"] = millis();

        if (sensors[i].type == "temperature_humidity" && dht) {
            float temp = dht->readTemperature();
            float humidity = dht->readHumidity();

            if (!isnan(temp) && !isnan(humidity)) {
                reading["temperature"] = temp;
                reading["humidity"] = humidity;
            }
        } else if (sensors[i].type == "light") {
            int rawValue = analogRead(sensors[i].pin);
            float calibrated = (rawValue + sensors[i].calibration_offset) * sensors[i].calibration_multiplier;
            reading["value"] = calibrated;
            reading["raw_value"] = rawValue;
        } else if (sensors[i].type == "motion") {
            reading["value"] = digitalRead(sensors[i].pin);
        }
    }

    String output;
    serializeJson(doc, output);
    return output;
}

void sendSensorData(String data) {
    if (WiFi.status() != WL_CONNECTED) return;

    HTTPClient http;
    String url = String(config.server_url) + "/api/sensor-data";

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-ID", config.device_id);
    http.addHeader("X-API-Key", SERVER_API_KEY);

    int httpCode = http.POST(data);

    if (httpCode > 0) {
        if (config.debug_mode) {
            Serial.printf("Sensor data sent. Response: %d\n", httpCode);
        }
    } else {
        Serial.printf("Failed to send sensor data: %s\n", http.errorToString(httpCode).c_str());
    }

    http.end();
}

void sendHeartbeat() {
    if (WiFi.status() != WL_CONNECTED) return;

    HTTPClient http;
    String url = String(config.server_url) + "/api/heartbeat";

    DynamicJsonDocument doc(512);
    doc["device_id"] = config.device_id;
    doc["uptime"] = millis() / 1000;
    doc["free_heap"] = ESP.getFreeHeap();
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["chip_model"] = ESP.getChipModel();

    String payload;
    serializeJson(doc, payload);

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-ID", config.device_id);
    http.addHeader("X-API-Key", SERVER_API_KEY);

    int httpCode = http.POST(payload);

    if (httpCode > 0) {
        Serial.printf("Heartbeat sent. Response: %d\n", httpCode);
    } else {
        Serial.printf("Heartbeat failed: %s\n", http.errorToString(httpCode).c_str());
    }

    http.end();
}

void checkForFirmwareUpdate() {
    Serial.println("Checking for firmware updates...");

    HTTPClient http;
    String url = String(config.server_url) + "/api/firmware/check?device_id=" + String(config.device_id) + "&version=" + FIRMWARE_VERSION;

    http.begin(url);
    int httpCode = http.GET();

    if (httpCode == 200) {
        String payload = http.getString();
        DynamicJsonDocument doc(512);
        deserializeJson(doc, payload);

        if (doc["update_available"].as<bool>()) {
            String updateUrl = doc["download_url"].as<String>();
            Serial.printf("Update available! Downloading from: %s\n", updateUrl.c_str());
            performOTAUpdate(updateUrl);
        } else {
            Serial.println("Firmware is up to date.");
        }
    }

    http.end();
}

void performOTAUpdate(String url) {
    Serial.println("Starting OTA update...");

    HTTPClient http;
    http.begin(url);
    int httpCode = http.GET();

    if (httpCode == 200) {
        int contentLength = http.getSize();

        if (Update.begin(contentLength)) {
            WiFiClient *stream = http.getStreamPtr();
            size_t written = Update.writeStream(*stream);

            if (written == contentLength) {
                Serial.println("OTA update written successfully");
            }

            if (Update.end()) {
                if (Update.isFinished()) {
                    Serial.println("OTA update completed. Rebooting...");
                    ESP.restart();
                }
            } else {
                Serial.printf("OTA update failed: %d\n", Update.getError());
            }
        }
    }

    http.end();
}
