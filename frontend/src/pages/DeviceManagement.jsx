import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import {
    Plus,
    Trash2,
    Wifi,
    WifiOff,
    AlertTriangle,
    Settings,
    Filter,
    Search,
    Eye,
    MapPin,
    Activity,
    Clock,
    RefreshCw,
    X,
    ChevronDown,
    ChevronUp,
    Cpu,
    Zap,
    TrendingUp,
    Server,
    Calendar
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';

function DeviceManagementNew() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // State
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterLocation, setFilterLocation] = useState('all');
    const [showFilters, setShowFilters] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 12;

    // Fetch data
    const { data: devicesData = [], isLoading, refetch } = useQuery(
        ['devices'],
        () => apiService.getDevices(),
        {
            refetchInterval: 30000,
            select: (data) => data.devices || data || []
        }
    );

    const { data: locations = [] } = useQuery('locations', apiService.getLocations, {
        select: (data) => data.locations || data || []
    });

    // Filter and search logic
    const filteredDevices = useMemo(() => {
        let filtered = devicesData;

        // Search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(device =>
                device.name?.toLowerCase().includes(query) ||
                device.id?.toLowerCase().includes(query)
            );
        }

        // Status filter
        if (filterStatus !== 'all') {
            filtered = filtered.filter(device => device.status === filterStatus);
        }

        // Location filter
        if (filterLocation !== 'all') {
            filtered = filtered.filter(device => device.location_id?.toString() === filterLocation);
        }

        return filtered;
    }, [devicesData, searchQuery, filterStatus, filterLocation]);

    // Pagination
    const totalPages = Math.ceil(filteredDevices.length / itemsPerPage);
    const paginatedDevices = filteredDevices.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Delete mutation
    const deleteDeviceMutation = useMutation(
        apiService.deleteDevice,
        {
            onSuccess: () => {
                queryClient.invalidateQueries('devices');
                toast.success(t('devices.deleteSuccess', 'Device deleted successfully'));
            },
            onError: () => {
                toast.error(t('devices.deleteError', 'Failed to delete device'));
            }
        }
    );

    const handleDeleteDevice = (device) => {
        if (window.confirm(t('devices.deleteConfirm', 'Are you sure you want to delete this device?'))) {
            deleteDeviceMutation.mutate(device.id);
        }
    };

    // Utility functions
    const getStatusColor = (status) => {
        switch (status) {
            case 'online':
                return 'bg-gradient-to-br from-green-500 to-emerald-600 text-white';
            case 'offline':
                return 'bg-gradient-to-br from-gray-500 to-gray-600 text-white';
            case 'warning':
                return 'bg-gradient-to-br from-yellow-500 to-orange-600 text-white';
            case 'error':
                return 'bg-gradient-to-br from-red-500 to-red-600 text-white';
            default:
                return 'bg-gradient-to-br from-gray-400 to-gray-500 text-white';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'online':
                return <Wifi className="h-5 w-5" />;
            case 'offline':
                return <WifiOff className="h-5 w-5" />;
            case 'warning':
            case 'error':
                return <AlertTriangle className="h-5 w-5" />;
            default:
                return <Server className="h-5 w-5" />;
        }
    };

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

    const getSignalQuality = (rssi) => {
        if (!rssi) return { label: t('common.noData', 'No data'), color: 'text-gray-400' };
        if (rssi >= -55) return { label: t('common.excellent', 'Excellent'), color: 'text-green-600' };
        if (rssi >= -65) return { label: t('common.veryGood', 'Very good'), color: 'text-green-500' };
        if (rssi >= -75) return { label: t('common.good', 'Good'), color: 'text-yellow-600' };
        if (rssi >= -85) return { label: t('common.fair', 'Fair'), color: 'text-orange-600' };
        return { label: t('common.poor', 'Poor'), color: 'text-red-600' };
    };

    // Stats
    const stats = useMemo(() => {
        const total = devicesData.length;
        const online = devicesData.filter(d => d.status === 'online').length;
        const offline = devicesData.filter(d => d.status === 'offline').length;
        const warning = devicesData.filter(d => d.status === 'warning' || d.status === 'error').length;

        return { total, online, offline, warning };
    }, [devicesData]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-16 space-y-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
                <p className="text-gray-500">{t('common.loading', 'Loading devices...')}</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-6 space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{t('devices.title', 'Devices')}</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        {t('devices.subtitle', 'Manage and monitor all your IoT devices')}
                    </p>
                </div>
                <button
                    onClick={() => navigate('/devices/create')}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:from-indigo-700 hover:to-indigo-800 transition-all duration-200 hover:scale-105"
                >
                    <Plus className="h-5 w-5" />
                    {t('devices.addDevice', 'Add Device')}
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 shadow-lg">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-indigo-100">{t('devices.stats.total', 'Total Devices')}</p>
                            <p className="mt-2 text-3xl font-bold text-white">{stats.total}</p>
                        </div>
                        <Server className="h-12 w-12 text-indigo-200 opacity-80" />
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-green-500 to-green-600 p-6 shadow-lg">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-green-100">{t('devices.stats.online', 'Online')}</p>
                            <p className="mt-2 text-3xl font-bold text-white">{stats.online}</p>
                        </div>
                        <Wifi className="h-12 w-12 text-green-200 opacity-80" />
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-gray-500 to-gray-600 p-6 shadow-lg">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-100">{t('devices.stats.offline', 'Offline')}</p>
                            <p className="mt-2 text-3xl font-bold text-white">{stats.offline}</p>
                        </div>
                        <WifiOff className="h-12 w-12 text-gray-200 opacity-80" />
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 p-6 shadow-lg">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-orange-100">{t('devices.stats.alerts', 'Alerts')}</p>
                            <p className="mt-2 text-3xl font-bold text-white">{stats.warning}</p>
                        </div>
                        <AlertTriangle className="h-12 w-12 text-orange-200 opacity-80" />
                    </div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
                {/* Search Bar */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder={t('devices.search', 'Search devices...')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                                showFilters
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            <Filter className="h-4 w-4" />
                            {t('devices.filters', 'Filters')}
                            {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>

                        <button
                            onClick={() => refetch()}
                            className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
                        >
                            <RefreshCw className="h-4 w-4" />
                            {t('common.refresh', 'Refresh')}
                        </button>
                    </div>
                </div>

                {/* Collapsible Filters */}
                {showFilters && (
                    <div className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-200 pt-4 sm:grid-cols-2 lg:grid-cols-3 animate-fade-in">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('devices.filterStatus', 'Status')}
                            </label>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            >
                                <option value="all">{t('devices.allStatuses', 'All Statuses')}</option>
                                <option value="online">{t('devices.statusOnline', 'Online')}</option>
                                <option value="offline">{t('devices.statusOffline', 'Offline')}</option>
                                <option value="warning">{t('devices.statusWarning', 'Warning')}</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('devices.filterLocation', 'Location')}
                            </label>
                            <select
                                value={filterLocation}
                                onChange={(e) => setFilterLocation(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            >
                                <option value="all">{t('devices.allLocations', 'All Locations')}</option>
                                {locations.map((location) => (
                                    <option key={location.id} value={location.id}>
                                        {location.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-end">
                            <button
                                onClick={() => {
                                    setFilterStatus('all');
                                    setFilterLocation('all');
                                    setSearchQuery('');
                                }}
                                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                {t('devices.clearFilters', 'Clear Filters')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Results Count */}
                <div className="mt-4 text-sm text-gray-600">
                    {t('devices.showingResults', 'Showing {{count}} of {{total}} devices', {
                        count: filteredDevices.length,
                        total: devicesData.length
                    })}
                </div>
            </div>

            {/* Device Cards Grid */}
            {filteredDevices.length === 0 ? (
                <div className="rounded-xl bg-white p-12 text-center shadow-sm border border-gray-200">
                    <Server className="mx-auto h-16 w-16 text-gray-300" />
                    <h3 className="mt-4 text-lg font-semibold text-gray-700">
                        {t('devices.noDevices', 'No devices found')}
                    </h3>
                    <p className="mt-2 text-sm text-gray-500">
                        {searchQuery
                            ? t('devices.noSearchResults', 'Try adjusting your search or filters')
                            : t('devices.addFirstDevice', 'Get started by adding your first device')}
                    </p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                        {paginatedDevices.map((device) => {
                            const signal = getSignalQuality(device.wifi_signal_strength);

                            return (
                                <Link
                                    key={device.id}
                                    to={`/devices/${device.id}`}
                                    className="group relative overflow-hidden rounded-xl bg-white p-6 shadow-sm border border-gray-200 transition-all duration-200 hover:shadow-lg hover:scale-[1.02] animate-fade-in"
                                >
                                    {/* Status Badge */}
                                    <div className="absolute right-4 top-4">
                                        <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-lg ${getStatusColor(device.status)}`}>
                                            {getStatusIcon(device.status)}
                                            <span className="capitalize">{device.status}</span>
                                        </div>
                                    </div>

                                    {/* Device Name */}
                                    <div className="mb-4">
                                        <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors pr-20">
                                            {device.name}
                                        </h3>
                                        <p className="mt-1 text-xs font-mono text-gray-500">{device.id}</p>
                                    </div>

                                    {/* Metrics Grid */}
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Location */}
                                        <div className="flex items-center gap-2">
                                            <MapPin className="h-4 w-4 text-gray-400" />
                                            <div className="min-w-0">
                                                <p className="text-xs text-gray-500">{t('devices.location', 'Location')}</p>
                                                <p className="truncate text-sm font-medium text-gray-900">
                                                    {device.location_name || t('common.none', 'None')}
                                                </p>
                                            </div>
                                        </div>

                                        {/* WiFi Signal */}
                                        <div className="flex items-center gap-2">
                                            <Activity className="h-4 w-4 text-gray-400" />
                                            <div className="min-w-0">
                                                <p className="text-xs text-gray-500">{t('devices.signal', 'Signal')}</p>
                                                <p className={`truncate text-sm font-medium ${signal.color}`}>
                                                    {signal.label}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Last Heartbeat */}
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-4 w-4 text-gray-400" />
                                            <div className="min-w-0">
                                                <p className="text-xs text-gray-500">{t('devices.lastSeen', 'Last seen')}</p>
                                                <p className="truncate text-sm font-medium text-gray-900">
                                                    {formatRelativeTime(device.last_heartbeat)}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Firmware */}
                                        <div className="flex items-center gap-2">
                                            <Cpu className="h-4 w-4 text-gray-400" />
                                            <div className="min-w-0">
                                                <p className="text-xs text-gray-500">{t('devices.firmware', 'Firmware')}</p>
                                                <p className="truncate text-sm font-medium text-gray-900">
                                                    {device.firmware_version || t('common.unknown', 'Unknown')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Quick Actions */}
                                    <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4">
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                navigate(`/devices/${device.id}`);
                                            }}
                                            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                                        >
                                            <Eye className="h-4 w-4" />
                                            {t('devices.view', 'View')}
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                handleDeleteDevice(device);
                                            }}
                                            className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-8">
                            <button
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {t('common.previous', 'Previous')}
                            </button>

                            <span className="px-4 py-2 text-sm text-gray-600">
                                {t('common.pageOfTotal', 'Page {{current}} of {{total}}', {
                                    current: currentPage,
                                    total: totalPages
                                })}
                            </span>

                            <button
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {t('common.next', 'Next')}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default DeviceManagementNew;
