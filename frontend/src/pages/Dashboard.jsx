import React, { useMemo } from 'react';
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
    Settings,
    Cpu,
    FileText,
    Server,
    BarChart3,
    Shield,
    Bell,
    ChevronRight,
    Calendar,
    Signal
} from 'lucide-react';

import { apiService } from '../services/api';

function Dashboard() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    // Query devices
    const { data: devicesData, isLoading: devicesLoading } = useQuery(
        'devices',
        () => apiService.getDevices(),
        {
            refetchOnWindowFocus: false,
            staleTime: 2 * 60 * 1000, // 2 minutes
            retry: false,
            select: (data) => data.devices || data || [],
            onError: (error) => {
                console.error('Failed to fetch devices:', error);
            }
        }
    );

    // Query recent alerts
    const { data: alertsData, isLoading: alertsLoading } = useQuery(
        'recent-alerts',
        () => apiService.getRecentAlerts(),
        {
            refetchOnWindowFocus: false,
            staleTime: 2 * 60 * 1000, // 2 minutes
            retry: false,
            select: (data) => data.alerts || data || [],
            onError: (error) => {
                console.error('Failed to fetch alerts:', error);
            }
        }
    );

    // Acknowledge alert mutation
    const acknowledgeAlertMutation = useMutation(
        (alertId) => apiService.acknowledgeAlert(alertId),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('recent-alerts');
                toast.success(t('dashboard.toast.acknowledgeSuccess', 'Alert acknowledged'));
            },
            onError: () => {
                toast.error(t('dashboard.toast.acknowledgeError', 'Failed to acknowledge alert'));
            }
        }
    );

    // Resolve alert mutation
    const resolveAlertMutation = useMutation(
        (alertId) => apiService.resolveAlert(alertId),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('recent-alerts');
                toast.success(t('dashboard.toast.resolveSuccess', 'Alert resolved'));
            },
            onError: () => {
                toast.error(t('dashboard.toast.resolveError', 'Failed to resolve alert'));
            }
        }
    );

    const devices = devicesData || [];
    const alerts = alertsData || [];

    function isDeviceOnline(device) {
        if (!device.last_heartbeat) return false;
        const diff = Date.now() - new Date(device.last_heartbeat).getTime();
        const minutes = Math.floor(diff / 60000);
        return minutes < 10; // Device is online if last heartbeat was within 10 minutes
    }

    // Calculate stats
    const stats = useMemo(() => {
        const total = devices.length;
        const online = devices.filter(d => isDeviceOnline(d)).length;
        const offline = devices.filter(d => !isDeviceOnline(d)).length;
        const activeAlerts = alerts.filter(a => a.status === 'active').length;

        return { total, online, offline, activeAlerts };
    }, [devices, alerts]);

    const formatRelativeTime = (timestamp) => {
        if (!timestamp) return t('common.never', 'Never');
        const diff = Date.now() - new Date(timestamp).getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 1) return t('common.justNow', 'Just now');
        if (minutes < 60) return t('common.minutesAgo', '{{count}} min ago', { count: minutes });
        if (hours < 24) return t('common.hoursAgo', '{{count}}h ago', { count: hours });
        return t('common.daysAgo', '{{count}}d ago', { count: days });
    };

    const formatSeverityLabel = (severity) => {
        if (!severity) return t('dashboard.alertSeverity.info', 'Info');
        const key = `dashboard.alertSeverity.${severity.toLowerCase()}`;
        return t(key, severity);
    };

    const resolveDeviceStatus = (device) => {
        // Determine actual status based on last heartbeat
        if (isDeviceOnline(device)) {
            return 'online';
        }
        return 'offline';
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'online':
                return <Wifi className="h-5 w-5" />;
            case 'offline':
                return <WifiOff className="h-5 w-5" />;
            case 'alarm':
                return <AlertTriangle className="h-5 w-5" />;
            default:
                return <WifiOff className="h-5 w-5" />;
        }
    };

    if (devicesLoading || alertsLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-16 space-y-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
                <p className="text-gray-500">{t('common.loading', 'Loading dashboard...')}</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-6 space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">
                        {t('dashboard.title', 'Dashboard')}
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        {t('dashboard.subtitle', 'Monitor your IoT infrastructure at a glance')}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        to="/devices"
                        className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 border border-gray-200 transition-all"
                    >
                        <Monitor className="h-4 w-4" />
                        {t('dashboard.manageDevices', 'Manage Devices')}
                    </Link>
                    <Link
                        to="/firmware-builder"
                        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:from-indigo-700 hover:to-indigo-800 transition-all duration-200 hover:scale-105"
                    >
                        <Zap className="h-4 w-4" />
                        {t('dashboard.buildFirmware', 'Build Firmware')}
                    </Link>
                </div>
            </div>

            {/* Stats Cards - Matching DeviceManagement design */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 shadow-lg hover:shadow-xl transition-shadow">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-indigo-100">
                                {t('dashboard.totalDevices', 'Total Devices')}
                            </p>
                            <p className="mt-2 text-3xl font-bold text-white">{stats.total}</p>
                        </div>
                        <Server className="h-12 w-12 text-indigo-200 opacity-80" />
                    </div>
                    <div className="mt-4">
                        <Link
                            to="/devices"
                            className="inline-flex items-center text-sm font-medium text-indigo-100 hover:text-white transition-colors"
                        >
                            {t('dashboard.viewAll', 'View all')}
                            <ChevronRight className="ml-1 h-4 w-4" />
                        </Link>
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-green-500 to-green-600 p-6 shadow-lg hover:shadow-xl transition-shadow">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-green-100">
                                {t('dashboard.onlineDevices', 'Online')}
                            </p>
                            <p className="mt-2 text-3xl font-bold text-white">{stats.online}</p>
                        </div>
                        <Wifi className="h-12 w-12 text-green-200 opacity-80" />
                    </div>
                    <div className="mt-4">
                        <div className="text-sm text-green-100">
                            {stats.total > 0 ? Math.round((stats.online / stats.total) * 100) : 0}% {t('dashboard.operational', 'operational')}
                        </div>
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-gray-500 to-gray-600 p-6 shadow-lg hover:shadow-xl transition-shadow">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-100">
                                {t('dashboard.offlineDevices', 'Offline')}
                            </p>
                            <p className="mt-2 text-3xl font-bold text-white">{stats.offline}</p>
                        </div>
                        <WifiOff className="h-12 w-12 text-gray-200 opacity-80" />
                    </div>
                    <div className="mt-4">
                        <div className="text-sm text-gray-100">
                            {stats.offline > 0 ? t('dashboard.needsAttention', 'Needs attention') : t('dashboard.allGood', 'All systems operational')}
                        </div>
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 p-6 shadow-lg hover:shadow-xl transition-shadow">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-orange-100">
                                {t('dashboard.activeAlerts', 'Active Alerts')}
                            </p>
                            <p className="mt-2 text-3xl font-bold text-white">{stats.activeAlerts}</p>
                        </div>
                        <AlertTriangle className="h-12 w-12 text-orange-200 opacity-80" />
                    </div>
                    <div className="mt-4">
                        <Link
                            to="/alerts"
                            className="inline-flex items-center text-sm font-medium text-orange-100 hover:text-white transition-colors"
                        >
                            {t('dashboard.reviewAlerts', 'Review alerts')}
                            <ChevronRight className="ml-1 h-4 w-4" />
                        </Link>
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Device Activity - 2 columns */}
                <div className="lg:col-span-2 rounded-xl bg-white p-6 shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                                <Activity className="h-5 w-5 text-indigo-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">
                                    {t('dashboard.devices', 'Devices')}
                                </h2>
                                <p className="text-sm text-gray-500">
                                    {t('dashboard.recentlyActive', 'Recently active devices')}
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/devices"
                            className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                        >
                            {t('dashboard.viewAll', 'View all')} →
                        </Link>
                    </div>

                    {devices.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                                <Monitor className="h-8 w-8 text-gray-400" />
                            </div>
                            <h3 className="text-sm font-medium text-gray-900 mb-1">
                                {t('dashboard.noDevices', 'No devices yet')}
                            </h3>
                            <p className="text-sm text-gray-500 mb-4">
                                {t('dashboard.noDevicesDesc', 'Add your first IoT device to get started')}
                            </p>
                            <Link
                                to="/devices/create"
                                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                            >
                                <Monitor className="h-4 w-4" />
                                {t('dashboard.addFirstDevice', 'Add Device')}
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {devices.slice(0, 6).map((device) => {
                                const status = resolveDeviceStatus(device);
                                const signalQuality = device.wifi_signal_strength;

                                return (
                                    <Link
                                        key={device.id}
                                        to={`/devices/${device.id}`}
                                        className="flex items-center justify-between p-4 rounded-lg hover:bg-gray-50 transition-all duration-200 group border border-transparent hover:border-indigo-200"
                                    >
                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${status === 'online' ? 'bg-green-100 text-green-600' :
                                                    status === 'alarm' ? 'bg-red-100 text-red-600' :
                                                        'bg-gray-100 text-gray-600'
                                                }`}>
                                                {getStatusIcon(status)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className="font-medium text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                                                        {device.name}
                                                    </p>
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status === 'online' ? 'bg-green-100 text-green-700' :
                                                            status === 'alarm' ? 'bg-red-100 text-red-700' :
                                                                'bg-gray-100 text-gray-700'
                                                        }`}>
                                                        {status}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-gray-500">
                                                    {device.location_name && (
                                                        <span className="flex items-center gap-1">
                                                            <MapPin className="h-3 w-3" />
                                                            {device.location_name}
                                                        </span>
                                                    )}
                                                    {device.last_heartbeat && (
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            {formatRelativeTime(device.last_heartbeat)}
                                                        </span>
                                                    )}
                                                    {signalQuality && (
                                                        <span className="flex items-center gap-1">
                                                            <Signal className="h-3 w-3" />
                                                            {signalQuality} dBm
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-indigo-600 transition-colors flex-shrink-0" />
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Quick Actions - 1 column */}
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                            <Zap className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">
                                {t('dashboard.quickActions', 'Quick Actions')}
                            </h2>
                            <p className="text-sm text-gray-500">
                                {t('dashboard.commonTasks', 'Common tasks')}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Link
                            to="/firmware-builder"
                            className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 transition-all group"
                        >
                            <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                                <Zap className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                                    {t('dashboard.buildFirmware', 'Build Firmware')}
                                </p>
                                <p className="text-xs text-gray-600 truncate">
                                    {t('dashboard.buildFirmwareDesc', 'Create custom firmware')}
                                </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 flex-shrink-0" />
                        </Link>

                        <Link
                            to="/devices"
                            className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-green-50 to-green-100 hover:from-green-100 hover:to-green-200 transition-all group"
                        >
                            <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
                                <Monitor className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 group-hover:text-green-700 transition-colors">
                                    {t('dashboard.manageDevices', 'Manage Devices')}
                                </p>
                                <p className="text-xs text-gray-600 truncate">
                                    {t('dashboard.manageDevicesDesc', 'View and configure')}
                                </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-green-600 flex-shrink-0" />
                        </Link>

                        <Link
                            to="/sensor-rules"
                            className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200 transition-all group"
                        >
                            <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center flex-shrink-0">
                                <Shield className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 group-hover:text-purple-700 transition-colors">
                                    {t('dashboard.alertRules', 'Alert Rules')}
                                </p>
                                <p className="text-xs text-gray-600 truncate">
                                    {t('dashboard.alertRulesDesc', 'Configure thresholds')}
                                </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-purple-600 flex-shrink-0" />
                        </Link>

                        <Link
                            to="/settings"
                            className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 transition-all group"
                        >
                            <div className="w-10 h-10 rounded-lg bg-gray-500 flex items-center justify-center flex-shrink-0">
                                <Settings className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 group-hover:text-gray-700 transition-colors">
                                    {t('dashboard.systemSettings', 'System Settings')}
                                </p>
                                <p className="text-xs text-gray-600 truncate">
                                    {t('dashboard.systemSettingsDesc', 'Configure platform')}
                                </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
                        </Link>
                    </div>
                </div>
            </div>

            {/* Active Alerts */}
            {stats.activeAlerts > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="h-5 w-5 text-red-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">
                                    {t('dashboard.activeAlerts', 'Active Alerts')}
                                </h2>
                                <p className="text-sm text-gray-500">
                                    {stats.activeAlerts} {t('dashboard.unresolvedAlerts', 'unresolved')}
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/alerts"
                            className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
                        >
                            <Eye className="h-4 w-4" />
                            {t('dashboard.viewAllAlerts', 'View All')}
                        </Link>
                    </div>

                    <div className="space-y-3">
                        {alerts.filter(a => a.status === 'active').slice(0, 5).map((alert) => (
                            <div
                                key={alert.id}
                                className={`flex items-start gap-4 p-4 rounded-lg border-l-4 bg-gradient-to-r transition-all hover:shadow-md ${alert.severity === 'critical'
                                        ? 'border-red-500 from-red-50 to-red-100/50'
                                        : alert.severity === 'high'
                                            ? 'border-orange-500 from-orange-50 to-orange-100/50'
                                            : 'border-yellow-500 from-yellow-50 to-yellow-100/50'
                                    }`}
                            >
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${alert.severity === 'critical' ? 'bg-red-100' :
                                        alert.severity === 'high' ? 'bg-orange-100' : 'bg-yellow-100'
                                    }`}>
                                    <AlertTriangle className={`h-5 w-5 ${alert.severity === 'critical' ? 'text-red-600' :
                                            alert.severity === 'high' ? 'text-orange-600' : 'text-yellow-600'
                                        }`} />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${alert.severity === 'critical' ? 'bg-red-100 text-red-700' :
                                                alert.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                                                    'bg-yellow-100 text-yellow-700'
                                            }`}>
                                            {formatSeverityLabel(alert.severity)}
                                        </span>
                                        {alert.alert_type && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                                <Cpu className="h-3 w-3" />
                                                {alert.alert_type}
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="font-medium text-gray-900 mb-1">
                                        {alert.device_name || 'Unknown Device'}
                                    </h3>
                                    <p className="text-sm text-gray-700 mb-2">
                                        {alert.message || t('dashboard.noMessage', 'No message provided')}
                                    </p>
                                    <div className="flex items-center gap-3 text-xs text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {formatRelativeTime(alert.created_at)}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 flex-shrink-0">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            resolveAlertMutation.mutate(alert.id);
                                        }}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-100 text-green-700 text-xs font-medium hover:bg-green-200 transition-colors"
                                        disabled={resolveAlertMutation.isLoading}
                                    >
                                        <Check className="h-3 w-3" />
                                        {t('dashboard.resolve', 'Resolve')}
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            acknowledgeAlertMutation.mutate(alert.id);
                                        }}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 transition-colors"
                                        disabled={acknowledgeAlertMutation.isLoading}
                                    >
                                        <Bell className="h-3 w-3" />
                                        {t('dashboard.ack', 'Ack')}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty state when no alerts */}
            {stats.activeAlerts === 0 && (
                <div className="rounded-xl bg-white p-12 shadow-sm border border-gray-200 text-center">
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                        <Check className="h-8 w-8 text-green-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {t('dashboard.noActiveAlerts', 'All Clear!')}
                    </h3>
                    <p className="text-sm text-gray-500 max-w-md mx-auto">
                        {t('dashboard.noActiveAlertsDesc', 'No active alerts at the moment. Your system is running smoothly.')}
                    </p>
                </div>
            )}
        </div>
    );
}

export default Dashboard;
