import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { apiService } from '../services/api';

const DeviceTagsManager = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingTag, setEditingTag] = useState(null);
    const [selectedDevices, setSelectedDevices] = useState([]);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedTag, setSelectedTag] = useState(null);

    // Fetch device tags - NO auto-refresh
    const { data: tagsData, isLoading: tagsLoading, error: tagsError } = useQuery(
        'device-tags',
        apiService.getDeviceTags,
        {
            refetchOnWindowFocus: false, // Disable auto-refresh
            onError: (error) => {
                console.error('Error loading device tags:', error);
            }
        }
    );

    const tags = Array.isArray(tagsData?.tags) ? tagsData.tags : [];

    // Fetch devices for assignment
    const { data: devices = [], isLoading: devicesLoading } = useQuery(
        'devices',
        apiService.getDevices
    );

    // Create tag mutation
    const createTagMutation = useMutation(
        apiService.createDeviceTag,
        {
            onSuccess: () => {
                queryClient.invalidateQueries('device-tags');
                setShowAddForm(false);
                resetForm();
            },
            onError: (error) => {
                console.error('Error creating tag:', error);
                alert(t('deviceTags.createError'));
            }
        }
    );

    // Update tag mutation
    const updateTagMutation = useMutation(
        ({ tagId, tagData }) => apiService.updateDeviceTag(tagId, tagData),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('device-tags');
                setEditingTag(null);
                resetForm();
            },
            onError: (error) => {
                console.error('Error updating tag:', error);
                alert(t('deviceTags.updateError'));
            }
        }
    );

    // Delete tag mutation
    const deleteTagMutation = useMutation(
        apiService.deleteDeviceTag,
        {
            onSuccess: () => {
                queryClient.invalidateQueries('device-tags');
            },
            onError: (error) => {
                console.error('Error deleting tag:', error);
                alert(t('deviceTags.deleteError'));
            }
        }
    );

    // Assign tag to device mutation
    const assignTagMutation = useMutation(
        ({ tagId, deviceId }) => apiService.assignTagToDevice(tagId, deviceId),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('device-tags');
                queryClient.invalidateQueries('devices');
            },
            onError: (error) => {
                console.error('Error assigning tag:', error);
                alert(t('deviceTags.assignError'));
            }
        }
    );

    // Unassign tag from device mutation
    const unassignTagMutation = useMutation(
        ({ tagId, deviceId }) => apiService.unassignTagFromDevice(tagId, deviceId),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('device-tags');
                queryClient.invalidateQueries('devices');
            },
            onError: (error) => {
                console.error('Error unassigning tag:', error);
                alert(t('deviceTags.unassignError'));
            }
        }
    );

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        color: '#3B82F6'
    });

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            color: '#3B82F6'
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            alert(t('deviceTags.nameRequired'));
            return;
        }

        if (editingTag) {
            updateTagMutation.mutate({
                tagId: editingTag.id,
                tagData: formData
            });
        } else {
            createTagMutation.mutate(formData);
        }
    };

    const handleEdit = (tag) => {
        setEditingTag(tag);
        setFormData({
            name: tag.name,
            description: tag.description || '',
            color: tag.color || '#3B82F6'
        });
        setShowAddForm(true);
    };

    const handleDelete = (tagId) => {
        if (window.confirm(t('deviceTags.deleteConfirm'))) {
            deleteTagMutation.mutate(tagId);
        }
    };

    const handleAssignTag = () => {
        if (!selectedTag || selectedDevices.length === 0) return;

        selectedDevices.forEach(deviceId => {
            assignTagMutation.mutate({
                tagId: selectedTag.id,
                deviceId: deviceId
            });
        });

        setShowAssignModal(false);
        setSelectedDevices([]);
        setSelectedTag(null);
    };

    const handleUnassignTag = (tagId, deviceId) => {
        if (window.confirm(t('deviceTags.unassignConfirm'))) {
            unassignTagMutation.mutate({ tagId, deviceId });
        }
    };

    if (tagsLoading) {
        return (
            <div className="flex justify-center items-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2">{t('common.loading')}</span>
            </div>
        );
    }

    if (tagsError) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <div className="text-red-800">
                    <strong>{t('common.error')}</strong>
                    <p>{t('deviceTags.loadError')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{t('deviceTags.title')}</h1>
                    <p className="text-gray-600 mt-1">{t('deviceTags.subtitle')}</p>
                </div>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center space-x-2"
                >
                    <span>+</span>
                    <span>{t('deviceTags.addTag')}</span>
                </button>
            </div>

            {/* Add/Edit Form */}
            {showAddForm && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold mb-4">
                        {editingTag ? t('deviceTags.editTag') : t('deviceTags.addTag')}
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('deviceTags.tagName')} *
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder={t('deviceTags.tagNamePlaceholder')}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('deviceTags.tagColor')}
                                </label>
                                <input
                                    type="color"
                                    value={formData.color}
                                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                    className="w-full h-10 border border-gray-300 rounded-md"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('deviceTags.tagDescription')}
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows="3"
                                placeholder={t('deviceTags.tagDescriptionPlaceholder')}
                            />
                        </div>
                        <div className="flex space-x-3">
                            <button
                                type="submit"
                                disabled={createTagMutation.isLoading || updateTagMutation.isLoading}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md disabled:opacity-50"
                            >
                                {editingTag ? t('common.update') : t('common.create')}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAddForm(false);
                                    setEditingTag(null);
                                    resetForm();
                                }}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md"
                            >
                                {t('common.cancel')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Tags List */}
            <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold">{t('deviceTags.existingTags')}</h2>
                </div>
                {tags.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">
                        <p>{t('deviceTags.noTags')}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200">
                        {(tags || []).map((tag) => (
                            <div key={tag.id} className="p-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <div
                                            className="w-4 h-4 rounded-full"
                                            style={{ backgroundColor: tag.color }}
                                        ></div>
                                        <div>
                                            <h3 className="font-semibold text-gray-900">{tag.name}</h3>
                                            {tag.description && (
                                                <p className="text-sm text-gray-600">{tag.description}</p>
                                            )}
                                            <p className="text-xs text-gray-500 mt-1">
                                                {t('deviceTags.deviceCount', { count: tag.device_count || 0 })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <button
                                            onClick={() => {
                                                setSelectedTag(tag);
                                                setShowAssignModal(true);
                                            }}
                                            className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1 rounded-md text-sm"
                                        >
                                            {t('deviceTags.assign')}
                                        </button>
                                        <button
                                            onClick={() => handleEdit(tag)}
                                            className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded-md text-sm"
                                        >
                                            {t('common.edit')}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(tag.id)}
                                            className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded-md text-sm"
                                        >
                                            {t('common.delete')}
                                        </button>
                                    </div>
                                </div>
                                {/* Show assigned devices */}
                                {tag.devices && tag.devices.length > 0 && (
                                    <div className="mt-3">
                                        <p className="text-sm font-medium text-gray-700 mb-2">
                                            {t('deviceTags.assignedDevices')}:
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {(tag.devices || []).map((device) => (
                                                <div
                                                    key={device.id}
                                                    className="bg-gray-100 px-2 py-1 rounded-md text-sm flex items-center space-x-1"
                                                >
                                                    <span>{device.name}</span>
                                                    <button
                                                        onClick={() => handleUnassignTag(tag.id, device.id)}
                                                        className="text-red-600 hover:text-red-800"
                                                        title={t('deviceTags.unassign')}
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Assign Tag Modal */}
            {showAssignModal && selectedTag && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-lg font-semibold mb-4">
                            {t('deviceTags.assignTagToDevices', { tagName: selectedTag.name })}
                        </h2>
                        {devicesLoading ? (
                            <div className="text-center py-4">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {(devices || []).map((device) => (
                                    <label key={device.id} className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedDevices.includes(device.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedDevices([...selectedDevices, device.id]);
                                                } else {
                                                    setSelectedDevices(selectedDevices.filter(id => id !== device.id));
                                                }
                                            }}
                                            className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                                        />
                                        <span>{device.name}</span>
                                        <span className="text-sm text-gray-500">({device.device_type})</span>
                                    </label>
                                ))}
                            </div>
                        )}
                        <div className="flex justify-end space-x-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowAssignModal(false);
                                    setSelectedDevices([]);
                                    setSelectedTag(null);
                                }}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleAssignTag}
                                disabled={selectedDevices.length === 0 || assignTagMutation.isLoading}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md disabled:opacity-50"
                            >
                                {t('deviceTags.assignSelected', { count: selectedDevices.length })}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeviceTagsManager;