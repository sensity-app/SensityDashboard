const express = require('express');
const router = express.Router();

// Predefined firmware templates for common use cases
const templates = {
    kitchen_monitor: {
        name: 'Kitchen Monitor',
        description: 'Complete kitchen environment monitoring with temperature, humidity, motion, and safety sensors',
        icon: '🍳',
        category: 'home_automation',
        config: {
            device_name: 'Kitchen Monitor',
            device_location: 'Kitchen',
            heartbeat_interval: 300,
            sensor_read_interval: 10000,
            debug_mode: false,
            ota_enabled: true,
            device_armed: true,
            sensors: {
                temperature_humidity: {
                    enabled: true,
                    pin: 'D4',
                    temp_min: 10.0,
                    temp_max: 40.0,
                    humidity_min: 30.0,
                    humidity_max: 90.0
                },
                light: {
                    enabled: true,
                    min: 50,
                    max: 950,
                    calibration_offset: 0.0,
                    calibration_multiplier: 1.0
                },
                motion: {
                    enabled: true,
                    pin: 'D2',
                    timeout: 60000
                },
                gas: {
                    enabled: false, // Disabled by default due to A0 conflict
                    min: 100,
                    max: 500
                },
                magnetic: {
                    enabled: true,
                    pin: 'D3'
                },
                distance: {
                    enabled: false
                },
                sound: {
                    enabled: false
                },
                vibration: {
                    enabled: false
                }
            }
        },
        required_sensors: [
            'DHT22 Temperature/Humidity sensor',
            'LDR (Light Dependent Resistor)',
            'PIR Motion Sensor',
            'Magnetic Reed Switch (for cabinet doors)'
        ],
        optional_sensors: [
            'MQ Gas Sensor (conflicts with Light sensor)',
            'Sound sensor',
            'Vibration sensor'
        ],
        use_cases: [
            'Monitor cooking temperature and humidity',
            'Detect kitchen occupancy',
            'Monitor cabinet door openings',
            'Safety monitoring (gas leaks if sensor enabled)',
            'Energy efficiency tracking'
        ]
    },

    security_node: {
        name: 'Security Monitor',
        description: 'Comprehensive security monitoring with motion, distance, door/window, and vibration detection',
        icon: '🛡️',
        category: 'security',
        config: {
            device_name: 'Security Monitor',
            device_location: 'Front Door',
            heartbeat_interval: 60,
            sensor_read_interval: 2000,
            debug_mode: false,
            ota_enabled: true,
            device_armed: true,
            sensors: {
                temperature_humidity: {
                    enabled: true,
                    pin: 'D4',
                    temp_min: -5.0,
                    temp_max: 45.0,
                    humidity_min: 10.0,
                    humidity_max: 95.0
                },
                light: {
                    enabled: true,
                    min: 20,
                    max: 980,
                    calibration_offset: 0.0,
                    calibration_multiplier: 1.0
                },
                motion: {
                    enabled: true,
                    pin: 'D2',
                    timeout: 10000
                },
                distance: {
                    enabled: true,
                    trigger_pin: 'D5',
                    echo_pin: 'D6',
                    min: 10.0,
                    max: 100.0
                },
                magnetic: {
                    enabled: true,
                    pin: 'D3'
                },
                vibration: {
                    enabled: true,
                    pin: 'D7'
                },
                sound: {
                    enabled: false // Conflicts with light
                },
                gas: {
                    enabled: false
                }
            }
        },
        required_sensors: [
            'PIR Motion Sensor',
            'HC-SR04 Ultrasonic Distance Sensor',
            'Magnetic Reed Switch',
            'Vibration Sensor',
            'DHT22 (optional for environmental monitoring)'
        ],
        optional_sensors: [
            'Sound level sensor (conflicts with Light)',
            'LDR Light sensor'
        ],
        use_cases: [
            'Perimeter intrusion detection',
            'Door and window monitoring',
            'Forced entry detection (vibration)',
            'Proximity alerts',
            'Environmental monitoring'
        ]
    },

    environmental_monitor: {
        name: 'Environmental Monitor',
        description: 'Indoor climate and air quality monitoring for optimal comfort and health',
        icon: '🌿',
        category: 'environmental',
        config: {
            device_name: 'Environmental Monitor',
            device_location: 'Living Room',
            heartbeat_interval: 600,
            sensor_read_interval: 30000,
            debug_mode: false,
            ota_enabled: true,
            device_armed: true,
            sensors: {
                temperature_humidity: {
                    enabled: true,
                    pin: 'D4',
                    temp_min: 16.0,
                    temp_max: 28.0,
                    humidity_min: 30.0,
                    humidity_max: 70.0
                },
                light: {
                    enabled: true,
                    min: 30,
                    max: 950,
                    calibration_offset: 0.0,
                    calibration_multiplier: 1.0
                },
                gas: {
                    enabled: false, // Can be enabled instead of light for air quality
                    min: 100,
                    max: 400
                },
                motion: {
                    enabled: false, // Optional occupancy detection
                    pin: 'D2',
                    timeout: 300000
                },
                distance: {
                    enabled: false
                },
                magnetic: {
                    enabled: false
                },
                vibration: {
                    enabled: false
                },
                sound: {
                    enabled: false
                }
            }
        },
        required_sensors: [
            'DHT22 Temperature/Humidity sensor',
            'LDR Light sensor OR MQ Gas sensor for air quality'
        ],
        optional_sensors: [
            'PIR Motion sensor (for occupancy)',
            'Sound level sensor'
        ],
        use_cases: [
            'HVAC optimization',
            'Comfort monitoring',
            'Air quality tracking',
            'Light level monitoring',
            'Energy efficiency'
        ]
    },

    greenhouse_monitor: {
        name: 'Greenhouse Monitor',
        description: 'Plant growth environment monitoring with irrigation and climate control support',
        icon: '🏡',
        category: 'agriculture',
        config: {
            device_name: 'Greenhouse Monitor',
            device_location: 'Greenhouse',
            heartbeat_interval: 300,
            sensor_read_interval: 15000,
            debug_mode: false,
            ota_enabled: true,
            device_armed: true,
            sensors: {
                temperature_humidity: {
                    enabled: true,
                    pin: 'D4',
                    temp_min: 12.0,
                    temp_max: 35.0,
                    humidity_min: 40.0,
                    humidity_max: 95.0
                },
                light: {
                    enabled: true,
                    min: 100,
                    max: 900,
                    calibration_offset: 0.0,
                    calibration_multiplier: 1.0
                },
                distance: {
                    enabled: true,
                    trigger_pin: 'D5',
                    echo_pin: 'D6',
                    min: 5.0,
                    max: 50.0 // Water tank level monitoring
                },
                motion: {
                    enabled: true,
                    pin: 'D2',
                    timeout: 120000 // Security
                },
                magnetic: {
                    enabled: true,
                    pin: 'D3' // Door monitoring
                },
                vibration: {
                    enabled: true,
                    pin: 'D7' // Wind/structural monitoring
                },
                gas: {
                    enabled: false // Would conflict with light
                },
                sound: {
                    enabled: false
                }
            }
        },
        required_sensors: [
            'DHT22 Temperature/Humidity sensor',
            'LDR Light sensor (for grow light automation)',
            'HC-SR04 (for water tank level)',
            'PIR Motion sensor (security)',
            'Magnetic Reed Switch (door monitoring)',
            'Vibration sensor (wind detection)'
        ],
        optional_sensors: [
            'MQ CO2 sensor (instead of light sensor)',
            'Soil moisture sensors (additional hardware needed)'
        ],
        use_cases: [
            'Plant health monitoring',
            'Automated irrigation alerts',
            'Climate control automation',
            'Security monitoring',
            'Growth environment optimization'
        ]
    },

    simple_temp_monitor: {
        name: 'Simple Temperature Monitor',
        description: 'Basic temperature and humidity monitoring - perfect for beginners',
        icon: '🌡️',
        category: 'basic',
        config: {
            device_name: 'Temperature Monitor',
            device_location: 'Home',
            heartbeat_interval: 300,
            sensor_read_interval: 30000,
            debug_mode: true, // Enable debug for beginners
            ota_enabled: true,
            device_armed: true,
            sensors: {
                temperature_humidity: {
                    enabled: true,
                    pin: 'D4',
                    temp_min: 15.0,
                    temp_max: 30.0,
                    humidity_min: 30.0,
                    humidity_max: 70.0
                },
                light: {
                    enabled: false
                },
                motion: {
                    enabled: false
                },
                distance: {
                    enabled: false
                },
                magnetic: {
                    enabled: false
                },
                vibration: {
                    enabled: false
                },
                sound: {
                    enabled: false
                },
                gas: {
                    enabled: false
                }
            }
        },
        required_sensors: [
            'DHT22 Temperature/Humidity sensor'
        ],
        optional_sensors: [],
        use_cases: [
            'Basic home monitoring',
            'Learning IoT development',
            'Simple data logging'
        ]
    },

    workshop_monitor: {
        name: 'Workshop Monitor',
        description: 'Monitor workshop environment including sound levels, vibration, and air quality',
        icon: '🔨',
        category: 'industrial',
        config: {
            device_name: 'Workshop Monitor',
            device_location: 'Workshop',
            heartbeat_interval: 180,
            sensor_read_interval: 5000,
            debug_mode: false,
            ota_enabled: true,
            device_armed: true,
            sensors: {
                temperature_humidity: {
                    enabled: true,
                    pin: 'D4',
                    temp_min: 5.0,
                    temp_max: 45.0,
                    humidity_min: 20.0,
                    humidity_max: 85.0
                },
                sound: {
                    enabled: true, // Monitor noise levels
                    min: 200,
                    max: 800
                },
                vibration: {
                    enabled: true,
                    pin: 'D7'
                },
                motion: {
                    enabled: true,
                    pin: 'D2',
                    timeout: 30000
                },
                magnetic: {
                    enabled: true,
                    pin: 'D3' // Tool cabinet monitoring
                },
                gas: {
                    enabled: false // Can be enabled instead of sound
                },
                light: {
                    enabled: false
                },
                distance: {
                    enabled: false
                }
            }
        },
        required_sensors: [
            'DHT22 Temperature/Humidity sensor',
            'Sound level sensor',
            'Vibration sensor',
            'PIR Motion sensor',
            'Magnetic Reed Switch'
        ],
        optional_sensors: [
            'MQ Gas sensor (for air quality, conflicts with sound)',
            'HC-SR04 Distance sensor'
        ],
        use_cases: [
            'Noise level monitoring',
            'Equipment vibration monitoring',
            'Workshop occupancy tracking',
            'Tool cabinet security',
            'Environmental safety'
        ]
    }
};

// Get all available templates
router.get('/', (req, res) => {
    const templateSummary = Object.entries(templates).map(([key, template]) => ({
        id: key,
        name: template.name,
        description: template.description,
        icon: template.icon,
        category: template.category,
        sensor_count: Object.values(template.config.sensors).filter(s => s.enabled).length,
        use_cases: template.use_cases.slice(0, 3) // First 3 use cases for preview
    }));

    res.json({
        success: true,
        templates: templateSummary,
        categories: [
            { id: 'basic', name: 'Basic Monitoring', description: 'Simple setups for beginners' },
            { id: 'home_automation', name: 'Home Automation', description: 'Smart home monitoring' },
            { id: 'security', name: 'Security Systems', description: 'Safety and security monitoring' },
            { id: 'environmental', name: 'Environmental', description: 'Climate and air quality' },
            { id: 'agriculture', name: 'Agriculture', description: 'Plant and crop monitoring' },
            { id: 'industrial', name: 'Industrial', description: 'Workshop and manufacturing' }
        ]
    });
});

// Get specific template details
router.get('/:templateId', (req, res) => {
    const templateId = req.params.templateId;
    const template = templates[templateId];

    if (!template) {
        return res.status(404).json({
            success: false,
            error: 'Template not found'
        });
    }

    res.json({
        success: true,
        template: {
            id: templateId,
            ...template
        }
    });
});

// Generate firmware from template
router.post('/:templateId/build', async (req, res) => {
    const templateId = req.params.templateId;
    const template = templates[templateId];

    if (!template) {
        return res.status(404).json({
            success: false,
            error: 'Template not found'
        });
    }

    try {
        const {
            device_id,
            wifi_ssid,
            wifi_password,
            server_url,
            api_key = '',
            customizations = {}
        } = req.body;

        // Validate required fields
        if (!device_id || !wifi_ssid || !wifi_password || !server_url) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: device_id, wifi_ssid, wifi_password, server_url'
            });
        }

        // Merge template config with customizations
        const finalConfig = {
            ...template.config,
            device_id,
            wifi_ssid,
            wifi_password,
            server_url,
            api_key,
            ...customizations,
            sensors: {
                ...template.config.sensors,
                ...customizations.sensors
            }
        };

        // Forward to the main firmware builder
        const buildResponse = await fetch(`${req.protocol}://${req.get('host')}/api/firmware-builder/build`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(finalConfig)
        });

        if (buildResponse.ok) {
            const buffer = await buildResponse.buffer();

            // Set response headers for file download
            res.set({
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${device_id}_${templateId}_firmware.zip"`,
                'Content-Length': buffer.length
            });

            console.log(`Generated firmware from template: ${templateId} for device: ${device_id}`);
            res.send(buffer);
        } else {
            const error = await buildResponse.json();
            res.status(buildResponse.status).json(error);
        }

    } catch (error) {
        console.error('Template firmware generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate firmware from template'
        });
    }
});

// Get template recommendations based on sensors
router.post('/recommend', (req, res) => {
    const { available_sensors = [], use_case = '', environment = '' } = req.body;

    // Simple recommendation logic
    const recommendations = [];

    // Match by available sensors
    Object.entries(templates).forEach(([key, template]) => {
        const enabledSensors = Object.entries(template.config.sensors)
            .filter(([_, config]) => config.enabled)
            .map(([sensorType, _]) => sensorType);

        const matchScore = enabledSensors.filter(sensor =>
            available_sensors.includes(sensor)
        ).length / enabledSensors.length;

        if (matchScore > 0.3) { // At least 30% sensor match
            recommendations.push({
                id: key,
                name: template.name,
                description: template.description,
                icon: template.icon,
                category: template.category,
                match_score: matchScore,
                missing_sensors: enabledSensors.filter(sensor =>
                    !available_sensors.includes(sensor)
                ),
                use_cases: template.use_cases
            });
        }
    });

    // Sort by match score
    recommendations.sort((a, b) => b.match_score - a.match_score);

    res.json({
        success: true,
        recommendations: recommendations.slice(0, 5), // Top 5 recommendations
        total_templates: Object.keys(templates).length
    });
});

module.exports = router;