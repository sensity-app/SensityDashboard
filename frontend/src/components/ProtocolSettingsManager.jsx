import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Settings, Wifi, Router, TestTube, Save, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { apiService } from '../services/api';

const ProtocolSettingsManager = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    const [selectedDevice, setSelectedDevice] = useState('');
    const [protocol, setProtocol] = useState('http');
    const [formData, setFormData] = useState({
        httpEndpoint: '',
        mqttBrokerHost: '',
        mqttBrokerPort: 1883,
        mqttUsername: '',
        mqttPassword: '',
        mqttTopicPrefix: 'iot',
        mqttQos: 1,
        heartbeatInterval: 300
    });
    const [testResult, setTestResult] = useState(null);
    const [testLoading, setTestLoading] = useState(false);

    // Fetch devices
    const { data: devices = [] } = useQuery('devices', apiService.getDevices);

    // Fetch MQTT configuration
    const { data: mqttConfig } = useQuery('mqttConfig', apiService.getMqttConfig);

    // Fetch current protocol settings for selected device
    const { data: currentSettings, refetch: refetchSettings } = useQuery(
        ['protocolSettings', selectedDevice],
        () => selectedDevice ? apiService.getDeviceProtocolSettings(selectedDevice) : null,
        { enabled: !!selectedDevice }
    );

    // Update protocol settings mutation
    const updateProtocolMutation = useMutation(apiService.updateProtocolSettings, {
        onSuccess: () => {
            toast.success(t('protocolSettings.updateSuccess', 'Protocol settings updated successfully'));
            queryClient.invalidateQueries(['protocolSettings', selectedDevice]);
            refetchSettings();
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || t('protocolSettings.updateError', 'Failed to update protocol settings'));
        }
    });

    // Delete protocol settings mutation
    const deleteProtocolMutation = useMutation(apiService.deleteProtocolSettings, {
        onSuccess: () => {
            toast.success(t('protocolSettings.resetSuccess', 'Protocol settings reset to default'));
            queryClient.invalidateQueries(['protocolSettings', selectedDevice]);
            refetchSettings();
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || t('protocolSettings.resetError', 'Failed to reset protocol settings'));
        }
    });

    // Test connection mutation
    const testConnectionMutation = useMutation(apiService.testProtocolConnection, {
        onSuccess: (result) => {
            setTestResult(result);
            if (result.success) {
                toast.success(t('protocolSettings.testSuccess', 'Connection test successful'));
            } else {
                toast.error(t('protocolSettings.testFailed', 'Connection test failed'));
            }
        },
        onError: (error) => {
            setTestResult({
                success: false,
                message: error.response?.data?.message || 'Connection test failed',
                details: error.response?.data?.details || {}
            });
            toast.error(t('protocolSettings.testError', 'Failed to test connection'));
        }
    });

    // Load current settings when device is selected
    useEffect(() => {
        if (currentSettings) {
            setProtocol(currentSettings.protocol || 'http');
            setFormData({
                httpEndpoint: currentSettings.http_endpoint || '',
                mqttBrokerHost: currentSettings.mqtt_broker_host || mqttConfig?.defaultBrokerHost || '',
                mqttBrokerPort: currentSettings.mqtt_broker_port || mqttConfig?.defaultBrokerPort || 1883,
                mqttUsername: currentSettings.mqtt_username || '',
                mqttPassword: currentSettings.mqtt_password || '',
                mqttTopicPrefix: currentSettings.mqtt_topic_prefix || mqttConfig?.defaultTopicPrefix || 'iot',
                mqttQos: currentSettings.mqtt_qos || mqttConfig?.defaultQos || 1,
                heartbeatInterval: currentSettings.heartbeat_interval || 300
            });
        } else if (mqttConfig) {
            // Set defaults from MQTT config
            setFormData(prev => ({
                ...prev,
                mqttBrokerHost: mqttConfig.defaultBrokerHost || '',
                mqttBrokerPort: mqttConfig.defaultBrokerPort || 1883,
                mqttTopicPrefix: mqttConfig.defaultTopicPrefix || 'iot',
                mqttQos: mqttConfig.defaultQos || 1
            }));
        }
        setTestResult(null);
    }, [currentSettings, mqttConfig]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setTestResult(null);
    };

    const handleTestConnection = async () => {
        if (!selectedDevice) {
            toast.error(t('protocolSettings.selectDevice', 'Please select a device'));
            return;
        }

        setTestLoading(true);
        try {
            const testData = {
                protocol,
                ...(protocol === 'http' ? {
                    httpEndpoint: formData.httpEndpoint
                } : {
                    mqttBrokerHost: formData.mqttBrokerHost,
                    mqttBrokerPort: formData.mqttBrokerPort,
                    mqttUsername: formData.mqttUsername || undefined,
                    mqttPassword: formData.mqttPassword || undefined
                })
            };

            testConnectionMutation.mutate(testData);
        } finally {
            setTestLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedDevice) {
            toast.error(t('protocolSettings.selectDevice', 'Please select a device'));
            return;
        }

        const saveData = {
            deviceId: selectedDevice,
            protocol,
            httpEndpoint: protocol === 'http' ? formData.httpEndpoint : undefined,
            mqttBrokerHost: protocol === 'mqtt' ? formData.mqttBrokerHost : undefined,
            mqttBrokerPort: protocol === 'mqtt' ? formData.mqttBrokerPort : undefined,
            mqttUsername: protocol === 'mqtt' ? formData.mqttUsername : undefined,
            mqttPassword: protocol === 'mqtt' ? formData.mqttPassword : undefined,
            mqttTopicPrefix: protocol === 'mqtt' ? formData.mqttTopicPrefix : undefined,
            mqttQos: protocol === 'mqtt' ? formData.mqttQos : undefined,
            heartbeatInterval: formData.heartbeatInterval
        };

        updateProtocolMutation.mutate(saveData);
    };

    const handleReset = () => {
        if (!selectedDevice) {
            toast.error(t('protocolSettings.selectDevice', 'Please select a device'));
            return;
        }

        if (window.confirm(t('protocolSettings.confirmReset', 'Are you sure you want to reset protocol settings to default HTTP?'))) {
            deleteProtocolMutation.mutate(selectedDevice);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white shadow rounded-lg">
                <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center">
                        <Settings className="w-5 h-5 text-gray-400 mr-2" />
                        <h2 className="text-lg font-medium text-gray-900">
                            {t('protocolSettings.title', 'Protocol Settings')}
                        </h2>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                        {t('protocolSettings.description', 'Configure communication protocols for your devices (HTTP or MQTT)')}
                    </p>
                </div>

                <div className="p-6 space-y-6">
                    {/* Device Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('protocolSettings.selectDevice', 'Select Device')}
                        </label>
                        <select
                            value={selectedDevice}
                            onChange={(e) => setSelectedDevice(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                            <option value="">{t('protocolSettings.chooseDevice', 'Choose a device...')}</option>
                            {devices.map((device) => (
                                <option key={device.id} value={device.id}>
                                    {device.name} ({device.device_type})
                                </option>
                            ))}
                        </select>
                    </div>

                    {selectedDevice && (
                        <>
                            {/* Protocol Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('protocolSettings.protocol', 'Protocol')}
                                </label>
                                <div className="flex space-x-4">
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            name="protocol"
                                            value="http"
                                            checked={protocol === 'http'}
                                            onChange={(e) => setProtocol(e.target.value)}
                                            className="mr-2"
                                        />
                                        <Wifi className="w-4 h-4 mr-1" />
                                        HTTP
                                    </label>
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            name="protocol"
                                            value="mqtt"
                                            checked={protocol === 'mqtt'}
                                            onChange={(e) => setProtocol(e.target.value)}
                                            className="mr-2"
                                        />
                                        <Router className="w-4 h-4 mr-1" />
                                        MQTT
                                    </label>
                                </div>
                            </div>

                            {/* HTTP Configuration */}
                            {protocol === 'http' && (
                                <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
                                    <h3 className="text-md font-medium text-blue-900">HTTP Configuration</h3>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            {t('protocolSettings.httpEndpoint', 'HTTP Endpoint')}
                                        </label>
                                        <input
                                            type="url"
                                            value={formData.httpEndpoint}
                                            onChange={(e) => handleInputChange('httpEndpoint', e.target.value)}
                                            placeholder="http://localhost:3001/api"
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                            required
                                        />
                                    </div>
                                </div>
                            )}

                            {/* MQTT Configuration */}
                            {protocol === 'mqtt' && (
                                <div className="space-y-4 p-4 bg-green-50 rounded-lg">
                                    <h3 className="text-md font-medium text-green-900">MQTT Configuration</h3>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                {t('protocolSettings.mqttBrokerHost', 'MQTT Broker Host')}
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.mqttBrokerHost}
                                                onChange={(e) => handleInputChange('mqttBrokerHost', e.target.value)}
                                                placeholder="localhost"
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                {t('protocolSettings.mqttBrokerPort', 'Port')}
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="65535"
                                                value={formData.mqttBrokerPort}
                                                onChange={(e) => handleInputChange('mqttBrokerPort', parseInt(e.target.value))}
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                {t('protocolSettings.mqttUsername', 'Username (Optional)')}
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.mqttUsername}
                                                onChange={(e) => handleInputChange('mqttUsername', e.target.value)}
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                {t('protocolSettings.mqttPassword', 'Password (Optional)')}
                                            </label>
                                            <input
                                                type="password"
                                                value={formData.mqttPassword}
                                                onChange={(e) => handleInputChange('mqttPassword', e.target.value)}
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                {t('protocolSettings.mqttTopicPrefix', 'Topic Prefix')}
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.mqttTopicPrefix}
                                                onChange={(e) => handleInputChange('mqttTopicPrefix', e.target.value)}
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                {t('protocolSettings.mqttQos', 'QoS Level')}
                                            </label>
                                            <select
                                                value={formData.mqttQos}
                                                onChange={(e) => handleInputChange('mqttQos', parseInt(e.target.value))}
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                                            >
                                                {mqttConfig?.availableQosLevels?.map((qos) => (
                                                    <option key={qos.value} value={qos.value}>
                                                        {qos.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Heartbeat Configuration */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('protocolSettings.heartbeatInterval', 'Heartbeat Interval (seconds)')}
                                </label>
                                <input
                                    type="number"
                                    min="30"
                                    max="3600"
                                    value={formData.heartbeatInterval}
                                    onChange={(e) => handleInputChange('heartbeatInterval', parseInt(e.target.value))}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                />
                            </div>

                            {/* Test Result */}
                            {testResult && (
                                <div className={`p-4 rounded-lg ${testResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
                                    <div className="flex items-center">
                                        {testResult.success ? (
                                            <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                                        ) : (
                                            <XCircle className="w-5 h-5 text-red-500 mr-2" />
                                        )}
                                        <span className={`font-medium ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                                            {testResult.message}
                                        </span>
                                    </div>
                                    {testResult.details && (
                                        <div className="mt-2 text-sm text-gray-600">
                                            {Object.entries(testResult.details).map(([key, value]) => (
                                                <div key={key}>
                                                    <span className="font-medium">{key}:</span> {value}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex justify-between pt-4">
                                <button
                                    onClick={handleReset}
                                    disabled={deleteProtocolMutation.isLoading}
                                    className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    {t('protocolSettings.reset', 'Reset to Default')}
                                </button>

                                <div className="flex space-x-3">
                                    <button
                                        onClick={handleTestConnection}
                                        disabled={testLoading}
                                        className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                                    >
                                        <TestTube className="w-4 h-4 mr-2" />
                                        {testLoading ? t('protocolSettings.testing', 'Testing...') : t('protocolSettings.testConnection', 'Test Connection')}
                                    </button>

                                    <button
                                        onClick={handleSave}
                                        disabled={updateProtocolMutation.isLoading}
                                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                                    >
                                        <Save className="w-4 h-4 mr-2" />
                                        {updateProtocolMutation.isLoading ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProtocolSettingsManager;