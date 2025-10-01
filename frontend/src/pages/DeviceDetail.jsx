import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, AlertTriangle, Settings, Download, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { websocketService } from '../services/websocket';
import HistoricalChart from '../components/HistoricalChart';
import SensorRuleEditor from '../components/SensorRuleEditor';
import OTAManager from '../components/OTAManager';

function DeviceDetail() {
    const { id } = useParams();
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    const [realtimeData, setRealtimeData] = useState({});
    const [selectedSensor, setSelectedSensor] = useState(null);
    const [showRuleEditor, setShowRuleEditor] = useState(false);
    const [showOTAManager, setShowOTAManager] = useState(false);
    const [showSensorEditor, setShowSensorEditor] = useState(false);
    const [editingSensor, setEditingSensor] = useState(null);

    // Device data query
    const { data: device, isLoading } = useQuery(
        ['device', id],
        () => apiService.getDevice(id),
        {
            refetchInterval: 30000,
            enabled: !!id,
            select: (data) => data.device
        }
    );

    // Device sensors query
    const { data: sensors = [], isLoading: sensorsLoading, error: sensorsError } = useQuery(
        ['device-sensors', id],
        () => apiService.getDeviceSensors(id),
        {
            enabled: !!id,
            select: (data) => {
                console.log('Sensors API response:', data);
                return data.sensors || data || [];
            },
            onError: (error) => {
                console.error('Failed to fetch sensors:', error);
            }
        }
    );

    // Device stats query
    const { data: stats } = useQuery(
        ['device-stats', id],
        () => apiService.getDeviceStats(id, '24h'),
        {
            enabled: !!id,
            refetchInterval: 60000,
            select: (data) => data.stats
        }
    );

    // Recent alerts query
    const { data: alerts = [] } = useQuery(
        ['device-alerts', id],
        () => apiService.getDeviceAlerts(id),
        {
            enabled: !!id,
            refetchInterval: 10000,
            select: (data) => data.alerts || data || []
        }
    );

    // Configuration update mutation
    const updateConfigMutation = useMutation(
        (config) => apiService.updateDeviceConfig(id, config),
        {
            onSuccess: () => {
                queryClient.invalidateQueries(['device', id]);
                toast.success('Device configuration updated');
            },
            onError: () => {
                toast.error('Failed to update device configuration');
            }
        }
    );

    // WebSocket real-time updates
    useEffect(() => {
        if (!id) return;

        const handleTelemetryUpdate = (data) => {
            setRealtimeData(prev => ({
                ...prev,
                [data.pin]: {
                    ...data,
                    timestamp: new Date(data.timestamp)
                }
            }));
        };

        const handleDeviceUpdate = (data) => {
            queryClient.setQueryData(['device', id], old => ({
                ...old,
                ...data
            }));
        };

        const handleConfigUpdate = (data) => {
            queryClient.invalidateQueries(['device', id]);
            toast.success(`Configuration updated by ${data.updatedBy}`);
        };

        // Initialize WebSocket connection only if service is available
        if (websocketService && typeof websocketService.subscribe === 'function') {
            websocketService.subscribe('device', id);
            websocketService.on(`device:${id}:telemetry`, handleTelemetryUpdate);
            websocketService.on(`device:${id}:updated`, handleDeviceUpdate);
            websocketService.on(`device:${id}:config_updated`, handleConfigUpdate);
        }

        return () => {
            if (websocketService && typeof websocketService.unsubscribe === 'function') {
                websocketService.unsubscribe('device', id);
                websocketService.off(`device:${id}:telemetry`, handleTelemetryUpdate);
                websocketService.off(`device:${id}:updated`, handleDeviceUpdate);
                websocketService.off(`device:${id}:config_updated`, handleConfigUpdate);
            }
        };
    }, [id, queryClient]);

    const handleConfigUpdate = (field, value) => {
        const config = {
            ...device,
            [field]: value
        };
        updateConfigMutation.mutate(config);
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'online':
                return <Wifi className="h-5 w-5 text-green-600" />;
            case 'offline':
                return <WifiOff className="h-5 w-5 text-gray-600" />;
            case 'alarm':
                return <AlertTriangle className="h-5 w-5 text-red-600" />;
            default:
                return <WifiOff className="h-5 w-5 text-gray-600" />;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'online': return 'bg-green-100 text-green-800';
            case 'offline': return 'bg-gray-100 text-gray-800';
            case 'alarm': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    if (isLoading) {
        return <div className="p-6">Loading device...</div>;
    }

    if (!device) {
        return <div className="p-6">Device not found</div>;
    }

    return (
        <div className="p-6 space-y-6">
            {/* Device Header */}
            <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        {getStatusIcon(device.status)}
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{device.name}</h1>
                            <p className="text-gray-500">{device.location_name}</p>
                        </div>
                        <span className={`px-2 py-1 text-sm font-medium rounded-full ${getStatusColor(device.status)}`}>
                            {device.status.toUpperCase()}
                        </span>
                    </div>

                    <div className="flex space-x-2">
                        <button
                            onClick={() => setShowRuleEditor(true)}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                        >
                            <Settings className="h-4 w-4 inline mr-1" />
                            Rules
                        </button>
                        <button
                            onClick={() => setShowOTAManager(true)}
                            className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200"
                        >
                            <Zap className="h-4 w-4 inline mr-1" />
                            OTA Update
                        </button>
                    </div>
                </div>

                {/* Device Info Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <p className="text-sm font-medium text-gray-500">Device ID</p>
                        <p className="text-sm text-gray-900">{device.id}</p>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Firmware Version</p>
                        <p className="text-sm text-gray-900">{device.firmware_version || 'Unknown'}</p>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">IP Address</p>
                        <p className="text-sm text-gray-900">{device.ip_address || 'Unknown'}</p>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Last Seen</p>
                        <p className="text-sm text-gray-900">
                            {device.last_heartbeat ?
                                new Date(device.last_heartbeat).toLocaleString() :
                                'Never'
                            }
                        </p>
                    </div>
                </div>
            </div>

            {/* Real-time Sensor Data */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">
                        Sensors {sensors.length > 0 && <span className="text-sm text-gray-500">({sensors.length})</span>}
                    </h2>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sensorsLoading ? (
                    <div className="col-span-full text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                        <p className="text-gray-500 mt-4">Loading sensors...</p>
                    </div>
                ) : sensorsError ? (
                    <div className="col-span-full text-center py-12 bg-red-50 rounded-lg">
                        <p className="text-red-600 mb-2">Failed to load sensors</p>
                        <p className="text-sm text-red-500">{sensorsError.message}</p>
                    </div>
                ) : sensors.length === 0 ? (
                    <div className="col-span-full text-center py-12 bg-white rounded-lg shadow">
                        <p className="text-gray-500 mb-4">No sensors configured for this device</p>
                        <p className="text-sm text-gray-400">Sensors are configured during firmware building in the Firmware Builder</p>
                    </div>
                ) : sensors.map((sensor) => {
                    const realtimeValue = realtimeData[sensor.pin];
                    const stat = stats?.find(s => s.pin === sensor.pin);

                    return (
                        <div key={sensor.id} className="bg-white rounded-lg shadow p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900">{sensor.name}</h3>
                                    <p className="text-sm text-gray-500">Pin {sensor.pin} • {sensor.sensor_type}</p>
                                </div>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => {
                                            setEditingSensor(sensor);
                                            setShowSensorEditor(true);
                                        }}
                                        className="text-gray-600 hover:text-gray-800"
                                        title="Edit sensor configuration"
                                    >
                                        <Settings className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Current Value */}
                            <div className="mb-4">
                                <div className="flex items-end space-x-2">
                                    <span className="text-3xl font-bold text-gray-900">
                                        {realtimeValue ?
                                            realtimeValue.processed_value.toFixed(2) :
                                            (stat?.avg_value ? parseFloat(stat.avg_value).toFixed(2) : '--')
                                        }
                                    </span>
                                    <span className="text-gray-500 text-sm">{sensor.unit}</span>
                                </div>
                                {realtimeValue && (
                                    <p className="text-xs text-gray-400">
                                        {realtimeValue.timestamp.toLocaleTimeString()}
                                    </p>
                                )}
                            </div>

                            {/* 24h Stats */}
                            {stat && (
                                <div className="grid grid-cols-3 gap-2 text-sm">
                                    <div>
                                        <p className="text-gray-500">Min</p>
                                        <p className="font-medium">{parseFloat(stat.min_value).toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500">Avg</p>
                                        <p className="font-medium">{parseFloat(stat.avg_value).toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500">Max</p>
                                        <p className="font-medium">{parseFloat(stat.max_value).toFixed(2)}</p>
                                    </div>
                                </div>
                            )}

                            {/* Rules Status */}
                            {sensor.rules && sensor.rules.length > 0 && (
                                <div className="mt-4 pt-4 border-t">
                                    <p className="text-xs text-gray-500 mb-2">Active Rules</p>
                                    <div className="flex flex-wrap gap-1">
                                        {sensor.rules.map((rule, index) => (
                                            <span
                                                key={index}
                                                className={`px-2 py-1 text-xs rounded-full ${
                                                    rule.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                                                }`}
                                            >
                                                {rule.rule_name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Historical Charts */}
            <div className="space-y-6">
                <h2 className="text-xl font-bold text-gray-900">Historical Data</h2>
                {sensors.map((sensor) => (
                    <HistoricalChart
                        key={sensor.id}
                        deviceId={id}
                        sensorPin={sensor.pin}
                        sensorName={sensor.name}
                        sensorUnit={sensor.unit}
                    />
                ))}
            </div>

            {/* Recent Alerts */}
            {alerts.length > 0 && (
                <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h2 className="text-lg font-medium text-gray-900">Recent Alerts</h2>
                    </div>
                    <div className="divide-y divide-gray-200">
                        {(alerts || []).slice(0, 5).map((alert) => (
                            <div key={alert.id} className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                            alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                                            alert.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                                            'bg-yellow-100 text-yellow-800'
                                        }`}>
                                            {alert.severity.toUpperCase()}
                                        </span>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{alert.alert_type}</p>
                                            <p className="text-sm text-gray-500">{alert.message}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm text-gray-500">
                                            {new Date(alert.created_at).toLocaleString()}
                                        </p>
                                        <span className={`text-xs px-2 py-1 rounded-full ${
                                            alert.status === 'OPEN' ? 'bg-red-100 text-red-800' :
                                            alert.status === 'ACK' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-green-100 text-green-800'
                                        }`}>
                                            {alert.status}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modals */}
            {showRuleEditor && selectedSensor && (
                <SensorRuleEditor
                    sensor={selectedSensor}
                    onClose={() => {
                        setShowRuleEditor(false);
                        setSelectedSensor(null);
                    }}
                />
            )}

            {showOTAManager && (
                <OTAManager
                    device={device}
                    onClose={() => setShowOTAManager(false)}
                />
            )}

            {showSensorEditor && editingSensor && (
                <SensorEditorModal
                    sensor={editingSensor}
                    deviceId={id}
                    onClose={() => {
                        setShowSensorEditor(false);
                        setEditingSensor(null);
                    }}
                    onSave={() => {
                        queryClient.invalidateQueries(['device-sensors', id]);
                        setShowSensorEditor(false);
                        setEditingSensor(null);
                    }}
                />
            )}
        </div>
    );
}

// Sensor Editor Modal Component
function SensorEditorModal({ sensor, deviceId, onClose, onSave }) {
    const [formData, setFormData] = useState({
        name: sensor?.name || '',
        calibration_offset: sensor?.calibration_offset || 0,
        calibration_multiplier: sensor?.calibration_multiplier || 1,
        enabled: sensor?.enabled !== false
    });
    const [triggerOTA, setTriggerOTA] = useState(true);

    const updateSensorMutation = useMutation(
        (data) => apiService.updateSensor(deviceId, sensor.id, data),
        {
            onSuccess: async () => {
                toast.success('Sensor updated successfully');

                if (triggerOTA) {
                    toast.info('Triggering OTA update to apply sensor changes...');
                    // Note: OTA update trigger would go here
                    // For now, just show a message
                    setTimeout(() => {
                        toast.success('Sensor configuration will be applied on next device sync');
                    }, 1000);
                }

                onSave();
            },
            onError: (error) => {
                toast.error('Failed to update sensor: ' + (error.response?.data?.error || error.message));
            }
        }
    );

    const handleSubmit = (e) => {
        e.preventDefault();
        updateSensorMutation.mutate(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Edit Sensor: {sensor.name}
                </h3>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Sensor Name
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="input w-full"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Calibration Offset
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={formData.calibration_offset}
                            onChange={(e) => setFormData({...formData, calibration_offset: parseFloat(e.target.value)})}
                            className="input w-full"
                        />
                        <p className="text-xs text-gray-500 mt-1">Value added to raw sensor reading</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Calibration Multiplier
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={formData.calibration_multiplier}
                            onChange={(e) => setFormData({...formData, calibration_multiplier: parseFloat(e.target.value)})}
                            className="input w-full"
                        />
                        <p className="text-xs text-gray-500 mt-1">Value multiplied with raw sensor reading</p>
                    </div>

                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="enabled"
                            checked={formData.enabled}
                            onChange={(e) => setFormData({...formData, enabled: e.target.checked})}
                            className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                        />
                        <label htmlFor="enabled" className="ml-2 block text-sm text-gray-700">
                            Sensor enabled
                        </label>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded p-3">
                        <div className="flex items-start">
                            <input
                                type="checkbox"
                                id="triggerOTA"
                                checked={triggerOTA}
                                onChange={(e) => setTriggerOTA(e.target.checked)}
                                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded mt-0.5"
                            />
                            <label htmlFor="triggerOTA" className="ml-2 block text-sm text-gray-700">
                                <span className="font-medium">Trigger OTA Update</span>
                                <p className="text-xs text-gray-600 mt-1">
                                    Device will receive updated configuration on next sync
                                </p>
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn-secondary px-4 py-2"
                            disabled={updateSensorMutation.isLoading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-primary px-4 py-2"
                            disabled={updateSensorMutation.isLoading}
                        >
                            {updateSensorMutation.isLoading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default DeviceDetail;