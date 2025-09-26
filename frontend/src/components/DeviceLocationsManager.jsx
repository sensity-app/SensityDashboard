import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
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
    CheckCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

import { apiService } from '../services/api';

function DeviceLocationsManager() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    const [showForm, setShowForm] = useState(false);
    const [editingLocation, setEditingLocation] = useState(null);
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
            onError: (error) => {
                console.error('Failed to fetch locations:', error);
                toast.error('Failed to load locations');
            }
        }
    );

    // Create location mutation
    const createLocationMutation = useMutation(
        (locationData) => apiService.createLocation(locationData),
        {
            onSuccess: () => {
                toast.success(t('locations.createSuccess', 'Location created successfully'));
                queryClient.invalidateQueries('locations');
                setShowForm(false);
                resetForm();
            },
            onError: (error) => {
                const message = error.response?.data?.error || 'Failed to create location';
                toast.error(message);
            }
        }
    );

    // Update location mutation
    const updateLocationMutation = useMutation(
        ({ id, locationData }) => apiService.updateLocation(id, locationData),
        {
            onSuccess: () => {
                toast.success(t('locations.updateSuccess', 'Location updated successfully'));
                queryClient.invalidateQueries('locations');
                setEditingLocation(null);
                setShowForm(false);
                resetForm();
            },
            onError: (error) => {
                const message = error.response?.data?.error || 'Failed to update location';
                toast.error(message);
            }
        }
    );

    // Delete location mutation
    const deleteLocationMutation = useMutation(
        (locationId) => apiService.deleteLocation(locationId),
        {
            onSuccess: () => {
                toast.success(t('locations.deleteSuccess', 'Location deleted successfully'));
                queryClient.invalidateQueries('locations');
            },
            onError: (error) => {
                const message = error.response?.data?.error || 'Failed to delete location';
                toast.error(message);
            }
        }
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
                                    GPS Coordinates (Optional)
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
                                            placeholder="e.g. 37.7749"
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
                                            placeholder="e.g. -122.4194"
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">Coordinates help with mapping and location-based features</p>
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
                                            <span>{editingLocation ? 'Updating...' : 'Creating...'}</span>
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
            <div className="card animate-slide-up" style={{animationDelay: '200ms'}}>
                <div className="card-header">
                    <h2 className="card-title">
                        <MapPin className="w-5 h-5 text-primary" />
                        <span>Locations</span>
                    </h2>
                    <span className="badge badge-primary">{locations.length} locations</span>
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
                                        <tr key={location.id} className="animate-scale-in" style={{animationDelay: `${index * 50}ms`}}>
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
                                                        onClick={() => handleEdit(location)}
                                                        className="btn-ghost p-2 text-primary"
                                                        title={t('common.edit', 'Edit')}
                                                    >
                                                        <Edit2 className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(location)}
                                                        className={`btn-ghost p-2 ${
                                                            location.device_count > 0
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
        </div>
    );
}

export default DeviceLocationsManager;