const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const JSZip = require('jszip');
const db = require('../models/database');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const firmwareCompiler = require('../services/firmwareCompiler');

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

// Helper function to register device in database
async function registerDeviceInDatabase(config) {
    const {
        device_id,
        device_name,
        location_id,
        device_location,
        platform,
        wifi_ssid,
        wifi_password,
        ota_enabled,
        heartbeat_interval,
        sensors,
        user
    } = config;

    // Map sensor types to database sensor type names
    const sensorTypeMapping = {
        'light': 'Photodiode',
        'temperature_humidity': 'Temperature',
        'motion': 'Motion',
        'distance': 'Distance',
        'sound': 'Sound',
        'gas': 'Gas',
        'pressure': 'Pressure'
    };

    try {
        // Check if device already exists
        const existingDevice = await db.query('SELECT id FROM devices WHERE id = $1', [device_id]);

        if (existingDevice.rows.length > 0) {
            // Update existing device
            await db.query(`
                UPDATE devices
                SET name = $1,
                    location_id = $2,
                    device_type = $3,
                    wifi_ssid = $4,
                    wifi_password = $5,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $6
            `, [device_name, location_id, platform, wifi_ssid, wifi_password, device_id]);

            logger.info(`Updated existing device: ${device_id} by ${user?.email || 'system'}`);
        } else {
            // Insert new device
            await db.query(`
                INSERT INTO devices (id, name, location_id, device_type, wifi_ssid, wifi_password, status)
                VALUES ($1, $2, $3, $4, $5, $6, 'offline')
            `, [device_id, device_name, location_id, platform, wifi_ssid, wifi_password]);

            logger.info(`Registered new device: ${device_id} (${device_name}) by ${user?.email || 'system'}`);
        }

        // Create or update device config
        await db.query(`
            INSERT INTO device_configs (device_id, armed, heartbeat_interval, ota_enabled)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (device_id) DO UPDATE
            SET heartbeat_interval = $3, ota_enabled = $4, updated_at = CURRENT_TIMESTAMP
        `, [device_id, true, heartbeat_interval, ota_enabled]);

        // Register sensors if provided
        if (sensors && sensors.length > 0) {
            for (const sensor of sensors) {
                if (!sensor.enabled) continue;

                const sensorTypeName = sensorTypeMapping[sensor.type] || sensor.type;

                // Get sensor type ID
                const sensorTypeResult = await db.query(
                    'SELECT id FROM sensor_types WHERE LOWER(name) = LOWER($1)',
                    [sensorTypeName]
                );

                if (sensorTypeResult.rows.length === 0) {
                    logger.warn(`Sensor type not found: ${sensorTypeName}, skipping sensor registration`);
                    continue;
                }

                const sensorTypeId = sensorTypeResult.rows[0].id;

                // Insert or update device sensor
                await db.query(`
                    INSERT INTO device_sensors (device_id, sensor_type_id, pin, name, calibration_offset, calibration_multiplier, enabled)
                    VALUES ($1, $2, $3, $4, $5, $6, true)
                    ON CONFLICT (device_id, pin) DO UPDATE
                    SET sensor_type_id = $2,
                        name = $4,
                        calibration_offset = $5,
                        calibration_multiplier = $6,
                        enabled = true
                `, [
                    device_id,
                    sensorTypeId,
                    sensor.pin,
                    sensor.name || sensor.type,
                    sensor.calibration_offset || sensor.light_calibration_offset || 0,
                    sensor.calibration_multiplier || sensor.light_calibration_multiplier || 1
                ]);

                logger.info(`Registered sensor: ${sensor.name || sensor.type} (${sensor.pin}) for device ${device_id}`);
            }
        }

        return { success: true, device_id };
    } catch (error) {
        logger.error(`Failed to register device ${device_id}:`, error);
        throw error;
    }
}

// Firmware builder route - requires authentication
router.post('/build', authenticateToken, async (req, res) => {
    try {
        const {
            // Platform
            platform = 'esp8266',

            // Device configuration
            device_id,
            device_name,
            device_location,
            location_id,
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

        // Read base firmware files based on platform
        const firmwarePath = path.join(__dirname, '../../../firmware');
        const platformConfig = getPlatformConfig(platform);

        let mainFirmware;
        let mainFilename;

        switch(platform) {
            case 'esp32':
                mainFirmware = await fs.readFile(path.join(firmwarePath, 'esp32_sensor_platform.ino'), 'utf8');
                mainFilename = 'esp32_sensor_platform.ino';
                break;
            case 'arduino':
                mainFirmware = await fs.readFile(path.join(firmwarePath, 'arduino_sensor_platform.ino'), 'utf8');
                mainFilename = 'arduino_sensor_platform.ino';
                break;
            case 'raspberry_pi':
                mainFirmware = await fs.readFile(path.join(firmwarePath, 'raspberry_pi_sensor_platform.py'), 'utf8');
                mainFilename = 'sensor_platform.py';
                // Replace config placeholders in Python script
                mainFirmware = replacePythonConfig(mainFirmware, {
                    device_id,
                    device_name,
                    device_location,
                    wifi_ssid,
                    wifi_password,
                    server_url,
                    api_key,
                    heartbeat_interval,
                    sensor_read_interval,
                    debug_mode,
                    sensors: sensorsObject
                });
                break;
            default: // esp8266
                mainFirmware = await fs.readFile(path.join(firmwarePath, 'esp8266_sensor_platform.ino'), 'utf8');
                mainFilename = 'esp8266_sensor_platform.ino';
        }

        // Create firmware package
        const zip = new JSZip();

        // Add configuration based on platform
        if (platform === 'raspberry_pi') {
            // For Python, config is embedded in the script
            zip.file(mainFilename, mainFirmware);
        } else {
            // For Arduino/ESP, add header file
            zip.file('device_config.h', configContent);
            zip.file(mainFilename, mainFirmware);
        }

        // Add installation instructions
        const instructions = generateInstallationInstructions(platform, device_id, device_name, sensors);
        zip.file('INSTALLATION_INSTRUCTIONS.md', instructions);

        // Add required libraries/dependencies list
        const librariesList = generateLibrariesList(platform, sensors);
        if (platform === 'raspberry_pi') {
            zip.file('requirements.txt', librariesList);
        } else {
            zip.file('REQUIRED_LIBRARIES.txt', librariesList);
        }

        // Add wiring diagram (text-based)
        const wiringDiagram = generateWiringDiagram(platform, sensors);
        zip.file('WIRING_DIAGRAM.txt', wiringDiagram);

        // Generate ZIP file
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

        // Register device in database (or update if already exists)
        try {
            await registerDeviceInDatabase({
                device_id,
                device_name,
                location_id: location_id || null,
                device_location,
                platform,
                wifi_ssid,
                wifi_password,
                ota_enabled,
                heartbeat_interval,
                sensors,
                user: req.user
            });
            logger.info(`Device ${device_id} registered by authenticated user ${req.user.email}`);
        } catch (dbError) {
            logger.warn(`Device registration failed for ${device_id}, but firmware was generated:`, dbError.message);
            // Continue with firmware download even if DB registration fails
        }

        // Set response headers for file download
        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${device_id}_firmware.zip"`,
            'Content-Length': zipBuffer.length
        });

        // Log firmware generation
        logger.info(`Generated firmware for device: ${device_id} (${device_name}) by ${req.user?.email || 'unknown'}`);

        res.send(zipBuffer);

    } catch (error) {
        logger.error('Firmware generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate firmware package'
        });
    }
});

// POST /api/firmware-builder/compile - Compile firmware to binary for web flashing
router.post('/compile', authenticateToken, async (req, res) => {
    try {
        const {
            platform = 'esp8266',
            device_id,
            device_name,
            device_location,
            wifi_ssid,
            wifi_password,
            open_wifi = false,
            server_url,
            api_key,
            heartbeat_interval = 300,
            sensor_read_interval = 5000,
            debug_mode = false,
            ota_enabled = true,
            device_armed = true,
            sensors = []
        } = req.body;

        // Validate required fields
        if (!device_id || !device_name || !wifi_ssid || !server_url) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: device_id, device_name, wifi_ssid, server_url'
            });
        }

        // Only support ESP8266 for now
        if (platform !== 'esp8266') {
            return res.status(400).json({
                success: false,
                error: 'Web flashing currently only supports ESP8266 platform'
            });
        }

        // Convert sensor array to object format
        const sensorsObject = convertSensorArrayToObject(sensors);

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

        // Read base firmware file
        const firmwarePath = path.join(__dirname, '../../../firmware');
        const mainFirmware = await fs.readFile(path.join(firmwarePath, 'esp8266_sensor_platform.ino'), 'utf8');

        logger.info(`Compiling firmware for device: ${device_id} (${device_name})`);

        // Compile firmware using arduino-cli
        const compilationResult = await firmwareCompiler.compile(device_id, mainFirmware, configContent);

        if (!compilationResult.success) {
            return res.status(500).json({
                success: false,
                error: 'Firmware compilation failed'
            });
        }

        logger.info(`Firmware compiled successfully for ${device_id}`);

        // Return compiled binary for web flashing
        res.json({
            success: true,
            device_id,
            flashFiles: compilationResult.flashFiles,
            chipFamily: 'ESP8266',
            message: 'Firmware compiled successfully'
        });

    } catch (error) {
        logger.error('Firmware compilation error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to compile firmware'
        });
    }
});

// Platform-specific configurations
const getPlatformConfig = (platform) => {
    const configs = {
        esp8266: {
            name: 'ESP8266',
            wifi_capable: true,
            extension: '.ino',
            language: 'C++',
            available_pins: {
                digital: [
                    { pin: 'D0', label: 'D0', note: 'LED_BUILTIN, no PWM/interrupt (GPIO16)' },
                    { pin: 'D1', label: 'D1', note: 'SCL - avoid if using I2C (GPIO5)' },
                    { pin: 'D2', label: 'D2', note: 'SDA - avoid if using I2C (GPIO4)' },
                    { pin: 'D3', label: 'D3', note: 'FLASH button, pull-up required (GPIO0)' },
                    { pin: 'D4', label: 'D4', note: 'LED_BUILTIN on some boards, pull-up required (GPIO2)' },
                    { pin: 'D5', label: 'D5', note: 'SCK (GPIO14)' },
                    { pin: 'D6', label: 'D6', note: 'MISO (GPIO12)' },
                    { pin: 'D7', label: 'D7', note: 'MOSI (GPIO13)' },
                    { pin: 'D8', label: 'D8', note: 'SS, pull-down required (GPIO15)' }
                ],
                analog: [
                    { pin: 'A0', label: 'A0', note: 'Analog input, 0-1V range (ADC0)' }
                ]
            }
        },
        esp32: {
            name: 'ESP32',
            wifi_capable: true,
            extension: '.ino',
            language: 'C++',
            available_pins: {
                digital: [
                    { pin: 'GPIO2', label: 'GPIO2', note: 'Built-in LED on some boards' },
                    { pin: 'GPIO4', label: 'GPIO4', note: 'General purpose' },
                    { pin: 'GPIO5', label: 'GPIO5', note: 'General purpose' },
                    { pin: 'GPIO12', label: 'GPIO12', note: 'General purpose' },
                    { pin: 'GPIO13', label: 'GPIO13', note: 'General purpose' },
                    { pin: 'GPIO14', label: 'GPIO14', note: 'General purpose' },
                    { pin: 'GPIO15', label: 'GPIO15', note: 'General purpose' },
                    { pin: 'GPIO16', label: 'GPIO16', note: 'General purpose' },
                    { pin: 'GPIO17', label: 'GPIO17', note: 'General purpose' },
                    { pin: 'GPIO18', label: 'GPIO18', note: 'General purpose' },
                    { pin: 'GPIO19', label: 'GPIO19', note: 'General purpose' },
                    { pin: 'GPIO21', label: 'GPIO21', note: 'I2C SDA' },
                    { pin: 'GPIO22', label: 'GPIO22', note: 'I2C SCL' },
                    { pin: 'GPIO23', label: 'GPIO23', note: 'General purpose' },
                    { pin: 'GPIO25', label: 'GPIO25', note: 'DAC1 output' },
                    { pin: 'GPIO26', label: 'GPIO26', note: 'DAC2 output' },
                    { pin: 'GPIO27', label: 'GPIO27', note: 'General purpose' },
                    { pin: 'GPIO32', label: 'GPIO32', note: 'ADC capable' },
                    { pin: 'GPIO33', label: 'GPIO33', note: 'ADC capable' }
                ],
                analog: [
                    { pin: 'GPIO32', label: 'GPIO32', note: 'ADC 0-3.3V (ADC1_CH4)' },
                    { pin: 'GPIO33', label: 'GPIO33', note: 'ADC 0-3.3V (ADC1_CH5)' },
                    { pin: 'GPIO34', label: 'GPIO34', note: 'Input only, ADC 0-3.3V (ADC1_CH6)' },
                    { pin: 'GPIO35', label: 'GPIO35', note: 'Input only, ADC 0-3.3V (ADC1_CH7)' },
                    { pin: 'GPIO36', label: 'GPIO36', note: 'Input only, ADC 0-3.3V (VP)' },
                    { pin: 'GPIO39', label: 'GPIO39', note: 'Input only, ADC 0-3.3V (VN)' }
                ]
            }
        },
        arduino: {
            name: 'Arduino',
            wifi_capable: false,
            extension: '.ino',
            language: 'C++',
            available_pins: {
                digital: [
                    { pin: '2', label: 'Pin 2', note: 'Interrupt capable' },
                    { pin: '3', label: 'Pin 3', note: 'PWM, Interrupt' },
                    { pin: '4', label: 'Pin 4', note: 'General purpose' },
                    { pin: '5', label: 'Pin 5', note: 'PWM capable' },
                    { pin: '6', label: 'Pin 6', note: 'PWM capable' },
                    { pin: '7', label: 'Pin 7', note: 'General purpose' },
                    { pin: '8', label: 'Pin 8', note: 'General purpose' },
                    { pin: '9', label: 'Pin 9', note: 'PWM capable' },
                    { pin: '10', label: 'Pin 10', note: 'PWM, SPI SS' },
                    { pin: '11', label: 'Pin 11', note: 'PWM, SPI MOSI' },
                    { pin: '12', label: 'Pin 12', note: 'SPI MISO' },
                    { pin: '13', label: 'Pin 13', note: 'Built-in LED, SPI SCK' }
                ],
                analog: [
                    { pin: 'A0', label: 'A0', note: 'ADC 0-5V' },
                    { pin: 'A1', label: 'A1', note: 'ADC 0-5V' },
                    { pin: 'A2', label: 'A2', note: 'ADC 0-5V' },
                    { pin: 'A3', label: 'A3', note: 'ADC 0-5V' },
                    { pin: 'A4', label: 'A4', note: 'ADC 0-5V, I2C SDA' },
                    { pin: 'A5', label: 'A5', note: 'ADC 0-5V, I2C SCL' }
                ]
            }
        },
        raspberry_pi: {
            name: 'Raspberry Pi',
            wifi_capable: true,
            extension: '.py',
            language: 'Python',
            available_pins: {
                digital: [
                    { pin: 'GPIO2', label: 'GPIO2', note: 'I2C SDA (Pin 3)' },
                    { pin: 'GPIO3', label: 'GPIO3', note: 'I2C SCL (Pin 5)' },
                    { pin: 'GPIO4', label: 'GPIO4', note: 'General purpose (Pin 7)' },
                    { pin: 'GPIO17', label: 'GPIO17', note: 'General purpose (Pin 11)' },
                    { pin: 'GPIO27', label: 'GPIO27', note: 'General purpose (Pin 13)' },
                    { pin: 'GPIO22', label: 'GPIO22', note: 'General purpose (Pin 15)' },
                    { pin: 'GPIO10', label: 'GPIO10', note: 'SPI MOSI (Pin 19)' },
                    { pin: 'GPIO9', label: 'GPIO9', note: 'SPI MISO (Pin 21)' },
                    { pin: 'GPIO11', label: 'GPIO11', note: 'SPI SCLK (Pin 23)' },
                    { pin: 'GPIO5', label: 'GPIO5', note: 'General purpose (Pin 29)' },
                    { pin: 'GPIO6', label: 'GPIO6', note: 'General purpose (Pin 31)' },
                    { pin: 'GPIO13', label: 'GPIO13', note: 'PWM capable (Pin 33)' },
                    { pin: 'GPIO19', label: 'GPIO19', note: 'PWM capable (Pin 35)' },
                    { pin: 'GPIO26', label: 'GPIO26', note: 'General purpose (Pin 37)' }
                ],
                analog: [
                    { pin: 'MCP3008_CH0', label: 'Channel 0', note: 'Requires MCP3008 ADC chip' },
                    { pin: 'MCP3008_CH1', label: 'Channel 1', note: 'Requires MCP3008 ADC chip' },
                    { pin: 'MCP3008_CH2', label: 'Channel 2', note: 'Requires MCP3008 ADC chip' },
                    { pin: 'MCP3008_CH3', label: 'Channel 3', note: 'Requires MCP3008 ADC chip' }
                ]
            }
        }
    };

    return configs[platform] || configs.esp8266;
};

// Generate sensor configuration options
router.get('/sensor-options', (req, res) => {
    const platform = req.query.platform || 'esp8266';
    const platformConfig = getPlatformConfig(platform);

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

    // Generate pin mapping from available pins
    const pin_mapping = {};
    platformConfig.available_pins.digital.forEach(p => {
        pin_mapping[p.pin] = `${p.label} - ${p.note}`;
    });
    platformConfig.available_pins.analog.forEach(p => {
        pin_mapping[p.pin] = `${p.label} - ${p.note}`;
    });

    res.json({
        success: true,
        platform: platformConfig.name,
        wifi_capable: platformConfig.wifi_capable,
        sensors: sensorOptions,
        pin_mapping: pin_mapping,
        available_pins: platformConfig.available_pins
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
#define TEMP_THRESHOLD_MIN ${s.temperature_min || -10.0}
#define TEMP_THRESHOLD_MAX ${s.temperature_max || 40.0}
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

// Replace Python config placeholders
function replacePythonConfig(template, config) {
    let result = template;

    // Replace basic config
    result = result.replace(/{{DEVICE_ID}}/g, config.device_id);
    result = result.replace(/{{DEVICE_NAME}}/g, config.device_name);
    result = result.replace(/{{DEVICE_LOCATION}}/g, config.device_location || 'Unknown');
    result = result.replace(/{{FIRMWARE_VERSION}}/g, '1.0.0');
    result = result.replace(/{{WIFI_SSID}}/g, config.wifi_ssid);
    result = result.replace(/{{WIFI_PASSWORD}}/g, config.wifi_password);
    result = result.replace(/{{SERVER_URL}}/g, config.server_url);
    result = result.replace(/{{SERVER_API_KEY}}/g, config.api_key || '');
    result = result.replace(/{{HEARTBEAT_INTERVAL_SEC}}/g, config.heartbeat_interval);
    result = result.replace(/{{SENSOR_READ_INTERVAL_MS}}/g, config.sensor_read_interval);
    result = result.replace(/{{DEBUG_MODE}}/g, config.debug_mode ? 'True' : 'False');
    result = result.replace(/{{DEVICE_ARMED}}/g, config.device_armed ? 'True' : 'False');

    // Replace sensor config
    const sensors = config.sensors || {};
    result = result.replace(/{{SENSOR_DHT_ENABLED}}/g, sensors.temperature_humidity?.enabled ? 'True' : 'False');
    result = result.replace(/{{SENSOR_DHT_PIN}}/g, sensors.temperature_humidity?.pin || 4);
    result = result.replace(/{{SENSOR_DHT_TYPE}}/g, 'DHT22');

    result = result.replace(/{{SENSOR_LIGHT_ENABLED}}/g, sensors.light?.enabled ? 'True' : 'False');
    result = result.replace(/{{SENSOR_LIGHT_CHANNEL}}/g, '0');

    result = result.replace(/{{SENSOR_MOTION_ENABLED}}/g, sensors.motion?.enabled ? 'True' : 'False');
    result = result.replace(/{{SENSOR_MOTION_PIN}}/g, sensors.motion?.pin || 17);

    result = result.replace(/{{SENSOR_DISTANCE_ENABLED}}/g, sensors.distance?.enabled ? 'True' : 'False');
    result = result.replace(/{{SENSOR_DISTANCE_TRIGGER_PIN}}/g, sensors.distance?.trigger_pin || 23);
    result = result.replace(/{{SENSOR_DISTANCE_ECHO_PIN}}/g, sensors.distance?.echo_pin || 24);

    return result;
}

// Generate installation instructions
function generateInstallationInstructions(platform, deviceId, deviceName, sensors) {
    const enabledSensors = Object.keys(sensors).filter(key => sensors[key]?.enabled);

    const platformInstructions = {
        esp8266: `# Installation Instructions for ${deviceName} (${deviceId})

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
`,
        esp32: `# Installation Instructions for ${deviceName} (${deviceId})

## Prerequisites
1. **Arduino IDE** - Download from https://www.arduino.cc/en/software
2. **ESP32 Board Package** - Install via Arduino IDE Board Manager
3. **Required Libraries** - See REQUIRED_LIBRARIES.txt

## Installation Steps

### 1. Setup Arduino IDE for ESP32
1. Open Arduino IDE
2. Go to File → Preferences
3. Add this URL to "Additional Board Manager URLs":
   \`https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json\`
4. Go to Tools → Board → Board Manager
5. Search for "ESP32" and install the latest version

### 2. Install Libraries & Upload
Same as ESP8266 instructions, but select "ESP32 Dev Module" as board

## Enabled Sensors
${enabledSensors.map(s => `- ${s.toUpperCase()}`).join('\n') || 'No sensors'}

## ESP32 Advantages
- Dual-core processor for parallel sensor reading
- More GPIO pins and ADC channels
- Bluetooth support (future enhancement)
`,
        arduino: `# Installation Instructions for ${deviceName} (${deviceId})

## Prerequisites
1. **Arduino IDE** - Download from https://www.arduino.cc/en/software
2. **Arduino Uno/Nano/Mega board**
3. **WiFi Shield or ESP8266 Module** (optional, for network connectivity)
4. **Required Libraries** - See REQUIRED_LIBRARIES.txt

## Installation Steps

### 1. Install Libraries
1. Open Arduino IDE
2. Go to Sketch → Include Library → Manage Libraries
3. Install required libraries listed in REQUIRED_LIBRARIES.txt

### 2. Upload Firmware
1. Connect Arduino via USB
2. Open the .ino file
3. Select Tools → Board → Arduino Uno (or your board model)
4. Select correct port
5. Click Upload

### 3. Serial Communication
Arduino sends data via Serial. Connect to:
- Raspberry Pi or PC via USB for network forwarding
- ESP8266/ESP32 WiFi module for wireless connectivity

## Enabled Sensors
${enabledSensors.map(s => `- ${s.toUpperCase()}`).join('\n') || 'No sensors'}

## Note
Arduino boards without WiFi require external connectivity (ESP module, Ethernet shield, or USB-to-network bridge).
`,
        raspberry_pi: `# Installation Instructions for ${deviceName} (${deviceId})

## Prerequisites
1. **Raspberry Pi** (any model with GPIO - 3/4/Zero)
2. **Raspbian OS** installed
3. **Python 3.7+**
4. **Internet connection**

## Installation Steps

### 1. Install Python Dependencies
\`\`\`bash
cd /path/to/firmware
pip3 install -r requirements.txt
\`\`\`

### 2. Enable Interfaces (if needed)
\`\`\`bash
sudo raspi-config
# Enable: I2C, SPI, GPIO (if using these interfaces)
\`\`\`

### 3. Run the Script
\`\`\`bash
# Make executable
chmod +x sensor_platform.py

# Run
python3 sensor_platform.py

# Or run as service
sudo cp sensor_platform.py /usr/local/bin/
sudo cp sensor_platform.service /etc/systemd/system/
sudo systemctl enable sensor_platform
sudo systemctl start sensor_platform
\`\`\`

### 4. Check Status
\`\`\`bash
sudo systemctl status sensor_platform
journalctl -u sensor_platform -f
\`\`\`

## Enabled Sensors
${enabledSensors.map(s => `- ${s.toUpperCase()}`).join('\n') || 'No sensors'}

## Hardware Notes
- MCP3008 ADC required for analog sensors
- Connect sensors to GPIO pins as specified in wiring diagram
- Ensure proper 3.3V/5V levels for sensors
`
    };

    return platformInstructions[platform] || platformInstructions.esp8266;
}

// Generate libraries list
function generateLibrariesList(platform, sensors) {
    if (platform === 'raspberry_pi') {
        // Python requirements.txt format
        const packages = [
            'requests>=2.28.0',
            'RPi.GPIO>=0.7.1',
        ];

        if (sensors.temperature_humidity?.enabled) {
            packages.push('Adafruit-DHT>=1.4.0');
        }

        if (sensors.light?.enabled || sensors.gas?.enabled || sensors.sound?.enabled) {
            packages.push('adafruit-circuitpython-mcp3xxx>=1.4.0');
            packages.push('adafruit-blinka>=8.0.0');
        }

        return packages.join('\n');
    }

    // Arduino/ESP libraries
    const libraries = new Set(['ArduinoJson (by Benoit Blanchon)']);

    if (platform === 'esp8266') {
        libraries.add('ESP8266WiFi (included with ESP8266 board package)');
        libraries.add('ESP8266HTTPClient (included with ESP8266 board package)');
    } else if (platform === 'esp32') {
        libraries.add('WiFi (included with ESP32 board package)');
        libraries.add('HTTPClient (included with ESP32 board package)');
    }

    if (sensors.temperature_humidity?.enabled) {
        libraries.add('DHT sensor library (by Adafruit)');
        libraries.add('Adafruit Unified Sensor (dependency)');
    }

    if (sensors.distance?.enabled) {
        libraries.add('Ultrasonic (by ErickSimoes) or NewPing');
    }

    const platformName = platform === 'esp32' ? 'ESP32' : platform === 'arduino' ? 'Arduino' : 'ESP8266';

    return `Required Arduino Libraries for ${platformName} Firmware

Install these libraries through Arduino IDE:
Sketch → Include Library → Manage Libraries

Required Libraries:
${Array.from(libraries).map(lib => `- ${lib}`).join('\n')}

Installation Notes:
1. Some libraries are automatically included with the board package
2. For Adafruit libraries, you may be prompted to install dependencies - click "Install All"
3. If a library is not found, try searching with different keywords
4. Restart Arduino IDE after installing libraries
`;
}

// Generate wiring diagram
function generateWiringDiagram(platform, sensors) {
    const platformName = platform === 'esp32' ? 'ESP32' : platform === 'arduino' ? 'Arduino' : platform === 'raspberry_pi' ? 'Raspberry Pi' : 'ESP8266';

    let diagram = `${platformName} Wiring Diagram
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