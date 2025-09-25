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

    const locations = Array.isArray(locationsData?.data?.locations) ? locationsData.data.locations : [];

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
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="animate-pulse space-y-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-16 bg-gray-200 rounded"></div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <MapPin className="h-8 w-8 text-blue-600" />
                        <h1 className="text-3xl font-bold text-gray-900">
                            {t('locations.title', 'Device Locations')}
                        </h1>
                    </div>
                    <button
                        onClick={() => setShowForm(true)}
                        className="btn-primary flex items-center space-x-2"
                    >
                        <Plus className="h-4 w-4" />
                        <span>{t('locations.addLocation', 'Add Location')}</span>
                    </button>
                </div>
                <p className="mt-2 text-gray-600">
                    {t('locations.description', 'Manage physical locations where your devices are deployed')}
                </p>
            </div>

            {/* Add/Edit Form */}
            {showForm && (
                <div className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-900">
                            {editingLocation
                                ? t('locations.editLocation', 'Edit Location')
                                : t('locations.addLocation', 'Add Location')
                            }
                        </h2>
                        <button
                            onClick={handleCancelForm}
                            className="text-gray-400 hover:text-gray-600"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
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
                            <div>
                                <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1">
                                    <Clock className="h-4 w-4 inline mr-1" />
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

                        <div>
                            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="latitude" className="block text-sm font-medium text-gray-700 mb-1">
                                    <Globe className="h-4 w-4 inline mr-1" />
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
                            <div>
                                <label htmlFor="longitude" className="block text-sm font-medium text-gray-700 mb-1">
                                    <Globe className="h-4 w-4 inline mr-1" />
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

                        <div className="flex justify-end space-x-3">
                            <button
                                type="button"
                                onClick={handleCancelForm}
                                className="btn-secondary"
                            >
                                {t('common.cancel', 'Cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={createLocationMutation.isLoading || updateLocationMutation.isLoading}
                                className="btn-primary flex items-center space-x-2"
                            >
                                <Save className="h-4 w-4" />
                                <span>
                                    {editingLocation
                                        ? t('common.update', 'Update')
                                        : t('common.create', 'Create')
                                    }
                                </span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Locations List */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {locations.length === 0 ? (
                    <div className="p-12 text-center">
                        <MapPin className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
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
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {t('locations.name', 'Location')}
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {t('locations.devices', 'Devices')}
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {t('locations.timezone', 'Timezone')}
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {t('locations.coordinates', 'Coordinates')}
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {t('common.actions', 'Actions')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {locations.map((location) => (
                                    <tr key={location.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div>
                                                <div className="text-sm font-medium text-gray-900">
                                                    {location.name}
                                                </div>
                                                {location.description && (
                                                    <div className="text-sm text-gray-500">
                                                        {location.description}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center space-x-4">
                                                <div className="flex items-center space-x-1">
                                                    <Users className="h-4 w-4 text-gray-400" />
                                                    <span className="text-sm text-gray-600">
                                                        {location.device_count || 0}
                                                    </span>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <div className="flex items-center space-x-1">
                                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                                        <span className="text-sm text-green-600">
                                                            {location.online_devices || 0}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center space-x-1">
                                                        <AlertCircle className="h-4 w-4 text-red-500" />
                                                        <span className="text-sm text-red-600">
                                                            {location.offline_devices || 0}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center space-x-1">
                                                <Clock className="h-4 w-4 text-gray-400" />
                                                <span className="text-sm text-gray-600">
                                                    {location.timezone || 'UTC'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {location.latitude && location.longitude ? (
                                                <div className="flex items-center space-x-1">
                                                    <Globe className="h-4 w-4 text-gray-400" />
                                                    <span className="text-sm text-gray-600">
                                                        {parseFloat(location.latitude).toFixed(4)}, {parseFloat(location.longitude).toFixed(4)}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-sm text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex items-center justify-end space-x-2">
                                                <button
                                                    onClick={() => handleEdit(location)}
                                                    className="text-blue-600 hover:text-blue-800"
                                                    title={t('common.edit', 'Edit')}
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(location)}
                                                    className="text-red-600 hover:text-red-800"
                                                    title={t('common.delete', 'Delete')}
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
                )}
            </div>
        </div>
    );
}

export default DeviceLocationsManager;