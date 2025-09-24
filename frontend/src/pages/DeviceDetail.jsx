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

    // Device data query
    const { data: device, isLoading } = useQuery(
        ['device', id],
        () => apiService.getDevice(id),
        {
            refetchInterval: 30000,
            enabled: !!id
        }
    );

    // Device sensors query
    const { data: sensors = [] } = useQuery(
        ['device-sensors', id],
        () => apiService.getDeviceSensors(id),
        { enabled: !!id }
    );

    // Device stats query
    const { data: stats } = useQuery(
        ['device-stats', id],
        () => apiService.getDeviceStats(id, '24h'),
        {
            enabled: !!id,
            refetchInterval: 60000
        }
    );

    // Recent alerts query
    const { data: alerts = [] } = useQuery(
        ['device-alerts', id],
        () => apiService.getDeviceAlerts(id),
        {
            enabled: !!id,
            refetchInterval: 10000
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

        websocketService.subscribe('device', id);
        websocketService.on(`device:${id}:telemetry`, handleTelemetryUpdate);
        websocketService.on(`device:${id}:updated`, handleDeviceUpdate);
        websocketService.on(`device:${id}:config_updated`, handleConfigUpdate);

        return () => {
            websocketService.unsubscribe('device', id);
            websocketService.off(`device:${id}:telemetry`, handleTelemetryUpdate);
            websocketService.off(`device:${id}:updated`, handleDeviceUpdate);
            websocketService.off(`device:${id}:config_updated`, handleConfigUpdate);
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
                        {getStatusIcon(device.current_status)}
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{device.name}</h1>
                            <p className="text-gray-500">{device.location_name}</p>
                        </div>
                        <span className={`px-2 py-1 text-sm font-medium rounded-full ${getStatusColor(device.current_status)}`}>
                            {device.current_status.toUpperCase()}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sensors.map((sensor) => {
                    const realtimeValue = realtimeData[sensor.pin];
                    const stat = stats?.find(s => s.pin === sensor.pin);

                    return (
                        <div key={sensor.id} className="bg-white rounded-lg shadow p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900">{sensor.name}</h3>
                                    <p className="text-sm text-gray-500">Pin {sensor.pin} • {sensor.sensor_type}</p>
                                </div>
                                <button
                                    onClick={() => setSelectedSensor(sensor)}
                                    className="text-blue-600 hover:text-blue-800"
                                >
                                    <Settings className="h-5 w-5" />
                                </button>
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
                        {alerts.slice(0, 5).map((alert) => (
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
        </div>
    );
}

export default DeviceDetail;