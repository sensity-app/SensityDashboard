import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import {
    Plus,
    Edit3,
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
    Cpu
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

    // Query devices
    const { data: devicesData, isLoading: devicesLoading } = useQuery(
        ['devices', filterStatus, filterType],
        () => apiService.getDevices({
            status: filterStatus === 'all' ? undefined : filterStatus,
            device_type: filterType === 'all' ? undefined : filterType
        }),
        {
            refetchInterval: 30000,
            select: (data) => data.devices || data || []
        }
    );

    // Query locations for dropdown
    const { data: locations = [] } = useQuery('locations', apiService.getLocations, {
        select: (data) => data.locations || data || []
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


    const deviceTypes = ['esp8266', 'esp32', 'arduino', 'raspberry_pi'];
    const statusOptions = ['all', 'online', 'offline', 'alarm'];

    if (devicesLoading) {
        return (
            <div className="space-y-8 animate-fade-in">
                <div className="card p-8">
                    <div className="flex justify-center items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
                        <span className="ml-3 text-gray-600">{t('common.loading')}</span>
                    </div>
                </div>
            </div>
        );
    }

    const devices = devicesData || [];

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
                            <h1 className="text-3xl font-bold text-gray-900">{t('devices.management', 'Device Management')}</h1>
                            <p className="text-gray-600 mt-1">{t('devices.managementSubtitle', 'Manage and monitor your IoT devices')}</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={() => window.location.reload()}
                            className="btn-secondary flex items-center space-x-2"
                        >
                            <RefreshCw className="h-4 w-4" />
                            <span>Refresh</span>
                        </button>
                        <button
                            onClick={() => navigate('/firmware-builder')}
                            className="btn-primary flex items-center space-x-2"
                        >
                            <Cpu className="h-4 w-4" />
                            <span>Build & Add Device</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Modern Filters */}
            <div className="card animate-slide-up" style={{animationDelay: '100ms'}}>
                <div className="card-header">
                    <h3 className="card-title">
                        <Filter className="w-5 h-5 text-primary" />
                        <span>Filter Devices</span>
                    </h3>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="form-group">
                            <label className="form-label">
                                <Activity className="w-4 h-4 inline mr-1" />
                                {t('devices.filterByStatus', 'Filter by Status')}
                            </label>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="input-field"
                            >
                                {statusOptions.map(status => (
                                    <option key={status} value={status}>
                                        {status === 'all' ? t('common.all', 'All') : status.toUpperCase()}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">
                                <Monitor className="w-4 h-4 inline mr-1" />
                                {t('devices.filterByType', 'Filter by Type')}
                            </label>
                            <select
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                                className="input-field"
                            >
                                <option value="all">{t('common.all', 'All')}</option>
                                {deviceTypes.map(type => (
                                    <option key={type} value={type}>
                                        {type.toUpperCase()}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">
                                <Search className="w-4 h-4 inline mr-1" />
                                Search Devices
                            </label>
                            <input
                                type="text"
                                placeholder="Search by name or ID..."
                                className="input-field"
                            />
                        </div>
                    </div>
                    {(filterStatus !== 'all' || filterType !== 'all') && (
                        <div className="mt-4 flex items-center space-x-2">
                            <span className="text-sm text-gray-500">Active filters:</span>
                            {filterStatus !== 'all' && (
                                <span className="badge badge-primary flex items-center space-x-1">
                                    <span>Status: {filterStatus}</span>
                                    <button onClick={() => setFilterStatus('all')}>
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            )}
                            {filterType !== 'all' && (
                                <span className="badge badge-primary flex items-center space-x-1">
                                    <span>Type: {filterType}</span>
                                    <button onClick={() => setFilterType('all')}>
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            )}
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
                            <p className="text-3xl font-bold text-gray-900">{devices.length}</p>
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
                                {devices.filter(d => d.current_status === 'online' || d.status === 'online').length}
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
                                {devices.filter(d => d.current_status === 'offline' || d.status === 'offline').length}
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
                                {devices.filter(d => d.current_status === 'alarm' || d.status === 'alarm').length}
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
                    <span className="badge badge-primary">{devices.length} devices</span>
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
                        <div className="table-modern overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr>
                                        <th className="text-left">{t('devices.deviceName')}</th>
                                        <th className="text-left">{t('common.status')}</th>
                                        <th className="text-left">{t('devices.deviceType')}</th>
                                        <th className="text-left">{t('devices.location')}</th>
                                        <th className="text-left">{t('devices.ipAddress')}</th>
                                        <th className="text-left">{t('devices.lastHeartbeat')}</th>
                                        <th className="text-left">{t('devices.firmwareVersion')}</th>
                                        <th className="text-right">{t('common.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(devices || []).map((device, index) => (
                                        <tr key={device.id} className="animate-scale-in" style={{animationDelay: `${index * 50}ms`}}>
                                            <td>
                                                <div className="flex items-center space-x-3">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                                        device.current_status === 'online' ? 'bg-green-100' :
                                                        device.current_status === 'alarm' ? 'bg-red-100' : 'bg-gray-100'
                                                    }`}>
                                                        {getStatusIcon(device.current_status || device.status)}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-gray-900">{device.name}</div>
                                                        <div className="text-xs text-gray-500 font-mono">ID: {device.id}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`badge ${
                                                    (device.current_status || device.status) === 'online' ? 'badge-success' :
                                                    (device.current_status || device.status) === 'alarm' ? 'badge-error' : 'badge-warning'
                                                }`}>
                                                    {(device.current_status || device.status || 'offline').toUpperCase()}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="badge badge-primary">
                                                    {(device.device_type || 'unknown').toUpperCase()}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex items-center space-x-1 text-sm text-gray-900">
                                                    <MapPin className="w-3 h-3 text-gray-400" />
                                                    <span>{device.location_name || t('common.unknown')}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="font-mono text-xs text-gray-600">
                                                    {device.ip_address || '-'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex items-center space-x-1 text-sm text-gray-500">
                                                    <Clock className="w-3 h-3" />
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
                                                <div className="flex justify-end space-x-1">
                                                    <Link
                                                        to={`/devices/${device.id}`}
                                                        className="btn-ghost p-2"
                                                        title={t('devices.viewDetails')}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Link>
                                                    <button
                                                        onClick={() => handleManageSensors(device)}
                                                        className="btn-ghost p-2 text-purple-600 hover:text-purple-700"
                                                        title={t('devices.manageSensors', 'Manage Sensors')}
                                                    >
                                                        <Cpu className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleEditDevice(device)}
                                                        className="btn-ghost p-2 text-primary"
                                                        title={t('common.edit')}
                                                    >
                                                        <Edit3 className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteDevice(device)}
                                                        className="btn-ghost p-2 text-red-600 hover:text-red-700"
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

    // Fetch sensors for this device
    const { data: sensors = [], isLoading } = useQuery(
        ['device-sensors', device.id],
        () => apiService.getDeviceSensors(device.id),
        {
            select: (data) => data.sensors || data || []
        }
    );

    const updateSensorMutation = useMutation(
        ({ sensorId, data }) => apiService.updateSensor(device.id, sensorId, data),
        {
            onSuccess: () => {
                queryClient.invalidateQueries(['device-sensors', device.id]);
                toast.success('Sensor updated successfully');
                setEditingSensor(null);
            },
            onError: (error) => {
                toast.error('Failed to update sensor: ' + (error.response?.data?.error || error.message));
            }
        }
    );

    const createSensorMutation = useMutation(
        (data) => apiService.createSensor(device.id, data),
        {
            onSuccess: () => {
                queryClient.invalidateQueries(['device-sensors', device.id]);
                toast.success('Sensor created successfully');
                setShowAddSensor(false);
            },
            onError: (error) => {
                toast.error('Failed to create sensor: ' + (error.response?.data?.error || error.message));
            }
        }
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="card-header">
                    <h2 className="card-title">
                        <Cpu className="w-5 h-5 text-purple-600" />
                        <span>{t('devices.manageSensors', 'Manage Sensors')}: {device.name}</span>
                    </h2>
                    <button onClick={onClose} className="btn-ghost p-2">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6">
                    {isLoading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                            <p className="text-gray-500 mt-4">Loading sensors...</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Add Sensor Button */}
                            {!showAddSensor && (
                                <button
                                    onClick={() => setShowAddSensor(true)}
                                    className="btn-primary w-full py-3"
                                >
                                    <Plus className="w-4 h-4 mr-2 inline" />
                                    Add New Sensor
                                </button>
                            )}

                            {/* Add Sensor Form */}
                            {showAddSensor && (
                                <div className="border border-purple-300 rounded-lg p-4 bg-purple-50">
                                    <h3 className="font-semibold mb-3">Add New Sensor</h3>
                                    <AddSensorForm
                                        onSave={(data) => createSensorMutation.mutate(data)}
                                        onCancel={() => setShowAddSensor(false)}
                                        isLoading={createSensorMutation.isLoading}
                                    />
                                </div>
                            )}

                            {sensors.length === 0 && !showAddSensor ? (
                                <div className="text-center py-8 bg-gray-50 rounded-lg">
                                    <Cpu className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                                    <p className="text-gray-600 mb-2">No sensors configured</p>
                                    <p className="text-sm text-gray-500">
                                        Click "Add New Sensor" to create your first sensor
                                    </p>
                                </div>
                            ) : null}

                            {/* Existing Sensors */}
                            {sensors.map((sensor) => (
                                <div key={sensor.id} className="border rounded-lg p-4 hover:border-purple-300 transition-colors">
                                    {editingSensor?.id === sensor.id ? (
                                        <SensorEditForm
                                            sensor={sensor}
                                            onSave={(data) => updateSensorMutation.mutate({ sensorId: sensor.id, data })}
                                            onCancel={() => setEditingSensor(null)}
                                            isLoading={updateSensorMutation.isLoading}
                                        />
                                    ) : (
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center space-x-2 mb-2">
                                                    <h3 className="font-semibold text-lg">{sensor.name}</h3>
                                                    <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">
                                                        Pin {sensor.pin}
                                                    </span>
                                                    {sensor.enabled === false && (
                                                        <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                                                            Disabled
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-600 mb-2">
                                                    Type: {sensor.sensor_type || 'Unknown'}
                                                </p>
                                                <div className="grid grid-cols-2 gap-4 text-sm">
                                                    <div>
                                                        <span className="text-gray-500">Calibration Offset:</span>
                                                        <span className="ml-2 font-mono">{sensor.calibration_offset || 0}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-500">Calibration Multiplier:</span>
                                                        <span className="ml-2 font-mono">{sensor.calibration_multiplier || 1}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setEditingSensor(sensor)}
                                                className="btn-secondary px-3 py-2 text-sm"
                                            >
                                                <Edit3 className="w-4 h-4 mr-1 inline" />
                                                Edit
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="border-t p-4 flex justify-end">
                    <button onClick={onClose} className="btn-primary px-6 py-2">
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
        <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
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
                <div className="flex items-center pt-6">
                    <input
                        type="checkbox"
                        id={`enabled-${sensor.id}`}
                        checked={formData.enabled}
                        onChange={(e) => setFormData({...formData, enabled: e.target.checked})}
                        className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                    />
                    <label htmlFor={`enabled-${sensor.id}`} className="ml-2 block text-sm text-gray-700">
                        Enabled
                    </label>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
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
                    {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </form>
    );
}

// Add Sensor Form Component
function AddSensorForm({ onSave, onCancel, isLoading }) {
    const [formData, setFormData] = useState({
        type: '',
        pin: '',
        name: '',
        calibration_offset: 0,
        calibration_multiplier: 1,
        enabled: true
    });

    const sensorTypes = [
        { value: 'Temperature', label: 'Temperature (°C)' },
        { value: 'Humidity', label: 'Humidity (%)' },
        { value: 'Pressure', label: 'Pressure (hPa)' },
        { value: 'Gas', label: 'Gas (ppm)' },
        { value: 'Photodiode', label: 'Light/Photodiode (lux)' },
        { value: 'Motion', label: 'Motion (PIR)' },
        { value: 'Sound', label: 'Sound (dB)' },
        { value: 'Magnetic', label: 'Magnetic Field' },
        { value: 'Vibration', label: 'Vibration (g)' },
        { value: 'Distance', label: 'Distance (cm)' }
    ];

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Sensor Type
                    </label>
                    <select
                        value={formData.type}
                        onChange={(e) => setFormData({...formData, type: e.target.value})}
                        className="input w-full"
                        required
                    >
                        <option value="">Select sensor type...</option>
                        {sensorTypes.map(type => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Pin Number
                    </label>
                    <input
                        type="number"
                        value={formData.pin}
                        onChange={(e) => setFormData({...formData, pin: e.target.value})}
                        className="input w-full"
                        required
                        min="0"
                        max="16"
                    />
                </div>
            </div>

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
                    placeholder="e.g., Living Room Temperature"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    id="add-sensor-enabled"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({...formData, enabled: e.target.checked})}
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                />
                <label htmlFor="add-sensor-enabled" className="ml-2 block text-sm text-gray-700">
                    Enabled
                </label>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
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
                    {isLoading ? 'Creating...' : 'Create Sensor'}
                </button>
            </div>
        </form>
    );
}

export default DeviceManagement;