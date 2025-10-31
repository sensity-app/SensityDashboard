import React, { useState, useEffect, useMemo } from 'react';
import {
    Download,
    Cpu,
    Wifi,
    Settings,
    Zap,
    AlertTriangle,
    CheckCircle,
    Info,
    MapPin,
    ArrowRight,
    ArrowLeft,
    Play,
    Smartphone,
    Monitor,
    Thermometer,
    Droplets,
    Sun,
    Wind,
    Activity,
    BarChart3,
    Shield,
    Key,
    Globe,
    Plus,
    X
} from 'lucide-react';
import WebFlasher from '../components/WebFlasher';
import { apiService } from '../services/api';
import { useTranslation } from 'react-i18next';

const FirmwareBuilder = () => {
    const { t } = useTranslation();
    const copy = useMemo(() => {
        const result = t('firmwareBuilder', { returnObjects: true });
        return typeof result === 'string' ? {} : result;
    }, [t]);

    const getCopy = (path, fallback) => {
        return path.split('.').reduce((acc, key) => {
            if (acc && typeof acc === 'object' && key in acc) {
                return acc[key];
            }
            return undefined;
        }, copy) ?? fallback;
    };
    const [sensorOptions, setSensorOptions] = useState({});
    const [pinMapping, setPinMapping] = useState({});
    const [availablePins, setAvailablePins] = useState({ digital: [], analog: [] });
    const [locations, setLocations] = useState([]);
    const [knownWifiNetworks, setKnownWifiNetworks] = useState([]);
    const [wifiCredentials, setWifiCredentials] = useState({}); // Store SSID -> password mapping
    const [loading, setLoading] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState(null);
    const [showWebFlasher, setShowWebFlasher] = useState(false);
    const [showLocationDropdown, setShowLocationDropdown] = useState(false);
    const [showWifiDropdown, setShowWifiDropdown] = useState(false);

    // Generate unique device ID
    const generateDeviceId = (platform = 'device') => {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 5);
        const normalizedPrefix = (platform || 'device')
            .toString()
            .replace(/[^a-zA-Z0-9]/g, '')
            .toUpperCase() || 'DEVICE';
        return `${normalizedPrefix}_${timestamp}_${random}`;
    };

    // Generate API key
    const generateApiKey = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 32; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    // Form state
    const [config, setConfig] = useState({
        platform: 'esp8266', // esp8266, esp32, arduino, raspberry_pi
        device_id: generateDeviceId('esp8266'),
        device_name: '',
        device_location: '',
        wifi_ssid: '',
        wifi_password: '',
        open_wifi: false,
        server_url: window.location.origin, // Fixed - non-changeable
        api_key: generateApiKey(),
        heartbeat_interval: 60, // Fixed at 60 seconds
        sensor_read_interval: 1000, // Fixed at 1 second (1000ms)
        debug_mode: false,
        ota_enabled: true,
        device_armed: true,
        sensors: []
    });

    // Load sensor options, locations, and known WiFi networks on component mount
    useEffect(() => {
        fetchSensorOptions();
        fetchLocations();
        fetchKnownWifiNetworks();
    }, []);

    const fetchSensorOptions = async () => {
        try {
            const response = await fetch(`/api/firmware-builder/sensor-options?platform=${config.platform}`);
            const data = await response.json();
            if (data.success) {
                setSensorOptions(data.sensors);
                setPinMapping(data.pin_mapping);
                setAvailablePins(data.available_pins || { digital: [], analog: [] });
            }
        } catch (error) {
            console.error('Failed to load sensor options:', error);
        }
    };

    const fetchLocations = async () => {
        try {
            const data = await apiService.getLocations();
            setLocations(data.locations || []);
        } catch (error) {
            console.error('Failed to load locations:', error);
            setLocations([]);
        }
    };

    const fetchKnownWifiNetworks = async () => {
        try {
            // Get unique WiFi SSIDs and passwords from existing devices
            const devicesData = await apiService.getDevices();
            const devices = devicesData.devices || devicesData || [];

            const credentials = {};
            devices.forEach(device => {
                if (device.wifi_ssid) {
                    credentials[device.wifi_ssid] = device.wifi_password || '';
                }
            });

            setWifiCredentials(credentials);
            setKnownWifiNetworks(Object.keys(credentials));
        } catch (error) {
            console.error('Failed to load known WiFi networks:', error);
            setKnownWifiNetworks([]);
            setWifiCredentials({});
        }
    };

    const regenerateDeviceId = () => {
        setConfig(prev => ({
            ...prev,
            device_id: generateDeviceId(prev.platform)
        }));
    };

    const regenerateApiKey = () => {
        setConfig(prev => ({
            ...prev,
            api_key: generateApiKey()
        }));
    };

    const handleConfigChange = (key, value) => {
        setConfig(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const addSensor = (sensorType) => {
        const sensorInfo = sensorOptions[sensorType];
        const sensorId = `${sensorType}_${Date.now()}`;

        // Check for analog exclusivity on ESP8266
        if (config.platform === 'esp8266' &&
            sensorInfo?.pin_type === 'analog' &&
            sensorInfo?.exclusive_analog) {

            const existingAnalogSensor = config.sensors.find(s => {
                const existingInfo = sensorOptions[s.type];
                return existingInfo?.pin_type === 'analog' && s.enabled;
            });

            if (existingAnalogSensor) {
                alert(getCopy('errors.analogExclusive', 'ESP8266 has only one analog pin (A0). Please remove {{existing}} first.').replace('{{existing}}', existingAnalogSensor.name));
                return;
            }
        }

        // Get available pins based on sensor type
        let availablePinsForSensor = [];
        if (sensorInfo.pin_type === 'analog') {
            availablePinsForSensor = availablePins.analog || [];
        } else if (sensorInfo.pin_type === 'digital') {
            availablePinsForSensor = availablePins.digital || [];
        } else {
            availablePinsForSensor = [...(availablePins.digital || []), ...(availablePins.analog || [])];
        }

        // Find first available pin that's not already used
        const usedPins = getUsedPins();
        let availablePin = '';

        for (const pinOption of availablePinsForSensor) {
            const pinValue = typeof pinOption === 'string' ? pinOption : pinOption.pin;
            if (!usedPins[pinValue]) {
                availablePin = pinValue;
                break;
            }
        }

        const newSensor = {
            id: sensorId,
            type: sensorType,
            name: `${sensorInfo.name} ${config.sensors.filter(s => s.type === sensorType).length + 1}`,
            pin: availablePin || (availablePinsForSensor[0]?.pin || availablePinsForSensor[0] || ''),
            enabled: true
        };

        setConfig(prev => ({
            ...prev,
            sensors: [...prev.sensors, newSensor]
        }));
    };

    const removeSensor = (sensorId) => {
        setConfig(prev => ({
            ...prev,
            sensors: prev.sensors.filter(s => s.id !== sensorId)
        }));
    };

    const updateSensor = (sensorId, key, value) => {
        setConfig(prev => ({
            ...prev,
            sensors: prev.sensors.map(sensor =>
                sensor.id === sensorId ? { ...sensor, [key]: value } : sensor
            )
        }));
    };

    const validateConfig = () => {
        const errors = [];

        if (!config.device_id) errors.push('Device ID is required');
        if (!config.device_name) errors.push('Device name is required');
        if (!config.wifi_ssid) errors.push('WiFi SSID is required');
        if (!config.open_wifi && !config.wifi_password) errors.push('WiFi password is required (or enable Open WiFi)');
        if (!config.server_url) errors.push('Server URL is required');

        // Check for pin conflicts
        const usedPins = getUsedPins();
        const pinConflicts = Object.entries(usedPins).filter(([pin, sensors]) => sensors.length > 1);

        for (const [pin, sensors] of pinConflicts) {
            errors.push(t('firmwareBuilder.validation.pinConflict', { pin, sensors: sensors.join(', ') }));
        }

        return errors;
    };

    const createDeviceFromConfig = async () => {
        try {
            console.log('Creating device from config...');
            console.log('Available locations:', locations);
            console.log('Config device_location:', config.device_location);

            // Find location by name or create new location
            let locationId = null;
            if (config.device_location) {
                const location = locations.find(loc => loc.name === config.device_location);

                if (location) {
                    locationId = location.id;
                    console.log('Found existing location:', location);
                } else {
                    // Location doesn't exist, create it
                    console.log('Location not found, creating new location:', config.device_location);
                    try {
                        const newLocation = await apiService.createLocation({
                            name: config.device_location,
                            description: `Auto-created from firmware builder for ${config.device_name}`
                        });
                        locationId = newLocation.location.id;
                        console.log('Created new location:', newLocation);

                        // Update locations list to include the new location
                        setLocations(prev => [...prev, newLocation.location]);
                    } catch (locationError) {
                        console.warn('Failed to create location, device will be created without location:', locationError);
                    }
                }
            }

            // Create device configuration object that matches backend API
            const deviceData = {
                id: config.device_id,           // Backend expects 'id', not 'device_id'
                name: config.device_name,
                device_type: config.platform || 'esp8266',
                wifi_ssid: config.wifi_ssid,
                wifi_password: config.open_wifi ? '' : config.wifi_password,
            };

            // Only include location_id if it's valid (backend validator requires it to be an integer if present)
            if (locationId) {
                deviceData.location_id = locationId;
            }

            console.log('Device data to be created:', deviceData);

            const response = await apiService.createDevice(deviceData);
            console.log('Device creation response:', response);
            return response;
        } catch (error) {
            console.error('Failed to create device:', error);
            console.error('Error details:', {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });
            throw error;
        }
    };

    const buildFirmware = async () => {
        const errors = validateConfig();
        if (errors.length > 0) {
            alert(`${t('firmwareBuilder.alerts.validationErrors', 'Configuration errors:')}\n${errors.join('\n')}`);
            return;
        }

        setLoading(true);
        try {
            // Find location_id if device_location is specified
            let locationId = null;
            if (config.device_location) {
                const location = locations.find(loc => loc.name === config.device_location);
                if (location) {
                    locationId = location.id;
                }
            }

            // Prepare config with location_id
            const buildConfig = {
                ...config,
                location_id: locationId
            };

            // Debug: Log the config being sent
            console.log('Sending firmware build request with config:', buildConfig);
            console.log('Required fields check:', {
                device_id: config.device_id,
                device_name: config.device_name,
                wifi_ssid: config.wifi_ssid,
                wifi_password: config.wifi_password,
                open_wifi: config.open_wifi,
                server_url: config.server_url,
                location_id: locationId
            });

            // Build the firmware (this will also register the device in the database)
            const response = await fetch('/api/firmware-builder/build', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(buildConfig)
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${config.device_id}_firmware.zip`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                setDownloadUrl(url);

                // Device is automatically registered by the backend during firmware build
                alert(t('firmwareBuilder.alerts.buildSuccess', 'Firmware built successfully! Device has been registered in the database and is ready to use once flashed.'));
            } else {
                const error = await response.json().catch(() => ({}));
                const message = error?.error || t('firmwareBuilder.alerts.buildErrorUnknown', 'Unknown error');
                alert(t('firmwareBuilder.alerts.buildError', 'Failed to build firmware: {{message}}', { message }));
            }
        } catch (error) {
            console.error('Build error:', error);
            const message = error?.message || t('firmwareBuilder.alerts.buildErrorUnknown', 'Unknown error');
            alert(t('firmwareBuilder.alerts.buildError', 'Failed to build firmware: {{message}}', { message }));
        } finally {
            setLoading(false);
        }
    };

    const [currentStep, setCurrentStep] = useState(0);

    const steps = useMemo(() => ([
        { id: 'device', title: getCopy('steps.device.title', 'Device Setup'), icon: Smartphone, description: getCopy('steps.device.description', 'Configure device identity and location') },
        { id: 'network', title: getCopy('steps.network.title', 'Network Config'), icon: Wifi, description: getCopy('steps.network.description', 'Set up Wi-Fi and server connection') },
        { id: 'sensors', title: getCopy('steps.sensors.title', 'Sensor Selection'), icon: Activity, description: getCopy('steps.sensors.description', 'Choose and configure sensors') },
        { id: 'review', title: getCopy('steps.review.title', 'Review & Build'), icon: BarChart3, description: getCopy('steps.review.description', 'Review configuration and build firmware') }
    ]), [copy]);

    const enabledSensorsCount = config.sensors.length;

    // Check for pin conflicts more accurately
    const getUsedPins = () => {
        const usedPins = {};

        for (const sensor of config.sensors) {
            if (sensor.pin && sensor.pin.trim()) {
                const pins = sensor.pin.includes(',') ? sensor.pin.split(',') : [sensor.pin];
                for (const pin of pins) {
                    const trimmedPin = pin.trim();
                    if (usedPins[trimmedPin]) {
                        usedPins[trimmedPin].push(sensor.name);
                    } else {
                        usedPins[trimmedPin] = [sensor.name];
                    }
                }
            }
        }
        return usedPins;
    };

    const usedPins = getUsedPins();
    const pinConflicts = Object.entries(usedPins).filter(([pin, sensors]) => sensors.length > 1);

    const nextStep = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    const prevStep = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const canProceed = () => {
        switch (currentStep) {
            case 0: // Device setup
                return config.device_name.trim() && config.device_location.trim();
            case 1: // Network config
                return config.wifi_ssid.trim() && (config.open_wifi || config.wifi_password.trim()) && config.server_url.trim();
            case 2: // Sensors
                return true; // No validation needed for sensors
            case 3: // Review
                return pinConflicts.length === 0;
            default:
                return true;
        }
    };

    return (
        <>
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8">
                <div className="max-w-6xl mx-auto px-6">
                    {/* Modern Header */}
                    <div className="card animate-fade-in mb-8">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                                    <Cpu className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-3xl font-bold text-gray-900">{getCopy('header.title', 'Custom Firmware Builder')}</h1>
                                    <p className="text-gray-600 mt-1">
                                        {getCopy('header.subtitle', 'Configure your device step by step and generate custom firmware')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Progress Steps */}
                    <div className="card animate-slide-up mb-8">
                        <div className="flex items-center justify-between">
                            {steps.map((step, index) => {
                                const StepIcon = step.icon;
                                const isActive = index === currentStep;
                                const isCompleted = index < currentStep;
                                const canAccess = index <= currentStep;

                                return (
                                    <div key={step.id} className="flex items-center flex-1">
                                        <div className="flex flex-col items-center flex-1">
                                            <button
                                                onClick={() => canAccess && setCurrentStep(index)}
                                                className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${isActive
                                                    ? 'border-primary bg-primary text-white shadow-lg'
                                                    : isCompleted
                                                        ? 'border-green-500 bg-green-500 text-white'
                                                        : canAccess
                                                            ? 'border-gray-300 bg-white text-gray-400 hover:border-gray-400'
                                                            : 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed'
                                                    }`}
                                            >
                                                {isCompleted ? (
                                                    <CheckCircle className="w-6 h-6" />
                                                ) : (
                                                    <StepIcon className="w-6 h-6" />
                                                )}
                                            </button>
                                            <div className="text-center mt-2">
                                                <p className={`text-sm font-medium ${isActive || isCompleted ? 'text-gray-900' : 'text-gray-500'
                                                    }`}>
                                                    {step.title}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-1">{step.description}</p>
                                            </div>
                                        </div>
                                        {index < steps.length - 1 && (
                                            <div className={`w-full h-0.5 mx-4 ${index < currentStep ? 'bg-green-500' : 'bg-gray-200'
                                                }`} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Step Content */}
                    <div className="card animate-scale-in">
                        {/* Step 0: Device Configuration */}
                        {currentStep === 0 && (
                            <div>
                                <div className="card-header">
                                    <h2 className="card-title">
                                        <Smartphone className="w-6 h-6 text-primary" />
                                        <span>{getCopy('sections.device.title', 'Device Setup')}</span>
                                    </h2>
                                </div>
                                <div className="space-y-6">
                                    {/* Platform Selection */}
                                    <div className="form-group">
                                        <label className="form-label">
                                            <Cpu className="w-4 h-4 inline mr-1" />
                                            Platform *
                                        </label>
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                            {[
                                                { value: 'esp8266', label: 'ESP8266', icon: '📡', desc: 'WiFi microcontroller' },
                                                { value: 'esp32', label: 'ESP32', icon: '🚀', desc: 'Dual-core with WiFi & Bluetooth' },
                                                { value: 'arduino', label: 'Arduino', icon: '🔧', desc: 'Uno/Nano/Mega boards' },
                                                { value: 'raspberry_pi', label: 'Raspberry Pi', icon: '🥧', desc: 'Single board computer' }
                                            ].map(platform => (
                                                <button
                                                    key={platform.value}
                                                    type="button"
                                                    onClick={() => {
                                                        handleConfigChange('platform', platform.value);
                                                        setConfig(prev => ({
                                                            ...prev,
                                                            platform: platform.value,
                                                            device_id: `${platform.label.toUpperCase().replace(' ', '_')}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`,
                                                            device_type: platform.value,
                                                            sensors: [] // Reset sensors when platform changes
                                                        }));
                                                        fetchSensorOptions(); // Reload sensor options for new platform
                                                    }}
                                                    className={`p-4 rounded-xl border-2 transition-all duration-200 text-left ${config.platform === platform.value
                                                        ? 'border-primary bg-primary/10 shadow-lg'
                                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                                        }`}
                                                >
                                                    <div className="text-2xl mb-2">{platform.icon}</div>
                                                    <div className="font-semibold text-gray-900">{platform.label}</div>
                                                    <div className="text-xs text-gray-500 mt-1">{platform.desc}</div>
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">{getCopy('sections.device.platformHelp', 'Select the hardware platform for your IoT device')}</p>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <div className="form-group">
                                            <label className="form-label">
                                                {getCopy('sections.device.fields.name.label', 'Device Name *')}
                                            </label>
                                            <input
                                                type="text"
                                                value={config.device_name}
                                                onChange={(e) => handleConfigChange('device_name', e.target.value)}
                                                className="input-field"
                                                placeholder={getCopy('sections.device.fields.name.placeholder', 'e.g., Kitchen Sensor Hub')}
                                            />
                                            <p className="text-xs text-gray-500 mt-1">{getCopy('sections.device.fields.name.helper', 'Choose a descriptive name for easy identification')}</p>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">
                                                <MapPin className="w-4 h-4 inline mr-1" />
                                                {getCopy('sections.device.fields.location.label', 'Location')}
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={config.device_location}
                                                    onChange={(e) => handleConfigChange('device_location', e.target.value)}
                                                    onFocus={() => setShowLocationDropdown(true)}
                                                    onBlur={() => setTimeout(() => setShowLocationDropdown(false), 200)}
                                                    className="input-field"
                                                    placeholder={getCopy('sections.device.fields.location.placeholder', 'Enter or select location...')}
                                                />
                                                {showLocationDropdown && locations.length > 0 && (
                                                    <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-60 overflow-auto">
                                                        {locations
                                                            .filter(loc => loc.name.toLowerCase().includes(config.device_location.toLowerCase()))
                                                            .map((location) => (
                                                                <button
                                                                    key={location.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        handleConfigChange('device_location', location.name);
                                                                        setShowLocationDropdown(false);
                                                                    }}
                                                                    className="w-full text-left px-4 py-3 hover:bg-indigo-50 flex items-center gap-3 group transition-colors"
                                                                >
                                                                    <MapPin className="h-4 w-4 text-indigo-600" />
                                                                    <div>
                                                                        <div className="font-medium text-gray-900">{location.name}</div>
                                                                        {location.timezone && (
                                                                            <div className="text-xs text-gray-500">{location.timezone}</div>
                                                                        )}
                                                                    </div>
                                                                </button>
                                                            ))}
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {locations.length > 0
                                                    ? getCopy('sections.device.fields.location.helper', `${locations.length} saved locations available`)
                                                    : getCopy('sections.device.fields.location.helperNew', 'Enter a new location')
                                                }
                                            </p>
                                        </div>
                                    </div>

                                    <div className="glass p-4 rounded-lg">
                                        <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                                            <Key className="w-4 h-4 mr-2" />
                                            {getCopy('sections.device.auto.title', 'Auto-generated identifiers')}
                                        </h3>
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            <div className="form-group">
                                                <label className="form-label">{getCopy('sections.device.auto.deviceId.label', 'Device ID')}</label>
                                                <div className="flex items-center space-x-2">
                                                    <input
                                                        type="text"
                                                        value={config.device_id}
                                                        readOnly
                                                        className="input-field bg-gray-50 font-mono text-sm flex-1"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={regenerateDeviceId}
                                                        className="btn-secondary px-3 py-2 text-xs"
                                                    >
                                                        {getCopy('sections.device.auto.deviceId.regenerate', 'Regenerate')}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">{getCopy('sections.device.auto.apiKey.label', 'API Key')}</label>
                                                <div className="flex items-center space-x-2">
                                                    <input
                                                        type="text"
                                                        value={config.api_key}
                                                        readOnly
                                                        className="input-field bg-gray-50 font-mono text-sm flex-1"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={regenerateApiKey}
                                                        className="btn-secondary px-3 py-2 text-xs"
                                                    >
                                                        {getCopy('sections.device.auto.apiKey.regenerate', 'Regenerate')}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Step Navigation */}
                                <div className="flex justify-end pt-6 border-t border-gray-200">
                                    <button
                                        onClick={nextStep}
                                        disabled={!config.device_name || !config.device_location}
                                        className="btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span>{getCopy('navigation.nextNetwork', 'Next: Network Config')}</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Step 1: Network Configuration */}
                        {currentStep === 1 && (
                            <div>
                                <div className="card-header">
                                    <h2 className="card-title">
                                        <Wifi className="w-6 h-6 text-primary" />
                                        <span>{getCopy('deviceConfig.networkConfig', 'Network Configuration')}</span>
                                    </h2>
                                </div>
                                <div className="space-y-6">
                                    <div className="glass p-6 rounded-xl">
                                        <h3 className="text-lg font-medium text-gray-800 mb-4 flex items-center">
                                            <Wifi className="w-5 h-5 mr-2" />
                                            {getCopy('sections.network.wifi.title', 'WiFi Connection')}
                                        </h3>
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            <div className="form-group">
                                                <label className="form-label">
                                                    <Wifi className="w-4 h-4 inline mr-1" />
                                                    {getCopy('sections.network.wifi.fields.ssid.label', 'WiFi Network Name (SSID) *')}
                                                </label>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={config.wifi_ssid}
                                                        onChange={(e) => handleConfigChange('wifi_ssid', e.target.value)}
                                                        onFocus={() => setShowWifiDropdown(true)}
                                                        onBlur={() => setTimeout(() => setShowWifiDropdown(false), 200)}
                                                        className="input-field"
                                                        placeholder={getCopy('sections.network.wifi.fields.ssid.placeholder', 'Your WiFi network name')}
                                                    />
                                                    {showWifiDropdown && knownWifiNetworks.length > 0 && (
                                                        <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-60 overflow-auto">
                                                            {knownWifiNetworks
                                                                .filter(ssid => ssid.toLowerCase().includes(config.wifi_ssid.toLowerCase()))
                                                                .map((ssid, index) => (
                                                                    <button
                                                                        key={index}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setConfig(prev => ({
                                                                                ...prev,
                                                                                wifi_ssid: ssid,
                                                                                wifi_password: wifiCredentials[ssid] || ''
                                                                            }));
                                                                            setShowWifiDropdown(false);
                                                                        }}
                                                                        className="w-full text-left px-4 py-3 hover:bg-indigo-50 flex items-center justify-between group transition-colors"
                                                                    >
                                                                        <div className="flex items-center gap-3">
                                                                            <Wifi className="h-4 w-4 text-indigo-600" />
                                                                            <span className="font-medium text-gray-900">{ssid}</span>
                                                                        </div>
                                                                        {wifiCredentials[ssid] && (
                                                                            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                                                                                Saved
                                                                            </span>
                                                                        )}
                                                                    </button>
                                                                ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {knownWifiNetworks.length > 0
                                                        ? getCopy('sections.network.wifi.fields.ssid.helper', `${knownWifiNetworks.length} saved networks available`)
                                                        : getCopy('sections.network.wifi.fields.ssid.helperNew', 'Enter your WiFi network name')
                                                    }
                                                </p>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">
                                                    {getCopy('sections.network.wifi.fields.password.label', 'WiFi Password')} {!config.open_wifi && '*'}
                                                </label>
                                                <input
                                                    type="password"
                                                    value={config.wifi_password}
                                                    onChange={(e) => handleConfigChange('wifi_password', e.target.value)}
                                                    className="input-field"
                                                    placeholder={config.open_wifi
                                                        ? getCopy('sections.network.wifi.fields.password.placeholderOpen', 'No password required')
                                                        : getCopy('sections.network.wifi.fields.password.placeholder', 'Your WiFi password')}
                                                    disabled={config.open_wifi}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="flex items-center space-x-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={config.open_wifi}
                                                        onChange={(e) => {
                                                            handleConfigChange('open_wifi', e.target.checked);
                                                            if (e.target.checked) {
                                                                handleConfigChange('wifi_password', '');
                                                            }
                                                        }}
                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <span className="text-sm text-gray-700">{getCopy('sections.network.wifi.fields.open.label', 'Open WiFi (no password)')}</span>
                                                </label>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {getCopy('sections.network.wifi.fields.open.helper', 'Check this if connecting to an open WiFi network without password')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="glass p-6 rounded-xl">
                                        <h3 className="text-lg font-medium text-gray-800 mb-4 flex items-center">
                                            <Globe className="w-5 h-5 mr-2" />
                                            {getCopy('sections.network.server.title', 'Server Connection')}
                                        </h3>
                                        <div className="form-group">
                                            <label className="form-label">
                                                {getCopy('sections.network.server.fields.url.label', 'Server URL *')}
                                            </label>
                                            <input
                                                type="url"
                                                value={config.server_url}
                                                readOnly
                                                disabled
                                                className="input-field bg-gray-100 cursor-not-allowed"
                                                placeholder={getCopy('sections.network.server.fields.url.placeholder', 'https://your-server.com')}
                                            />
                                            <p className="text-xs text-gray-500 mt-1">
                                                {getCopy('sections.network.server.fields.url.helper', 'Server URL is automatically set to this dashboard (non-changeable)')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="glass p-6 rounded-xl">
                                        <h3 className="text-lg font-medium text-gray-800 mb-4 flex items-center">
                                            <Settings className="w-5 h-5 mr-2" />
                                            {getCopy('deviceConfig.deviceBehavior', 'Device Behavior')}
                                        </h3>
                                        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                                            <h4 className="text-sm font-semibold text-blue-900 mb-2">
                                                {getCopy('sections.behavior.fixed.title', 'Fixed Device Behavior')}
                                            </h4>
                                            <div className="space-y-2 text-sm text-blue-800">
                                                <div className="flex justify-between">
                                                    <span>{getCopy('sections.behavior.fixed.heartbeat', 'Heartbeat Interval:')}</span>
                                                    <span className="font-semibold">60 seconds</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>{getCopy('sections.behavior.fixed.sensorRead', 'Sensor Read Interval:')}</span>
                                                    <span className="font-semibold">1 second (1000ms)</span>
                                                </div>
                                            </div>
                                            <p className="text-xs text-blue-700 mt-3">
                                                {getCopy('sections.behavior.fixed.description', 'These values are optimized and cannot be changed to ensure consistent device performance.')}
                                            </p>
                                        </div>

                                        <div className="mt-6">
                                            <h4 className="text-sm font-medium text-gray-700 mb-3">{getCopy('deviceConfig.deviceOptions', 'Device Options')}</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <label className="flex items-center space-x-3 p-3 glass rounded-lg cursor-pointer hover:bg-white/50">
                                                    <input
                                                        type="checkbox"
                                                        checked={config.debug_mode}
                                                        onChange={(e) => handleConfigChange('debug_mode', e.target.checked)}
                                                        className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                                    />
                                                    <div>
                                                        <span className="text-sm font-medium text-gray-700">{getCopy('sections.options.debug.label', 'Debug Mode')}</span>
                                                        <p className="text-xs text-gray-500">{getCopy('sections.options.debug.helper', 'Enable detailed logging')}</p>
                                                    </div>
                                                </label>
                                                <label className="flex items-center space-x-3 p-3 glass rounded-lg cursor-pointer hover:bg-white/50">
                                                    <input
                                                        type="checkbox"
                                                        checked={config.ota_enabled}
                                                        onChange={(e) => handleConfigChange('ota_enabled', e.target.checked)}
                                                        className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                                    />
                                                    <div>
                                                        <span className="text-sm font-medium text-gray-700">{getCopy('sections.options.ota.label', 'OTA Updates')}</span>
                                                        <p className="text-xs text-gray-500">{getCopy('sections.options.ota.helper', 'Allow over-the-air firmware updates')}</p>
                                                    </div>
                                                </label>
                                                <label className="flex items-center space-x-3 p-3 glass rounded-lg cursor-pointer hover:bg-white/50">
                                                    <input
                                                        type="checkbox"
                                                        checked={config.device_armed}
                                                        onChange={(e) => handleConfigChange('device_armed', e.target.checked)}
                                                        className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                                    />
                                                    <div>
                                                        <span className="text-sm font-medium text-gray-700">{getCopy('sections.options.armed.label', 'Device Armed')}</span>
                                                        <p className="text-xs text-gray-500">{getCopy('sections.options.armed.helper', 'Start monitoring on boot')}</p>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Step Navigation */}
                                <div className="flex justify-between pt-6 border-t border-gray-200">
                                    <button
                                        onClick={prevStep}
                                        className="btn-secondary flex items-center space-x-2"
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                        <span>{getCopy('deviceConfig.previousStep', 'Previous: Device Setup')}</span>
                                    </button>
                                    <button
                                        onClick={nextStep}
                                        disabled={!config.wifi_ssid || (!config.open_wifi && !config.wifi_password)}
                                        className="btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span>{getCopy('navigation.nextSensors', 'Next: Sensor Selection')}</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Sensor Selection */}
                        {currentStep === 2 && (
                            <div>
                                <div className="card-header">
                                    <h2 className="card-title">
                                        <Activity className="w-6 h-6 text-primary" />
                                        <span>{steps[2].title}</span>
                                    </h2>
                                </div>
                                <div className="space-y-6">
                                    {/* Pin Conflicts Warning */}
                                    {pinConflicts.length > 0 && (
                                        <div className="bg-red-50 border border-red-200 rounded-md p-4">
                                            <div className="flex items-start space-x-3">
                                                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                                                <div>
                                                    <h3 className="text-sm font-medium text-red-800">{getCopy('sections.sensors.conflict.title', 'Pin Conflict Warning')}</h3>
                                                    <div className="text-sm text-red-700 mt-1">
                                                        {pinConflicts.map(([pin, sensors]) => (
                                                            <p key={pin} className="mb-1">
                                                                {t('firmwareBuilder.sections.sensors.conflict.item', { pin, sensors: sensors.join(', ') })}
                                                            </p>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Available Sensor Types */}
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-semibold text-gray-900">{getCopy('sections.sensors.availableTitle', 'Available Sensor Types')}</h3>
                                            <div className="flex items-center space-x-4 text-sm text-gray-600">
                                                <span>{t('firmwareBuilder.sections.sensors.configuredCount', { count: enabledSensorsCount })}</span>
                                                {pinConflicts.length > 0 && (
                                                    <div className="flex items-center space-x-1 text-red-600">
                                                        <AlertTriangle className="w-4 h-4" />
                                                        <span>{t('firmwareBuilder.sections.sensors.conflictCount', { count: pinConflicts.length })}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            {Object.entries(sensorOptions).length === 0 ? (
                                                <div className="text-center py-8">
                                                    <p className="text-gray-500">{getCopy('sections.sensors.loading', 'Loading sensor options...')}</p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {Object.entries(sensorOptions).map(([sensorKey, sensorInfo]) => {
                                                        const sensorCount = config.sensors.filter(s => s.type === sensorKey).length;

                                                        return (
                                                            <div key={sensorKey} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <h5 className="font-medium text-gray-900">{sensorInfo.name || sensorKey}</h5>
                                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${sensorInfo.pin_type === 'analog' ?
                                                                        'bg-green-100 text-green-800' :
                                                                        'bg-blue-100 text-blue-800'
                                                                        }`}>
                                                                        {sensorInfo.pin_type || 'digital'}
                                                                    </span>
                                                                </div>
                                                                <p className="text-sm text-gray-500 mb-3">
                                                                    {sensorInfo.description || `${sensorInfo.pin_type || 'digital'} sensor`}
                                                                </p>
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-xs text-gray-400">
                                                                        {sensorCount} configured
                                                                    </span>
                                                                    <button
                                                                        onClick={() => addSensor(sensorKey)}
                                                                        className="btn-primary text-sm px-3 py-1"
                                                                    >
                                                                        <Plus className="w-3 h-3 mr-1" />
                                                                        {getCopy('sections.sensors.addButton', 'Add')}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* Pin Reference - Collapsible */}
                                        {Object.keys(pinMapping).length > 0 && (
                                            <details className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                                <summary className="cursor-pointer font-medium text-blue-900 flex items-center">
                                                    <Info className="w-4 h-4 mr-2" />
                                                    {t('firmwareBuilder.sections.sensors.pinReference', { platform: config.platform.toUpperCase() })}
                                                </summary>
                                                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                                    {Object.entries(pinMapping).map(([pin, description]) => (
                                                        <div key={pin} className="flex text-sm">
                                                            <span className="font-mono font-medium text-blue-700 min-w-[80px]">{pin}</span>
                                                            <span className="text-gray-700">{description}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </details>
                                        )}

                                        {/* Configured Sensors */}
                                        {config.sensors.length > 0 && (
                                            <div>
                                                <h4 className="text-lg font-semibold text-gray-900 mb-4">{getCopy('sections.sensors.configuredTitle', 'Configured Sensors')}</h4>
                                                <div className="space-y-4">
                                                    {config.sensors.map((sensor, index) => {
                                                        const sensorInfo = sensorOptions[sensor.type];
                                                        const availablePinsForSensor = sensorInfo?.pin_type === 'analog' ?
                                                            availablePins.analog || [] :
                                                            sensorInfo?.pin_type === 'digital' ?
                                                                availablePins.digital || [] :
                                                                [...(availablePins.digital || []), ...(availablePins.analog || [])];
                                                        const usedPins = getUsedPins();
                                                        const hasConflict = usedPins[sensor.pin]?.length > 1;

                                                        return (
                                                            <div key={sensor.id} className={`border rounded-lg p-4 ${hasConflict ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                                                                <div className="flex items-center justify-between mb-3">
                                                                    <div className="flex items-center space-x-3">
                                                                        <span className="font-medium text-gray-900">
                                                                            {sensor.name}
                                                                        </span>
                                                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${sensorInfo?.pin_type === 'analog' ?
                                                                            'bg-green-100 text-green-800' :
                                                                            'bg-blue-100 text-blue-800'
                                                                            }`}>
                                                                            {sensorInfo?.pin_type || 'digital'}
                                                                        </span>
                                                                        {hasConflict && (
                                                                            <div className="flex items-center text-red-600">
                                                                                <AlertTriangle className="w-4 h-4 mr-1" />
                                                                                <span className="text-xs">{getCopy('sections.sensors.conflictBadge', 'Conflict!')}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        onClick={() => removeSensor(sensor.id)}
                                                                        className="text-red-600 hover:text-red-800 p-1"
                                                                        title={t('deviceDetail.sensorManager.remove')}
                                                                    >
                                                                        <X className="w-4 h-4" />
                                                                    </button>
                                                                </div>

                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                    <div>
                                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                            Pin Assignment
                                                                        </label>
                                                                        <select
                                                                            value={sensor.pin}
                                                                            onChange={(e) => updateSensor(sensor.id, 'pin', e.target.value)}
                                                                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 text-sm ${hasConflict ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                                                                                }`}
                                                                        >
                                                                            <option value="">{t('devices.selectPin')}</option>
                                                                            {availablePinsForSensor.map(pinOption => {
                                                                                const pinValue = typeof pinOption === 'string' ? pinOption : pinOption.pin;
                                                                                const pinDescription = pinMapping[pinValue] || 'Available';
                                                                                const isUsed = usedPins[pinValue] && usedPins[pinValue].length > 0 && !usedPins[pinValue].includes(sensor.name);

                                                                                return (
                                                                                    <option
                                                                                        key={pinValue}
                                                                                        value={pinValue}
                                                                                        disabled={isUsed}
                                                                                        style={{ color: isUsed ? '#9ca3af' : 'inherit' }}
                                                                                    >
                                                                                        {pinValue} - {pinDescription} {isUsed ? '(used)' : ''}
                                                                                    </option>
                                                                                );
                                                                            })}
                                                                        </select>
                                                                        {hasConflict && (
                                                                            <p className="text-xs text-red-600 mt-1">
                                                                                {t('firmwareBuilder.sections.sensors.pinConflictDetail', {
                                                                                    pin: sensor.pin,
                                                                                    conflicts: usedPins[sensor.pin].filter(name => name !== sensor.name).join(', ')
                                                                                })}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                            {getCopy('sections.sensors.nameLabel', 'Sensor Name')}
                                                                        </label>
                                                                        <input
                                                                            type="text"
                                                                            value={sensor.name}
                                                                            onChange={(e) => updateSensor(sensor.id, 'name', e.target.value)}
                                                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                                            placeholder={t('firmwareBuilder.sections.sensors.namePlaceholder', { sensor: sensorInfo?.name || sensor.type })}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Step Navigation */}
                                    <div className="flex justify-between pt-6 border-t border-gray-200">
                                        <button
                                            onClick={prevStep}
                                            className="btn-secondary flex items-center space-x-2"
                                        >
                                            <ArrowLeft className="w-4 h-4" />
                                            <span>{getCopy('navigation.prevNetwork', 'Previous: Network Config')}</span>
                                        </button>
                                        <button
                                            onClick={nextStep}
                                            disabled={pinConflicts.length > 0}
                                            className="btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <span>{getCopy('navigation.nextReview', 'Next: Review & Build')}</span>
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Review & Build */}
                        {currentStep === 3 && (
                            <div>
                                <div className="card-header">
                                    <h2 className="card-title">
                                        <BarChart3 className="w-6 h-6 text-primary" />
                                        <span>{steps[3].title}</span>
                                    </h2>
                                </div>
                                <div className="space-y-6">
                                    {/* Configuration Review */}
                                    <div className="space-y-6">
                                        {/* Device Configuration */}
                                        <div className="bg-white border border-gray-200 rounded-lg p-6">
                                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                                <Smartphone className="w-5 h-5 text-blue-600 mr-2" />
                                                {getCopy('deviceConfig.deviceConfig', 'Device Configuration')}
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                                <div>
                                                    <span className="font-medium text-gray-700">{getCopy('review.labels.deviceName', 'Device Name:')}</span>
                                                    <span className="ml-2 text-gray-900">{config.device_name}</span>
                                                </div>
                                                <div>
                                                    <span className="font-medium text-gray-700">{getCopy('review.labels.location', 'Location:')}</span>
                                                    <span className="ml-2 text-gray-900">{config.device_location}</span>
                                                </div>
                                                <div>
                                                    <span className="font-medium text-gray-700">{getCopy('review.labels.deviceId', 'Device ID:')}</span>
                                                    <span className="ml-2 font-mono text-xs text-gray-900">{config.device_id}</span>
                                                </div>
                                                <div>
                                                    <span className="font-medium text-gray-700">{getCopy('review.labels.apiKey', 'API Key:')}</span>
                                                    <span className="ml-2 font-mono text-xs text-gray-900">{config.api_key.substring(0, 8)}...</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Network Configuration */}
                                        <div className="bg-white border border-gray-200 rounded-lg p-6">
                                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                                <Wifi className="w-5 h-5 text-green-600 mr-2" />
                                                {getCopy('deviceConfig.networkConfig', 'Network Configuration')}
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                                <div>
                                                    <span className="font-medium text-gray-700">{getCopy('review.labels.wifiSsid', 'WiFi SSID:')}</span>
                                                    <span className="ml-2 text-gray-900">{config.wifi_ssid}</span>
                                                </div>
                                                <div>
                                                    <span className="font-medium text-gray-700">{getCopy('review.labels.wifiSecurity', 'WiFi Security:')}</span>
                                                    <span className="ml-2 text-gray-900">{config.open_wifi ? getCopy('review.values.wifiOpen', 'Open (no password)') : getCopy('review.values.wifiSecured', 'Secured')}</span>
                                                </div>
                                                <div>
                                                    <span className="font-medium text-gray-700">{getCopy('review.labels.serverUrl', 'Server URL:')}</span>
                                                    <span className="ml-2 text-gray-900">{config.server_url}</span>
                                                </div>
                                                <div>
                                                    <span className="font-medium text-gray-700">{getCopy('review.labels.heartbeat', 'Heartbeat:')}</span>
                                                    <span className="ml-2 text-gray-900">{config.heartbeat_interval}s</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Sensor Configuration */}
                                        {config.sensors.length > 0 && (
                                            <div className="bg-white border border-gray-200 rounded-lg p-6">
                                                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                                    <Activity className="w-5 h-5 text-purple-600 mr-2" />
                                                    {t('firmwareBuilder.review.sensors.title', { count: config.sensors.length })}
                                                </h3>
                                                <div className="space-y-3">
                                                    {config.sensors.map((sensor) => {
                                                        const sensorInfo = sensorOptions[sensor.type];
                                                        const hasConflict = usedPins[sensor.pin]?.length > 1;

                                                        return (
                                                            <div key={sensor.id} className={`p-4 rounded-lg border ${hasConflict ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center space-x-3">
                                                                        <span className="font-medium text-gray-900">{sensor.name}</span>
                                                                        <span className={`px-2 py-1 text-xs rounded-full ${sensorInfo?.pin_type === 'analog' ?
                                                                            'bg-green-100 text-green-800' :
                                                                            'bg-blue-100 text-blue-800'
                                                                            }`}>
                                                                            {sensorInfo?.pin_type || 'digital'}
                                                                        </span>
                                                                        <span className="text-sm text-gray-600">{t('firmwareBuilder.sections.sensors.pinLabel', { pin: sensor.pin })}</span>
                                                                        {hasConflict && (
                                                                            <div className="flex items-center text-red-600">
                                                                                <AlertTriangle className="w-4 h-4 mr-1" />
                                                                                <span className="text-xs">{getCopy('sections.sensors.conflictBadge', 'Conflict!')}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-xs text-gray-500">{sensorInfo?.name}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Device Options */}
                                        <div className="bg-white border border-gray-200 rounded-lg p-6">
                                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                                <Settings className="w-5 h-5 text-gray-600 mr-2" />
                                                {getCopy('deviceConfig.deviceOptions', 'Device Options')}
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="flex items-center space-x-2">
                                                    {config.debug_mode ? (
                                                        <CheckCircle className="w-5 h-5 text-green-600" />
                                                    ) : (
                                                        <div className="w-5 h-5 border border-gray-300 rounded" />
                                                    )}
                                                    <span className="text-sm text-gray-700">Debug Mode</span>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    {config.ota_enabled ? (
                                                        <CheckCircle className="w-5 h-5 text-green-600" />
                                                    ) : (
                                                        <div className="w-5 h-5 border border-gray-300 rounded" />
                                                    )}
                                                    <span className="text-sm text-gray-700">OTA Updates</span>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    {config.device_armed ? (
                                                        <CheckCircle className="w-5 h-5 text-green-600" />
                                                    ) : (
                                                        <div className="w-5 h-5 border border-gray-300 rounded" />
                                                    )}
                                                    <span className="text-sm text-gray-700">Device Armed</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Build Actions */}
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Build Firmware</h3>
                                                <p className="text-sm text-gray-600">
                                                    {enabledSensorsCount} sensor{enabledSensorsCount !== 1 ? 's' : ''} configured
                                                    {pinConflicts.length > 0 && (
                                                        <span className="text-red-600 ml-2">
                                                            • {pinConflicts.length} pin conflict{pinConflicts.length > 1 ? 's' : ''} detected
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                            <div className="flex items-center space-x-3">
                                                <button
                                                    onClick={() => setShowWebFlasher(true)}
                                                    disabled={loading || pinConflicts.length > 0}
                                                    className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium ${loading || pinConflicts.length > 0
                                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                        : 'bg-green-600 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500'
                                                        }`}
                                                    title={getCopy('actions.flashTooltip', 'Flash firmware directly via Web Serial API')}
                                                >
                                                    <Zap className="w-5 h-5" />
                                                    <span>{getCopy('actions.flash')}</span>
                                                </button>
                                                <button
                                                    onClick={buildFirmware}
                                                    disabled={loading || pinConflicts.length > 0}
                                                    className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium ${loading || pinConflicts.length > 0
                                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                        : 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
                                                        }`}
                                                >
                                                    {loading ? (
                                                        <>
                                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                            <span>{getCopy('actions.building')}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Download className="w-5 h-5" />
                                                            <span>{getCopy('actions.download')}</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {downloadUrl && (
                                        <div className="bg-green-50 border border-green-200 rounded-md p-4">
                                            <div className="flex items-start space-x-3">
                                                <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                                                <div>
                                                    <h3 className="text-sm font-medium text-green-800">Firmware Generated Successfully!</h3>
                                                    <p className="text-sm text-green-700 mt-1">
                                                        Your custom firmware has been downloaded. The ZIP file contains:
                                                    </p>
                                                    <ul className="text-sm text-green-700 mt-2 ml-4 list-disc">
                                                        <li>{getCopy('summary.items.ino')}</li>
                                                        <li>{getCopy('summary.items.configHeader')}</li>
                                                        <li>{getCopy('summary.items.instructions')}</li>
                                                        <li>{getCopy('summary.items.libraries')}</li>
                                                        <li>{getCopy('summary.items.wiring')}</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Step Navigation */}
                                    <div className="flex justify-between pt-6 border-t border-gray-200">
                                        <button
                                            onClick={prevStep}
                                            className="btn-secondary flex items-center space-x-2"
                                        >
                                            <ArrowLeft className="w-4 h-4" />
                                            <span>{getCopy('navigation.prevSensors')}</span>
                                        </button>
                                        <div className="text-sm text-gray-600">
                                            Final step - Build your firmware above
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Web Flasher Modal */}
            {showWebFlasher && (
                <WebFlasher
                    config={config}
                    onClose={() => setShowWebFlasher(false)}
                />
            )}
        </>
    );
};

export default FirmwareBuilder;
