#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266httpUpdate.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>
#include <EEPROM.h>
#include <DHT.h>
#include <Ultrasonic.h>

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

// Global variables
DeviceConfig config;
SensorConfig sensors[MAX_SENSORS];
int sensorCount = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastSensorRead = 0;
WiFiClient wifiClient;

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
    // Try to load from EEPROM, otherwise use hardcoded defaults
    EEPROM.get(0, config);

    // Check if configuration is valid (magic number check)
    if (config.config_version == 0 || config.config_version > 1000) {
        // Set default configuration
        strcpy(config.wifi_ssid, "YOUR_WIFI_SSID");
        strcpy(config.wifi_password, "YOUR_WIFI_PASSWORD");
        strcpy(config.server_url, "https://your-server.com");
        strcpy(config.device_id, "ESP8266_001");
        config.heartbeat_interval = 300;
        config.armed = true;
        config.ota_enabled = true;
        config.debug_mode = false;
        config.config_version = 1;

        saveConfiguration();
    }

    if (config.debug_mode) {
        Serial.println("Configuration loaded:");
        Serial.println("Device ID: " + String(config.device_id));
        Serial.println("Heartbeat interval: " + String(config.heartbeat_interval));
        Serial.println("Armed: " + String(config.armed));
    }
}

void saveConfiguration() {
    EEPROM.put(0, config);
    EEPROM.commit();
    Serial.println("Configuration saved to EEPROM");
}

void initializeSensors() {
    // Example sensor configurations - this would be loaded from server
    sensorCount = 0;

    // Photodiode on A0
    sensors[sensorCount] = {A0, "photodiode", "Light Sensor", 0, 1, true, 0, 1024};
    sensorCount++;

    // Temperature/Humidity on D4 (if DHT22 connected)
    if (digitalRead(D4) != -1) {
        dht = new DHT(D4, DHT22);
        dht->begin();

        sensors[sensorCount] = {D4, "temperature", "Temperature", 0, 1, true, -40, 85};
        sensorCount++;

        sensors[sensorCount] = {D4, "humidity", "Humidity", 0, 1, true, 0, 100};
        sensorCount++;
    }

    // Motion sensor on D2
    pinMode(D2, INPUT);
    sensors[sensorCount] = {D2, "motion", "Motion Detector", 0, 1, true, 0, 1};
    sensorCount++;

    // Ultrasonic sensor on D5 (trigger) and D6 (echo)
    ultrasonic = new Ultrasonic(D5, D6);
    sensors[sensorCount] = {D5, "distance", "Distance Sensor", 0, 1, true, 0, 400};
    sensorCount++;
}

void readAndProcessSensors() {
    StaticJsonDocument<1024> telemetryDoc;
    JsonArray sensorData = telemetryDoc.createNestedArray("sensors");

    for (int i = 0; i < sensorCount; i++) {
        if (!sensors[i].enabled) continue;

        float rawValue = 0;
        float processedValue = 0;
        bool hasReading = false;

        // Read sensor based on type
        if (sensors[i].type == "photodiode") {
            rawValue = analogRead(sensors[i].pin);
            processedValue = (rawValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
            hasReading = true;

        } else if (sensors[i].type == "temperature" && dht != nullptr) {
            rawValue = dht->readTemperature();
            if (!isnan(rawValue)) {
                processedValue = (rawValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
                hasReading = true;
            }

        } else if (sensors[i].type == "humidity" && dht != nullptr) {
            rawValue = dht->readHumidity();
            if (!isnan(rawValue)) {
                processedValue = (rawValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
                hasReading = true;
            }

        } else if (sensors[i].type == "motion") {
            rawValue = digitalRead(sensors[i].pin);
            processedValue = rawValue;
            hasReading = true;

        } else if (sensors[i].type == "distance" && ultrasonic != nullptr) {
            rawValue = ultrasonic->read();
            processedValue = (rawValue * sensors[i].calibration_multiplier) + sensors[i].calibration_offset;
            hasReading = true;
        }

        if (hasReading) {
            JsonObject sensor = sensorData.createNestedObject();
            sensor["pin"] = sensors[i].pin;
            sensor["type"] = sensors[i].type;
            sensor["name"] = sensors[i].name;
            sensor["raw_value"] = rawValue;
            sensor["processed_value"] = processedValue;
            sensor["timestamp"] = WiFi.getTime();

            // Check for alarm conditions
            if (config.armed &&
                (processedValue < sensors[i].threshold_min ||
                 processedValue > sensors[i].threshold_max)) {
                sendAlarmEvent(i, processedValue);
            }

            if (config.debug_mode) {
                Serial.println("Sensor " + sensors[i].name + ": " + String(processedValue));
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
    http.begin(wifiClient, String(config.server_url) + "/api/devices/" + config.device_id + "/telemetry");
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
    http.begin(wifiClient, String(config.server_url) + "/api/devices/" + config.device_id + "/heartbeat");
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<512> doc;
    doc["device_id"] = config.device_id;
    doc["firmware_version"] = "2.0.0";
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
        if (config.ota_enabled && otaInfo["version"] != "2.0.0") {
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
    http.begin(wifiClient, String(config.server_url) + "/api/devices/" + config.device_id + "/ota-status");
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
    http.begin(wifiClient, String(config.server_url) + "/api/devices/" + config.device_id + "/alarm");
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
    http.begin(wifiClient, String(config.server_url) + "/api/devices/" + config.device_id + "/ota-check");
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> doc;
    doc["current_version"] = "2.0.0";
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
    http.begin(wifiClient, String(config.server_url) + "/api/devices/" + config.device_id + "/ota-pending");
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