import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    MapPin,
    Plus,
    Edit2,
    Trash2,
    Save,
    X,
    Globe,
    Clock,
    Users,
    AlertCircle,
    CheckCircle,
    Eye,
    Move
} from 'lucide-react';

import { apiService } from '../services/api';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { Link } from 'react-router-dom';

function DeviceLocationsManager() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { handleError, showSuccess, createMutationHandlers } = useErrorHandler('Location Management');

    const [showForm, setShowForm] = useState(false);
    const [editingLocation, setEditingLocation] = useState(null);
    const [viewingDevices, setViewingDevices] = useState(null);
    const [movingDevice, setMovingDevice] = useState(null);
    const [targetLocationId, setTargetLocationId] = useState('');
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        timezone: 'UTC',
        latitude: '',
        longitude: ''
    });

    // Query locations
    const { data: locationsData, isLoading, error } = useQuery(
        'locations',
        () => apiService.getLocations(),
        {
            onError: (error) => handleError(error, { customMessage: 'Failed to load locations' })
        }
    );

    // Query all devices
    const { data: allDevices = [] } = useQuery('devices', apiService.getDevices);

    // Move device mutation
    const moveDeviceMutation = useMutation(
        ({ deviceId, locationId }) => apiService.updateDevice(deviceId, { location_id: locationId }),
        {
            onSuccess: () => {
                toast.success(t('locations.deviceMoved', 'Device moved successfully'));
                queryClient.invalidateQueries('devices');
                queryClient.invalidateQueries('locations');
                setMovingDevice(null);
                setTargetLocationId('');
            },
            onError: (error) => {
                toast.error(t('locations.deviceMoveError', 'Failed to move device'));
            }
        }
    );

    // Create location mutation
    const createLocationMutation = useMutation(
        (locationData) => apiService.createLocation(locationData),
        createMutationHandlers({
            successMessage: t('locations.createSuccess', 'Location created successfully'),
            errorMessage: 'Failed to create location',
            onSuccess: () => {
                queryClient.invalidateQueries('locations');
                setShowForm(false);
                resetForm();
            }
        })
    );

    // Update location mutation
    const updateLocationMutation = useMutation(
        ({ id, locationData }) => apiService.updateLocation(id, locationData),
        createMutationHandlers({
            successMessage: t('locations.updateSuccess', 'Location updated successfully'),
            errorMessage: 'Failed to update location',
            onSuccess: () => {
                queryClient.invalidateQueries('locations');
                setEditingLocation(null);
                setShowForm(false);
                resetForm();
            }
        })
    );

    // Delete location mutation
    const deleteLocationMutation = useMutation(
        (locationId) => apiService.deleteLocation(locationId),
        createMutationHandlers({
            successMessage: t('locations.deleteSuccess', 'Location deleted successfully'),
            errorMessage: 'Failed to delete location',
            onSuccess: () => {
                queryClient.invalidateQueries('locations');
            }
        })
    );

    const locations = Array.isArray(locationsData?.locations) ? locationsData.locations : [];

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            timezone: 'UTC',
            latitude: '',
            longitude: ''
        });
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const locationData = {
            ...formData,
            latitude: formData.latitude ? parseFloat(formData.latitude) : null,
            longitude: formData.longitude ? parseFloat(formData.longitude) : null
        };

        if (editingLocation) {
            updateLocationMutation.mutate({ id: editingLocation.id, locationData });
        } else {
            createLocationMutation.mutate(locationData);
        }
    };

    const handleEdit = (location) => {
        setEditingLocation(location);
        setFormData({
            name: location.name,
            description: location.description || '',
            timezone: location.timezone || 'UTC',
            latitude: location.latitude ? location.latitude.toString() : '',
            longitude: location.longitude ? location.longitude.toString() : ''
        });
        setShowForm(true);
    };

    const handleDelete = async (location) => {
        if (location.device_count > 0) {
            toast.error(`Cannot delete location with ${location.device_count} devices. Move or delete devices first.`);
            return;
        }

        if (window.confirm(`Are you sure you want to delete "${location.name}"?`)) {
            deleteLocationMutation.mutate(location.id);
        }
    };

    const handleCancelForm = () => {
        setShowForm(false);
        setEditingLocation(null);
        resetForm();
    };

    const commonTimezones = [
        'UTC',
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
        'Europe/London',
        'Europe/Paris',
        'Europe/Berlin',
        'Asia/Tokyo',
        'Asia/Shanghai',
        'Australia/Sydney'
    ];

    if (isLoading) {
        return (
            <div className="space-y-8 animate-fade-in">
                <div className="card p-8">
                    <div className="flex justify-center items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
                        <span className="ml-3 text-gray-600">Loading locations...</span>
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
                            <MapPin className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">
                                {t('locations.title', 'Device Locations')}
                            </h1>
                            <p className="text-gray-600 mt-1">
                                {t('locations.description', 'Manage physical locations where your devices are deployed')}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowForm(true)}
                        className="btn-primary flex items-center space-x-2"
                    >
                        <Plus className="h-4 w-4" />
                        <span>{t('locations.addLocation', 'Add Location')}</span>
                    </button>
                </div>
            </div>

            {/* Modern Add/Edit Form */}
            {showForm && (
                <div className="card animate-scale-in">
                    <div className="card-header">
                        <h2 className="card-title">
                            <MapPin className="w-5 h-5 text-primary" />
                            <span>
                                {editingLocation
                                    ? t('locations.editLocation', 'Edit Location')
                                    : t('locations.addLocation', 'Add Location')
                                }
                            </span>
                        </h2>
                        <button
                            onClick={handleCancelForm}
                            className="btn-ghost p-2"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="p-6">

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="form-group">
                                    <label className="form-label">
                                        <MapPin className="w-4 h-4 inline mr-1" />
                                        {t('locations.name', 'Location Name')} *
                                    </label>
                                    <input
                                        type="text"
                                        id="name"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleInputChange}
                                        required
                                        className="input-field"
                                        placeholder={t('locations.namePlaceholder', 'e.g. Main Office, Warehouse A')}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">
                                        <Clock className="w-4 h-4 inline mr-1" />
                                        {t('locations.timezone', 'Timezone')}
                                    </label>
                                    <select
                                        id="timezone"
                                        name="timezone"
                                        value={formData.timezone}
                                        onChange={handleInputChange}
                                        className="input-field"
                                    >
                                        {commonTimezones.map(tz => (
                                            <option key={tz} value={tz}>{tz}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">
                                    {t('locations.description', 'Description')}
                                </label>
                                <textarea
                                    id="description"
                                    name="description"
                                    value={formData.description}
                                    onChange={handleInputChange}
                                    rows="3"
                                    className="input-field"
                                    placeholder={t('locations.descriptionPlaceholder', 'Optional description of this location')}
                                />
                            </div>

                            <div className="glass p-4 rounded-xl">
                                <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                                    <Globe className="w-4 h-4 mr-2" />
                                    {t('locations.gpsTitle', 'GPS Coordinates (Optional)')}
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="form-group">
                                        <label className="form-label">
                                            {t('locations.latitude', 'Latitude')}
                                        </label>
                                        <input
                                            type="number"
                                            id="latitude"
                                            name="latitude"
                                            value={formData.latitude}
                                            onChange={handleInputChange}
                                            step="any"
                                            min="-90"
                                            max="90"
                                            className="input-field"
                                            placeholder={t('locations.latitudePlaceholder', 'e.g. 37.7749')}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">
                                            {t('locations.longitude', 'Longitude')}
                                        </label>
                                        <input
                                            type="number"
                                            id="longitude"
                                            name="longitude"
                                            value={formData.longitude}
                                            onChange={handleInputChange}
                                            step="any"
                                            min="-180"
                                            max="180"
                                            className="input-field"
                                            placeholder={t('locations.longitudePlaceholder', 'e.g. -122.4194')}
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    {t('locations.coordinatesHelp', 'Coordinates help with mapping and location-based features')}
                                </p>
                            </div>

                            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                                <button
                                    type="button"
                                    onClick={handleCancelForm}
                                    className="btn-secondary"
                                >
                                    <X className="w-4 h-4 mr-2" />
                                    {t('common.cancel', 'Cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={createLocationMutation.isLoading || updateLocationMutation.isLoading}
                                    className="btn-primary flex items-center space-x-2"
                                >
                                    {(createLocationMutation.isLoading || updateLocationMutation.isLoading) ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            <span>
                                                {editingLocation
                                                    ? t('locations.updating', 'Updating...')
                                                    : t('locations.creating', 'Creating...')
                                                }
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <Save className="h-4 w-4" />
                                            <span>
                                                {editingLocation
                                                    ? t('common.update', 'Update')
                                                    : t('common.create', 'Create')
                                                }
                                            </span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modern Locations List */}
            <div className="card animate-slide-up" style={{ animationDelay: '200ms' }}>
                <div className="card-header">
                    <h2 className="card-title">
                        <MapPin className="w-5 h-5 text-primary" />
                        <span>{t('locations.sectionTitle', 'Locations')}</span>
                    </h2>
                    <span className="badge badge-primary">
                        {t('locations.count', { count: locations.length })}
                    </span>
                </div>

                {locations.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center mb-6">
                            <MapPin className="h-12 w-12 text-blue-500" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            {t('locations.noLocations', 'No locations yet')}
                        </h3>
                        <p className="text-gray-500 mb-6">
                            {t('locations.noLocationsDesc', 'Create your first location to organize your devices')}
                        </p>
                        <button
                            onClick={() => setShowForm(true)}
                            className="btn-primary flex items-center space-x-2 mx-auto"
                        >
                            <Plus className="h-4 w-4" />
                            <span>{t('locations.addLocation', 'Add Location')}</span>
                        </button>
                    </div>
                ) : (
                    <div className="p-6">
                        <div className="table-modern overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr>
                                        <th className="text-left">{t('locations.name', 'Location')}</th>
                                        <th className="text-left">{t('locations.devices', 'Devices')}</th>
                                        <th className="text-left">{t('locations.timezone', 'Timezone')}</th>
                                        <th className="text-left">{t('locations.coordinates', 'Coordinates')}</th>
                                        <th className="text-right">{t('common.actions', 'Actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {locations.map((location, index) => (
                                        <tr key={location.id} className="animate-scale-in" style={{ animationDelay: `${index * 50}ms` }}>
                                            <td>
                                                <div className="flex items-start space-x-3">
                                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center flex-shrink-0">
                                                        <MapPin className="w-5 h-5 text-blue-600" />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-gray-900">
                                                            {location.name}
                                                        </div>
                                                        {location.description && (
                                                            <div className="text-sm text-gray-500 mt-1">
                                                                {location.description}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center space-x-4">
                                                    <div className="flex items-center space-x-1">
                                                        <Users className="h-4 w-4 text-gray-400" />
                                                        <span className="text-sm font-medium text-gray-900">
                                                            {location.device_count || 0}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <span className="badge badge-success text-xs">
                                                            <CheckCircle className="h-3 w-3 mr-1" />
                                                            {location.online_devices || 0}
                                                        </span>
                                                        <span className="badge badge-error text-xs">
                                                            <AlertCircle className="h-3 w-3 mr-1" />
                                                            {location.offline_devices || 0}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center space-x-1">
                                                    <Clock className="h-3 h-3 text-gray-400" />
                                                    <span className="text-sm text-gray-600">
                                                        {location.timezone || 'UTC'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                {location.latitude && location.longitude ? (
                                                    <div className="flex items-center space-x-1">
                                                        <Globe className="h-3 w-3 text-gray-400" />
                                                        <span className="text-xs font-mono text-gray-600">
                                                            {parseFloat(location.latitude).toFixed(4)}, {parseFloat(location.longitude).toFixed(4)}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-gray-400">No coordinates</span>
                                                )}
                                            </td>
                                            <td>
                                                <div className="flex items-center justify-end space-x-1">
                                                    <button
                                                        onClick={() => setViewingDevices(location)}
                                                        className="btn-ghost p-2 text-blue-600"
                                                        title={t('locations.viewDevices', 'View Devices')}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleEdit(location)}
                                                        className="btn-ghost p-2 text-primary"
                                                        title={t('common.edit', 'Edit')}
                                                    >
                                                        <Edit2 className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(location)}
                                                        className={`btn-ghost p-2 ${location.device_count > 0
                                                                ? 'text-gray-400 cursor-not-allowed'
                                                                : 'text-red-600 hover:text-red-700'
                                                            }`}
                                                        title={location.device_count > 0 ? 'Cannot delete location with devices' : t('common.delete', 'Delete')}
                                                        disabled={location.device_count > 0}
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

            {/* View Devices Modal */}
            {viewingDevices && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-3xl bg-white rounded-lg shadow-xl max-h-[80vh] overflow-hidden">
                        <div className="border-b border-gray-200 p-6 flex justify-between items-center">
                            <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                                <MapPin className="h-5 w-5 text-indigo-600" />
                                {viewingDevices.name} - {t('locations.devices', 'Devices')}
                            </h3>
                            <button
                                onClick={() => setViewingDevices(null)}
                                className="btn-ghost p-2"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto max-h-[60vh]">
                            {allDevices.filter(d => d.location_id === viewingDevices.id).length === 0 ? (
                                <div className="text-center py-8">
                                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                                    <p className="text-gray-500">{t('locations.noDevicesInLocation', 'No devices in this location')}</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {allDevices
                                        .filter(d => d.location_id === viewingDevices.id)
                                        .map(device => (
                                            <div
                                                key={device.id}
                                                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-3 h-3 rounded-full ${device.is_online ? 'bg-green-500' : 'bg-red-500'}`} />
                                                    <div>
                                                        <div className="font-medium text-gray-900">{device.name}</div>
                                                        <div className="text-xs text-gray-500">{device.device_type}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Link
                                                        to={`/devices/${device.id}`}
                                                        className="btn-ghost p-2 text-blue-600"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Link>
                                                    <button
                                                        onClick={() => {
                                                            setMovingDevice(device);
                                                            setViewingDevices(null);
                                                        }}
                                                        className="btn-ghost p-2 text-indigo-600"
                                                        title={t('locations.moveDevice', 'Move Device')}
                                                    >
                                                        <Move className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Move Device Modal */}
            {movingDevice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md bg-white rounded-lg shadow-xl">
                        <div className="border-b border-gray-200 p-6">
                            <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                                <Move className="h-5 w-5 text-indigo-600" />
                                {t('locations.moveDevice', 'Move Device')}
                            </h3>
                        </div>

                        <div className="p-6">
                            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                                <div className="text-sm font-medium text-gray-900">{movingDevice.name}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {t('locations.currentLocation', 'Current')}: {
                                        locations.find(l => l.id === movingDevice.location_id)?.name || t('common.none', 'None')
                                    }
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('locations.selectNewLocation', 'Select New Location')}
                                </label>
                                <select
                                    value={targetLocationId}
                                    onChange={(e) => setTargetLocationId(e.target.value)}
                                    className="w-full rounded-md border-gray-300"
                                >
                                    <option value="">{t('common.select', 'Select...')}</option>
                                    {locations
                                        .filter(l => l.id !== movingDevice.location_id)
                                        .map(location => (
                                            <option key={location.id} value={location.id}>
                                                {location.name}
                                            </option>
                                        ))}
                                </select>
                            </div>
                        </div>

                        <div className="border-t border-gray-200 p-6 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setMovingDevice(null);
                                    setTargetLocationId('');
                                }}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                            >
                                {t('common.cancel', 'Cancel')}
                            </button>
                            <button
                                onClick={() => {
                                    if (targetLocationId) {
                                        moveDeviceMutation.mutate({
                                            deviceId: movingDevice.id,
                                            locationId: targetLocationId
                                        });
                                    } else {
                                        toast.error(t('locations.selectLocationError', 'Please select a location'));
                                    }
                                }}
                                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                                disabled={!targetLocationId || moveDeviceMutation.isLoading}
                            >
                                {moveDeviceMutation.isLoading ? t('common.moving', 'Moving...') : t('common.move', 'Move')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DeviceLocationsManager;
