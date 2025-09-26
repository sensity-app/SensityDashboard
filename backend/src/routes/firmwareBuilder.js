const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const JSZip = require('jszip');

// Convert sensor array from frontend to object format expected by generateDeviceConfig
function convertSensorArrayToObject(sensorsArray) {
    const sensorsObject = {};

    if (!Array.isArray(sensorsArray)) {
        console.log('Sensors is not an array, returning as-is');
        return sensorsArray || {};
    }

    // Convert array of sensor objects to the expected format
    sensorsArray.forEach(sensor => {
        if (sensor.type && sensor.enabled) {
            const sensorConfig = {
                enabled: true,
                pin: sensor.pin,
                name: sensor.name
            };

            // Add type-specific properties
            switch (sensor.type) {
                case 'light':
                    sensorConfig.min = sensor.light_min || 100;
                    sensorConfig.max = sensor.light_max || 900;
                    sensorConfig.calibration_offset = sensor.light_calibration_offset || 0.0;
                    sensorConfig.calibration_multiplier = sensor.light_calibration_multiplier || 1.0;
                    break;
                case 'temperature_humidity':
                    sensorConfig.temperature_min = sensor.temperature_min || -10.0;
                    sensorConfig.temperature_max = sensor.temperature_max || 40.0;
                    sensorConfig.humidity_min = sensor.humidity_min || 20.0;
                    sensorConfig.humidity_max = sensor.humidity_max || 80.0;
                    break;
                case 'motion':
                    sensorConfig.timeout = sensor.motion_timeout || 30000;
                    break;
                case 'distance':
                    sensorConfig.trigger_pin = sensor.trigger_pin;
                    sensorConfig.echo_pin = sensor.echo_pin;
                    sensorConfig.min_distance = sensor.min_distance || 2.0;
                    sensorConfig.max_distance = sensor.max_distance || 200.0;
                    break;
            }

            sensorsObject[sensor.type] = sensorConfig;
        }
    });

    return sensorsObject;
}

// Firmware builder route
router.post('/build', async (req, res) => {
    try {
        const {
            // Device configuration
            device_id,
            device_name,
            device_location,
            wifi_ssid,
            wifi_password,
            open_wifi = false,

            // Server configuration
            server_url,
            api_key,

            // Device behavior
            heartbeat_interval = 300,
            sensor_read_interval = 5000,
            debug_mode = false,
            ota_enabled = true,
            device_armed = true,

            // Sensor configuration
            sensors = []
        } = req.body;

        // Debug: Log the received data
        console.log('Firmware builder request body:', JSON.stringify(req.body, null, 2));
        console.log('Extracted fields:', { device_id, device_name, wifi_ssid, wifi_password: wifi_password ? '***' : undefined, open_wifi, server_url });

        // Convert sensor array to object format expected by generateDeviceConfig
        const sensorsObject = convertSensorArrayToObject(sensors);
        console.log('Converted sensors object:', sensorsObject);

        // Validate required fields
        if (!device_id || !device_name || !wifi_ssid || !server_url) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: device_id, device_name, wifi_ssid, server_url'
            });
        }

        // Validate wifi_password is required only if not using open wifi
        if (!open_wifi && !wifi_password) {
            return res.status(400).json({
                success: false,
                error: 'WiFi password is required when not using open WiFi'
            });
        }

        // Generate device configuration header
        const configContent = generateDeviceConfig({
            device_id,
            device_name,
            device_location: device_location || 'Unknown',
            wifi_ssid,
            wifi_password,
            server_url,
            api_key: api_key || '',
            heartbeat_interval,
            sensor_read_interval,
            debug_mode,
            ota_enabled,
            device_armed,
            sensors: sensorsObject
        });

        // Read base firmware files
        const firmwarePath = path.join(__dirname, '../../../firmware');
        const mainFirmware = await fs.readFile(path.join(firmwarePath, 'esp8266_sensor_platform.ino'), 'utf8');

        // Create firmware package
        const zip = new JSZip();

        // Add generated config
        zip.file('device_config.h', configContent);

        // Add main firmware
        zip.file('esp8266_sensor_platform.ino', mainFirmware);

        // Add installation instructions
        const instructions = generateInstallationInstructions(device_id, device_name, sensors);
        zip.file('INSTALLATION_INSTRUCTIONS.md', instructions);

        // Add required libraries list
        const librariesList = generateLibrariesList(sensors);
        zip.file('REQUIRED_LIBRARIES.txt', librariesList);

        // Add wiring diagram (text-based)
        const wiringDiagram = generateWiringDiagram(sensors);
        zip.file('WIRING_DIAGRAM.txt', wiringDiagram);

        // Generate ZIP file
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

        // Set response headers for file download
        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${device_id}_firmware.zip"`,
            'Content-Length': zipBuffer.length
        });

        // Log firmware generation
        console.log(`Generated firmware for device: ${device_id} (${device_name})`);

        res.send(zipBuffer);

    } catch (error) {
        console.error('Firmware generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate firmware package'
        });
    }
});

// Generate sensor configuration options
router.get('/sensor-options', (req, res) => {
    const sensorOptions = {
        temperature_humidity: {
            name: 'Temperature & Humidity (DHT22)',
            pin_type: 'digital',
            recommended_pins: ['D4', 'D2', 'D5'],
            default_pin: 'D4',
            description: 'Monitors temperature and humidity levels',
            required_libraries: ['DHT sensor library'],
            wiring_notes: 'Requires 3.3V/5V power and pull-up resistor (10kΩ)',
            thresholds: {
                temperature_min: { default: -10, min: -40, max: 50 },
                temperature_max: { default: 40, min: -40, max: 85 },
                humidity_min: { default: 20, min: 0, max: 100 },
                humidity_max: { default: 80, min: 0, max: 100 }
            }
        },
        light: {
            name: 'Light Sensor (LDR/Photodiode)',
            pin_type: 'analog',
            recommended_pins: ['A0'],
            default_pin: 'A0',
            description: 'Measures ambient light levels',
            required_libraries: [],
            wiring_notes: 'LDR between A0 and 3.3V, 10kΩ resistor between A0 and GND',
            exclusive_analog: true,
            thresholds: {
                light_min: { default: 100, min: 0, max: 1024 },
                light_max: { default: 900, min: 0, max: 1024 }
            }
        },
        motion: {
            name: 'Motion Sensor (PIR)',
            pin_type: 'digital',
            recommended_pins: ['D2', 'D1', 'D5', 'D6', 'D7'],
            default_pin: 'D2',
            description: 'Detects movement and occupancy',
            required_libraries: [],
            wiring_notes: 'VCC to 3.3V/5V, GND to GND, OUT to digital pin',
            thresholds: {
                motion_timeout: { default: 30000, min: 1000, max: 300000 }
            }
        },
        distance: {
            name: 'Distance Sensor (HC-SR04)',
            pin_type: 'digital',
            recommended_pins: ['D5,D6', 'D1,D2', 'D3,D7'],
            default_pin: 'D5,D6',
            description: 'Ultrasonic distance measurement (requires 2 pins: Trig and Echo)',
            required_libraries: ['Ultrasonic sensor library'],
            wiring_notes: 'Trig pin connects to first pin, Echo pin to second pin. Requires 5V power.',
            pins_required: 2,
            thresholds: {
                distance_min: { default: 5, min: 2, max: 400 },
                distance_max: { default: 200, min: 2, max: 400 }
            }
        },
        sound: {
            name: 'Sound Level Sensor',
            pin_type: 'analog',
            recommended_pins: ['A0'],
            default_pin: 'A0',
            description: 'Monitors noise levels and sound intensity',
            required_libraries: [],
            wiring_notes: 'Requires analog input. VCC to 3.3V, GND to ground, OUT to A0.',
            exclusive_analog: true,
            conflicts_with: ['light', 'gas'],
            thresholds: {
                sound_min: { default: 100, min: 0, max: 1024 },
                sound_max: { default: 800, min: 0, max: 1024 }
            }
        },
        magnetic: {
            name: 'Magnetic Door/Window Sensor',
            pin_type: 'digital',
            recommended_pins: ['D3', 'D1', 'D7', 'D8'],
            default_pin: 'D3',
            description: 'Detects door/window open/close using reed switch',
            required_libraries: [],
            wiring_notes: 'Reed switch with built-in pull-up. Connect one end to pin, other to GND.',
            thresholds: {}
        },
        vibration: {
            name: 'Vibration Sensor',
            pin_type: 'digital',
            recommended_pins: ['D7', 'D1', 'D8', 'D3'],
            default_pin: 'D7',
            description: 'Detects vibrations and impacts (SW-420 or similar)',
            required_libraries: [],
            wiring_notes: 'Digital output sensor. VCC to 3.3V, GND to ground, DO to pin.',
            thresholds: {}
        },
        gas: {
            name: 'Gas Sensor (MQ series)',
            pin_type: 'analog',
            recommended_pins: ['A0'],
            default_pin: 'A0',
            description: 'Detects gas leaks and air quality (MQ-2, MQ-135, etc.)',
            required_libraries: [],
            wiring_notes: 'Analog output sensor. VCC to 5V, GND to ground, AO to A0. Requires 24h burn-in.',
            exclusive_analog: true,
            conflicts_with: ['light', 'sound'],
            thresholds: {
                gas_min: { default: 100, min: 0, max: 1024 },
                gas_max: { default: 600, min: 0, max: 1024 }
            }
        }
    };

    res.json({
        success: true,
        sensors: sensorOptions,
        pin_mapping: {
            'D0': 'GPIO16 (LED_BUILTIN, no PWM/interrupt)',
            'D1': 'GPIO5 (SCL)',
            'D2': 'GPIO4 (SDA)',
            'D3': 'GPIO0 (FLASH button, pull-up required)',
            'D4': 'GPIO2 (LED_BUILTIN on some boards, pull-up required)',
            'D5': 'GPIO14 (SCK)',
            'D6': 'GPIO12 (MISO)',
            'D7': 'GPIO13 (MOSI)',
            'D8': 'GPIO15 (SS, pull-down required)',
            'A0': 'ADC0 (Analog input, 0-1V, use voltage divider for 3.3V)'
        },
        available_pins: {
            digital: [
                { pin: 'D0', label: 'D0 (GPIO16)', note: 'LED_BUILTIN, no PWM/interrupt' },
                { pin: 'D1', label: 'D1 (GPIO5)', note: 'SCL - avoid if using I2C' },
                { pin: 'D2', label: 'D2 (GPIO4)', note: 'SDA - avoid if using I2C' },
                { pin: 'D3', label: 'D3 (GPIO0)', note: 'FLASH button, pull-up required' },
                { pin: 'D4', label: 'D4 (GPIO2)', note: 'LED_BUILTIN on some boards, pull-up required' },
                { pin: 'D5', label: 'D5 (GPIO14)', note: 'SCK' },
                { pin: 'D6', label: 'D6 (GPIO12)', note: 'MISO' },
                { pin: 'D7', label: 'D7 (GPIO13)', note: 'MOSI' },
                { pin: 'D8', label: 'D8 (GPIO15)', note: 'SS, pull-down required' }
            ],
            analog: [
                { pin: 'A0', label: 'A0 (ADC0)', note: 'Analog input, 0-1V range, use voltage divider for 3.3V' }
            ]
        }
    });
});

// Generate device configuration content
function generateDeviceConfig(config) {
    const { sensors } = config;

    return `#ifndef DEVICE_CONFIG_H
#define DEVICE_CONFIG_H

// ========================================
// GENERATED DEVICE CONFIGURATION
// Generated on: ${new Date().toISOString()}
// ========================================

// DEVICE IDENTIFICATION
#define DEVICE_ID "${config.device_id}"
#define DEVICE_NAME "${config.device_name}"
#define DEVICE_LOCATION "${config.device_location}"
#define FIRMWARE_VERSION "2.1.0"

// WIFI CONFIGURATION
#define WIFI_SSID "${config.wifi_ssid}"
#define WIFI_PASSWORD "${config.wifi_password}"
#define WIFI_CONNECT_TIMEOUT_SEC 30
#define WIFI_RECONNECT_ATTEMPTS 3
#define WIFI_RECONNECT_DELAY_MS 5000

// SERVER CONFIGURATION
#define SERVER_URL "${config.server_url}"
#define SERVER_API_KEY "${config.api_key}"
#define USE_HTTPS ${config.server_url.startsWith('https') ? 'true' : 'false'}
#define SERVER_FINGERPRINT ""

// DEVICE BEHAVIOR SETTINGS
#define HEARTBEAT_INTERVAL_SEC ${config.heartbeat_interval}
#define SENSOR_READ_INTERVAL_MS ${config.sensor_read_interval}
#define TELEMETRY_BATCH_SIZE 5
#define DEVICE_ARMED ${config.device_armed ? 'true' : 'false'}
#define DEBUG_MODE ${config.debug_mode ? 'true' : 'false'}
#define OTA_ENABLED ${config.ota_enabled ? 'true' : 'false'}

// ========================================
// SENSOR CONFIGURATION
// ========================================

${generateSensorConfig(sensors)}

// ADVANCED SETTINGS
#define WATCHDOG_TIMEOUT_MS 30000
#define CONFIG_EEPROM_ADDR 0
#define CONFIG_MAGIC_NUMBER 0x12345678
#define MAX_FAILED_CONNECTIONS 5
#define USE_JSON_COMPRESSION false
#define MAX_RETRY_ATTEMPTS 3
#define HTTP_REQUEST_TIMEOUT_MS 10000
#define DEEP_SLEEP_ENABLED false
#define DEEP_SLEEP_DURATION_SEC 300
#define BATTERY_MONITORING_ENABLED false
#define LOW_BATTERY_THRESHOLD_V 3.2

// VALIDATION
#if !defined(WIFI_SSID) || !defined(WIFI_PASSWORD)
  #error "WiFi credentials must be configured"
#endif

#if !defined(SERVER_URL)
  #error "Server URL must be configured"
#endif

${generateConflictWarnings(sensors)}

#endif // DEVICE_CONFIG_H`;
}

// Generate sensor-specific configuration
function generateSensorConfig(sensors) {
    let config = '';

    // Temperature & Humidity Sensor (DHT22)
    if (sensors.temperature_humidity?.enabled) {
        const s = sensors.temperature_humidity;
        config += `
// Temperature & Humidity Sensor (DHT22)
#define SENSOR_DHT_ENABLED true
#define SENSOR_DHT_PIN ${s.pin || 'D4'}
#define SENSOR_DHT_TYPE DHT22
#define TEMP_THRESHOLD_MIN ${s.temp_min || -10.0}
#define TEMP_THRESHOLD_MAX ${s.temp_max || 40.0}
#define HUMIDITY_THRESHOLD_MIN ${s.humidity_min || 20.0}
#define HUMIDITY_THRESHOLD_MAX ${s.humidity_max || 80.0}
`;
    } else {
        config += `
// Temperature & Humidity Sensor (DHT22) - DISABLED
#define SENSOR_DHT_ENABLED false
#define SENSOR_DHT_PIN D4
#define SENSOR_DHT_TYPE DHT22
#define TEMP_THRESHOLD_MIN -10.0
#define TEMP_THRESHOLD_MAX 40.0
#define HUMIDITY_THRESHOLD_MIN 20.0
#define HUMIDITY_THRESHOLD_MAX 80.0
`;
    }

    // Light Sensor
    if (sensors.light?.enabled) {
        const s = sensors.light;
        config += `
// Light Sensor (LDR/Photodiode)
#define SENSOR_LIGHT_ENABLED true
#define SENSOR_LIGHT_PIN A0
#define LIGHT_THRESHOLD_MIN ${s.min || 100}
#define LIGHT_THRESHOLD_MAX ${s.max || 900}
#define LIGHT_CALIBRATION_OFFSET ${s.calibration_offset || 0.0}
#define LIGHT_CALIBRATION_MULTIPLIER ${s.calibration_multiplier || 1.0}
`;
    } else {
        config += `
// Light Sensor (LDR/Photodiode) - DISABLED
#define SENSOR_LIGHT_ENABLED false
#define SENSOR_LIGHT_PIN A0
#define LIGHT_THRESHOLD_MIN 100
#define LIGHT_THRESHOLD_MAX 900
#define LIGHT_CALIBRATION_OFFSET 0.0
#define LIGHT_CALIBRATION_MULTIPLIER 1.0
`;
    }

    // Motion Sensor
    if (sensors.motion?.enabled) {
        const s = sensors.motion;
        config += `
// Motion Sensor (PIR)
#define SENSOR_MOTION_ENABLED true
#define SENSOR_MOTION_PIN ${s.pin || 'D2'}
#define MOTION_THRESHOLD_MIN 0
#define MOTION_THRESHOLD_MAX 1
#define MOTION_DETECTION_TIMEOUT_MS ${s.timeout || 30000}
`;
    } else {
        config += `
// Motion Sensor (PIR) - DISABLED
#define SENSOR_MOTION_ENABLED false
#define SENSOR_MOTION_PIN D2
#define MOTION_THRESHOLD_MIN 0
#define MOTION_THRESHOLD_MAX 1
#define MOTION_DETECTION_TIMEOUT_MS 30000
`;
    }

    // Distance Sensor
    if (sensors.distance?.enabled) {
        const s = sensors.distance;
        config += `
// Distance Sensor (HC-SR04)
#define SENSOR_DISTANCE_ENABLED true
#define SENSOR_DISTANCE_TRIGGER_PIN ${s.trigger_pin || 'D5'}
#define SENSOR_DISTANCE_ECHO_PIN ${s.echo_pin || 'D6'}
#define DISTANCE_THRESHOLD_MIN ${s.min || 5.0}
#define DISTANCE_THRESHOLD_MAX ${s.max || 200.0}
`;
    } else {
        config += `
// Distance Sensor (HC-SR04) - DISABLED
#define SENSOR_DISTANCE_ENABLED false
#define SENSOR_DISTANCE_TRIGGER_PIN D5
#define SENSOR_DISTANCE_ECHO_PIN D6
#define DISTANCE_THRESHOLD_MIN 5.0
#define DISTANCE_THRESHOLD_MAX 200.0
`;
    }

    // Sound Sensor
    if (sensors.sound?.enabled) {
        const s = sensors.sound;
        config += `
// Sound Level Sensor
#define SENSOR_SOUND_ENABLED true
#define SENSOR_SOUND_PIN A0
#define SOUND_THRESHOLD_MIN ${s.min || 100}
#define SOUND_THRESHOLD_MAX ${s.max || 800}
`;
    } else {
        config += `
// Sound Level Sensor - DISABLED
#define SENSOR_SOUND_ENABLED false
#define SENSOR_SOUND_PIN A0
#define SOUND_THRESHOLD_MIN 100
#define SOUND_THRESHOLD_MAX 800
`;
    }

    // Magnetic Sensor
    if (sensors.magnetic?.enabled) {
        const s = sensors.magnetic;
        config += `
// Magnetic Door/Window Sensor
#define SENSOR_MAGNETIC_ENABLED true
#define SENSOR_MAGNETIC_PIN ${s.pin || 'D3'}
#define MAGNETIC_THRESHOLD_MIN 0
#define MAGNETIC_THRESHOLD_MAX 1
`;
    } else {
        config += `
// Magnetic Door/Window Sensor - DISABLED
#define SENSOR_MAGNETIC_ENABLED false
#define SENSOR_MAGNETIC_PIN D3
#define MAGNETIC_THRESHOLD_MIN 0
#define MAGNETIC_THRESHOLD_MAX 1
`;
    }

    // Vibration Sensor
    if (sensors.vibration?.enabled) {
        const s = sensors.vibration;
        config += `
// Vibration Sensor
#define SENSOR_VIBRATION_ENABLED true
#define SENSOR_VIBRATION_PIN ${s.pin || 'D7'}
#define VIBRATION_THRESHOLD_MIN 0
#define VIBRATION_THRESHOLD_MAX 1
`;
    } else {
        config += `
// Vibration Sensor - DISABLED
#define SENSOR_VIBRATION_ENABLED false
#define SENSOR_VIBRATION_PIN D7
#define VIBRATION_THRESHOLD_MIN 0
#define VIBRATION_THRESHOLD_MAX 1
`;
    }

    // Gas Sensor
    if (sensors.gas?.enabled) {
        const s = sensors.gas;
        config += `
// Gas Sensor (MQ series)
#define SENSOR_GAS_ENABLED true
#define SENSOR_GAS_PIN A0
#define GAS_THRESHOLD_MIN ${s.min || 100}
#define GAS_THRESHOLD_MAX ${s.max || 600}
`;
    } else {
        config += `
// Gas Sensor (MQ series) - DISABLED
#define SENSOR_GAS_ENABLED false
#define SENSOR_GAS_PIN A0
#define GAS_THRESHOLD_MIN 100
#define GAS_THRESHOLD_MAX 600
`;
    }

    return config;
}

// Generate conflict warnings
function generateConflictWarnings(sensors) {
    let warnings = '';

    // Check A0 pin conflicts
    const a0Sensors = [];
    if (sensors.light?.enabled) a0Sensors.push('light');
    if (sensors.sound?.enabled) a0Sensors.push('sound');
    if (sensors.gas?.enabled) a0Sensors.push('gas');

    if (a0Sensors.length > 1) {
        warnings += `
#if ${a0Sensors.map(s => `SENSOR_${s.toUpperCase()}_ENABLED`).join(' && ')}
  #error "Multiple sensors enabled on pin A0: ${a0Sensors.join(', ')}. Only one can be used."
#endif
`;
    }

    return warnings;
}

// Generate installation instructions
function generateInstallationInstructions(deviceId, deviceName, sensors) {
    const enabledSensors = Object.keys(sensors).filter(key => sensors[key]?.enabled);

    return `# Installation Instructions for ${deviceName} (${deviceId})

## Prerequisites

1. **Arduino IDE** - Download from https://www.arduino.cc/en/software
2. **ESP8266 Board Package** - Install via Arduino IDE Board Manager
3. **Required Libraries** - See REQUIRED_LIBRARIES.txt

## Installation Steps

### 1. Setup Arduino IDE
1. Open Arduino IDE
2. Go to File → Preferences
3. Add this URL to "Additional Board Manager URLs":
   \`http://arduino.esp8266.com/stable/package_esp8266com_index.json\`
4. Go to Tools → Board → Board Manager
5. Search for "ESP8266" and install the latest version

### 2. Install Libraries
1. Go to Sketch → Include Library → Manage Libraries
2. Install each library listed in REQUIRED_LIBRARIES.txt
3. Restart Arduino IDE after installation

### 3. Upload Firmware
1. Connect your ESP8266 device via USB
2. Open the \`.ino\` file in Arduino IDE
3. Ensure \`device_config.h\` is in the same folder
4. Select your board: Tools → Board → ESP8266 Boards → NodeMCU 1.0
5. Select the correct port: Tools → Port → [your ESP8266 port]
6. Click Upload (arrow button)

### 4. Verify Installation
1. Open Serial Monitor (Tools → Serial Monitor)
2. Set baud rate to 115200
3. Reset the ESP8266
4. You should see configuration details and sensor initialization

## Enabled Sensors
${enabledSensors.length > 0
    ? enabledSensors.map(sensor => `- ${sensor.toUpperCase()}`).join('\n')
    : 'No sensors enabled'
}

## Troubleshooting

**Upload Failed:**
- Check USB cable and driver installation
- Try different USB ports
- Hold FLASH button during upload if needed

**WiFi Connection Issues:**
- Verify SSID and password in device_config.h
- Check WiFi signal strength
- Ensure 2.4GHz network (ESP8266 doesn't support 5GHz)

**Sensor Issues:**
- Verify wiring according to WIRING_DIAGRAM.txt
- Check power supply (3.3V/5V requirements)
- Review pin assignments in device_config.h

**Server Communication:**
- Verify server URL is correct and accessible
- Check firewall settings
- Ensure server is running and API endpoints are available

## Support

For additional help, refer to:
- ESP8266 documentation: https://arduino-esp8266.readthedocs.io/
- Arduino community forums: https://forum.arduino.cc/
`;
}

// Generate libraries list
function generateLibrariesList(sensors) {
    const libraries = new Set([
        'ESP8266WiFi (included with ESP8266 board package)',
        'ESP8266HTTPClient (included with ESP8266 board package)',
        'ArduinoJson (by Benoit Blanchon)'
    ]);

    if (sensors.temperature_humidity?.enabled) {
        libraries.add('DHT sensor library (by Adafruit)');
        libraries.add('Adafruit Unified Sensor (dependency)');
    }

    if (sensors.distance?.enabled) {
        libraries.add('Ultrasonic (by ErickSimoes) or NewPing');
    }

    return `Required Arduino Libraries for ESP8266 Firmware

Install these libraries through Arduino IDE:
Sketch → Include Library → Manage Libraries

Required Libraries:
${Array.from(libraries).map(lib => `- ${lib}`).join('\n')}

Installation Notes:
1. Some libraries are automatically included with the ESP8266 board package
2. For Adafruit libraries, you may be prompted to install dependencies - click "Install All"
3. If a library is not found, try searching with different keywords
4. Restart Arduino IDE after installing libraries
`;
}

// Generate wiring diagram
function generateWiringDiagram(sensors) {
    let diagram = `ESP8266 Wiring Diagram
======================

ESP8266 NodeMCU Pin Layout:
    ┌─────────────────────────┐
    │  RST              RST   │
    │  A0               D0    │
    │  GND              D1    │
    │  VV               D2    │
    │  S3               D3    │
    │  S2               D4    │
    │  S1               D5    │
    │  SC               D6    │
    │  S0               D7    │
    │  SK               D8    │
    │  GND              3V3   │
    │  3V3              GND   │
    │  EN               5V    │
    │                         │
    │     [USB Connector]     │
    └─────────────────────────┘

Sensor Connections:
==================
`;

    if (sensors.temperature_humidity?.enabled) {
        const pin = sensors.temperature_humidity.pin || 'D4';
        diagram += `
DHT22 Temperature/Humidity Sensor:
- VCC → 3.3V or 5V
- GND → GND
- DATA → ${pin}
- 10kΩ pull-up resistor between DATA and VCC
`;
    }

    if (sensors.light?.enabled) {
        diagram += `
Light Sensor (LDR):
- One leg → A0
- Other leg → GND
- 10kΩ resistor between A0 and 3.3V
`;
    }

    if (sensors.motion?.enabled) {
        const pin = sensors.motion.pin || 'D2';
        diagram += `
PIR Motion Sensor:
- VCC → 5V (or 3.3V for some modules)
- GND → GND
- OUT → ${pin}
`;
    }

    if (sensors.distance?.enabled) {
        const triggerPin = sensors.distance.trigger_pin || 'D5';
        const echoPin = sensors.distance.echo_pin || 'D6';
        diagram += `
HC-SR04 Ultrasonic Distance Sensor:
- VCC → 5V
- GND → GND
- Trig → ${triggerPin}
- Echo → ${echoPin}
`;
    }

    if (sensors.magnetic?.enabled) {
        const pin = sensors.magnetic.pin || 'D3';
        diagram += `
Magnetic Reed Switch:
- One wire → ${pin}
- Other wire → GND
- Internal pull-up resistor enabled in software
`;
    }

    if (sensors.vibration?.enabled) {
        const pin = sensors.vibration.pin || 'D7';
        diagram += `
Vibration Sensor:
- VCC → 3.3V or 5V
- GND → GND
- OUT → ${pin}
`;
    }

    if (sensors.sound?.enabled) {
        diagram += `
Sound Level Sensor:
- VCC → 3.3V or 5V
- GND → GND
- OUT → A0
`;
    }

    if (sensors.gas?.enabled) {
        diagram += `
Gas Sensor (MQ series):
- VCC → 5V
- GND → GND
- AOUT → A0
- DOUT → (not connected)
`;
    }

    diagram += `
Power Supply:
============
- ESP8266 operates at 3.3V logic level
- Some sensors require 5V power supply
- USB provides 5V, onboard regulator provides 3.3V
- Total current consumption depends on enabled sensors

Important Notes:
===============
- Only ONE sensor can use pin A0 at a time
- Some pins have special functions - avoid D0, D3, D4, D8 for sensors if possible
- Use appropriate voltage levels for each sensor
- Double-check connections before powering on
`;

    return diagram;
}

module.exports = router;