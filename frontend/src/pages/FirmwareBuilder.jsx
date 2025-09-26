import React, { useState, useEffect } from 'react';
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

const FirmwareBuilder = () => {
    const [sensorOptions, setSensorOptions] = useState({});
    const [pinMapping, setPinMapping] = useState({});
    const [availablePins, setAvailablePins] = useState({ digital: [], analog: [] });
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState(null);
    const [showWebFlasher, setShowWebFlasher] = useState(false);

    // Generate unique device ID
    const generateDeviceId = () => {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 5);
        return `ESP8266_${timestamp}_${random}`;
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
        device_id: generateDeviceId(),
        device_name: '',
        device_location: '',
        wifi_ssid: '',
        wifi_password: '',
        open_wifi: false,
        server_url: window.location.origin,
        api_key: generateApiKey(),
        heartbeat_interval: 300,
        sensor_read_interval: 5000,
        debug_mode: false,
        ota_enabled: true,
        device_armed: true,
        sensors: []
    });

    // Load sensor options and locations on component mount
    useEffect(() => {
        fetchSensorOptions();
        fetchLocations();
    }, []);

    const fetchSensorOptions = async () => {
        try {
            const response = await fetch('/api/firmware-builder/sensor-options');
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

    const regenerateDeviceId = () => {
        setConfig(prev => ({
            ...prev,
            device_id: generateDeviceId()
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

        if (!config.device_name) errors.push('Device name is required');
        if (!config.wifi_ssid) errors.push('WiFi SSID is required');
        if (!config.open_wifi && !config.wifi_password) errors.push('WiFi password is required (or enable Open WiFi)');
        if (!config.server_url) errors.push('Server URL is required');

        // Check for pin conflicts
        const usedPins = getUsedPins();
        const pinConflicts = Object.entries(usedPins).filter(([pin, sensors]) => sensors.length > 1);

        for (const [pin, sensors] of pinConflicts) {
            errors.push(`Pin ${pin} conflict: ${sensors.join(', ')}`);
        }

        return errors;
    };

    const createDeviceFromConfig = async () => {
        try {
            // Find location by name or create/use first available location
            let locationId = null;
            if (config.device_location && locations.length > 0) {
                const location = locations.find(loc => loc.name === config.device_location);
                locationId = location?.id || null;
            }

            // Create device configuration object
            const deviceData = {
                name: config.device_name,
                device_id: config.device_id,
                device_type: 'esp8266',
                location_id: locationId,
                description: `Device created via firmware builder. WiFi: ${config.wifi_ssid}${config.open_wifi ? ' (open)' : ''}. ${config.sensors.length} sensors configured.`,
                api_key: config.api_key,
                config: {
                    wifi_ssid: config.wifi_ssid,
                    wifi_password: config.open_wifi ? '' : config.wifi_password,
                    open_wifi: config.open_wifi,
                    server_url: config.server_url,
                    heartbeat_interval: config.heartbeat_interval,
                    sensor_read_interval: config.sensor_read_interval,
                    debug_mode: config.debug_mode,
                    ota_enabled: config.ota_enabled,
                    device_armed: config.device_armed,
                    sensors: config.sensors.map(sensor => ({
                        type: sensor.type,
                        name: sensor.name,
                        pin: sensor.pin
                    }))
                },
                status: 'offline',
                firmware_version: '1.0.0'
            };

            const response = await apiService.createDevice(deviceData);
            return response;
        } catch (error) {
            console.error('Failed to create device:', error);
            throw error;
        }
    };

    const buildFirmware = async () => {
        const errors = validateConfig();
        if (errors.length > 0) {
            alert('Configuration errors:\n' + errors.join('\n'));
            return;
        }

        setLoading(true);
        try {
            // First, build the firmware
            const response = await fetch('/api/firmware-builder/build', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config)
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

                // After successful firmware build, create the device in database
                try {
                    await createDeviceFromConfig();
                    alert('Firmware built successfully and device created in database!');
                } catch (deviceError) {
                    console.warn('Firmware built but failed to create device:', deviceError);
                    alert('Firmware built successfully, but failed to create device in database. You can create it manually in the devices section.');
                }
            } else {
                const error = await response.json();
                alert('Failed to build firmware: ' + (error.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Build error:', error);
            alert('Failed to build firmware: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const [currentStep, setCurrentStep] = useState(0);

    const steps = [
        { id: 'device', title: 'Device Setup', icon: Smartphone, description: 'Configure device identity and location' },
        { id: 'network', title: 'Network Config', icon: Wifi, description: 'Set up WiFi and server connection' },
        { id: 'sensors', title: 'Sensor Selection', icon: Activity, description: 'Choose and configure sensors' },
        { id: 'review', title: 'Review & Build', icon: BarChart3, description: 'Review configuration and build firmware' }
    ];

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
                                <h1 className="text-3xl font-bold text-gray-900">Custom Firmware Builder</h1>
                                <p className="text-gray-600 mt-1">
                                    Configure your ESP8266 device step by step and generate custom firmware
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
                                            className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                                                isActive
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
                                            <p className={`text-sm font-medium ${
                                                isActive || isCompleted ? 'text-gray-900' : 'text-gray-500'
                                            }`}>
                                                {step.title}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-1">{step.description}</p>
                                        </div>
                                    </div>
                                    {index < steps.length - 1 && (
                                        <div className={`w-full h-0.5 mx-4 ${
                                            index < currentStep ? 'bg-green-500' : 'bg-gray-200'
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
                                    <span>Device Setup</span>
                                </h2>
                            </div>
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <div className="form-group">
                                        <label className="form-label">
                                            Device Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={config.device_name}
                                            onChange={(e) => handleConfigChange('device_name', e.target.value)}
                                            className="input-field"
                                            placeholder="e.g., Kitchen Sensor Hub"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Choose a descriptive name for easy identification</p>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">
                                            <MapPin className="w-4 h-4 inline mr-1" />
                                            Location
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={config.device_location}
                                                onChange={(e) => handleConfigChange('device_location', e.target.value)}
                                                className="input-field"
                                                placeholder="Enter or select location..."
                                                list="locations-list"
                                            />
                                            <datalist id="locations-list">
                                                {Array.isArray(locations) && locations.map(location => (
                                                    <option key={location.id} value={location.name} />
                                                ))}
                                            </datalist>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Choose from existing locations or type a new one
                                        </p>
                                    </div>
                                </div>

                                <div className="glass p-4 rounded-lg">
                                    <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                                        <Key className="w-4 h-4 mr-2" />
                                        Auto-Generated Identifiers
                                    </h3>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        <div className="form-group">
                                            <label className="form-label">Device ID</label>
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
                                                    Regenerate
                                                </button>
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">API Key</label>
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
                                                    Regenerate
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
                                    <span>Next: Network Config</span>
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
                                    <span>Network Configuration</span>
                                </h2>
                            </div>
                            <div className="space-y-6">
                                <div className="glass p-6 rounded-xl">
                                    <h3 className="text-lg font-medium text-gray-800 mb-4 flex items-center">
                                        <Wifi className="w-5 h-5 mr-2" />
                                        WiFi Connection
                                    </h3>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <div className="form-group">
                                            <label className="form-label">
                                                WiFi Network Name (SSID) *
                                            </label>
                                            <input
                                                type="text"
                                                value={config.wifi_ssid}
                                                onChange={(e) => handleConfigChange('wifi_ssid', e.target.value)}
                                                className="input-field"
                                                placeholder="Your WiFi network name"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">
                                                WiFi Password {!config.open_wifi && '*'}
                                            </label>
                                            <input
                                                type="password"
                                                value={config.wifi_password}
                                                onChange={(e) => handleConfigChange('wifi_password', e.target.value)}
                                                className="input-field"
                                                placeholder={config.open_wifi ? "No password required" : "Your WiFi password"}
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
                                                <span className="text-sm text-gray-700">Open WiFi (no password)</span>
                                            </label>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Check this if connecting to an open WiFi network without password
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="glass p-6 rounded-xl">
                                    <h3 className="text-lg font-medium text-gray-800 mb-4 flex items-center">
                                        <Globe className="w-5 h-5 mr-2" />
                                        Server Connection
                                    </h3>
                                    <div className="form-group">
                                        <label className="form-label">
                                            Server URL *
                                        </label>
                                        <input
                                            type="url"
                                            value={config.server_url}
                                            onChange={(e) => handleConfigChange('server_url', e.target.value)}
                                            className="input-field"
                                            placeholder="https://your-server.com"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">The device will connect to this server to send data</p>
                                    </div>
                                </div>

                                <div className="glass p-6 rounded-xl">
                                    <h3 className="text-lg font-medium text-gray-800 mb-4 flex items-center">
                                        <Settings className="w-5 h-5 mr-2" />
                                        Device Behavior
                                    </h3>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <div className="form-group">
                                            <label className="form-label">
                                                Heartbeat Interval (seconds)
                                            </label>
                                            <input
                                                type="number"
                                                value={config.heartbeat_interval}
                                                onChange={(e) => handleConfigChange('heartbeat_interval', parseInt(e.target.value))}
                                                min="60"
                                                max="3600"
                                                className="input-field"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">How often the device reports it's online (60-3600 seconds)</p>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">
                                                Sensor Read Interval (ms)
                                            </label>
                                            <input
                                                type="number"
                                                value={config.sensor_read_interval}
                                                onChange={(e) => handleConfigChange('sensor_read_interval', parseInt(e.target.value))}
                                                min="1000"
                                                max="60000"
                                                className="input-field"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">How often sensors are read (1000-60000 ms)</p>
                                        </div>
                                    </div>

                                    <div className="mt-6">
                                        <h4 className="text-sm font-medium text-gray-700 mb-3">Device Options</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <label className="flex items-center space-x-3 p-3 glass rounded-lg cursor-pointer hover:bg-white/50">
                                                <input
                                                    type="checkbox"
                                                    checked={config.debug_mode}
                                                    onChange={(e) => handleConfigChange('debug_mode', e.target.checked)}
                                                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                                />
                                                <div>
                                                    <span className="text-sm font-medium text-gray-700">Debug Mode</span>
                                                    <p className="text-xs text-gray-500">Enable detailed logging</p>
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
                                                    <span className="text-sm font-medium text-gray-700">OTA Updates</span>
                                                    <p className="text-xs text-gray-500">Over-the-air firmware updates</p>
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
                                                    <span className="text-sm font-medium text-gray-700">Device Armed</span>
                                                    <p className="text-xs text-gray-500">Start monitoring on boot</p>
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
                                    <span>Previous: Device Setup</span>
                                </button>
                                <button
                                    onClick={nextStep}
                                    disabled={!config.wifi_ssid || (!config.open_wifi && !config.wifi_password)}
                                    className="btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span>Next: Sensor Selection</span>
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
                                    <span>Sensor Selection</span>
                                </h2>
                            </div>
                            <div className="space-y-6">
                                {/* Sensor Configuration */}
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">Available Sensors</h3>
                            <div className="flex items-center space-x-4 text-sm text-gray-600">
                                <span>{enabledSensorsCount} sensors enabled</span>
                                {pinConflicts.length > 0 && (
                                    <div className="flex items-center space-x-1 text-red-600">
                                        <AlertTriangle className="w-4 h-4" />
                                        <span>{pinConflicts.length} pin conflict{pinConflicts.length > 1 ? 's' : ''}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {pinConflicts.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                                <div className="flex items-start space-x-3">
                                    <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                                    <div>
                                        <h3 className="text-sm font-medium text-red-800">Pin Conflict Warning</h3>
                                        <div className="text-sm text-red-700 mt-1">
                                            {pinConflicts.map(([pin, sensors]) => (
                                                <p key={pin} className="mb-1">
                                                    Pin {pin} is being used by: {sensors.join(', ')}. Please select different pins.
                                                </p>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="bg-gray-50 rounded-lg p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {Object.entries(pinMapping).map(([pin, description]) => (
                                    <div key={pin} className="flex text-sm">
                                        <span className="font-mono font-medium text-blue-600 w-8">{pin}:</span>
                                        <span className="text-gray-700">{description}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Available Sensor Types */}
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-lg font-semibold text-gray-900 mb-4">Available Sensor Types</h4>
                                {Object.entries(sensorOptions).length === 0 ? (
                                    <div className="text-center py-8">
                                        <p className="text-gray-500">Loading sensor options...</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {Object.entries(sensorOptions).map(([sensorKey, sensorInfo]) => {
                                            const sensorCount = config.sensors.filter(s => s.type === sensorKey).length;

                                            return (
                                                <div key={sensorKey} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h5 className="font-medium text-gray-900">{sensorInfo.name || sensorKey}</h5>
                                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                                            sensorInfo.pin_type === 'analog' ?
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
                                                            Add
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Configured Sensors */}
                            {config.sensors.length > 0 && (
                                <div>
                                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Configured Sensors</h4>
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
                                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                                                sensorInfo?.pin_type === 'analog' ?
                                                                'bg-green-100 text-green-800' :
                                                                'bg-blue-100 text-blue-800'
                                                            }`}>
                                                                {sensorInfo?.pin_type || 'digital'}
                                                            </span>
                                                            {hasConflict && (
                                                                <div className="flex items-center text-red-600">
                                                                    <AlertTriangle className="w-4 h-4 mr-1" />
                                                                    <span className="text-xs">Pin conflict</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => removeSensor(sensor.id)}
                                                            className="text-red-600 hover:text-red-800 p-1"
                                                            title="Remove sensor"
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
                                                                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 text-sm ${
                                                                    hasConflict ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                                                                }`}
                                                            >
                                                                <option value="">Select Pin</option>
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
                                                                    Pin {sensor.pin} is also used by: {usedPins[sensor.pin].filter(name => name !== sensor.name).join(', ')}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Sensor Name
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={sensor.name}
                                                                onChange={(e) => updateSensor(sensor.id, 'name', e.target.value)}
                                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                                placeholder={`Enter name for ${sensorInfo?.name || sensor.type}`}
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
                                        <span>Previous: Network Config</span>
                                    </button>
                                    <button
                                        onClick={nextStep}
                                        disabled={pinConflicts.length > 0}
                                        className="btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span>Next: Review & Build</span>
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
                                    <span>Review & Build</span>
                                </h2>
                            </div>
                            <div className="space-y-6">
                                {/* Configuration Review */}
                                <div className="space-y-6">
                                    {/* Device Configuration */}
                                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                            <Smartphone className="w-5 h-5 text-blue-600 mr-2" />
                                            Device Configuration
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <span className="font-medium text-gray-700">Device Name:</span>
                                                <span className="ml-2 text-gray-900">{config.device_name}</span>
                                            </div>
                                            <div>
                                                <span className="font-medium text-gray-700">Location:</span>
                                                <span className="ml-2 text-gray-900">{config.device_location}</span>
                                            </div>
                                            <div>
                                                <span className="font-medium text-gray-700">Device ID:</span>
                                                <span className="ml-2 font-mono text-xs text-gray-900">{config.device_id}</span>
                                            </div>
                                            <div>
                                                <span className="font-medium text-gray-700">API Key:</span>
                                                <span className="ml-2 font-mono text-xs text-gray-900">{config.api_key.substring(0, 8)}...</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Network Configuration */}
                                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                            <Wifi className="w-5 h-5 text-green-600 mr-2" />
                                            Network Configuration
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <span className="font-medium text-gray-700">WiFi SSID:</span>
                                                <span className="ml-2 text-gray-900">{config.wifi_ssid}</span>
                                            </div>
                                            <div>
                                                <span className="font-medium text-gray-700">WiFi Security:</span>
                                                <span className="ml-2 text-gray-900">{config.open_wifi ? 'Open (no password)' : 'Secured'}</span>
                                            </div>
                                            <div>
                                                <span className="font-medium text-gray-700">Server URL:</span>
                                                <span className="ml-2 text-gray-900">{config.server_url}</span>
                                            </div>
                                            <div>
                                                <span className="font-medium text-gray-700">Heartbeat:</span>
                                                <span className="ml-2 text-gray-900">{config.heartbeat_interval}s</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sensor Configuration */}
                                    {config.sensors.length > 0 && (
                                        <div className="bg-white border border-gray-200 rounded-lg p-6">
                                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                                <Activity className="w-5 h-5 text-purple-600 mr-2" />
                                                Sensor Configuration ({config.sensors.length} sensors)
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
                                                                    <span className={`px-2 py-1 text-xs rounded-full ${
                                                                        sensorInfo?.pin_type === 'analog' ?
                                                                        'bg-green-100 text-green-800' :
                                                                        'bg-blue-100 text-blue-800'
                                                                    }`}>
                                                                        {sensorInfo?.pin_type || 'digital'}
                                                                    </span>
                                                                    <span className="text-sm text-gray-600">Pin {sensor.pin}</span>
                                                                    {hasConflict && (
                                                                        <div className="flex items-center text-red-600">
                                                                            <AlertTriangle className="w-4 h-4 mr-1" />
                                                                            <span className="text-xs">Conflict!</span>
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
                                            Device Options
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
                                    className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium ${
                                        loading || pinConflicts.length > 0
                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            : 'bg-green-600 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500'
                                    }`}
                                >
                                    <Zap className="w-5 h-5" />
                                    <span>Flash to Device</span>
                                </button>
                                <button
                                    onClick={buildFirmware}
                                    disabled={loading || pinConflicts.length > 0}
                                    className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium ${
                                        loading || pinConflicts.length > 0
                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            : 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
                                    }`}
                                >
                                    {loading ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            <span>Building...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Download className="w-5 h-5" />
                                            <span>Download Firmware</span>
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
                                        <li>Arduino sketch file (.ino)</li>
                                        <li>Device configuration header</li>
                                        <li>Installation instructions</li>
                                        <li>Required libraries list</li>
                                        <li>Wiring diagram</li>
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
                            <span>Previous: Sensor Selection</span>
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