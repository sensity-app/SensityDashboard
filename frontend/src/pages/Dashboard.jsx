import React from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    Wifi,
    WifiOff,
    AlertTriangle,
    Monitor,
    Activity,
    TrendingUp,
    Clock,
    MapPin,
    Zap,
    Eye,
    Check,
    Tag
} from 'lucide-react';

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

    const queryClient = useQueryClient();

    // Acknowledge alert mutation
    const acknowledgeAlertMutation = useMutation(
        (alertId) => apiService.acknowledgeAlert(alertId),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('recent-alerts');
                toast.success('Alert acknowledged successfully');
            },
            onError: (error) => {
                toast.error('Failed to acknowledge alert');
                console.error('Failed to acknowledge alert:', error);
            }
        }
    );

    // Safely handle API responses
    const devices = Array.isArray(devicesData) ? devicesData : [];
    const alerts = Array.isArray(alertsData) ? alertsData : [];

    const handleAcknowledgeAlert = async (alertId, event) => {
        event.stopPropagation();
        await acknowledgeAlertMutation.mutateAsync(alertId);
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


    if (devicesLoading) {
        return (
            <div className="space-y-8 animate-fade-in">
                <div className="animate-pulse">
                    <div className="h-6 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-1/4 mb-8"></div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="card p-6">
                                <div className="flex items-center space-x-4">
                                    <div className="w-12 h-12 bg-gradient-to-r from-gray-200 to-gray-300 rounded-xl"></div>
                                    <div className="flex-1">
                                        <div className="h-4 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-3/4 mb-2"></div>
                                        <div className="h-6 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-1/2"></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="card p-6">
                        <div className="h-6 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-1/3 mb-6"></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="glass p-4 rounded-xl">
                                    <div className="h-4 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-3/4 mb-3"></div>
                                    <div className="space-y-2">
                                        <div className="h-3 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-full"></div>
                                        <div className="h-3 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-2/3"></div>
                                        <div className="h-3 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-4/5"></div>
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
        <div className="space-y-8 animate-fade-in">
            {/* Modern Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="card p-6 hover:shadow-xl transition-all duration-300 animate-slide-up">
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                            <Monitor className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-gray-600 mb-1">
                                {t('dashboard.totalDevices', 'Total Devices')}
                            </p>
                            <p className="text-3xl font-bold text-gray-900">
                                {devices.length}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="card p-6 hover:shadow-xl transition-all duration-300 animate-slide-up" style={{animationDelay: '100ms'}}>
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                            <Wifi className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-gray-600 mb-1">
                                {t('dashboard.onlineDevices', 'Online')}
                            </p>
                            <p className="text-3xl font-bold text-green-600">
                                {devices.filter(d => d.current_status === 'online').length}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="card p-6 hover:shadow-xl transition-all duration-300 animate-slide-up" style={{animationDelay: '200ms'}}>
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center">
                            <WifiOff className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-gray-600 mb-1">
                                {t('dashboard.offlineDevices', 'Offline')}
                            </p>
                            <p className="text-3xl font-bold text-gray-600">
                                {devices.filter(d => d.current_status === 'offline').length}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="card p-6 hover:shadow-xl transition-all duration-300 animate-slide-up" style={{animationDelay: '300ms'}}>
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
                            <AlertTriangle className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-gray-600 mb-1">
                                {t('dashboard.activeAlerts', 'Active Alerts')}
                            </p>
                            <p className="text-3xl font-bold text-red-600">
                                {alerts.filter(a => a.status === 'OPEN').length}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modern Devices Grid */}
            <div className="card animate-slide-up">
                <div className="card-header">
                    <h2 className="card-title">
                        <Activity className="w-6 h-6 text-primary" />
                        <span>{t('dashboard.devices', 'Devices')}</span>
                    </h2>
                    <div className="flex items-center space-x-2">
                        <span className="badge badge-primary">{devices.length} total</span>
                        <Link to="/devices" className="btn-secondary px-4 py-2 text-sm">
                            <Eye className="w-4 h-4 mr-1" />
                            View All
                        </Link>
                    </div>
                </div>

                {devices.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-6">
                            <Monitor className="h-12 w-12 text-gray-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            {t('dashboard.noDevices', 'No devices found')}
                        </h3>
                        <p className="text-gray-500 mb-6">
                            {t('dashboard.addFirstDevice', 'Add your first IoT device to get started.')}
                        </p>
                        <Link to="/firmware-builder" className="btn-primary">
                            <Zap className="w-4 h-4 mr-2" />
                            Build First Device
                        </Link>
                    </div>
                ) : (
                    <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {(devices || []).map((device, index) => (
                                <Link
                                    key={device.id}
                                    to={`/devices/${device.id}`}
                                    className="glass p-4 rounded-xl hover:bg-white/60 transition-all duration-200 group animate-scale-in"
                                    style={{animationDelay: `${index * 50}ms`}}
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center space-x-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                                device.current_status === 'online' ? 'bg-green-100' :
                                                device.current_status === 'alarm' ? 'bg-red-100' : 'bg-gray-100'
                                            }`}>
                                                {getStatusIcon(device.current_status)}
                                            </div>
                                            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary transition-colors">
                                                {device.name}
                                            </h3>
                                        </div>
                                        <span className={`badge ${
                                            device.current_status === 'online' ? 'badge-success' :
                                            device.current_status === 'alarm' ? 'badge-error' : 'badge-warning'
                                        }`}>
                                            {device.current_status.toUpperCase()}
                                        </span>
                                    </div>

                                    <div className="space-y-2 text-sm">
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-500 flex items-center">
                                                <Monitor className="w-3 h-3 mr-1" />ID:
                                            </span>
                                            <span className="font-mono text-xs text-gray-900">{device.id}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-500 flex items-center">
                                                <MapPin className="w-3 h-3 mr-1" />Location:
                                            </span>
                                            <span className="text-gray-900">{device.location_name || 'Unknown'}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-500 flex items-center">
                                                <TrendingUp className="w-3 h-3 mr-1" />Version:
                                            </span>
                                            <span className="text-gray-900">{device.firmware_version || 'Unknown'}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-500 flex items-center">
                                                <Clock className="w-3 h-3 mr-1" />Last Seen:
                                            </span>
                                            <span className="text-gray-900 text-xs">{
                                                device.last_heartbeat ?
                                                    new Date(device.last_heartbeat).toLocaleDateString() :
                                                    'Never'
                                            }</span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Unresolved Alerts */}
            {alerts.filter(a => a.status === 'OPEN').length > 0 && (
                <div className="card animate-slide-up">
                    <div className="card-header">
                        <h2 className="card-title">
                            <AlertTriangle className="w-6 h-6 text-red-500" />
                            <span>{t('dashboard.unresolvedAlerts', 'Unresolved Alerts')}</span>
                        </h2>
                        <div className="flex items-center space-x-2">
                            <span className="badge badge-error">{alerts.filter(a => a.status === 'OPEN').length} unresolved</span>
                            <Link to="/alerts" className="btn-secondary px-4 py-2 text-sm">
                                <Eye className="w-4 h-4 mr-1" />
                                View All
                            </Link>
                        </div>
                    </div>
                    <div className="p-6">
                        <div className="space-y-4">
                            {alerts.filter(a => a.status === 'OPEN').slice(0, 5).map((alert, index) => {
                                // Find device details for this alert
                                const device = devices.find(d => d.name === alert.device_name || d.id === alert.device_id);

                                return (
                                    <div key={alert.id} className={`glass p-5 rounded-xl transition-all duration-200 hover:bg-white/60 animate-scale-in border-l-4 ${
                                        alert.severity === 'critical' ? 'border-red-500' :
                                        alert.severity === 'high' ? 'border-orange-500' : 'border-yellow-500'
                                    }`} style={{animationDelay: `${index * 100}ms`}}>
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start space-x-4 flex-1">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                                    alert.severity === 'critical' ? 'bg-red-100' :
                                                    alert.severity === 'high' ? 'bg-orange-100' : 'bg-yellow-100'
                                                }`}>
                                                    <AlertTriangle className={`w-6 h-6 ${
                                                        alert.severity === 'critical' ? 'text-red-600' :
                                                        alert.severity === 'high' ? 'text-orange-600' : 'text-yellow-600'
                                                    }`} />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center space-x-2 mb-2">
                                                        <span className={`badge ${
                                                            alert.severity === 'critical' ? 'badge-error' :
                                                            alert.severity === 'high' ? 'badge-warning' : 'badge-warning'
                                                        }`}>
                                                            {alert.severity.toUpperCase()}
                                                        </span>
                                                        <span className="badge badge-error">UNRESOLVED</span>
                                                    </div>
                                                    <div className="mb-2">
                                                        <h3 className="text-base font-semibold text-gray-900 mb-1">
                                                            {alert.device_name} - {alert.alert_type}
                                                        </h3>
                                                        <p className="text-sm text-gray-700 mb-2">{alert.message}</p>
                                                    </div>
                                                    <div className="flex items-center space-x-4 text-xs text-gray-600">
                                                        {device?.location_name && (
                                                            <div className="flex items-center space-x-1">
                                                                <MapPin className="w-3 h-3" />
                                                                <span>{device.location_name}</span>
                                                            </div>
                                                        )}
                                                        {device?.tags && device.tags.length > 0 && (
                                                            <div className="flex items-center space-x-1">
                                                                <Tag className="w-3 h-3" />
                                                                <span>{device.tags.join(', ')}</span>
                                                            </div>
                                                        )}
                                                        <div className="flex items-center space-x-1">
                                                            <Clock className="w-3 h-3" />
                                                            <span>{new Date(alert.created_at).toLocaleDateString()} {new Date(alert.created_at).toLocaleTimeString()}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => handleAcknowledgeAlert(alert.id, e)}
                                                disabled={acknowledgeAlertMutation.isLoading}
                                                className="btn-success flex items-center space-x-2 px-4 py-2 text-sm disabled:opacity-50"
                                                title="Acknowledge this alert"
                                            >
                                                {acknowledgeAlertMutation.isLoading ? (
                                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                ) : (
                                                    <>
                                                        <Check className="w-4 h-4" />
                                                        <span>Resolve</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {alerts.filter(a => a.status === 'OPEN').length > 5 && (
                            <div className="mt-4 text-center">
                                <Link to="/alerts" className="btn-ghost">
                                    View All {alerts.filter(a => a.status === 'OPEN').length} Unresolved Alerts
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;