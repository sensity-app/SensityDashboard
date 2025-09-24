import React, { useState, useEffect } from 'react';
import { Download, Cpu, Wifi, Settings, Zap, AlertTriangle, CheckCircle, Info, Sparkles, Grid3X3, Flash } from 'lucide-react';
import WebFlasher from '../components/WebFlasher';

const FirmwareBuilder = () => {
    const [sensorOptions, setSensorOptions] = useState({});
    const [pinMapping, setPinMapping] = useState({});
    const [templates, setTemplates] = useState([]);
    const [categories, setCategories] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [showTemplates, setShowTemplates] = useState(true);
    const [loading, setLoading] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState(null);
    const [showWebFlasher, setShowWebFlasher] = useState(false);

    // Form state
    const [config, setConfig] = useState({
        device_id: 'ESP8266_001',
        device_name: 'My ESP8266 Device',
        device_location: 'Home',
        wifi_ssid: '',
        wifi_password: '',
        server_url: window.location.origin,
        api_key: '',
        heartbeat_interval: 300,
        sensor_read_interval: 5000,
        debug_mode: false,
        ota_enabled: true,
        device_armed: true,
        sensors: {}
    });

    // Load sensor options and templates on component mount
    useEffect(() => {
        fetchSensorOptions();
        fetchTemplates();
    }, []);

    const fetchSensorOptions = async () => {
        try {
            const response = await fetch('/api/firmware-builder/sensor-options');
            const data = await response.json();
            if (data.success) {
                setSensorOptions(data.sensors);
                setPinMapping(data.pin_mapping);
            }
        } catch (error) {
            console.error('Failed to load sensor options:', error);
        }
    };

    const fetchTemplates = async () => {
        try {
            const response = await fetch('/api/firmware-templates');
            const data = await response.json();
            if (data.success) {
                setTemplates(data.templates);
                setCategories(data.categories);
            }
        } catch (error) {
            console.error('Failed to load templates:', error);
        }
    };

    const selectTemplate = async (templateId) => {
        try {
            const response = await fetch(`/api/firmware-templates/${templateId}`);
            const data = await response.json();
            if (data.success) {
                const template = data.template;
                setSelectedTemplate(template);

                // Apply template configuration
                setConfig(prev => ({
                    ...prev,
                    device_name: template.config.device_name,
                    device_location: template.config.device_location,
                    heartbeat_interval: template.config.heartbeat_interval,
                    sensor_read_interval: template.config.sensor_read_interval,
                    debug_mode: template.config.debug_mode,
                    ota_enabled: template.config.ota_enabled,
                    device_armed: template.config.device_armed,
                    sensors: template.config.sensors
                }));

                setShowTemplates(false);
            }
        } catch (error) {
            console.error('Failed to load template:', error);
        }
    };

    const startFromScratch = () => {
        setSelectedTemplate(null);
        setShowTemplates(false);
        // Reset to default config
        setConfig({
            device_id: 'ESP8266_001',
            device_name: 'My ESP8266 Device',
            device_location: 'Home',
            wifi_ssid: '',
            wifi_password: '',
            server_url: window.location.origin,
            api_key: '',
            heartbeat_interval: 300,
            sensor_read_interval: 5000,
            debug_mode: false,
            ota_enabled: true,
            device_armed: true,
            sensors: {}
        });
    };

    const handleConfigChange = (key, value) => {
        setConfig(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const handleSensorChange = (sensorType, enabled) => {
        setConfig(prev => ({
            ...prev,
            sensors: {
                ...prev.sensors,
                [sensorType]: enabled ? { enabled: true } : { enabled: false }
            }
        }));
    };

    const handleSensorConfigChange = (sensorType, key, value) => {
        setConfig(prev => ({
            ...prev,
            sensors: {
                ...prev.sensors,
                [sensorType]: {
                    ...prev.sensors[sensorType],
                    [key]: value
                }
            }
        }));
    };

    const validateConfig = () => {
        const errors = [];

        if (!config.device_id) errors.push('Device ID is required');
        if (!config.device_name) errors.push('Device name is required');
        if (!config.wifi_ssid) errors.push('WiFi SSID is required');
        if (!config.wifi_password) errors.push('WiFi password is required');
        if (!config.server_url) errors.push('Server URL is required');

        // Check for pin conflicts
        const usedPins = {};
        const enabledSensors = Object.keys(config.sensors).filter(key => config.sensors[key]?.enabled);

        for (const sensorType of enabledSensors) {
            const sensorInfo = sensorOptions[sensorType];
            if (sensorInfo?.pins) {
                for (const pin of sensorInfo.pins) {
                    if (usedPins[pin]) {
                        errors.push(`Pin ${pin} conflict: ${sensorType} and ${usedPins[pin]}`);
                    } else {
                        usedPins[pin] = sensorType;
                    }
                }
            }
        }

        return errors;
    };

    const buildFirmware = async () => {
        const errors = validateConfig();
        if (errors.length > 0) {
            alert('Configuration errors:\n' + errors.join('\n'));
            return;
        }

        setLoading(true);
        try {
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

    const renderSensorConfig = (sensorType, sensorInfo) => {
        const isEnabled = config.sensors[sensorType]?.enabled || false;
        const sensorConfig = config.sensors[sensorType] || {};

        return (
            <div key={sensorType} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center space-x-3">
                            <input
                                type="checkbox"
                                id={sensorType}
                                checked={isEnabled}
                                onChange={(e) => handleSensorChange(sensorType, e.target.checked)}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor={sensorType} className="text-sm font-medium text-gray-900">
                                {sensorInfo.name}
                            </label>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">{sensorInfo.description}</p>
                        <p className="text-xs text-gray-500 mt-1">
                            Pins: {sensorInfo.pins?.join(', ')}
                        </p>
                        {sensorInfo.conflicts_with && (
                            <p className="text-xs text-red-500 mt-1">
                                ⚠️ Conflicts with: {sensorInfo.conflicts_with.join(', ')}
                            </p>
                        )}
                    </div>
                </div>

                {isEnabled && sensorInfo.thresholds && (
                    <div className="mt-4 space-y-3 border-t pt-4">
                        <h4 className="text-sm font-medium text-gray-700">Threshold Settings</h4>
                        {Object.entries(sensorInfo.thresholds).map(([key, threshold]) => (
                            <div key={key} className="flex items-center space-x-3">
                                <label className="text-xs text-gray-600 w-24 flex-shrink-0">
                                    {key.replace('_', ' ')}:
                                </label>
                                <input
                                    type="number"
                                    value={sensorConfig[key] || threshold.default}
                                    onChange={(e) => handleSensorConfigChange(sensorType, key, parseFloat(e.target.value))}
                                    min={threshold.min}
                                    max={threshold.max}
                                    className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <span className="text-xs text-gray-500">
                                    ({threshold.min}-{threshold.max})
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const enabledSensorsCount = Object.values(config.sensors).filter(s => s?.enabled).length;
    const hasA0Conflict = ['light', 'sound', 'gas'].filter(s => config.sensors[s]?.enabled).length > 1;

    // Template selection view
    if (showTemplates) {
        return (
            <div className="max-w-6xl mx-auto p-6">
                <div className="bg-white rounded-lg shadow-lg">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <Sparkles className="w-6 h-6 text-blue-600" />
                                <h1 className="text-2xl font-bold text-gray-900">Choose Your Setup</h1>
                            </div>
                            <button
                                onClick={startFromScratch}
                                className="flex items-center space-x-2 px-4 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50"
                            >
                                <Grid3X3 className="w-4 h-4" />
                                <span>Custom Configuration</span>
                            </button>
                        </div>
                        <p className="text-gray-600 mt-2">
                            Select a pre-configured template for your use case, or create a custom configuration
                        </p>
                    </div>

                    <div className="p-6">
                        {/* Category filters */}
                        <div className="mb-6">
                            <div className="flex flex-wrap gap-2">
                                {categories.map(category => (
                                    <span
                                        key={category.id}
                                        className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full"
                                    >
                                        {category.name}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Template grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {templates.map(template => (
                                <div
                                    key={template.id}
                                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md cursor-pointer transition-shadow"
                                    onClick={() => selectTemplate(template.id)}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center space-x-3">
                                            <span className="text-2xl">{template.icon}</span>
                                            <div>
                                                <h3 className="font-semibold text-gray-900">{template.name}</h3>
                                                <p className="text-xs text-blue-600 capitalize">
                                                    {template.category.replace('_', ' ')}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                            {template.sensor_count} sensors
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600 mb-3">
                                        {template.description}
                                    </p>
                                    <div className="border-t pt-3">
                                        <p className="text-xs text-gray-500 font-medium mb-1">Key Features:</p>
                                        <ul className="space-y-1">
                                            {template.use_cases.map((useCase, index) => (
                                                <li key={index} className="text-xs text-gray-600 flex items-start">
                                                    <span className="text-green-500 mr-1">•</span>
                                                    {useCase}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="bg-white rounded-lg shadow-lg">
                <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <Cpu className="w-6 h-6 text-blue-600" />
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">
                                    {selectedTemplate ? selectedTemplate.name : 'Custom Firmware Builder'}
                                </h1>
                                <p className="text-gray-600 mt-1">
                                    {selectedTemplate
                                        ? `Template: ${selectedTemplate.description}`
                                        : 'Configure your ESP8266 device and generate custom firmware ready to flash'
                                    }
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowTemplates(true)}
                            className="flex items-center space-x-2 px-3 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            <Sparkles className="w-4 h-4" />
                            <span>Change Template</span>
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-8">
                    {/* Device Configuration */}
                    <div>
                        <div className="flex items-center space-x-2 mb-4">
                            <Settings className="w-5 h-5 text-gray-700" />
                            <h2 className="text-lg font-semibold text-gray-900">Device Configuration</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Device ID *
                                </label>
                                <input
                                    type="text"
                                    value={config.device_id}
                                    onChange={(e) => handleConfigChange('device_id', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., ESP8266_001"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Device Name *
                                </label>
                                <input
                                    type="text"
                                    value={config.device_name}
                                    onChange={(e) => handleConfigChange('device_name', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., Kitchen Sensor"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Location
                                </label>
                                <input
                                    type="text"
                                    value={config.device_location}
                                    onChange={(e) => handleConfigChange('device_location', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., Kitchen"
                                />
                            </div>
                        </div>
                    </div>

                    {/* WiFi Configuration */}
                    <div>
                        <div className="flex items-center space-x-2 mb-4">
                            <Wifi className="w-5 h-5 text-gray-700" />
                            <h2 className="text-lg font-semibold text-gray-900">WiFi Configuration</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    WiFi Network Name (SSID) *
                                </label>
                                <input
                                    type="text"
                                    value={config.wifi_ssid}
                                    onChange={(e) => handleConfigChange('wifi_ssid', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Your WiFi network name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    WiFi Password *
                                </label>
                                <input
                                    type="password"
                                    value={config.wifi_password}
                                    onChange={(e) => handleConfigChange('wifi_password', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Your WiFi password"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Server Configuration */}
                    <div>
                        <div className="flex items-center space-x-2 mb-4">
                            <Zap className="w-5 h-5 text-gray-700" />
                            <h2 className="text-lg font-semibold text-gray-900">Server Configuration</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Server URL *
                                </label>
                                <input
                                    type="url"
                                    value={config.server_url}
                                    onChange={(e) => handleConfigChange('server_url', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="https://your-server.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    API Key (optional)
                                </label>
                                <input
                                    type="text"
                                    value={config.api_key}
                                    onChange={(e) => handleConfigChange('api_key', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Optional API key"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Device Behavior */}
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Device Behavior</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Heartbeat Interval (seconds)
                                </label>
                                <input
                                    type="number"
                                    value={config.heartbeat_interval}
                                    onChange={(e) => handleConfigChange('heartbeat_interval', parseInt(e.target.value))}
                                    min="60"
                                    max="3600"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Sensor Read Interval (ms)
                                </label>
                                <input
                                    type="number"
                                    value={config.sensor_read_interval}
                                    onChange={(e) => handleConfigChange('sensor_read_interval', parseInt(e.target.value))}
                                    min="1000"
                                    max="60000"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        checked={config.debug_mode}
                                        onChange={(e) => handleConfigChange('debug_mode', e.target.checked)}
                                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-700">Debug Mode</span>
                                </label>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        checked={config.ota_enabled}
                                        onChange={(e) => handleConfigChange('ota_enabled', e.target.checked)}
                                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-700">OTA Updates</span>
                                </label>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        checked={config.device_armed}
                                        onChange={(e) => handleConfigChange('device_armed', e.target.checked)}
                                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-700">Device Armed</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Sensor Configuration */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-900">Sensor Configuration</h2>
                            <div className="flex items-center space-x-4 text-sm text-gray-600">
                                <span>{enabledSensorsCount} sensors enabled</span>
                                {hasA0Conflict && (
                                    <div className="flex items-center space-x-1 text-red-600">
                                        <AlertTriangle className="w-4 h-4" />
                                        <span>Pin conflict detected</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {hasA0Conflict && (
                            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                                <div className="flex items-start space-x-3">
                                    <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                                    <div>
                                        <h3 className="text-sm font-medium text-red-800">Pin Conflict Warning</h3>
                                        <p className="text-sm text-red-700 mt-1">
                                            Multiple sensors are trying to use pin A0. Only one sensor can use the analog pin at a time.
                                            Please disable all but one of: Light, Sound, or Gas sensors.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-4">
                            {Object.entries(sensorOptions).map(([type, info]) => renderSensorConfig(type, info))}
                        </div>
                    </div>

                    {/* Pin Mapping Reference */}
                    <div>
                        <div className="flex items-center space-x-2 mb-4">
                            <Info className="w-5 h-5 text-gray-700" />
                            <h2 className="text-lg font-semibold text-gray-900">Pin Mapping Reference</h2>
                        </div>
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
                    </div>

                    {/* Build Buttons */}
                    <div className="flex items-center justify-center space-x-4 pt-6 border-t">
                        <button
                            onClick={() => setShowWebFlasher(true)}
                            disabled={loading || hasA0Conflict}
                            className={`flex items-center space-x-3 px-6 py-3 rounded-lg font-medium ${
                                loading || hasA0Conflict
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-green-600 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500'
                            }`}
                        >
                            <Flash className="w-5 h-5" />
                            <span>Flash to Device</span>
                        </button>
                        <button
                            onClick={buildFirmware}
                            disabled={loading || hasA0Conflict}
                            className={`flex items-center space-x-3 px-6 py-3 rounded-lg font-medium ${
                                loading || hasA0Conflict
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
                            }`}
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    <span>Building Firmware...</span>
                                </>
                            ) : (
                                <>
                                    <Download className="w-5 h-5" />
                                    <span>Download Firmware</span>
                                </>
                            )}
                        </button>
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
                </div>
            </div>

            {/* Web Flasher Modal */}
            {showWebFlasher && (
                <WebFlasher
                    config={config}
                    onClose={() => setShowWebFlasher(false)}
                />
            )}
        </div>
    );
};

export default FirmwareBuilder;