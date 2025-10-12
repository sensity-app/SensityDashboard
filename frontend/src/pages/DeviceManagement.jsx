import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import {
    Plus,
    Edit3,
    Edit2,
    Trash2,
    Wifi,
    WifiOff,
    AlertTriangle,
    Monitor,
    Settings,
    Filter,
    Search,
    Eye,
    MapPin,
    Activity,
    Clock,
    RefreshCw,
    X,
    Cpu,
    Upload,
    List,
    Grid,
    Tag,
    Folder,
    XCircle,
    CheckCircle,
    Info,
    Zap,
    BarChart3,
    Download
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';

import { apiService } from '../services/api';

function DeviceManagement() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingDevice, setEditingDevice] = useState(null);
    const [managingSensorsDevice, setManagingSensorsDevice] = useState(null);
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterType, setFilterType] = useState('all');
    const [filterLocation, setFilterLocation] = useState('all');
    const [filterGroup, setFilterGroup] = useState('all');
    const [filterTag, setFilterTag] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [viewMode, setViewMode] = useState('compact'); // 'compact' or 'detailed'
    const [otaDevice, setOtaDevice] = useState(null);

    // Query devices
    const { data: devicesData, isLoading: devicesLoading } = useQuery(
        ['devices'],
        () => apiService.getDevices(),
        {
            refetchInterval: 30000,
            select: (data) => data.devices || data || []
        }
    );

    // Query locations for dropdown
    const { data: locations = [] } = useQuery('locations', apiService.getLocations, {
        select: (data) => data.locations || data || []
    });

    // Query device groups for dropdown
    const { data: deviceGroups = [] } = useQuery('device-groups', apiService.getDeviceGroups, {
        select: (data) => data.groups || data || [],
        onError: (error) => {
            console.error('Error fetching device groups:', error);
        },
        retry: 1
    });

    // Query device tags for dropdown
    const { data: deviceTags = [] } = useQuery('device-tags', apiService.getDeviceTags, {
        select: (data) => data.tags || data || [],
        onError: (error) => {
            console.error('Error fetching device tags:', error);
        },
        retry: 1
    });

    // Delete device mutation
    const deleteDeviceMutation = useMutation(
        apiService.deleteDevice,
        {
            onSuccess: () => {
                queryClient.invalidateQueries('devices');
                toast.success(t('devices.deleteSuccess', 'Device deleted successfully'));
            },
            onError: (error) => {
                console.error('Delete device error:', error);
                toast.error(t('devices.deleteError', 'Failed to delete device'));
            }
        }
    );

    const handleDeleteDevice = (device) => {
        if (window.confirm(t('devices.deleteConfirm', 'Are you sure you want to delete this device? This action cannot be undone.'))) {
            deleteDeviceMutation.mutate(device.id);
        }
    };

    const handleEditDevice = (device) => {
        setEditingDevice(device);
        setShowCreateForm(true);
    };

    const handleManageSensors = (device) => {
        setManagingSensorsDevice(device);
    };

    const handleOTAUpdate = (device) => {
        setOtaDevice(device);
    };

    const handleExportDevices = async () => {
        try {
            toast.loading(t('deviceManagement.export.exporting', 'Exporting devices...'));

            // Build filters for export
            const filters = {};
            if (filterLocation !== 'all') filters.location_id = filterLocation;
            if (filterStatus !== 'all') filters.status = filterStatus;
            if (filterType !== 'all') filters.device_type = filterType;

            const blob = await apiService.exportDevices(filters);

            // Create download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `devices_export_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast.dismiss();
            toast.success(t('deviceManagement.export.success', 'Devices exported successfully'));
        } catch (error) {
            toast.dismiss();
            console.error('Export error:', error);
            toast.error(t('deviceManagement.export.error', 'Failed to export devices'));
        }
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

    const formatStatusLabel = (status) => {
        if (!status) return t('deviceDetail.status.unknown');
        const normalized = (status || '').toLowerCase();
        const key = `deviceDetail.status.${normalized}`;
        return t(key, { defaultValue: status });
    };


    const deviceTypes = ['esp8266', 'esp32', 'arduino', 'raspberry_pi'];

    const formatDeviceType = (type) => {
        if (!type) {
            return t('deviceManagement.labels.unknownType');
        }
        return t(`deviceManagement.filters.typeOption.${type}`, type.toUpperCase());
    };
    const statusOptions = ['all', 'online', 'offline', 'alarm'];

    const allDevices = useMemo(() => devicesData || [], [devicesData]);

    const onlineCount = useMemo(
        () => allDevices.filter(d => (d.current_status || d.status) === 'online').length,
        [allDevices]
    );
    const offlineCount = useMemo(
        () => allDevices.filter(d => (d.current_status || d.status) === 'offline').length,
        [allDevices]
    );
    const alarmCount = useMemo(
        () => allDevices.filter(d => (d.current_status || d.status) === 'alarm').length,
        [allDevices]
    );

    const quickStatusFilters = useMemo(() => [
        {
            key: 'all',
            label: t('deviceManagement.quickFilters.all'),
            count: allDevices.length,
            icon: Monitor
        },
        {
            key: 'online',
            label: t('deviceManagement.quickFilters.online'),
            count: onlineCount,
            icon: Wifi
        },
        {
            key: 'offline',
            label: t('deviceManagement.quickFilters.offline'),
            count: offlineCount,
            icon: WifiOff
        },
        {
            key: 'alarm',
            label: t('deviceManagement.quickFilters.alarm'),
            count: alarmCount,
            icon: AlertTriangle
        }
    ], [allDevices.length, onlineCount, offlineCount, alarmCount, t]);

    // Apply filters and search - Memoized to prevent unnecessary re-renders
    const filteredDevices = useMemo(() => {
        return allDevices.filter(device => {
            // Status filter
            if (filterStatus !== 'all' && (device.current_status || device.status) !== filterStatus) {
                return false;
            }

            // Type filter
            if (filterType !== 'all' && device.device_type !== filterType) {
                return false;
            }

            // Location filter
            if (filterLocation !== 'all' && device.location_id !== parseInt(filterLocation)) {
                return false;
            }

            // Group filter
            if (filterGroup !== 'all') {
                const hasGroup = device.groups?.some(g => g.id === parseInt(filterGroup));
                if (!hasGroup) return false;
            }

            // Tag filter
            if (filterTag !== 'all') {
                const hasTag = device.tags?.some(t => t.id === parseInt(filterTag));
                if (!hasTag) return false;
            }

            // Search query
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase();
                const matchesName = device.name?.toLowerCase().includes(query);
                const matchesId = device.id?.toLowerCase().includes(query);
                const matchesType = device.device_type?.toLowerCase().includes(query);
                const matchesLocation = device.location_name?.toLowerCase().includes(query);
                const matchesIp = device.ip_address?.toLowerCase().includes(query);
                const matchesGroups = device.groups?.some(g => g.name.toLowerCase().includes(query));
                const matchesTags = device.tags?.some(t => t.name.toLowerCase().includes(query));

                if (!matchesName && !matchesId && !matchesType && !matchesLocation && !matchesIp && !matchesGroups && !matchesTags) {
                    return false;
                }
            }

            return true;
        });
    }, [allDevices, filterStatus, filterType, filterLocation, filterGroup, filterTag, searchQuery]);

    // Pagination
    const totalPages = Math.ceil(filteredDevices.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const devices = filteredDevices.slice(startIndex, endIndex);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [filterStatus, filterType, filterLocation, filterGroup, filterTag, searchQuery]);

    if (devicesLoading) {
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="card p-6">
                    <div className="animate-pulse space-y-4">
                        <div className="h-5 w-48 rounded bg-gray-200" />
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {[...Array(4)].map((_, index) => (
                                <div key={index} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-2xl bg-gray-200" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-3 w-20 rounded bg-gray-200" />
                                            <div className="h-5 w-16 rounded bg-gray-200" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="card p-6">
                    <div className="animate-pulse space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="h-6 w-40 rounded bg-gray-200" />
                            <div className="h-9 w-56 rounded-full bg-gray-200" />
                        </div>
                        <div className="space-y-3">
                            {[...Array(5)].map((_, index) => (
                                <div key={index} className="h-12 rounded-lg bg-gray-100" />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Modern Header */}
            <div className="card animate-slide-up">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                            <Monitor className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">{t('deviceManagement.header.title')}</h1>
                            <p className="text-gray-600 mt-1">{t('deviceManagement.header.subtitle')}</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={handleExportDevices}
                            className="btn-secondary flex items-center space-x-2"
                            title={t('deviceManagement.actions.export', 'Export to CSV')}
                        >
                            <Download className="h-4 w-4" />
                            <span>{t('deviceManagement.actions.export', 'Export')}</span>
                        </button>
                        <button
                            onClick={() => {
                                queryClient.invalidateQueries('devices');
                                queryClient.invalidateQueries('locations');
                                queryClient.invalidateQueries('device-groups');
                                queryClient.invalidateQueries('device-tags');
                            }}
                            className="btn-secondary flex items-center space-x-2"
                        >
                            <RefreshCw className="h-4 w-4" />
                            <span>{t('deviceManagement.actions.refresh')}</span>
                        </button>
                        <button
                            onClick={() => navigate('/firmware-builder')}
                            className="btn-primary flex items-center space-x-2"
                        >
                            <Cpu className="h-4 w-4" />
                            <span>{t('deviceManagement.actions.build')}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Quick status filters */}
            <div className="card animate-slide-up" style={{animationDelay: '60ms'}}>
                <div className="flex flex-wrap gap-3">
                    {quickStatusFilters.map((filter) => {
                        const Icon = filter.icon;
                        const isActive = filterStatus === filter.key;
                        return (
                            <button
                                key={filter.key}
                                onClick={() => {
                                    setFilterStatus(filter.key);
                                    setCurrentPage(1);
                                }}
                                className={`inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                                    isActive
                                        ? 'border-indigo-600 bg-indigo-600 text-white shadow'
                                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                                }`}
                            >
                                <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-indigo-500'}`} />
                                <span>{filter.label}</span>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                    isActive ? 'bg-white text-indigo-700' : 'bg-white text-gray-700'
                                }`}>
                                    {filter.count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Modern Filters */}
            <div className="card animate-slide-up" style={{animationDelay: '100ms'}}>
                <div className="card-header">
                    <h3 className="card-title">
                        <Filter className="w-5 h-5 text-primary" />
                        <span>{t('deviceManagement.filters.title')}</span>
                    </h3>
                    <div className="text-sm text-gray-500">
                        {t('deviceManagement.badge.deviceCount', { count: filteredDevices.length, total: allDevices.length })}
                    </div>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                        <div className="form-group md:col-span-2 xl:col-span-2">
                            <label className="form-label">
                                <Search className="w-4 h-4 inline mr-1" />
                                {t('deviceManagement.filters.searchLabel')}
                            </label>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('deviceManagement.filters.searchPlaceholder')}
                                className="input-field"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">
                                <Activity className="w-4 h-4 inline mr-1" />
                                {t('common.status')}
                            </label>
                            <select
                                value={filterStatus}
                                onChange={(e) => {
                                    setFilterStatus(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="input-field"
                            >
                                {statusOptions.map(status => (
                                    <option key={status} value={status}>
                                        {status === 'all' ? t('common.all') : formatStatusLabel(status)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">
                                <Monitor className="w-4 h-4 inline mr-1" />
                                {t('devices.deviceType')}
                            </label>
                            <select
                                value={filterType}
                                onChange={(e) => {
                                    setFilterType(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="input-field"
                            >
                                <option value="all">{t('common.all')}</option>
                                {deviceTypes.map(type => (
                                    <option key={type} value={type}>
                                        {formatDeviceType(type)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">
                                <MapPin className="w-4 h-4 inline mr-1" />
                                {t('devices.location')}
                            </label>
                            <select
                                value={filterLocation}
                                onChange={(e) => {
                                    setFilterLocation(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="input-field"
                            >
                                <option value="all">{t('common.all')}</option>
                                {locations.map(location => (
                                    <option key={location.id} value={location.id}>
                                        {location.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">
                                <Folder className="w-4 h-4 inline mr-1" />
                                {t('deviceManagement.filters.groupLabel')}
                            </label>
                            <select
                                value={filterGroup}
                                onChange={(e) => {
                                    setFilterGroup(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="input-field"
                            >
                                <option value="all">{t('common.all')}</option>
                                {(deviceGroups || []).map(group => (
                                    <option key={group.id} value={group.id}>
                                        {group.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">
                                <Tag className="w-4 h-4 inline mr-1" />
                                {t('deviceManagement.filters.tagLabel')}
                            </label>
                            <select
                                value={filterTag}
                                onChange={(e) => {
                                    setFilterTag(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="input-field"
                            >
                                <option value="all">{t('common.all')}</option>
                                {(deviceTags || []).map(tag => (
                                    <option key={tag.id} value={tag.id}>
                                        {tag.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {(filterStatus !== 'all' || filterType !== 'all' || filterLocation !== 'all' || filterGroup !== 'all' || filterTag !== 'all' || searchQuery.trim()) && (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <span className="text-sm text-gray-500">{t('deviceManagement.activeFilters.title')}</span>
                            {searchQuery.trim() && (
                                <span className="badge badge-primary flex items-center space-x-1">
                                    <span>{t('deviceManagement.activeFilters.search', { query: searchQuery.trim() })}</span>
                                    <button onClick={() => setSearchQuery('')}>
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            )}
                            {filterStatus !== 'all' && (
                                <span className="badge badge-primary flex items-center space-x-1">
                                    <span>{t('deviceManagement.activeFilters.status', { label: formatStatusLabel(filterStatus) })}</span>
                                    <button onClick={() => setFilterStatus('all')}>
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            )}
                            {filterType !== 'all' && (
                                <span className="badge badge-primary flex items-center space-x-1">
                                    <span>{t('deviceManagement.activeFilters.type', {
                                        label: formatDeviceType(filterType)
                                    })}</span>
                                    <button onClick={() => setFilterType('all')}>
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            )}
                            {filterLocation !== 'all' && (
                                <span className="badge badge-primary flex items-center space-x-1">
                                    <span>{t('deviceManagement.activeFilters.location', {
                                        label: locations.find(l => l.id === parseInt(filterLocation))?.name || t('deviceManagement.labels.noLocation')
                                    })}</span>
                                    <button onClick={() => setFilterLocation('all')}>
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            )}
                            {filterGroup !== 'all' && deviceGroups && (
                                <span className="badge flex items-center space-x-1" style={{backgroundColor: (deviceGroups || []).find(g => g.id === parseInt(filterGroup))?.color || '#3B82F6', color: 'white'}}>
                                    <Folder className="w-3 h-3" />
                                    <span>{t('deviceManagement.activeFilters.group', {
                                        label: (deviceGroups || []).find(g => g.id === parseInt(filterGroup))?.name || t('deviceManagement.labels.unknownType')
                                    })}</span>
                                    <button onClick={() => setFilterGroup('all')}>
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            )}
                            {filterTag !== 'all' && deviceTags && (
                                <span className="badge flex items-center space-x-1" style={{backgroundColor: (deviceTags || []).find(t => t.id === parseInt(filterTag))?.color || '#6B7280', color: 'white'}}>
                                    <Tag className="w-3 h-3" />
                                    <span>{t('deviceManagement.activeFilters.tag', {
                                        label: (deviceTags || []).find(t => t.id === parseInt(filterTag))?.name || t('deviceManagement.labels.unknownType')
                                    })}</span>
                                    <button onClick={() => setFilterTag('all')}>
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            )}
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setFilterStatus('all');
                                    setFilterType('all');
                                    setFilterLocation('all');
                                    setFilterGroup('all');
                                    setFilterTag('all');
                                }}
                                className="text-sm text-blue-600 hover:text-blue-800 ml-2"
                            >
                                {t('deviceManagement.activeFilters.clear')}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Modern Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="card p-6 hover:shadow-xl transition-all duration-300 animate-slide-up" style={{animationDelay: '200ms'}}>
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                            <Monitor className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-gray-600 mb-1">{t('dashboard.totalDevices')}</p>
                            <p className="text-3xl font-bold text-gray-900">{allDevices.length}</p>
                        </div>
                    </div>
                </div>
                <div className="card p-6 hover:shadow-xl transition-all duration-300 animate-slide-up" style={{animationDelay: '300ms'}}>
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                            <Wifi className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-gray-600 mb-1">{t('dashboard.onlineDevices')}</p>
                            <p className="text-3xl font-bold text-green-600">
                                {allDevices.filter(d => d.current_status === 'online' || d.status === 'online').length}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="card p-6 hover:shadow-xl transition-all duration-300 animate-slide-up" style={{animationDelay: '400ms'}}>
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center">
                            <WifiOff className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-gray-600 mb-1">{t('dashboard.offlineDevices')}</p>
                            <p className="text-3xl font-bold text-gray-600">
                                {allDevices.filter(d => d.current_status === 'offline' || d.status === 'offline').length}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="card p-6 hover:shadow-xl transition-all duration-300 animate-slide-up" style={{animationDelay: '500ms'}}>
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
                            <AlertTriangle className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-gray-600 mb-1">{t('devices.alarmsActive', 'Active Alarms')}</p>
                            <p className="text-3xl font-bold text-red-600">
                                {allDevices.filter(d => d.current_status === 'alarm' || d.status === 'alarm').length}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modern Devices Table */}
            <div className="card animate-slide-up" style={{animationDelay: '600ms'}}>
                <div className="card-header">
                    <h2 className="card-title">
                        <Monitor className="w-6 h-6 text-primary" />
                        <span>{t('devices.deviceList')}</span>
                    </h2>
                    <div className="flex items-center space-x-3">
                        <div className="hidden md:flex items-center bg-gray-100 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode('compact')}
                                className={`px-3 py-1 text-sm rounded ${
                                    viewMode === 'compact'
                                        ? 'bg-white shadow text-gray-900'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                {t('deviceManagement.view.compact')}
                            </button>
                            <button
                                onClick={() => setViewMode('detailed')}
                                className={`px-3 py-1 text-sm rounded ${
                                    viewMode === 'detailed'
                                        ? 'bg-white shadow text-gray-900'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                {t('deviceManagement.view.detailed')}
                            </button>
                        </div>
                        <span className="badge badge-primary">
                            {t('deviceManagement.badge.filtered', { count: filteredDevices.length })}
                        </span>
                    </div>
                </div>
                {devices.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-6">
                            <Monitor className="h-12 w-12 text-gray-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            {t('devices.noDevices', 'No devices found')}
                        </h3>
                        <p className="text-gray-500 mb-6">
                            {t('devices.addFirstDevice', 'Add your first IoT device to get started.')}
                        </p>
                        <button
                            onClick={() => navigate('/firmware-builder')}
                            className="btn-primary"
                        >
                            <Cpu className="w-4 h-4 mr-2" />
                            Build & Add First Device
                        </button>
                    </div>
                ) : (
                    <div className="p-6">
                        {/* Card view for mobile/tablet */}
                        <div className="block lg:hidden space-y-4">
                            {(devices || []).map((device, index) => (
                                <div key={device.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all animate-scale-in" style={{animationDelay: `${index * 50}ms`}}>
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center space-x-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                                device.current_status === 'online' ? 'bg-green-100' :
                                                device.current_status === 'alarm' ? 'bg-red-100' : 'bg-gray-100'
                                            }`}>
                                                {getStatusIcon(device.current_status || device.status)}
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-gray-900">{device.name}</h3>
                                                <p className="text-xs text-gray-500 font-mono">ID: {device.id}</p>
                                            </div>
                                        </div>
                                        <span className={`badge text-xs ${
                                            (device.current_status || device.status) === 'online' ? 'badge-success' :
                                            (device.current_status || device.status) === 'alarm' ? 'badge-error' : 'badge-warning'
                                        }`}>
                                            {formatStatusLabel(device.current_status || device.status || 'offline')}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                                        <div>
                                            <p className="text-gray-500 text-xs mb-1">{t('devices.deviceType')}</p>
                                            <span className="badge badge-primary text-xs">{formatDeviceType(device.device_type)}</span>
                                        </div>
                                        <div>
                                            <p className="text-gray-500 text-xs mb-1">{t('devices.firmwareVersion')}</p>
                                            <p className="font-mono text-xs text-gray-900">{device.firmware_version || t('common.unknown')}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500 text-xs mb-1">{t('devices.location')}</p>
                                            <div className="flex items-center space-x-1">
                                                <MapPin className="w-3 h-3 text-gray-400" />
                                                <span className="text-xs text-gray-900">{device.location_name || t('common.unknown')}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-gray-500 text-xs mb-1">{t('devices.ipAddress')}</p>
                                            <p className="font-mono text-xs text-gray-600">{device.ip_address || '-'}</p>
                                        </div>
                                        <div className="col-span-2">
                                            <p className="text-gray-500 text-xs mb-1">{t('devices.lastHeartbeat')}</p>
                                            <div className="flex items-center space-x-1">
                                                <Clock className="w-3 h-3 text-gray-400" />
                                                <span className="text-xs text-gray-600">
                                                    {device.last_heartbeat ?
                                                        new Date(device.last_heartbeat).toLocaleString() :
                                                        t('devices.never', 'Never')
                                                    }
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Groups and Tags */}
                                    {(device.groups?.length > 0 || device.tags?.length > 0) && (
                                        <div className="mb-3 space-y-2">
                                            {device.groups?.length > 0 && (
                                                <div>
                                                    <p className="text-gray-500 text-xs mb-1.5 flex items-center">
                                                        <Folder className="w-3 h-3 mr-1" />
                                                        Groups
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {device.groups.map(group => (
                                                            <button
                                                                key={group.id}
                                                                onClick={() => setFilterGroup(group.id.toString())}
                                                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium hover:opacity-80 transition-opacity"
                                                                style={{backgroundColor: group.color, color: 'white'}}
                                                                title={`Filter by group: ${group.name}`}
                                                            >
                                                                {group.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {device.tags?.length > 0 && (
                                                <div>
                                                    <p className="text-gray-500 text-xs mb-1.5 flex items-center">
                                                        <Tag className="w-3 h-3 mr-1" />
                                                        Tags
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {device.tags.map(tag => (
                                                            <button
                                                                key={tag.id}
                                                                onClick={() => setFilterTag(tag.id.toString())}
                                                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium hover:opacity-80 transition-opacity"
                                                                style={{backgroundColor: tag.color, color: 'white'}}
                                                                title={`Filter by tag: ${tag.name}`}
                                                            >
                                                                {tag.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex justify-end items-center space-x-2 pt-3 border-t border-gray-100">
                                        <button
                                            onClick={() => handleOTAUpdate(device)}
                                            className="btn-ghost px-3 py-1.5 text-sm text-orange-600 hover:bg-orange-50"
                                        >
                                            <Upload className="h-4 w-4 mr-1 inline" />
                                            OTA
                                        </button>
                                        <Link
                                            to={`/devices/${device.id}`}
                                            className="btn-ghost px-3 py-1.5 text-sm hover:bg-blue-50"
                                        >
                                            <Eye className="h-4 w-4 mr-1 inline" />
                                            {t('devices.viewDetails', 'View')}
                                        </Link>
                                        <button
                                            onClick={() => handleManageSensors(device)}
                                            className="btn-ghost px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50"
                                        >
                                            <Cpu className="h-4 w-4 mr-1 inline" />
                                            Sensors
                                        </button>
                                        <button
                                            onClick={() => handleEditDevice(device)}
                                            className="btn-ghost px-3 py-1.5 text-sm text-primary hover:bg-blue-50"
                                        >
                                            <Edit3 className="h-4 w-4 inline" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteDevice(device)}
                                            className="btn-ghost px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                                        >
                                            <Trash2 className="h-4 w-4 inline" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Compact Table view for desktop */}
                        {viewMode === 'compact' && (
                            <div className="hidden lg:block">
                                <table className="w-full table-modern">
                                    <thead>
                                        <tr>
                                            <th className="text-left w-1/5">{t('devices.deviceName')}</th>
                                            <th className="text-left w-20">{t('common.status')}</th>
                                            <th className="text-left w-24">{t('devices.deviceType')}</th>
                                            <th className="text-left w-28">{t('devices.firmwareVersion')}</th>
                                            <th className="text-left w-1/4">Groups & Tags</th>
                                            <th className="text-right">{t('common.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(devices || []).map((device, index) => (
                                            <tr key={device.id} className="animate-scale-in" style={{animationDelay: `${index * 50}ms`}}>
                                                <td>
                                                    <div className="flex items-center space-x-2">
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                                            device.current_status === 'online' ? 'bg-green-100' :
                                                            device.current_status === 'alarm' ? 'bg-red-100' : 'bg-gray-100'
                                                        }`}>
                                                            {getStatusIcon(device.current_status || device.status)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="font-medium text-gray-900 truncate text-sm">{device.name}</div>
                                                            <div className="text-xs text-gray-500 truncate">{device.location_name || 'No location'}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`badge text-xs ${
                                                        (device.current_status || device.status) === 'online' ? 'badge-success' :
                                                        (device.current_status || device.status) === 'alarm' ? 'badge-error' : 'badge-warning'
                                                    }`}>
                                                        {formatStatusLabel(device.current_status || device.status || 'offline')}
                                                    </span>
                                                </td>
                                                <td>
                                            <span className="badge badge-primary text-xs">
                                                {formatDeviceType(device.device_type)}
                                            </span>
                                                </td>
                                                <td>
                                                    <span className="font-mono text-xs text-gray-900">
                                                        {device.firmware_version || 'N/A'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="flex flex-wrap gap-1">
                                                        {device.groups?.slice(0, 2).map(group => (
                                                            <button
                                                                key={group.id}
                                                                onClick={() => setFilterGroup(group.id.toString())}
                                                                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium hover:opacity-80 transition-opacity"
                                                                style={{backgroundColor: group.color, color: 'white'}}
                                                                title={`Filter by group: ${group.name}`}
                                                            >
                                                                <Folder className="w-2.5 h-2.5 mr-0.5" />
                                                                {group.name}
                                                            </button>
                                                        ))}
                                                        {device.tags?.slice(0, 2).map(tag => (
                                                            <button
                                                                key={tag.id}
                                                                onClick={() => setFilterTag(tag.id.toString())}
                                                                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium hover:opacity-80 transition-opacity"
                                                                style={{backgroundColor: tag.color, color: 'white'}}
                                                                title={`Filter by tag: ${tag.name}`}
                                                            >
                                                                <Tag className="w-2.5 h-2.5 mr-0.5" />
                                                                {tag.name}
                                                            </button>
                                                        ))}
                                                        {((device.groups?.length || 0) + (device.tags?.length || 0)) > 4 && (
                                                            <Link
                                                                to={`/devices/${device.id}`}
                                                                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
                                                                title={t('devices.viewDetails')}
                                                            >
                                                                +{((device.groups?.length || 0) + (device.tags?.length || 0)) - 4}
                                                            </Link>
                                                        )}
                                                        {!device.groups?.length && !device.tags?.length && (
                                                            <span className="text-xs text-gray-400">-</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="flex justify-end items-center space-x-1">
                                                        <button
                                                            onClick={() => handleOTAUpdate(device)}
                                                            className="btn-ghost p-1.5 text-orange-600 hover:bg-orange-50"
                                                            title="OTA Update"
                                                        >
                                                            <Upload className="h-4 w-4" />
                                                        </button>
                                                        <Link
                                                            to={`/devices/${device.id}`}
                                                            className="btn-ghost p-1.5 hover:bg-blue-50"
                                                            title={t('devices.viewDetails')}
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </Link>
                                                        <button
                                                            onClick={() => handleManageSensors(device)}
                                                            className="btn-ghost p-1.5 text-purple-600 hover:bg-purple-50"
                                                            title={t('devices.manageSensors', 'Manage Sensors')}
                                                        >
                                                            <Cpu className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleEditDevice(device)}
                                                            className="btn-ghost p-1.5 text-primary hover:bg-blue-50"
                                                            title={t('common.edit')}
                                                        >
                                                            <Edit3 className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteDevice(device)}
                                                            className="btn-ghost p-1.5 text-red-600 hover:bg-red-50"
                                                            title={t('common.delete')}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Detailed Table view for desktop */}
                        {viewMode === 'detailed' && (
                            <div className="hidden lg:block overflow-x-auto">
                                <table className="w-full table-modern">
                                    <thead>
                                        <tr>
                                            <th className="text-left">{t('devices.deviceName')}</th>
                                            <th className="text-left">{t('common.status')}</th>
                                            <th className="text-left">{t('devices.deviceType')}</th>
                                            <th className="text-left">{t('devices.location')}</th>
                                            <th className="text-left">Groups & Tags</th>
                                            <th className="text-left">{t('devices.ipAddress')}</th>
                                            <th className="text-left">{t('devices.lastHeartbeat')}</th>
                                            <th className="text-left">{t('devices.firmwareVersion')}</th>
                                            <th className="text-right">{t('common.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(devices || []).map((device, index) => (
                                            <tr key={device.id} className="animate-scale-in" style={{animationDelay: `${index * 50}ms`}}>
                                                <td className="min-w-[200px]">
                                                    <div className="flex items-center space-x-3">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                                            device.current_status === 'online' ? 'bg-green-100' :
                                                            device.current_status === 'alarm' ? 'bg-red-100' : 'bg-gray-100'
                                                        }`}>
                                                            {getStatusIcon(device.current_status || device.status)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="font-medium text-gray-900 truncate">{device.name}</div>
                                                            <div className="text-xs text-gray-500 font-mono truncate">ID: {device.id}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap">
                                                    <span className={`badge text-xs ${
                                                        (device.current_status || device.status) === 'online' ? 'badge-success' :
                                                        (device.current_status || device.status) === 'alarm' ? 'badge-error' : 'badge-warning'
                                                    }`}>
                                                        {formatStatusLabel(device.current_status || device.status || 'offline')}
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap">
                                                    <span className="badge badge-primary text-xs">
                                                        {formatDeviceType(device.device_type)}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="flex items-center space-x-1 text-sm text-gray-900">
                                                        <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                                        <span className="truncate">{device.location_name || t('common.unknown')}</span>
                                                    </div>
                                                </td>
                                                <td className="min-w-[150px]">
                                                    <div className="flex flex-wrap gap-1">
                                                        {device.groups?.map(group => (
                                                            <button
                                                                key={group.id}
                                                                onClick={() => setFilterGroup(group.id.toString())}
                                                                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium hover:opacity-80 transition-opacity"
                                                                style={{backgroundColor: group.color, color: 'white'}}
                                                                title={`Filter by group: ${group.name}`}
                                                            >
                                                                <Folder className="w-2.5 h-2.5 mr-0.5" />
                                                                {group.name}
                                                            </button>
                                                        ))}
                                                        {device.tags?.map(tag => (
                                                            <button
                                                                key={tag.id}
                                                                onClick={() => setFilterTag(tag.id.toString())}
                                                                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium hover:opacity-80 transition-opacity"
                                                                style={{backgroundColor: tag.color, color: 'white'}}
                                                                title={`Filter by tag: ${tag.name}`}
                                                            >
                                                                <Tag className="w-2.5 h-2.5 mr-0.5" />
                                                                {tag.name}
                                                            </button>
                                                        ))}
                                                        {!device.groups?.length && !device.tags?.length && (
                                                            <span className="text-xs text-gray-400">-</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="font-mono text-xs text-gray-600">
                                                        {device.ip_address || '-'}
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap">
                                                    <div className="flex items-center space-x-1 text-sm text-gray-500">
                                                        <Clock className="w-3 h-3 flex-shrink-0" />
                                                        <span>
                                                            {device.last_heartbeat ?
                                                                new Date(device.last_heartbeat).toLocaleDateString() :
                                                                t('devices.never', 'Never')
                                                            }
                                                        </span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="font-mono text-xs text-gray-900">
                                                        {device.firmware_version || t('common.unknown')}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="flex justify-end items-center space-x-1">
                                                        <button
                                                            onClick={() => handleOTAUpdate(device)}
                                                            className="btn-ghost p-1.5 text-orange-600 hover:bg-orange-50"
                                                            title="OTA Update"
                                                        >
                                                            <Upload className="h-4 w-4" />
                                                        </button>
                                                        <Link
                                                            to={`/devices/${device.id}`}
                                                            className="btn-ghost p-1.5 hover:bg-blue-50"
                                                            title={t('devices.viewDetails')}
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </Link>
                                                        <button
                                                            onClick={() => handleManageSensors(device)}
                                                            className="btn-ghost p-1.5 text-purple-600 hover:bg-purple-50"
                                                            title={t('devices.manageSensors', 'Manage Sensors')}
                                                        >
                                                            <Cpu className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleEditDevice(device)}
                                                            className="btn-ghost p-1.5 text-primary hover:bg-blue-50"
                                                            title={t('common.edit')}
                                                        >
                                                            <Edit3 className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteDevice(device)}
                                                            className="btn-ghost p-1.5 text-red-600 hover:bg-red-50"
                                                            title={t('common.delete')}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Pagination Controls */}
                        {filteredDevices.length > 0 && (
                            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-200 pt-4">
                                <div className="flex items-center space-x-2">
                                    <label className="text-sm text-gray-600">{t('deviceManagement.pagination.perPage')}</label>
                                    <select
                                        value={itemsPerPage}
                                        onChange={(e) => {
                                            setItemsPerPage(parseInt(e.target.value));
                                            setCurrentPage(1);
                                        }}
                                        className="input-field py-1 px-2 text-sm"
                                    >
                                        <option value="5">5</option>
                                        <option value="10">10</option>
                                        <option value="25">25</option>
                                        <option value="50">50</option>
                                        <option value="100">100</option>
                                    </select>
                                    <span className="text-sm text-gray-600">
                                        {t('deviceManagement.pagination.range', {
                                            start: startIndex + 1,
                                            end: Math.min(endIndex, filteredDevices.length),
                                            total: filteredDevices.length
                                        })}
                                    </span>
                                </div>

                                {totalPages > 1 && (
                                    <div className="flex items-center space-x-1">
                                        <button
                                            onClick={() => setCurrentPage(1)}
                                            disabled={currentPage === 1}
                                            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {t('deviceManagement.pagination.first')}
                                        </button>
                                        <button
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {t('deviceManagement.pagination.previous')}
                                        </button>

                                        {/* Page numbers */}
                                        <div className="hidden sm:flex items-center space-x-1">
                                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                                let pageNum;
                                                if (totalPages <= 5) {
                                                    pageNum = i + 1;
                                                } else if (currentPage <= 3) {
                                                    pageNum = i + 1;
                                                } else if (currentPage >= totalPages - 2) {
                                                    pageNum = totalPages - 4 + i;
                                                } else {
                                                    pageNum = currentPage - 2 + i;
                                                }
                                                return (
                                                    <button
                                                        key={pageNum}
                                                        onClick={() => setCurrentPage(pageNum)}
                                                        className={`px-3 py-1 text-sm border rounded ${
                                                            currentPage === pageNum
                                                                ? 'bg-blue-600 text-white border-blue-600'
                                                                : 'border-gray-300 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {pageNum}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <span className="sm:hidden text-sm text-gray-600">
                                            {t('deviceManagement.pagination.page', { current: currentPage, total: totalPages })}
                                        </span>

                                        <button
                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                            disabled={currentPage === totalPages}
                                            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {t('deviceManagement.pagination.next')}
                                        </button>
                                        <button
                                            onClick={() => setCurrentPage(totalPages)}
                                            disabled={currentPage === totalPages}
                                            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {t('deviceManagement.pagination.last')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Create/Edit Form Modal */}
            {showCreateForm && (
                <DeviceFormModal
                    device={editingDevice}
                    locations={locations}
                    onClose={() => {
                        setShowCreateForm(false);
                        setEditingDevice(null);
                    }}
                />
            )}

            {/* Sensor Management Modal */}
            {managingSensorsDevice && (
                <SensorManagementModal
                    device={managingSensorsDevice}
                    onClose={() => setManagingSensorsDevice(null)}
                />
            )}

            {/* OTA Update Modal */}
            {otaDevice && (
                <OTAUpdateModal
                    device={otaDevice}
                    onClose={() => setOtaDevice(null)}
                />
            )}
        </div>
    );
}

function DeviceFormModal({ device, locations, onClose }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState({
        name: device?.name || '',
        device_type: device?.device_type || 'esp8266',
        location_id: device?.location_id || '',
        description: device?.description || '',
        api_key: device?.api_key || generateApiKey(),
        config: device?.config || {}
    });

    const isEditing = !!device;

    // Create device mutation
    const createDeviceMutation = useMutation(
        apiService.createDevice,
        {
            onSuccess: () => {
                queryClient.invalidateQueries('devices');
                toast.success(t('devices.createSuccess', 'Device created successfully'));
                onClose();
            },
            onError: (error) => {
                console.error('Create device error:', error);
                toast.error(t('devices.createError', 'Failed to create device'));
            }
        }
    );

    // Update device mutation
    const updateDeviceMutation = useMutation(
        ({ deviceId, deviceData }) => apiService.updateDevice(deviceId, deviceData),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('devices');
                toast.success(t('devices.updateSuccess', 'Device updated successfully'));
                onClose();
            },
            onError: (error) => {
                console.error('Update device error:', error);
                toast.error(t('devices.updateError', 'Failed to update device'));
            }
        }
    );

    function generateApiKey() {
        return 'device_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            toast.error(t('devices.nameRequired', 'Device name is required'));
            return;
        }

        const deviceData = {
            ...formData,
            location_id: formData.location_id || null
        };

        if (isEditing) {
            // For update, only send the fields that can be updated
            const updateData = {
                name: deviceData.name,
                location_id: deviceData.location_id
            };
            updateDeviceMutation.mutate({
                deviceId: device.id,
                deviceData: updateData
            });
        } else {
            // For create, need to generate a unique device ID
            const createData = {
                ...deviceData,
                id: `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            };
            createDeviceMutation.mutate(createData);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="card w-full max-w-lg max-h-screen overflow-y-auto animate-scale-in">
                <div className="card-header">
                    <h2 className="card-title">
                        <Monitor className="w-5 h-5 text-primary" />
                        <span>{isEditing ? t('devices.editDevice') : t('devices.addDevice')}</span>
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn-ghost p-2"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="form-group">
                        <label className="form-label">
                            <Monitor className="w-4 h-4 inline mr-1" />
                            {t('devices.deviceName')} *
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className="input-field"
                            placeholder="Enter device name..."
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">
                            <Activity className="w-4 h-4 inline mr-1" />
                            {t('devices.deviceType')} *
                        </label>
                        <select
                            name="device_type"
                            value={formData.device_type}
                            onChange={handleChange}
                            className="input-field"
                            required
                        >
                            <option value="esp8266">ESP8266</option>
                            <option value="esp32">ESP32</option>
                            <option value="arduino">Arduino</option>
                            <option value="raspberry_pi">Raspberry Pi</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">
                            <MapPin className="w-4 h-4 inline mr-1" />
                            {t('devices.location')}
                        </label>
                        <select
                            name="location_id"
                            value={formData.location_id}
                            onChange={handleChange}
                            className="input-field"
                        >
                            <option value="">{t('devices.selectLocation', 'Select a location...')}</option>
                            {(locations || []).map(location => (
                                <option key={location.id} value={location.id}>
                                    {location.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">
                            {t('common.description')}
                        </label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows="3"
                            className="input-field"
                            placeholder="Optional description..."
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">
                            {t('devices.apiKey', 'API Key')}
                        </label>
                        <div className="flex space-x-2">
                            <input
                                type="text"
                                name="api_key"
                                value={formData.api_key}
                                onChange={handleChange}
                                className="input-field flex-1 font-mono text-sm"
                                readOnly={isEditing}
                            />
                            {!isEditing && (
                                <button
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, api_key: generateApiKey() }))}
                                    className="btn-secondary px-3 py-2 text-sm"
                                >
                                    <RefreshCw className="w-4 h-4 mr-1" />
                                    {t('devices.regenerate', 'Regenerate')}
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">This key will be used for device authentication</p>
                    </div>
                    <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn-secondary"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={createDeviceMutation.isLoading || updateDeviceMutation.isLoading}
                            className="btn-primary"
                        >
                            {(createDeviceMutation.isLoading || updateDeviceMutation.isLoading) ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                                    {isEditing ? 'Updating...' : 'Creating...'}
                                </>
                            ) : (
                                <>
                                    <Plus className="w-4 h-4 mr-2" />
                                    {isEditing ? t('common.update') : t('common.create')}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// Sensor Management Modal Component
function SensorManagementModal({ device, onClose }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [editingSensor, setEditingSensor] = useState(null);
    const [showAddSensor, setShowAddSensor] = useState(false);

    // Available pins for ESP8266
    const availablePins = {
        digital: ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'],
        analog: ['A0']
    };

    const pinMapping = {
        'D0': 'GPIO16 (Wake from deep sleep)',
        'D1': 'GPIO5 (I2C SCL)',
        'D2': 'GPIO4 (I2C SDA)',
        'D3': 'GPIO0 (Flash mode)',
        'D4': 'GPIO2 (Built-in LED)',
        'D5': 'GPIO14 (SPI CLK)',
        'D6': 'GPIO12 (SPI MISO)',
        'D7': 'GPIO13 (SPI MOSI)',
        'D8': 'GPIO15 (SPI CS)',
        'A0': 'ADC0 (Analog input, 0-1V, use voltage divider for 3.3V)'
    };

    // Fetch sensors for this device
    const { data: sensors = [], isLoading } = useQuery(
        ['device-sensors', device.id],
        () => apiService.getDeviceSensors(device.id),
        {
            select: (data) => data.sensors || data || []
        }
    );

    // Get used pins
    const getUsedPins = () => {
        const usedPins = {};
        for (const sensor of sensors) {
            if (sensor.pin && sensor.pin.trim()) {
                const pins = sensor.pin.includes(',') ? sensor.pin.split(',') : [sensor.pin];
                for (const pin of pins) {
                    const trimmedPin = pin.trim();
                    if (usedPins[trimmedPin]) {
                        usedPins[trimmedPin].push({ id: sensor.id, name: sensor.name });
                    } else {
                        usedPins[trimmedPin] = [{ id: sensor.id, name: sensor.name }];
                    }
                }
            }
        }
        return usedPins;
    };

    const updateSensorMutation = useMutation(
        ({ sensorId, data }) => apiService.updateSensor(device.id, sensorId, data),
        {
            onSuccess: () => {
                queryClient.invalidateQueries(['device-sensors', device.id]);
                toast.success(t('deviceManagement.toast.sensorUpdated'));
                setEditingSensor(null);
            },
            onError: (error) => {
                toast.error(t('deviceManagement.toast.sensorUpdateFailed', {
                    message: error.response?.data?.error || error.message
                }));
            }
        }
    );

    const createSensorMutation = useMutation(
        (data) => apiService.createSensor(device.id, data),
        {
            onSuccess: () => {
                queryClient.invalidateQueries(['device-sensors', device.id]);
                toast.success(t('deviceManagement.toast.sensorCreated'));
                setShowAddSensor(false);
            },
            onError: (error) => {
                toast.error(t('deviceManagement.toast.sensorCreateFailed', {
                    message: error.response?.data?.error || error.message
                }));
            }
        }
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="border-b border-gray-200 px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900">{t('devices.manageSensors', 'Manage Sensors')}</h2>
                            <p className="text-sm text-gray-500 mt-1">{device.name}</p>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="p-6">
                    {isLoading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                            <p className="text-gray-500 mt-4">Loading sensors...</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Add Sensor Section */}
                            {showAddSensor && (
                                <div>
                                    <AddSensorForm
                                        onSave={(data) => createSensorMutation.mutate(data)}
                                        onCancel={() => setShowAddSensor(false)}
                                        isLoading={createSensorMutation.isLoading}
                                        availablePins={availablePins}
                                        pinMapping={pinMapping}
                                        usedPins={getUsedPins()}
                                    />
                                </div>
                            )}

                            {/* Available Sensor Types - only show when adding */}
                            {!showAddSensor && sensors.length === 0 && (
                                <div className="text-center py-12">
                                    <p className="text-gray-600 mb-4">No sensors configured</p>
                                    <button
                                        onClick={() => setShowAddSensor(true)}
                                        className="btn-primary"
                                    >
                                        <Plus className="w-4 h-4 mr-2 inline" />
                                        Add Sensor
                                    </button>
                                </div>
                            )}

                            {/* Configured Sensors */}
                            {sensors.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-semibold text-gray-900">Configured Sensors</h3>
                                        {!showAddSensor && (
                                            <button
                                                onClick={() => setShowAddSensor(true)}
                                                className="btn-primary text-sm"
                                            >
                                                <Plus className="w-4 h-4 mr-1 inline" />
                                                Add Sensor
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        {sensors.map((sensor) => (
                                            <div key={sensor.id} className="border border-gray-200 rounded-lg p-4">
                                                {editingSensor?.id === sensor.id ? (
                                                    <SensorEditForm
                                                        sensor={sensor}
                                                        onSave={(data) => updateSensorMutation.mutate({ sensorId: sensor.id, data })}
                                                        onCancel={() => setEditingSensor(null)}
                                                        isLoading={updateSensorMutation.isLoading}
                                                    />
                                                ) : (
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex-1">
                                                            <div className="flex items-center space-x-3">
                                                                <h4 className="font-medium text-gray-900">{sensor.name}</h4>
                                                                <span className={`text-xs px-2 py-1 rounded ${sensor.sensor_type?.toLowerCase() === 'analog' || sensor.pin?.toLowerCase().includes('a') ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                                                    {sensor.sensor_type?.toLowerCase() === 'analog' || sensor.pin?.toLowerCase().includes('a') ? 'analog' : 'digital'}
                                                                </span>
                                                                {sensor.enabled === false && (
                                                                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                                                                        Disabled
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-sm text-gray-500 mt-1">
                                                                {sensor.sensor_type || 'Unknown type'} • Pin {sensor.pin}
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => setEditingSensor(sensor)}
                                                            className="text-sm text-gray-600 hover:text-gray-900"
                                                        >
                                                            Edit
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="border-t border-gray-200 px-6 py-4 flex justify-end bg-gray-50 rounded-b-lg">
                    <button onClick={onClose} className="btn-secondary px-6 py-2">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

// Sensor Edit Form Component
function SensorEditForm({ sensor, onSave, onCancel, isLoading }) {
    const [formData, setFormData] = useState({
        name: sensor.name || '',
        calibration_offset: sensor.calibration_offset || 0,
        calibration_multiplier: sensor.calibration_multiplier || 1,
        enabled: sensor.enabled !== false
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm text-gray-700 mb-1">
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
                    <label className="block text-sm text-gray-700 mb-1">
                        Pin Assignment
                    </label>
                    <input
                        type="text"
                        value={sensor.pin}
                        className="input w-full bg-gray-50"
                        disabled
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm text-gray-700 mb-1">
                        Calibration Offset
                    </label>
                    <input
                        type="number"
                        step="0.01"
                        value={formData.calibration_offset}
                        onChange={(e) => setFormData({...formData, calibration_offset: parseFloat(e.target.value) || 0})}
                        className="input w-full"
                    />
                </div>
                <div>
                    <label className="block text-sm text-gray-700 mb-1">
                        Calibration Multiplier
                    </label>
                    <input
                        type="number"
                        step="0.01"
                        value={formData.calibration_multiplier}
                        onChange={(e) => setFormData({...formData, calibration_multiplier: parseFloat(e.target.value) || 1})}
                        className="input w-full"
                    />
                </div>
            </div>

            <div className="flex items-center">
                <input
                    type="checkbox"
                    id={`enabled-${sensor.id}`}
                    checked={formData.enabled}
                    onChange={(e) => setFormData({...formData, enabled: e.target.checked})}
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                />
                <label htmlFor={`enabled-${sensor.id}`} className="ml-2 text-sm text-gray-700">
                    Enabled
                </label>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200">
                <button
                    type="button"
                    onClick={onCancel}
                    className="btn-secondary px-4 py-2"
                    disabled={isLoading}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="btn-primary px-4 py-2"
                    disabled={isLoading}
                >
                    {isLoading ? 'Saving...' : 'Save'}
                </button>
            </div>
        </form>
    );
}

// Add Sensor Form Component
function AddSensorForm({ onSave, onCancel, isLoading, availablePins, pinMapping, usedPins }) {
    const [selectedType, setSelectedType] = useState(null);
    const [formData, setFormData] = useState({
        type: '',
        pin: '',
        name: '',
        calibration_offset: 0,
        calibration_multiplier: 1,
        enabled: true
    });

    const [pinConflict, setPinConflict] = useState(false);

    const sensorTypes = [
        { value: 'Temperature', label: 'Temperature', unit: '°C', description: 'Measures temperature', icon: '🌡️', color: 'from-red-400 to-red-500' },
        { value: 'Humidity', label: 'Humidity', unit: '%', description: 'Measures relative humidity', icon: '💧', color: 'from-blue-400 to-blue-500' },
        { value: 'Pressure', label: 'Pressure', unit: 'hPa', description: 'Atmospheric pressure sensor', icon: '📊', color: 'from-indigo-400 to-indigo-500' },
        { value: 'Gas', label: 'Gas', unit: 'ppm', description: 'Gas concentration sensor', icon: '💨', color: 'from-yellow-400 to-yellow-500' },
        { value: 'Photodiode', label: 'Light Intensity', unit: 'lux', description: 'Light sensor', icon: '☀️', color: 'from-amber-400 to-amber-500' },
        { value: 'Motion', label: 'Motion', unit: 'boolean', description: 'PIR motion detector', icon: '👁️', color: 'from-purple-400 to-purple-500' },
        { value: 'Sound', label: 'Sound', unit: 'dB', description: 'Sound level sensor', icon: '🔊', color: 'from-pink-400 to-pink-500' },
        { value: 'Magnetic', label: 'Magnetic', unit: 'boolean', description: 'Magnetic field detector', icon: '🧲', color: 'from-gray-400 to-gray-500' },
        { value: 'Vibration', label: 'Vibration', unit: 'g', description: 'Vibration/acceleration', icon: '📳', color: 'from-orange-400 to-orange-500' },
        { value: 'Distance', label: 'Distance', unit: 'cm', description: 'Ultrasonic distance', icon: '📏', color: 'from-teal-400 to-teal-500' }
    ];

    const handleSelectType = (type) => {
        setSelectedType(type);
        setFormData({...formData, type: type.value, name: type.label});
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    if (!selectedType) {
        return (
            <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Available Sensor Types</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sensorTypes.map((type) => (
                        <div key={type.value} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-2">
                                <h5 className="font-medium text-gray-900">{type.label}</h5>
                                <span className={`px-2 py-1 text-xs font-medium rounded ${
                                    type.unit === 'boolean' || type.label.includes('Digital') ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                                }`}>
                                    {type.unit === 'boolean' || type.label.includes('Digital') ? 'digital' : 'analog'}
                                </span>
                            </div>
                            <p className="text-sm text-gray-500 mb-3">{type.description}</p>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-400">0 configured</span>
                                <button
                                    type="button"
                                    onClick={() => handleSelectType(type)}
                                    className="btn-primary text-sm px-3 py-1"
                                >
                                    <Plus className="w-3 h-3 mr-1 inline" />
                                    Add
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end mt-6 pt-4 border-t border-gray-200">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="btn-secondary px-4 py-2"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Configured Sensors</h3>
                <button
                    type="button"
                    onClick={() => setSelectedType(null)}
                    className="text-sm text-gray-600 hover:text-gray-900"
                >
                    ← Back to sensor types
                </button>
            </div>
            <form onSubmit={handleSubmit} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        <h4 className="font-medium text-gray-900">{selectedType.label} 1</h4>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                            selectedType.unit === 'boolean' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                        }`}>
                            {selectedType.unit === 'boolean' ? 'digital' : 'analog'}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="text-red-600 hover:text-red-800"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">
                            Pin Assignment
                        </label>
                        <select
                            value={formData.pin}
                            onChange={(e) => {
                                const pin = e.target.value;
                                setFormData({...formData, pin});
                                setPinConflict(usedPins[pin] && usedPins[pin].length > 0);
                            }}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 text-sm bg-white ${
                                pinConflict ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                            }`}
                            required
                        >
                            <option value="">Select Pin</option>
                            {(selectedType.unit === 'boolean' ? availablePins.digital : availablePins.analog).map(pin => {
                                const isUsed = usedPins[pin] && usedPins[pin].length > 0;
                                const description = pinMapping[pin] || 'Available';
                                return (
                                    <option
                                        key={pin}
                                        value={pin}
                                        disabled={isUsed}
                                        style={{ color: isUsed ? '#9ca3af' : 'inherit' }}
                                    >
                                        {pin} - {description} {isUsed ? '(used)' : ''}
                                    </option>
                                );
                            })}
                        </select>
                        {pinConflict && (
                            <p className="text-xs text-red-600 mt-1">
                                Pin {formData.pin} is already used by: {usedPins[formData.pin]?.map(s => s.name).join(', ')}
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">
                            Sensor Name
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="input w-full"
                            required
                            placeholder={`${selectedType.label} 1`}
                        />
                    </div>
                </div>

                <div className="flex justify-end space-x-2 mt-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="btn-secondary px-4 py-2"
                        disabled={isLoading}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn-primary px-4 py-2"
                        disabled={isLoading || pinConflict}
                    >
                        {isLoading ? 'Adding...' : 'Add Sensor'}
                    </button>
                </div>
            </form>
        </div>
    );
}

// OTA Update Modal Component
function OTAUpdateModal({ device, onClose }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [otaStatus, setOtaStatus] = useState('idle'); // 'idle', 'uploading', 'success', 'error'
    const [uploadProgress, setUploadProgress] = useState(0);
    const [errorMessage, setErrorMessage] = useState('');

    const triggerOTAMutation = useMutation(
        () => apiService.triggerOTA(device.id),
        {
            onSuccess: () => {
                setOtaStatus('success');
                queryClient.invalidateQueries('devices');
                toast.success(t('deviceManagement.toast.otaStarted'));
                setTimeout(() => {
                    onClose();
                }, 2000);
            },
            onError: (error) => {
                setOtaStatus('error');
                setErrorMessage(error.response?.data?.error || error.message || t('deviceManagement.toast.otaFailed'));
                toast.error(t('deviceManagement.toast.otaFailed'));
            }
        }
    );

    const handleStartOTA = () => {
        setOtaStatus('uploading');
        setUploadProgress(0);

        // Simulate progress for better UX
        const interval = setInterval(() => {
            setUploadProgress(prev => {
                if (prev >= 90) {
                    clearInterval(interval);
                    return prev;
                }
                return prev + 10;
            });
        }, 300);

        triggerOTAMutation.mutate();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="card w-full max-w-md animate-scale-in">
                <div className="card-header">
                    <h2 className="card-title">
                        <Upload className="w-5 h-5 text-orange-600" />
                        <span>OTA Firmware Update</span>
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn-ghost p-2"
                        disabled={otaStatus === 'uploading'}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Device Info */}
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Device:</span>
                            <span className="font-medium text-gray-900">{device.name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Type:</span>
                            <span className="badge badge-primary text-xs">{formatDeviceType(device.device_type)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Current Firmware:</span>
                            <span className="font-mono text-xs text-gray-900">{device.firmware_version || 'Unknown'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Status:</span>
                            <span className={`badge text-xs ${
                                device.current_status === 'online' ? 'badge-success' : 'badge-warning'
                            }`}>
                                {formatStatusLabel(device.current_status || 'offline')}
                            </span>
                        </div>
                    </div>

                    {/* OTA Status */}
                    {otaStatus === 'idle' && (
                        <div className="space-y-3">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-800">
                                    <strong>Note:</strong> The device will be sent a command to download and install the latest firmware from the server. Make sure the device is online and connected to the internet.
                                </p>
                            </div>
                            {device.current_status !== 'online' && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                    <p className="text-sm text-yellow-800">
                                        <strong>Warning:</strong> The device appears to be offline. OTA update may fail.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {otaStatus === 'uploading' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent"></div>
                            </div>
                            <p className="text-center text-gray-600">Sending OTA update command...</p>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${uploadProgress}%` }}
                                ></div>
                            </div>
                            <p className="text-center text-sm text-gray-500">{uploadProgress}%</p>
                        </div>
                    )}

                    {otaStatus === 'success' && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <div className="flex items-center space-x-3">
                                <div className="flex-shrink-0">
                                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium text-green-900">OTA Update Initiated</p>
                                    <p className="text-sm text-green-700 mt-1">
                                        The device will download and install the firmware. This may take a few minutes.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {otaStatus === 'error' && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <div className="flex items-center space-x-3">
                                <div className="flex-shrink-0">
                                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                                        <X className="w-6 h-6 text-red-600" />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium text-red-900">Update Failed</p>
                                    <p className="text-sm text-red-700 mt-1">{errorMessage}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn-secondary"
                            disabled={otaStatus === 'uploading'}
                        >
                            {otaStatus === 'success' || otaStatus === 'error' ? 'Close' : 'Cancel'}
                        </button>
                        {otaStatus === 'idle' && (
                            <button
                                type="button"
                                onClick={handleStartOTA}
                                className="btn-primary flex items-center space-x-2"
                            >
                                <Upload className="w-4 h-4" />
                                <span>Start OTA Update</span>
                            </button>
                        )}
                        {otaStatus === 'error' && (
                            <button
                                type="button"
                                onClick={handleStartOTA}
                                className="btn-primary flex items-center space-x-2"
                            >
                                <RefreshCw className="w-4 h-4" />
                                <span>Retry</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DeviceManagement;
