#include <ArduinoJson.h>
#include <EEPROM.h>
#include <DHT.h>
#include "device_config.h"

// Configuration structure
struct DeviceConfig {
    char device_id[32];
    int heartbeat_interval;
    bool armed;
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

// Hardware instances
DHT* dht = nullptr;

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println(F("Starting Arduino Sensor Platform..."));
    Serial.print(F("Device ID: "));
    Serial.println(DEVICE_ID);

    // Load configuration
    loadConfiguration();

    // Initialize sensors
    initializeSensors();

    // Send initial status
    sendStatus();

    Serial.println(F("Setup complete. Waiting for commands..."));
}

void loop() {
    // Check for serial commands
    if (Serial.available() > 0) {
        processSerialCommand();
    }

    // Read sensors at configured interval
    if (config.armed && (millis() - lastSensorRead >= SENSOR_READ_INTERVAL_MS)) {
        String sensorData = readAllSensors();
        sendSensorData(sensorData);
        lastSensorRead = millis();
    }

    // Send heartbeat
    if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL_SEC * 1000UL) {
        sendHeartbeat();
        lastHeartbeat = millis();
    }

    delay(10);
}

void loadConfiguration() {
    strncpy(config.device_id, DEVICE_ID, sizeof(config.device_id));
    config.heartbeat_interval = HEARTBEAT_INTERVAL_SEC;
    config.armed = DEVICE_ARMED;
    config.debug_mode = DEBUG_MODE;

    if (config.debug_mode) {
        Serial.println(F("Configuration loaded:"));
        Serial.print(F("Device ID: "));
        Serial.println(config.device_id);
        Serial.print(F("Heartbeat Interval: "));
        Serial.println(config.heartbeat_interval);
    }
}

void initializeSensors() {
    Serial.println(F("Initializing sensors..."));

    #if SENSOR_DHT_ENABLED
    dht = new DHT(SENSOR_DHT_PIN, SENSOR_DHT_TYPE);
    dht->begin();
    sensors[sensorCount++] = {SENSOR_DHT_PIN, "temperature_humidity", "DHT22", 0, 1, true, TEMP_THRESHOLD_MIN, TEMP_THRESHOLD_MAX};
    Serial.print(F("DHT22 initialized on pin "));
    Serial.println(SENSOR_DHT_PIN);
    #endif

    #if SENSOR_LIGHT_ENABLED
    pinMode(SENSOR_LIGHT_PIN, INPUT);
    sensors[sensorCount++] = {SENSOR_LIGHT_PIN, "light", "Light Sensor", LIGHT_CALIBRATION_OFFSET, LIGHT_CALIBRATION_MULTIPLIER, true, LIGHT_THRESHOLD_MIN, LIGHT_THRESHOLD_MAX};
    Serial.print(F("Light sensor initialized on pin "));
    Serial.println(SENSOR_LIGHT_PIN);
    #endif

    #if SENSOR_MOTION_ENABLED
    pinMode(SENSOR_MOTION_PIN, INPUT);
    sensors[sensorCount++] = {SENSOR_MOTION_PIN, "motion", "Motion Sensor", 0, 1, true, MOTION_THRESHOLD_MIN, MOTION_THRESHOLD_MAX};
    Serial.print(F("Motion sensor initialized on pin "));
    Serial.println(SENSOR_MOTION_PIN);
    #endif

    #if SENSOR_DISTANCE_ENABLED
    pinMode(SENSOR_DISTANCE_TRIGGER_PIN, OUTPUT);
    pinMode(SENSOR_DISTANCE_ECHO_PIN, INPUT);
    sensors[sensorCount++] = {SENSOR_DISTANCE_TRIGGER_PIN, "distance", "Ultrasonic Sensor", 0, 1, true, DISTANCE_THRESHOLD_MIN, DISTANCE_THRESHOLD_MAX};
    Serial.print(F("Distance sensor initialized on pins "));
    Serial.print(SENSOR_DISTANCE_TRIGGER_PIN);
    Serial.print(F(" and "));
    Serial.println(SENSOR_DISTANCE_ECHO_PIN);
    #endif

    #if SENSOR_MAGNETIC_ENABLED
    pinMode(SENSOR_MAGNETIC_PIN, INPUT_PULLUP);
    sensors[sensorCount++] = {SENSOR_MAGNETIC_PIN, "magnetic", "Magnetic Sensor", 0, 1, true, 0, 1};
    Serial.print(F("Magnetic sensor initialized on pin "));
    Serial.println(SENSOR_MAGNETIC_PIN);
    #endif

    #if SENSOR_VIBRATION_ENABLED
    pinMode(SENSOR_VIBRATION_PIN, INPUT);
    sensors[sensorCount++] = {SENSOR_VIBRATION_PIN, "vibration", "Vibration Sensor", 0, 1, true, 0, 1};
    Serial.print(F("Vibration sensor initialized on pin "));
    Serial.println(SENSOR_VIBRATION_PIN);
    #endif

    Serial.print(F("Total sensors initialized: "));
    Serial.println(sensorCount);
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

                // Check thresholds
                if (temp < sensors[i].threshold_min || temp > sensors[i].threshold_max) {
                    reading["alert"] = "temperature_threshold";
                }
            }
        } else if (sensors[i].type == "light") {
            int rawValue = analogRead(sensors[i].pin);
            float calibrated = (rawValue + sensors[i].calibration_offset) * sensors[i].calibration_multiplier;
            reading["value"] = calibrated;
            reading["raw_value"] = rawValue;

            if (calibrated < sensors[i].threshold_min || calibrated > sensors[i].threshold_max) {
                reading["alert"] = "light_threshold";
            }
        } else if (sensors[i].type == "motion") {
            int motionValue = digitalRead(sensors[i].pin);
            reading["value"] = motionValue;
            if (motionValue == HIGH) {
                reading["alert"] = "motion_detected";
            }
        } else if (sensors[i].type == "distance") {
            float distance = measureDistance(SENSOR_DISTANCE_TRIGGER_PIN, SENSOR_DISTANCE_ECHO_PIN);
            reading["value"] = distance;

            if (distance < sensors[i].threshold_min || distance > sensors[i].threshold_max) {
                reading["alert"] = "distance_threshold";
            }
        } else if (sensors[i].type == "magnetic") {
            int magneticValue = digitalRead(sensors[i].pin);
            reading["value"] = magneticValue;
            reading["state"] = (magneticValue == LOW) ? "closed" : "open";
        } else if (sensors[i].type == "vibration") {
            int vibrationValue = digitalRead(sensors[i].pin);
            reading["value"] = vibrationValue;
            if (vibrationValue == HIGH) {
                reading["alert"] = "vibration_detected";
            }
        }
    }

    String output;
    serializeJson(doc, output);
    return output;
}

float measureDistance(int triggerPin, int echoPin) {
    digitalWrite(triggerPin, LOW);
    delayMicroseconds(2);
    digitalWrite(triggerPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(triggerPin, LOW);

    long duration = pulseIn(echoPin, HIGH, 30000); // 30ms timeout
    float distance = duration * 0.034 / 2; // Convert to cm

    return distance;
}

void sendSensorData(String data) {
    // Arduino sends data via Serial in JSON format
    // A connected device (Raspberry Pi, PC, ESP8266 shield) can forward this to the server

    DynamicJsonDocument doc(2048);
    doc["type"] = "sensor_data";
    doc["device_id"] = config.device_id;

    // Parse the sensor data and add it
    DynamicJsonDocument sensorDoc(2048);
    deserializeJson(sensorDoc, data);
    doc["payload"] = sensorDoc;

    serializeJson(doc, Serial);
    Serial.println(); // Newline delimiter
}

void sendHeartbeat() {
    DynamicJsonDocument doc(512);
    doc["type"] = "heartbeat";
    doc["device_id"] = config.device_id;
    doc["uptime"] = millis() / 1000;
    doc["free_memory"] = freeMemory();
    doc["sensor_count"] = sensorCount;
    doc["armed"] = config.armed;

    serializeJson(doc, Serial);
    Serial.println(); // Newline delimiter

    if (config.debug_mode) {
        Serial.print(F("Heartbeat sent. Uptime: "));
        Serial.print(millis() / 1000);
        Serial.println(F(" seconds"));
    }
}

void sendStatus() {
    DynamicJsonDocument doc(512);
    doc["type"] = "status";
    doc["device_id"] = config.device_id;
    doc["device_name"] = DEVICE_NAME;
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["sensor_count"] = sensorCount;
    doc["armed"] = config.armed;

    serializeJson(doc, Serial);
    Serial.println();
}

void processSerialCommand() {
    String command = Serial.readStringUntil('\n');
    command.trim();

    DynamicJsonDocument doc(512);
    DeserializationError error = deserializeJson(doc, command);

    if (error) {
        Serial.print(F("{\"error\":\"Invalid JSON: "));
        Serial.print(error.c_str());
        Serial.println(F("\"}"));
        return;
    }

    String cmd = doc["command"].as<String>();

    if (cmd == "arm") {
        config.armed = true;
        Serial.println(F("{\"status\":\"armed\"}"));
    } else if (cmd == "disarm") {
        config.armed = false;
        Serial.println(F("{\"status\":\"disarmed\"}"));
    } else if (cmd == "status") {
        sendStatus();
    } else if (cmd == "read") {
        String data = readAllSensors();
        sendSensorData(data);
    } else {
        Serial.print(F("{\"error\":\"Unknown command: "));
        Serial.print(cmd);
        Serial.println(F("\"}"));
    }
}

// Free memory calculation for Arduino
int freeMemory() {
    extern int __heap_start, *__brkval;
    int v;
    return (int) &v - (__brkval == 0 ? (int) &__heap_start : (int) __brkval);
}
