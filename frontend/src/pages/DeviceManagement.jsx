import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Edit3, Trash2, Wifi, WifiOff, AlertTriangle, Monitor, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

import { apiService } from '../services/api';

function DeviceManagement() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingDevice, setEditingDevice] = useState(null);
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
    const { data: locations = [] } = useQuery('locations', apiService.getLocations);

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

    const deviceTypes = ['esp8266', 'esp32', 'arduino', 'raspberry_pi'];
    const statusOptions = ['all', 'online', 'offline', 'alarm'];

    if (devicesLoading) {
        return (
            <div className="flex justify-center items-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2">{t('common.loading')}</span>
            </div>
        );
    }

    const devices = devicesData || [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{t('devices.management', 'Device Management')}</h1>
                    <p className="text-gray-600 mt-1">{t('devices.managementSubtitle', 'Manage your IoT devices')}</p>
                </div>
                <button
                    onClick={() => {
                        setEditingDevice(null);
                        setShowCreateForm(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center space-x-2"
                >
                    <Plus className="h-4 w-4" />
                    <span>{t('devices.addDevice')}</span>
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex flex-wrap gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t('devices.filterByStatus', 'Filter by Status')}
                        </label>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {statusOptions.map(status => (
                                <option key={status} value={status}>
                                    {status === 'all' ? t('common.all', 'All') : status.toUpperCase()}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t('devices.filterByType', 'Filter by Type')}
                        </label>
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">{t('common.all', 'All')}</option>
                            {deviceTypes.map(type => (
                                <option key={type} value={type}>
                                    {type.toUpperCase()}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center">
                        <Monitor className="h-8 w-8 text-blue-600" />
                        <div className="ml-3">
                            <p className="text-sm text-gray-500">{t('dashboard.totalDevices')}</p>
                            <p className="text-xl font-bold text-gray-900">{devices.length}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center">
                        <Wifi className="h-8 w-8 text-green-600" />
                        <div className="ml-3">
                            <p className="text-sm text-gray-500">{t('dashboard.onlineDevices')}</p>
                            <p className="text-xl font-bold text-green-600">
                                {devices.filter(d => d.current_status === 'online' || d.status === 'online').length}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center">
                        <WifiOff className="h-8 w-8 text-gray-600" />
                        <div className="ml-3">
                            <p className="text-sm text-gray-500">{t('dashboard.offlineDevices')}</p>
                            <p className="text-xl font-bold text-gray-600">
                                {devices.filter(d => d.current_status === 'offline' || d.status === 'offline').length}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center">
                        <AlertTriangle className="h-8 w-8 text-red-600" />
                        <div className="ml-3">
                            <p className="text-sm text-gray-500">{t('devices.alarmsActive', 'Active Alarms')}</p>
                            <p className="text-xl font-bold text-red-600">
                                {devices.filter(d => d.current_status === 'alarm' || d.status === 'alarm').length}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Devices Table */}
            <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold">{t('devices.deviceList')}</h2>
                </div>
                {devices.length === 0 ? (
                    <div className="p-6 text-center">
                        <Monitor className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">
                            {t('devices.noDevices', 'No devices found')}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                            {t('devices.addFirstDevice', 'Add your first IoT device to get started.')}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {t('devices.deviceName')}
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {t('common.status')}
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {t('devices.deviceType')}
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {t('devices.location')}
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {t('devices.lastHeartbeat')}
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {t('devices.firmwareVersion')}
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {t('common.actions')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {(devices || []).map((device) => (
                                    <tr key={device.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                {getStatusIcon(device.current_status || device.status)}
                                                <div className="ml-3">
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {device.name}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        ID: {device.id}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                getStatusColor(device.current_status || device.status)
                                            }`}>
                                                {(device.current_status || device.status || 'offline').toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {(device.device_type || 'unknown').toUpperCase()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {device.location_name || t('common.unknown')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {device.last_heartbeat ?
                                                new Date(device.last_heartbeat).toLocaleString() :
                                                t('devices.never', 'Never')
                                            }
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {device.firmware_version || t('common.unknown')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex justify-end space-x-2">
                                                <Link
                                                    to={`/devices/${device.id}`}
                                                    className="text-blue-600 hover:text-blue-900"
                                                    title={t('devices.viewDetails')}
                                                >
                                                    <Settings className="h-4 w-4" />
                                                </Link>
                                                <button
                                                    onClick={() => handleEditDevice(device)}
                                                    className="text-indigo-600 hover:text-indigo-900"
                                                    title={t('common.edit')}
                                                >
                                                    <Edit3 className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteDevice(device)}
                                                    className="text-red-600 hover:text-red-900"
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
            updateDeviceMutation.mutate({
                deviceId: device.id,
                deviceData
            });
        } else {
            createDeviceMutation.mutate(deviceData);
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-screen overflow-y-auto">
                <h2 className="text-lg font-semibold mb-4">
                    {isEditing ? t('devices.editDevice') : t('devices.addDevice')}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('devices.deviceName')} *
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('devices.deviceType')} *
                        </label>
                        <select
                            name="device_type"
                            value={formData.device_type}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        >
                            <option value="esp8266">ESP8266</option>
                            <option value="esp32">ESP32</option>
                            <option value="arduino">Arduino</option>
                            <option value="raspberry_pi">Raspberry Pi</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('devices.location')}
                        </label>
                        <select
                            name="location_id"
                            value={formData.location_id}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">{t('devices.selectLocation', 'Select a location...')}</option>
                            {locations.map(location => (
                                <option key={location.id} value={location.id}>
                                    {location.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('common.description')}
                        </label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows="3"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('devices.apiKey', 'API Key')}
                        </label>
                        <div className="flex space-x-2">
                            <input
                                type="text"
                                name="api_key"
                                value={formData.api_key}
                                onChange={handleChange}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                readOnly={isEditing}
                            />
                            {!isEditing && (
                                <button
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, api_key: generateApiKey() }))}
                                    className="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-md text-sm"
                                >
                                    {t('devices.regenerate', 'Regenerate')}
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-end space-x-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={createDeviceMutation.isLoading || updateDeviceMutation.isLoading}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md disabled:opacity-50"
                        >
                            {isEditing ? t('common.update') : t('common.create')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default DeviceManagement;