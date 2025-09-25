import React, { useState, useEffect } from 'react';
import { Download, Cpu, Wifi, Settings, Zap, AlertTriangle, CheckCircle, Info, MapPin } from 'lucide-react';
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
        server_url: window.location.origin,
        api_key: generateApiKey(),
        heartbeat_interval: 300,
        sensor_read_interval: 5000,
        debug_mode: false,
        ota_enabled: true,
        device_armed: true,
        sensors: {}
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
            setLocations(data || []);
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

    const handleSensorChange = (sensorType, enabled) => {
        const sensorInfo = sensorOptions[sensorType];
        setConfig(prev => ({
            ...prev,
            sensors: {
                ...prev.sensors,
                [sensorType]: enabled
                    ? {
                        enabled: true,
                        pin: sensorInfo?.default_pin || sensorInfo?.pins?.[0] || 'D4'
                      }
                    : { enabled: false }
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

        if (!config.device_name) errors.push('Device name is required');
        if (!config.wifi_ssid) errors.push('WiFi SSID is required');
        if (!config.wifi_password) errors.push('WiFi password is required');
        if (!config.server_url) errors.push('Server URL is required');

        // Check for pin conflicts
        const usedPins = {};
        const enabledSensors = Object.keys(config.sensors).filter(key => config.sensors[key]?.enabled);

        for (const sensorType of enabledSensors) {
            const sensorConfig = config.sensors[sensorType];
            const sensorInfo = sensorOptions[sensorType];

            // Get the actual pin(s) used by this sensor
            let sensorPins = [];
            if (sensorConfig.pin) {
                // Handle distance sensors which use two pins (e.g., "D5,D6")
                sensorPins = sensorConfig.pin.includes(',') ? sensorConfig.pin.split(',') : [sensorConfig.pin];
            } else if (sensorInfo?.pins) {
                // Fallback to default pins if no pin is configured
                sensorPins = sensorInfo.pins;
            }

            for (const pin of sensorPins) {
                const trimmedPin = pin.trim();
                if (usedPins[trimmedPin]) {
                    errors.push(`Pin ${trimmedPin} conflict: ${sensorType} and ${usedPins[trimmedPin]}`);
                } else {
                    usedPins[trimmedPin] = sensorType;
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

    const renderPinSelector = (sensorType, sensorInfo, sensorConfig) => {
        const currentPin = sensorConfig.pin || sensorInfo.default_pin || sensorInfo.pins?.[0];

        // Filter available pins based on sensor requirements
        let availablePinOptions = [];
        if (sensorInfo.pin_type === 'analog') {
            availablePinOptions = availablePins.analog;
        } else if (sensorInfo.pin_type === 'digital') {
            availablePinOptions = availablePins.digital;
        } else {
            // Fallback: use all pins if pin_type not specified
            availablePinOptions = [...availablePins.digital, ...availablePins.analog];
        }

        // For sensors that require multiple pins (like distance sensor)
        if (sensorInfo.pins_required === 2) {
            return (
                <select
                    value={currentPin}
                    onChange={(e) => handleSensorConfigChange(sensorType, 'pin', e.target.value)}
                    className="w-32 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                    {sensorInfo.recommended_pins?.map(pinPair => (
                        <option key={pinPair} value={pinPair}>
                            {pinPair}
                        </option>
                    ))}
                </select>
            );
        }

        // Single pin sensors
        return (
            <div className="flex items-center space-x-2">
                <select
                    value={currentPin}
                    onChange={(e) => handleSensorConfigChange(sensorType, 'pin', e.target.value)}
                    className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                    {availablePinOptions.map(pinOption => {
                        const isRecommended = sensorInfo.recommended_pins?.includes(pinOption.pin);
                        return (
                            <option key={pinOption.pin} value={pinOption.pin}>
                                {pinOption.pin} {isRecommended ? '⭐' : ''}
                            </option>
                        );
                    })}
                </select>
                <span className="text-xs text-gray-500">
                    {availablePinOptions.find(p => p.pin === currentPin)?.note}
                </span>
            </div>
        );
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
                        {sensorInfo.wiring_notes && (
                            <p className="text-xs text-blue-600 mt-1">💡 {sensorInfo.wiring_notes}</p>
                        )}
                        {isEnabled && (
                            <div className="mt-2">
                                <label className="text-xs text-gray-600 block mb-1">
                                    Pin Selection:
                                </label>
                                {renderPinSelector(sensorType, sensorInfo, sensorConfig)}
                            </div>
                        )}
                        {!isEnabled && sensorInfo.recommended_pins && (
                            <p className="text-xs text-gray-500 mt-1">
                                Recommended pins: {sensorInfo.recommended_pins.join(', ')}
                            </p>
                        )}
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

    // Check for pin conflicts more accurately
    const getUsedPins = () => {
        const usedPins = {};
        const enabledSensors = Object.keys(config.sensors).filter(key => config.sensors[key]?.enabled);

        for (const sensorType of enabledSensors) {
            const sensorConfig = config.sensors[sensorType];
            const sensorInfo = sensorOptions[sensorType];

            let sensorPins = [];
            if (sensorConfig.pin) {
                sensorPins = sensorConfig.pin.includes(',') ? sensorConfig.pin.split(',') : [sensorConfig.pin];
            } else if (sensorInfo?.default_pin) {
                sensorPins = sensorInfo.default_pin.includes(',') ? sensorInfo.default_pin.split(',') : [sensorInfo.default_pin];
            }

            for (const pin of sensorPins) {
                const trimmedPin = pin.trim();
                if (usedPins[trimmedPin]) {
                    usedPins[trimmedPin].push(sensorType);
                } else {
                    usedPins[trimmedPin] = [sensorType];
                }
            }
        }
        return usedPins;
    };

    const usedPins = getUsedPins();
    const pinConflicts = Object.entries(usedPins).filter(([pin, sensors]) => sensors.length > 1);

    return (
        <div className="max-w-5xl mx-auto p-6">
            <div className="bg-white rounded-lg shadow-lg">
                <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center space-x-3">
                        <Cpu className="w-6 h-6 text-blue-600" />
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Custom Firmware Builder</h1>
                            <p className="text-gray-600 mt-1">
                                Configure your ESP8266 device and generate custom firmware ready to flash
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Device Configuration */}
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-4">
                            <Settings className="w-5 h-5 text-gray-700" />
                            <h2 className="text-lg font-semibold text-gray-900">Device Configuration</h2>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                                <div className="flex items-center space-x-2">
                                    <MapPin className="w-4 h-4 text-gray-500" />
                                    <select
                                        value={config.device_location}
                                        onChange={(e) => handleConfigChange('device_location', e.target.value)}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Select location...</option>
                                        {locations.map(location => (
                                            <option key={location.id} value={location.name}>
                                                {location.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Device ID (Auto-generated)
                                </label>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="text"
                                        value={config.device_id}
                                        readOnly
                                        className="flex-1 px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-sm font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={regenerateDeviceId}
                                        className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                                    >
                                        New
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* WiFi Configuration */}
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-4">
                            <Wifi className="w-5 h-5 text-gray-700" />
                            <h2 className="text-lg font-semibold text-gray-900">WiFi Configuration</h2>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-4">
                            <Zap className="w-5 h-5 text-gray-700" />
                            <h2 className="text-lg font-semibold text-gray-900">Server Configuration</h2>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                                    API Key (Auto-generated)
                                </label>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="text"
                                        value={config.api_key}
                                        readOnly
                                        className="flex-1 px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-sm font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={regenerateApiKey}
                                        className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                                    >
                                        New
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Device Behavior */}
                    <div className="bg-gray-50 rounded-lg p-4">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Device Behavior Settings</h2>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                            <div className="flex flex-col justify-center space-y-3">
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