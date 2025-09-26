# Device Template Examples

This directory contains pre-configured device templates for common IoT monitoring scenarios. These templates are integrated into the **Web-Based Firmware Builder** and can be used without manual configuration.

## Web-Based Firmware Builder (Recommended)

**The easiest way to use these templates is through the web interface:**

1. **Visit the Firmware Builder**: `https://your-platform.com/firmware-builder`
2. **Select a template** from the visual gallery
3. **Configure device settings** (WiFi, sensors, etc.)
4. **Flash directly via browser** using WebSerial API OR download firmware package
5. **Device auto-registers** and starts sending data immediately

## Manual Configuration (Advanced Users)

If you prefer manual setup:
1. Copy the content from one of the example files
2. Paste it into `firmware/device_config.h`
3. Update the WiFi credentials and server URL with your actual values
4. Flash the firmware to your ESP8266

## Available Templates

### 1. 🍳 Kitchen Monitor (`kitchen_monitor.h`)
**Purpose**: Comprehensive kitchen environment and safety monitoring
**Sensors Enabled**:
- Temperature & Humidity (DHT22) - Food safety monitoring
- Light Level (LDR) - Energy efficiency tracking
- Motion Detection (PIR) - Occupancy detection
- Gas Detection (MQ sensors) - Safety monitoring
- Magnetic Door Sensor - Cabinet/appliance monitoring

**Real-world Applications**:
- Food safety compliance monitoring
- Energy efficiency optimization
- Kitchen security when unoccupied
- Gas leak early warning system
- Appliance usage tracking

### 2. 🛡️ Security Node (`security_node.h`)
**Purpose**: Multi-layered perimeter and intrusion detection
**Sensors Enabled**:
- Motion Detection (PIR) - Primary intrusion detection
- Distance/Proximity (HC-SR04) - Perimeter monitoring
- Door/Window Magnetic - Entry point monitoring
- Vibration Detection - Tamper and break-in detection
- Environmental monitoring (DHT22) - Baseline conditions
- Light Level (LDR) - Ambient change detection

**Real-world Applications**:
- Comprehensive home security system
- Commercial perimeter monitoring
- Multi-zone intrusion detection
- Equipment tamper protection
- Environmental baseline monitoring

### 3. 🌿 Environmental Monitor (`environmental_monitor.h`)
**Purpose**: Advanced indoor climate and air quality monitoring
**Sensors Enabled**:
- Temperature & Humidity (DHT22) - Climate tracking
- Light Level (LDR) - Natural light monitoring
- Air Quality (MQ sensors) - Pollution and gas detection
- Sound Level - Noise pollution monitoring

**Real-world Applications**:
- HVAC system optimization
- Indoor air quality compliance
- Energy efficiency analysis
- Health and wellness monitoring
- Smart building automation

### 4. 🏡 Greenhouse Monitor (`greenhouse_monitor.h`)
**Purpose**: Comprehensive plant growth environment optimization
**Sensors Enabled**:
- Temperature & Humidity (DHT22) - Growing conditions
- Light Level (LDR) - Grow light optimization
- Distance Sensor (HC-SR04) - Water tank level monitoring
- Motion Detection (PIR) - Security and pest detection
- Magnetic Door Sensor - Access monitoring
- Vibration Detection - Wind and structural monitoring

**Real-world Applications**:
- Automated plant care systems
- Irrigation management and alerts
- Climate control optimization
- Security monitoring for high-value crops
- Structural health monitoring

### 5. 🌡️ Simple Temperature Monitor
**Purpose**: Beginner-friendly basic monitoring setup
**Sensors Enabled**:
- Temperature & Humidity (DHT22) only

**Real-world Applications**:
- Learning IoT development
- Basic room monitoring
- Temperature-sensitive storage areas
- Simple climate tracking

### 6. 🔨 Workshop Monitor
**Purpose**: Industrial workshop safety and compliance monitoring
**Sensors Enabled**:
- Sound Level - Noise compliance monitoring
- Vibration Detection - Equipment monitoring
- Air Quality (MQ sensors) - Workplace safety
- Motion Detection - Occupancy tracking
- Light Level - Workspace illumination

**Real-world Applications**:
- OSHA noise compliance monitoring
- Equipment health monitoring
- Workplace safety compliance
- Automated ventilation control
- Security monitoring after hours

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

### Using Web-Based Firmware Builder (Recommended)
1. **Access Platform**: Visit `https://your-platform.com/firmware-builder`
2. **Configure Template**: Select appropriate template and configure sensors
3. **Security Settings**: WiFi credentials auto-filled securely
4. **Flash Device**: Use WebSerial for direct browser flashing
5. **Auto-Registration**: Device automatically appears in dashboard
6. **Monitor Remotely**: Real-time alerts and analytics available

### Manual Production Deployment
For advanced users preferring manual configuration:
1. Set `DEBUG_MODE false`
2. Use strong WiFi passwords
3. Enable HTTPS with valid certificates
4. Implement proper authentication
5. Monitor device health remotely
6. Plan for OTA updates

### Enterprise Features Available
- **Device Groups & Tags**: Organize devices by location or function
- **Alert Rules**: Configure automated notifications and escalations
- **Analytics Dashboard**: Real-time monitoring and trend analysis
- **User Management**: Role-based access control
- **Platform Updates**: Integrated update system with backup/rollback