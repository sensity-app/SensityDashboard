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
    Tag,
    Settings
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
            select: (data) => data.devices || data || [],
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
            select: (data) => data.alerts || data || [],
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
                toast.success(t('dashboard.toast.acknowledgeSuccess'));
            },
            onError: (error) => {
                toast.error(t('dashboard.toast.acknowledgeError'));
                console.error('Failed to acknowledge alert:', error);
            }
        }
    );

    // Data is already processed by select function
    const devices = devicesData || [];
    const alerts = alertsData || [];

    const handleAcknowledgeAlert = async (alertId, event) => {
        event.stopPropagation();
        await acknowledgeAlertMutation.mutateAsync(alertId);
    };

    const resolveDeviceStatus = (device) => device?.current_status || device?.status || 'offline';

    const formatStatusLabel = (status) => {
        if (!status) {
            return t('deviceDetail.status.unknown', 'Unknown');
        }
        return t(`deviceDetail.status.${status}`, { defaultValue: status });
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
                                {devices.filter(d => resolveDeviceStatus(d) === 'online').length}
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
                                {devices.filter(d => resolveDeviceStatus(d) === 'offline').length}
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
                                {alerts.filter(a => a.status === 'active').length}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Activity & Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Device Activity */}
                <div className="card animate-slide-up">
                    <div className="card-header">
                        <h2 className="card-title">
                            <Activity className="w-6 h-6 text-primary" />
                            <span>{t('dashboard.recentActivity', 'Recent Activity')}</span>
                        </h2>
                    </div>
                    <div className="p-6">
                        {devices.length === 0 ? (
                            <div className="text-center py-8">
                                <Monitor className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500 text-sm">
                                    {t('dashboard.noDevicesYet', 'No devices yet')}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {devices.slice(0, 5).map((device, index) => (
                                    <Link
                                        key={device.id}
                                        to={`/devices/${device.id}`}
                                        className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                                    >
                                        <div className="flex items-center space-x-3 flex-1">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                                device.status === 'online' ? 'bg-green-100' :
                                                device.status === 'alarm' ? 'bg-red-100' : 'bg-gray-100'
                                            }`}>
                                                {getStatusIcon(device.status)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-900 group-hover:text-primary transition-colors truncate">
                                                    {device.name}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {device.location_name || 'No location'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <span className={`badge text-xs ${
                                                device.status === 'online' ? 'badge-success' :
                                                device.status === 'alarm' ? 'badge-error' : 'badge-warning'
                                            }`}>
                                                {device.status}
                                            </span>
                                        </div>
                                    </Link>
                                ))}
                                {devices.length > 5 && (
                                <Link to="/devices" className="block text-center py-2 text-sm text-primary hover:underline">
                                    {t('dashboard.viewAll')} {devices.length} {t('devices.deviceCountLabel', 'devices')} →
                                </Link>
                            )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="card animate-slide-up" style={{animationDelay: '100ms'}}>
                    <div className="card-header">
                        <h2 className="card-title">
                            <Zap className="w-6 h-6 text-primary" />
                            <span>{t('dashboard.quickActions', 'Quick Actions')}</span>
                        </h2>
                    </div>
                    <div className="p-6">
                        <div className="grid grid-cols-1 gap-3">
                            <Link
                                to="/firmware-builder"
                                className="flex items-center p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg hover:from-blue-100 hover:to-blue-200 transition-all group"
                            >
                                <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center mr-4">
                                    <Zap className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                        {t('dashboard.buildFirmware', 'Build New Firmware')}
                                    </p>
                                    <p className="text-xs text-gray-600">
                                        {t('dashboard.buildFirmwareDesc', 'Create and deploy firmware for new devices')}
                                    </p>
                                </div>
                            </Link>

                            <Link
                                to="/devices"
                                className="flex items-center p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-lg hover:from-green-100 hover:to-green-200 transition-all group"
                            >
                                <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center mr-4">
                                    <Monitor className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-900 group-hover:text-green-600 transition-colors">
                                        {t('dashboard.manageDevices', 'Manage Devices')}
                                    </p>
                                    <p className="text-xs text-gray-600">
                                        {t('dashboard.manageDevicesDesc', 'View and configure all your IoT devices')}
                                    </p>
                                </div>
                            </Link>

                            <Link
                                to="/settings"
                                className="flex items-center p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg hover:from-purple-100 hover:to-purple-200 transition-all group"
                            >
                                <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center mr-4">
                                    <Settings className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-900 group-hover:text-purple-600 transition-colors">
                                        {t('dashboard.systemSettings', 'System Settings')}
                                    </p>
                                    <p className="text-xs text-gray-600">
                                        {t('dashboard.systemSettingsDesc', 'Configure platform and notifications')}
                                    </p>
                                </div>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Unresolved Alerts */}
            {alerts.filter(a => a.status === 'active').length > 0 && (
                <div className="card animate-slide-up">
                    <div className="card-header">
                        <h2 className="card-title">
                            <AlertTriangle className="w-6 h-6 text-red-500" />
                            <span>{t('dashboard.unresolvedAlerts', 'Unresolved Alerts')}</span>
                        </h2>
                        <div className="flex items-center space-x-2">
                            <span className="badge badge-error">{alerts.filter(a => a.status === 'active').length} {t('alerts.unresolvedBadge', 'unresolved')}</span>
                            <Link to="/alerts" className="btn-secondary px-4 py-2 text-sm">
                                <Eye className="w-4 h-4 mr-1" />
                                {t('dashboard.viewAll')}
                            </Link>
                        </div>
                    </div>
                    <div className="p-6">
                        <div className="space-y-4">
                            {alerts.filter(a => a.status === 'active').slice(0, 5).map((alert, index) => {
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
                                                            {formatSeverityLabel(alert.severity)}
                                                        </span>
                                                        <span className="badge badge-error">{t('alerts.unresolved', 'Unresolved')}</span>
                                                    </div>
                                                    <div className="mb-2">
                                                        <h3 className="text-base font-semibold text-gray-900 mb-1">
                                                            {alert.device_name} - {alert.alert_type}
                                                        </h3>
                                                        <p className="text-sm text-gray-700 mb-2">{alert.message || t('deviceDetail.alerts.noContext')}</p>
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
                                                                <span>{(device.tags || []).join(', ')}</span>
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
                        {alerts.filter(a => a.status === 'active').length > 5 && (
                            <div className="mt-4 text-center">
                                <Link to="/alerts" className="btn-ghost">
                                    {t('dashboard.viewAll')} {alerts.filter(a => a.status === 'active').length} {t('alerts.unresolved', 'Unresolved alerts')}
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
