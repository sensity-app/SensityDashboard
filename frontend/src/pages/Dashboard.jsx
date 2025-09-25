import React from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, AlertTriangle, Monitor } from 'lucide-react';

import { apiService } from '../services/api';

function Dashboard() {
    const { t } = useTranslation();

    // Query devices
    const { data: devicesData, isLoading: devicesLoading, error: devicesError } = useQuery(
        'devices',
        () => apiService.getDevices(),
        {
            refetchInterval: 30000,
            retry: false,
            onError: (error) => {
                console.error('Failed to fetch devices:', error);
            }
        }
    );

    // Query recent alerts
    const { data: alertsData, isLoading: alertsLoading, error: alertsError } = useQuery(
        'recent-alerts',
        () => apiService.getRecentAlerts(),
        {
            refetchInterval: 10000,
            retry: false,
            onError: (error) => {
                console.error('Failed to fetch alerts:', error);
            }
        }
    );

    // Safely handle API responses
    const devices = Array.isArray(devicesData) ? devicesData : [];
    const alerts = Array.isArray(alertsData) ? alertsData : [];

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

    if (devicesLoading) {
        return (
            <div className="p-6">
                <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/4 mb-6"></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="bg-white rounded-lg shadow p-6">
                                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <Monitor className="h-8 w-8 text-blue-600" />
                        </div>
                        <div className="ml-5 w-0 flex-1">
                            <dl>
                                <dt className="text-sm font-medium text-gray-500 truncate">
                                    {t('dashboard.totalDevices', 'Total Devices')}
                                </dt>
                                <dd className="text-3xl font-bold text-gray-900">
                                    {devices.length}
                                </dd>
                            </dl>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <Wifi className="h-8 w-8 text-green-600" />
                        </div>
                        <div className="ml-5 w-0 flex-1">
                            <dl>
                                <dt className="text-sm font-medium text-gray-500 truncate">
                                    {t('dashboard.onlineDevices', 'Online')}
                                </dt>
                                <dd className="text-3xl font-bold text-green-600">
                                    {devices.filter(d => d.current_status === 'online').length}
                                </dd>
                            </dl>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <WifiOff className="h-8 w-8 text-gray-600" />
                        </div>
                        <div className="ml-5 w-0 flex-1">
                            <dl>
                                <dt className="text-sm font-medium text-gray-500 truncate">
                                    {t('dashboard.offlineDevices', 'Offline')}
                                </dt>
                                <dd className="text-3xl font-bold text-gray-600">
                                    {devices.filter(d => d.current_status === 'offline').length}
                                </dd>
                            </dl>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <AlertTriangle className="h-8 w-8 text-red-600" />
                        </div>
                        <div className="ml-5 w-0 flex-1">
                            <dl>
                                <dt className="text-sm font-medium text-gray-500 truncate">
                                    {t('dashboard.activeAlerts', 'Active Alerts')}
                                </dt>
                                <dd className="text-3xl font-bold text-red-600">
                                    {alerts.filter(a => a.status === 'OPEN').length}
                                </dd>
                            </dl>
                        </div>
                    </div>
                </div>
            </div>

            {/* Devices Grid */}
            <div className="bg-white shadow rounded-lg">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-medium text-gray-900">
                        {t('dashboard.devices', 'Devices')}
                    </h2>
                </div>

                {devices.length === 0 ? (
                    <div className="p-6 text-center">
                        <Monitor className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">
                            {t('dashboard.noDevices', 'No devices found')}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                            {t('dashboard.addFirstDevice', 'Add your first IoT device to get started.')}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                        {(devices || []).map((device) => (
                            <Link
                                key={device.id}
                                to={`/devices/${device.id}`}
                                className="block bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center space-x-2">
                                        {getStatusIcon(device.current_status)}
                                        <h3 className="text-lg font-medium text-gray-900">
                                            {device.name}
                                        </h3>
                                    </div>
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(device.current_status)}`}>
                                        {device.current_status.toUpperCase()}
                                    </span>
                                </div>

                                <div className="text-sm text-gray-600">
                                    <p><span className="font-medium">ID:</span> {device.id}</p>
                                    <p><span className="font-medium">Location:</span> {device.location_name || 'Unknown'}</p>
                                    <p><span className="font-medium">Version:</span> {device.firmware_version || 'Unknown'}</p>
                                    <p><span className="font-medium">Last Seen:</span> {
                                        device.last_heartbeat ?
                                            new Date(device.last_heartbeat).toLocaleString() :
                                            'Never'
                                    }</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            {/* Recent Alerts */}
            {alerts.length > 0 && (
                <div className="bg-white shadow rounded-lg">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h2 className="text-lg font-medium text-gray-900">
                            {t('dashboard.recentAlerts', 'Recent Alerts')}
                        </h2>
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
                                            <p className="text-sm font-medium text-gray-900">
                                                {alert.device_name} - {alert.alert_type}
                                            </p>
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
        </div>
    );
}

export default Dashboard;