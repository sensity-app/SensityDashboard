# MQTT Protocol Setup Guide

## Overview

The IoT Platform now supports MQTT as an alternative protocol to HTTP for device communication. MQTT is ideal for:
- Low bandwidth environments
- Battery-powered devices
- Real-time bidirectional communication
- Devices behind NAT/firewalls

## Prerequisites

### 1. Install an MQTT Broker

You need an MQTT broker running. Popular options:

#### Option A: Mosquitto (Recommended for local development)
```bash
# Ubuntu/Debian
sudo apt-get install mosquitto mosquitto-clients

# macOS
brew install mosquitto

# Start the broker
mosquitto -v
```

#### Option B: EMQX (Recommended for production)
```bash
docker run -d --name emqx \
  -p 1883:1883 \
  -p 8083:8083 \
  -p 8084:8084 \
  -p 8883:8883 \
  -p 18083:18083 \
  emqx/emqx:latest
```

#### Option C: Cloud MQTT Brokers
- AWS IoT Core
- Azure IoT Hub
- HiveMQ Cloud
- CloudMQTT

### 2. Install MQTT Package

The mqtt package is now included in package.json. Run:

```bash
cd backend
npm install
```

## Backend Configuration

### 1. Environment Variables

Add these to your `.env` file:

```env
# Enable/disable MQTT support
MQTT_ENABLED=true

# MQTT broker connection URL
MQTT_BROKER_URL=mqtt://localhost:1883
# For secure connection: mqtts://broker.example.com:8883

# MQTT authentication (optional)
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password

# Default topic prefix for all devices
MQTT_TOPIC_PREFIX=iot

# Default Quality of Service level (0, 1, or 2)
MQTT_DEFAULT_QOS=1
```

### 2. Start the Server

```bash
cd backend
npm start
```

You should see in the logs:
```
MQTT service initialized successfully
Subscribed to MQTT topics for X devices
```

## Device Configuration

### 1. Configure Device for MQTT via UI

1. Go to **Administration** → **Protocol Settings**
2. Select your device
3. Choose **MQTT** as the protocol
4. Configure:
   - **MQTT Broker Host**: Your broker hostname/IP (e.g., `192.168.1.100`)
   - **MQTT Broker Port**: Usually `1883` (non-secure) or `8883` (secure)
   - **Username/Password**: If your broker requires authentication
   - **Topic Prefix**: Default is `iot`, change if needed
   - **QoS Level**:
     - `0` - At most once (fire and forget)
     - `1` - At least once (default, recommended)
     - `2` - Exactly once (slowest but most reliable)
   - **Heartbeat Interval**: How often device sends heartbeat (seconds)

4. Click **Save Settings**
5. Click **Test Connection** to verify configuration

### 2. Generate Firmware with MQTT Support

1. Go to **Administration** → **Firmware Builder**
2. Select your device
3. The firmware will automatically include MQTT configuration based on protocol settings
4. Flash the generated firmware to your ESP8266 device

## MQTT Topics

### Device → Platform (Publish)

Devices should publish to these topics:

#### 1. Telemetry Data
**Topic**: `{prefix}/{deviceId}/telemetry`

**Payload**:
```json
{
  "sensors": [
    {
      "pin": "A0",
      "type": "temperature",
      "raw_value": 512,
      "processed_value": 25.3,
      "name": "Room Temperature",
      "calibration_offset": 0,
      "calibration_multiplier": 1
    },
    {
      "pin": "D4",
      "type": "humidity",
      "raw_value": 768,
      "processed_value": 65.2,
      "name": "Room Humidity"
    }
  ]
}
```

#### 2. Heartbeat
**Topic**: `{prefix}/{deviceId}/heartbeat`

**Payload**:
```json
{
  "firmware_version": "1.0.0",
  "uptime": 12345,
  "free_heap": 25000,
  "wifi_rssi": -65
}
```

#### 3. Alarms
**Topic**: `{prefix}/{deviceId}/alarm`

**Payload**:
```json
{
  "alarm_type": "threshold_exceeded",
  "message": "Temperature too high: 35.2°C",
  "severity": "high"
}
```

#### 4. Status Updates
**Topic**: `{prefix}/{deviceId}/status`

**Payload**:
```json
{
  "status": "online",
  "metadata": {
    "ip": "192.168.1.100",
    "mac": "AA:BB:CC:DD:EE:FF"
  }
}
```

### Platform → Device (Subscribe)

Devices should subscribe to these topics for commands:

#### Command Topic
**Topic**: `{prefix}/{deviceId}/command/#`

Examples:
- `{prefix}/{deviceId}/command/restart` - Restart device
- `{prefix}/{deviceId}/command/ota` - Start OTA update
- `{prefix}/{deviceId}/command/config` - Update configuration

**Command Payload Example**:
```json
{
  "command": "restart",
  "timestamp": 1234567890
}
```

## ESP8266 Arduino Code Example

### Installation

Add to your Arduino libraries:
```cpp
#include <PubSubClient.h>
```

Install via Arduino Library Manager: **PubSubClient by Nick O'Leary**

### Example Code

```cpp
#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// WiFi credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// MQTT Configuration (from platform)
const char* mqtt_server = "192.168.1.100";
const int mqtt_port = 1883;
const char* mqtt_user = "your_username";  // Optional
const char* mqtt_password = "your_password";  // Optional
const char* device_id = "esp8266_001";
const char* topic_prefix = "iot";

WiFiClient espClient;
PubSubClient mqtt(espClient);

unsigned long lastTelemetry = 0;
unsigned long lastHeartbeat = 0;
const long telemetryInterval = 5000;  // 5 seconds
const long heartbeatInterval = 60000;  // 60 seconds

void setup() {
  Serial.begin(115200);

  // Connect to WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("WiFi connected");

  // Setup MQTT
  mqtt.setServer(mqtt_server, mqtt_port);
  mqtt.setCallback(mqttCallback);
}

void loop() {
  if (!mqtt.connected()) {
    reconnectMQTT();
  }
  mqtt.loop();

  unsigned long now = millis();

  // Send telemetry
  if (now - lastTelemetry > telemetryInterval) {
    lastTelemetry = now;
    sendTelemetry();
  }

  // Send heartbeat
  if (now - lastHeartbeat > heartbeatInterval) {
    lastHeartbeat = now;
    sendHeartbeat();
  }
}

void reconnectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("Connecting to MQTT...");

    String clientId = "ESP8266-" + String(device_id);

    bool connected;
    if (mqtt_user && strlen(mqtt_user) > 0) {
      connected = mqtt.connect(clientId.c_str(), mqtt_user, mqtt_password);
    } else {
      connected = mqtt.connect(clientId.c_str());
    }

    if (connected) {
      Serial.println("connected");

      // Subscribe to command topics
      String commandTopic = String(topic_prefix) + "/" + device_id + "/command/#";
      mqtt.subscribe(commandTopic.c_str());

    } else {
      Serial.print("failed, rc=");
      Serial.print(mqtt.state());
      Serial.println(" retrying in 5 seconds");
      delay(5000);
    }
  }
}

void sendTelemetry() {
  // Read sensors
  float temperature = readTemperature();  // Your sensor reading function
  float humidity = readHumidity();        // Your sensor reading function

  // Create JSON payload
  StaticJsonDocument<512> doc;
  JsonArray sensors = doc.createNestedArray("sensors");

  JsonObject sensor1 = sensors.createNestedObject();
  sensor1["pin"] = "A0";
  sensor1["type"] = "temperature";
  sensor1["raw_value"] = analogRead(A0);
  sensor1["processed_value"] = temperature;
  sensor1["name"] = "Room Temperature";

  JsonObject sensor2 = sensors.createNestedObject();
  sensor2["pin"] = "D4";
  sensor2["type"] = "humidity";
  sensor2["raw_value"] = 768;
  sensor2["processed_value"] = humidity;
  sensor2["name"] = "Room Humidity";

  String payload;
  serializeJson(doc, payload);

  // Publish
  String topic = String(topic_prefix) + "/" + device_id + "/telemetry";
  mqtt.publish(topic.c_str(), payload.c_str());

  Serial.println("Telemetry sent");
}

void sendHeartbeat() {
  StaticJsonDocument<256> doc;
  doc["firmware_version"] = "1.0.0";
  doc["uptime"] = millis() / 1000;
  doc["free_heap"] = ESP.getFreeHeap();
  doc["wifi_rssi"] = WiFi.RSSI();

  String payload;
  serializeJson(doc, payload);

  String topic = String(topic_prefix) + "/" + device_id + "/heartbeat";
  mqtt.publish(topic.c_str(), payload.c_str());

  Serial.println("Heartbeat sent");
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message received on topic: ");
  Serial.println(topic);

  // Parse payload
  StaticJsonDocument<256> doc;
  deserializeJson(doc, payload, length);

  const char* command = doc["command"];

  if (strcmp(command, "restart") == 0) {
    Serial.println("Restarting device...");
    ESP.restart();
  }
  // Add more command handlers as needed
}

// Placeholder sensor functions
float readTemperature() {
  // Your temperature sensor code here
  return 25.0 + random(-5, 5);
}

float readHumidity() {
  // Your humidity sensor code here
  return 60.0 + random(-10, 10);
}
```

## Testing MQTT Connection

### Using mosquitto_sub (Command Line)

Subscribe to all device messages:
```bash
mosquitto_sub -h localhost -t 'iot/#' -v
```

### Using MQTT Explorer (GUI)

1. Download: https://mqtt-explorer.com/
2. Connect to your broker
3. View all topics and messages in real-time

### Test Connection via Platform

1. Go to **Administration** → **Protocol Settings**
2. Configure MQTT settings for a device
3. Click **Test Connection**
4. Should see: ✅ "MQTT connection successful"

## Troubleshooting

### MQTT Service Not Starting

**Symptom**: Warning in logs: "MQTT service initialization failed"

**Solutions**:
1. Check if MQTT broker is running:
   ```bash
   netstat -an | grep 1883
   ```

2. Verify MQTT_BROKER_URL in .env file

3. Test broker directly:
   ```bash
   mosquitto_pub -h localhost -t test -m "hello"
   ```

4. Disable MQTT if not needed:
   ```env
   MQTT_ENABLED=false
   ```

### Device Not Connecting

**Symptom**: Device can't connect to MQTT broker

**Solutions**:
1. Verify broker host/IP is reachable from device
2. Check firewall rules (port 1883)
3. Verify username/password if authentication is enabled
4. Check device logs for connection errors
5. Try with QoS 0 first, then upgrade to QoS 1

### No Telemetry Data

**Symptom**: Device connects but no data appears in platform

**Solutions**:
1. Verify topic format matches: `{prefix}/{deviceId}/telemetry`
2. Check JSON payload structure matches expected format
3. Verify device is registered in the platform
4. Check device has sensors configured in database
5. Look at backend logs for processing errors

### High Message Loss

**Symptom**: Some messages not received

**Solutions**:
1. Increase QoS level to 1 or 2
2. Check broker resource usage
3. Verify network stability
4. Increase `MQTT_RECONNECT_PERIOD` if needed

## Performance Considerations

### MQTT vs HTTP

| Aspect | MQTT | HTTP |
|--------|------|------|
| **Bandwidth** | ~2 bytes overhead | ~100+ bytes overhead |
| **Connection** | Persistent | Request/Response |
| **Latency** | Very Low | Low to Medium |
| **Battery Life** | Excellent | Good |
| **Behind Firewall** | Works well | May need port forwarding |
| **Bidirectional** | Native | Requires polling |

### Recommended Settings

**For battery-powered devices**:
- QoS: 1
- Heartbeat Interval: 300-600 seconds
- Use Last Will Testament (LWT)

**For real-time applications**:
- QoS: 1 or 2
- Telemetry Interval: 1-5 seconds
- Keep-alive: 30 seconds

**For low-bandwidth networks**:
- QoS: 0 or 1
- Compress payloads if possible
- Increase telemetry interval

## Security Best Practices

1. **Use TLS/SSL** (mqtts://)
   ```env
   MQTT_BROKER_URL=mqtts://broker.example.com:8883
   ```

2. **Enable Authentication**
   - Set unique username/password per device
   - Store credentials securely on device

3. **Use ACLs** (Access Control Lists)
   - Configure broker to restrict topic access
   - Each device should only access its own topics

4. **Regular Firmware Updates**
   - Keep MQTT library updated
   - Use OTA for security patches

5. **Monitor Connections**
   - Alert on unexpected disconnections
   - Track unusual message patterns

## Advanced Features

### Last Will Testament (LWT)

Configure device to notify platform when it disconnects unexpectedly:

```cpp
mqtt.connect(clientId.c_str(), mqtt_user, mqtt_password,
            willTopic, willQoS, willRetain, willMessage);
```

### Retained Messages

Platform can publish retained messages for device configuration:

```javascript
await mqttService.publish(topic, payload, { retain: true });
```

### Persistent Sessions

Use `clean: false` for persistent sessions (QoS 1 & 2):

```cpp
mqtt.connect(clientId.c_str(), mqtt_user, mqtt_password,
            willTopic, willQoS, willRetain, willMessage, false);
```

## Support

For issues or questions:
1. Check backend logs: `tail -f backend/app.log`
2. Enable debug logging: `LOG_LEVEL=debug` in .env
3. Test with MQTT client tools first
4. Review device serial output

## Additional Resources

- **MQTT Specification**: http://docs.oasis-open.org/mqtt/mqtt/v3.1.1/mqtt-v3.1.1.html
- **PubSubClient Library**: https://pubsubclient.knolleary.net/
- **Mosquitto Documentation**: https://mosquitto.org/documentation/
- **EMQX Documentation**: https://docs.emqx.com/
