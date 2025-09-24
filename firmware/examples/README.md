# Device Configuration Examples

This directory contains pre-configured device setups for common IoT monitoring scenarios. Each configuration file provides all the necessary settings to flash directly to an ESP8266 device without requiring manual configuration.

## How to Use

1. Copy the content from one of the example files
2. Paste it into `firmware/device_config.h`
3. Update the WiFi credentials and server URL with your actual values
4. Flash the firmware to your ESP8266

## Available Configurations

### 1. Kitchen Monitor (`kitchen_monitor.h`)
**Purpose**: Monitor kitchen environment and safety
**Sensors Enabled**:
- Temperature & Humidity (DHT22 on D4)
- Light Level (A0)
- Motion Detection (D2)
- Gas Detection (A0) - conflicts with light, choose one
- Magnetic Door Sensor (D3)

**Use Cases**:
- Food safety monitoring
- Energy efficiency (lights/appliances)
- Security monitoring
- Fire/gas leak detection

### 2. Security Node (`security_node.h`)
**Purpose**: Perimeter and intrusion monitoring
**Sensors Enabled**:
- Motion Detection (D2) - Primary security sensor
- Distance/Proximity (D5/D6)
- Door/Window Magnetic (D3)
- Vibration Detection (D7)
- Environmental monitoring (DHT22 on D4)
- Light Level (A0)

**Use Cases**:
- Home security
- Perimeter monitoring
- Break-in detection
- Tamper detection

### 3. Environmental Monitor (`environmental_monitor.h`)
**Purpose**: Indoor climate and comfort monitoring
**Sensors Enabled**:
- Temperature & Humidity (DHT22 on D4)
- Light Level (A0)
- Optional air quality monitoring

**Use Cases**:
- HVAC optimization
- Comfort monitoring
- Energy efficiency
- Health and wellness tracking

### 4. Greenhouse Monitor (`greenhouse_monitor.h`)
**Purpose**: Plant growth environment monitoring
**Sensors Enabled**:
- Temperature & Humidity (DHT22 on D4)
- Light Level (A0) - for grow light control
- Distance Sensor (D5/D6) - water tank level
- Motion Detection (D2) - security
- Magnetic Door Sensor (D3)
- Vibration Detection (D7) - wind/structural

**Use Cases**:
- Plant health monitoring
- Automated irrigation
- Climate control
- Security monitoring

## Configuration Guidelines

### WiFi Settings
Always update these fields with your actual network credentials:
```cpp
#define WIFI_SSID "YOUR_ACTUAL_WIFI_NAME"
#define WIFI_PASSWORD "your_actual_wifi_password"
```

### Server Settings
Update with your IoT platform URL:
```cpp
#define SERVER_URL "https://your-iot-platform.com"
#define SERVER_API_KEY "your_api_key_if_needed"
```

### Device Identity
Each device should have a unique ID:
```cpp
#define DEVICE_ID "KITCHEN_001"  // Change for each device
#define DEVICE_NAME "Kitchen Monitor"
#define DEVICE_LOCATION "Kitchen"
```

## Pin Conflicts

**Important**: The ESP8266 has limited analog pins. Only one sensor can use A0 at a time:
- Light Sensor (A0)
- Sound Sensor (A0)
- Gas Sensor (A0)

Choose only ONE of these sensors per device, or use external multiplexing.

## Sensor Wiring Reference

### DHT22 (Temperature/Humidity)
- VCC → 3.3V
- GND → GND
- DATA → D4
- Pull-up resistor (10kΩ) between DATA and VCC

### PIR Motion Sensor
- VCC → 3.3V or 5V
- GND → GND
- OUT → D2

### HC-SR04 Ultrasonic Distance
- VCC → 5V (or 3.3V for some modules)
- GND → GND
- Trig → D5
- Echo → D6

### Magnetic Reed Switch
- One wire → D3
- Other wire → GND
- Internal pull-up resistor enabled in code

### LDR Light Sensor
- LDR → A0 and 3.3V
- 10kΩ resistor → A0 and GND

## Power Considerations

- **5V Sensors**: Some sensors (HC-SR04) work best with 5V supply
- **3.3V Logic**: ESP8266 GPIO pins are 3.3V - use level shifters if needed
- **Power Consumption**: Consider deep sleep mode for battery-powered applications
- **Current Draw**: Each sensor adds to total current consumption

## Troubleshooting

1. **Compile Errors**: Make sure all required libraries are installed
2. **WiFi Connection Issues**: Check SSID/password, signal strength
3. **Sensor Readings**: Verify wiring and power supply
4. **Server Communication**: Confirm server URL and network connectivity
5. **Memory Issues**: Reduce `TELEMETRY_BATCH_SIZE` if experiencing crashes

## Adding Custom Configurations

To create a new configuration:

1. Copy an existing example file
2. Modify the device identification
3. Enable/disable sensors as needed
4. Adjust thresholds for your use case
5. Update pin assignments if needed
6. Test thoroughly before deployment

## Production Deployment

For production use:
1. Set `DEBUG_MODE false`
2. Use strong WiFi passwords
3. Enable HTTPS with valid certificates
4. Implement proper authentication
5. Monitor device health remotely
6. Plan for OTA updates