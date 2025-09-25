import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import {
    FolderPlus,
    Edit,
    Trash2,
    Plus,
    Users,
    X,
    Check,
    Folder,
    Monitor
} from 'lucide-react';
import toast from 'react-hot-toast';

import { apiService } from '../services/api';

function DeviceGroupsManager({ onClose }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [showEditForm, setShowEditForm] = useState(null);
    const [showAddDeviceForm, setShowAddDeviceForm] = useState(null);

    // Get all device groups
    const { data: groups = [], isLoading: groupsLoading } = useQuery(
        'device-groups',
        () => apiService.getDeviceGroups()
    );

    // Get all devices for adding to groups
    const { data: devicesData } = useQuery(
        'devices',
        () => apiService.getDevices()
    );

    const devices = devicesData?.devices || [];

    // Create group mutation
    const createGroupMutation = useMutation(
        (groupData) => apiService.createDeviceGroup(groupData),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('device-groups');
                setShowCreateForm(false);
                toast.success(t('deviceGroups.created', 'Device group created successfully'));
            },
            onError: (error) => {
                toast.error(error.response?.data?.error || t('deviceGroups.createError', 'Failed to create device group'));
            }
        }
    );

    // Update group mutation
    const updateGroupMutation = useMutation(
        ({ groupId, ...groupData }) => apiService.updateDeviceGroup(groupId, groupData),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('device-groups');
                setShowEditForm(null);
                toast.success(t('deviceGroups.updated', 'Device group updated successfully'));
            },
            onError: (error) => {
                toast.error(error.response?.data?.error || t('deviceGroups.updateError', 'Failed to update device group'));
            }
        }
    );

    // Delete group mutation
    const deleteGroupMutation = useMutation(
        (groupId) => apiService.deleteDeviceGroup(groupId),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('device-groups');
                setSelectedGroup(null);
                toast.success(t('deviceGroups.deleted', 'Device group deleted successfully'));
            },
            onError: (error) => {
                toast.error(error.response?.data?.error || t('deviceGroups.deleteError', 'Failed to delete device group'));
            }
        }
    );

    // Add device to group mutation
    const addDeviceMutation = useMutation(
        ({ groupId, deviceId }) => apiService.addDeviceToGroup(groupId, deviceId),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('device-groups');
                if (selectedGroup) {
                    queryClient.invalidateQueries(['device-group', selectedGroup.id]);
                }
                toast.success(t('deviceGroups.deviceAdded', 'Device added to group'));
            },
            onError: (error) => {
                toast.error(error.response?.data?.error || t('deviceGroups.addDeviceError', 'Failed to add device to group'));
            }
        }
    );

    // Remove device from group mutation
    const removeDeviceMutation = useMutation(
        ({ groupId, deviceId }) => apiService.removeDeviceFromGroup(groupId, deviceId),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('device-groups');
                if (selectedGroup) {
                    queryClient.invalidateQueries(['device-group', selectedGroup.id]);
                }
                toast.success(t('deviceGroups.deviceRemoved', 'Device removed from group'));
            },
            onError: (error) => {
                toast.error(error.response?.data?.error || t('deviceGroups.removeDeviceError', 'Failed to remove device from group'));
            }
        }
    );

    const handleDeleteGroup = (group) => {
        if (window.confirm(t('deviceGroups.confirmDelete', 'Are you sure you want to delete this group? This will not delete the devices.'))) {
            deleteGroupMutation.mutate(group.id);
        }
    };

    if (groupsLoading) {
        return (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center">
                <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh]">
                    <div className="p-6">
                        <div className="animate-pulse space-y-4">
                            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="h-32 bg-gray-200 rounded"></div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <FolderPlus className="h-6 w-6 text-blue-600" />
                        <h2 className="text-xl font-semibold text-gray-900">
                            {t('deviceGroups.title', 'Device Groups Management')}
                        </h2>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => setShowCreateForm(true)}
                            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center text-sm"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            {t('deviceGroups.createGroup', 'Create Group')}
                        </button>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600"
                        >
                            <X className="h-6 w-6" />
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Groups List */}
                    <div className="w-1/2 border-r border-gray-200 overflow-y-auto">
                        <div className="p-4">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">
                                {t('deviceGroups.allGroups', 'All Groups')} ({groups.groups?.length || 0})
                            </h3>

                            {groups.groups?.length === 0 ? (
                                <div className="text-center py-8">
                                    <Folder className="mx-auto h-12 w-12 text-gray-400" />
                                    <h4 className="mt-2 text-sm font-medium text-gray-900">
                                        {t('deviceGroups.noGroups', 'No groups yet')}
                                    </h4>
                                    <p className="mt-1 text-sm text-gray-500">
                                        {t('deviceGroups.createFirstGroup', 'Create your first device group to organize your devices.')}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {(groups.groups || []).map((group) => (
                                        <GroupCard
                                            key={group.id}
                                            group={group}
                                            isSelected={selectedGroup?.id === group.id}
                                            onSelect={setSelectedGroup}
                                            onEdit={() => setShowEditForm(group)}
                                            onDelete={() => handleDeleteGroup(group)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Group Details */}
                    <div className="w-1/2 overflow-y-auto">
                        {selectedGroup ? (
                            <GroupDetails
                                group={selectedGroup}
                                onAddDevice={() => setShowAddDeviceForm(selectedGroup)}
                                onRemoveDevice={(deviceId) => removeDeviceMutation.mutate({
                                    groupId: selectedGroup.id,
                                    deviceId
                                })}
                            />
                        ) : (
                            <div className="p-8 text-center">
                                <Users className="mx-auto h-12 w-12 text-gray-400" />
                                <h4 className="mt-2 text-sm font-medium text-gray-900">
                                    {t('deviceGroups.selectGroup', 'Select a group')}
                                </h4>
                                <p className="mt-1 text-sm text-gray-500">
                                    {t('deviceGroups.selectGroupDescription', 'Choose a group from the left to view and manage its devices.')}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Create Group Form */}
            {showCreateForm && (
                <GroupForm
                    onSubmit={(data) => createGroupMutation.mutate(data)}
                    onClose={() => setShowCreateForm(false)}
                    isLoading={createGroupMutation.isLoading}
                />
            )}

            {/* Edit Group Form */}
            {showEditForm && (
                <GroupForm
                    group={showEditForm}
                    onSubmit={(data) => updateGroupMutation.mutate({ groupId: showEditForm.id, ...data })}
                    onClose={() => setShowEditForm(null)}
                    isLoading={updateGroupMutation.isLoading}
                />
            )}

            {/* Add Device Form */}
            {showAddDeviceForm && (
                <AddDeviceToGroupForm
                    group={showAddDeviceForm}
                    devices={devices}
                    onSubmit={(deviceId) => {
                        addDeviceMutation.mutate({
                            groupId: showAddDeviceForm.id,
                            deviceId
                        });
                        setShowAddDeviceForm(null);
                    }}
                    onClose={() => setShowAddDeviceForm(null)}
                    isLoading={addDeviceMutation.isLoading}
                />
            )}
        </div>
    );
}

function GroupCard({ group, isSelected, onSelect, onEdit, onDelete }) {
    const { t } = useTranslation();

    return (
        <div
            className={`p-4 rounded-lg border cursor-pointer transition-all ${
                isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
            onClick={() => onSelect(group)}
        >
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                    <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: group.color }}
                    ></div>
                    <h4 className="font-medium text-gray-900">{group.name}</h4>
                </div>
                <div className="flex items-center space-x-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit();
                        }}
                        className="p-1 text-gray-400 hover:text-gray-600"
                    >
                        <Edit className="h-4 w-4" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        className="p-1 text-gray-400 hover:text-red-600"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {group.description && (
                <p className="text-sm text-gray-600 mb-2">{group.description}</p>
            )}

            <div className="flex items-center justify-between text-sm text-gray-500">
                <span>
                    {group.device_count} {t('deviceGroups.devices', 'devices')}
                </span>
                <span>
                    {t('common.createdBy', 'Created by')} {group.created_by_email || 'Unknown'}
                </span>
            </div>
        </div>
    );
}

function GroupDetails({ group, onAddDevice, onRemoveDevice }) {
    const { t } = useTranslation();

    // Get detailed group information
    const { data: groupDetails, isLoading } = useQuery(
        ['device-group', group.id],
        () => apiService.getDeviceGroup(group.id),
        { enabled: !!group.id }
    );

    if (isLoading) {
        return (
            <div className="p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-gray-200 rounded w-1/3"></div>
                    <div className="space-y-3">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="h-16 bg-gray-200 rounded"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const devices = groupDetails?.group?.devices || [];

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <div className="flex items-center space-x-3 mb-2">
                        <div
                            className="w-6 h-6 rounded"
                            style={{ backgroundColor: group.color }}
                        ></div>
                        <h3 className="text-lg font-medium text-gray-900">{group.name}</h3>
                    </div>
                    {group.description && (
                        <p className="text-gray-600">{group.description}</p>
                    )}
                </div>
                <button
                    onClick={onAddDevice}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 flex items-center"
                >
                    <Plus className="h-4 w-4 mr-1" />
                    {t('deviceGroups.addDevice', 'Add Device')}
                </button>
            </div>

            <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3">
                    {t('deviceGroups.devicesInGroup', 'Devices in Group')} ({devices.length})
                </h4>

                {devices.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg">
                        <Monitor className="mx-auto h-8 w-8 text-gray-400" />
                        <p className="mt-2 text-sm text-gray-500">
                            {t('deviceGroups.noDevicesInGroup', 'No devices in this group yet.')}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {(devices || []).map((device) => (
                            <div
                                key={device.id}
                                className="flex items-center justify-between p-3 bg-gray-50 rounded border"
                            >
                                <div className="flex items-center space-x-3">
                                    <div className={`w-3 h-3 rounded-full ${
                                        device.current_status === 'online' ? 'bg-green-500' :
                                        device.current_status === 'alarm' ? 'bg-red-500' : 'bg-gray-400'
                                    }`}></div>
                                    <div>
                                        <h5 className="font-medium text-gray-900">{device.name}</h5>
                                        <p className="text-sm text-gray-500">
                                            ID: {device.id} • {device.location_name || 'No location'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center space-x-2">
                                    <span className={`px-2 py-1 text-xs rounded-full ${
                                        device.current_status === 'online' ? 'bg-green-100 text-green-800' :
                                        device.current_status === 'alarm' ? 'bg-red-100 text-red-800' :
                                        'bg-gray-100 text-gray-800'
                                    }`}>
                                        {device.current_status?.toUpperCase()}
                                    </span>

                                    <button
                                        onClick={() => onRemoveDevice(device.id)}
                                        className="p-1 text-gray-400 hover:text-red-600"
                                        title={t('deviceGroups.removeFromGroup', 'Remove from group')}
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function GroupForm({ group, onSubmit, onClose, isLoading }) {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        name: group?.name || '',
        description: group?.description || '',
        color: group?.color || '#3B82F6'
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    const predefinedColors = [
        '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
        '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
    ];

    return (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">
                        {group ? t('deviceGroups.editGroup', 'Edit Group') : t('deviceGroups.createGroup', 'Create Group')}
                    </h3>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t('common.name', 'Name')}
                        </label>
                        <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={t('deviceGroups.namePlaceholder', 'Enter group name')}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t('common.description', 'Description')} ({t('common.optional', 'Optional')})
                        </label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={t('deviceGroups.descriptionPlaceholder', 'Enter group description')}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('common.color', 'Color')}
                        </label>
                        <div className="flex items-center space-x-2">
                            <div className="flex space-x-2">
                                {predefinedColors.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, color })}
                                        className={`w-8 h-8 rounded border-2 ${
                                            formData.color === color ? 'border-gray-800' : 'border-gray-300'
                                        }`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                            <input
                                type="color"
                                value={formData.color}
                                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                className="w-8 h-8 border border-gray-300 rounded cursor-pointer"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                        >
                            {t('common.cancel', 'Cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                            {isLoading ? (
                                t('common.saving', 'Saving...')
                            ) : group ? (
                                t('common.save', 'Save')
                            ) : (
                                t('common.create', 'Create')
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function AddDeviceToGroupForm({ group, devices, onSubmit, onClose, isLoading }) {
    const { t } = useTranslation();
    const [selectedDeviceId, setSelectedDeviceId] = useState('');

    // Filter out devices already in the group
    const { data: groupDetails } = useQuery(
        ['device-group', group.id],
        () => apiService.getDeviceGroup(group.id)
    );

    const existingDeviceIds = groupDetails?.group?.devices?.map(d => d.id) || [];
    const availableDevices = devices.filter(device => !existingDeviceIds.includes(device.id));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (selectedDeviceId) {
            onSubmit(selectedDeviceId);
        }
    };

    return (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">
                        {t('deviceGroups.addDeviceToGroup', 'Add Device to Group')}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                        {group.name}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('deviceGroups.selectDevice', 'Select Device')}
                        </label>

                        {availableDevices.length === 0 ? (
                            <div className="text-center py-4 text-gray-500">
                                <Monitor className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                                <p className="text-sm">
                                    {t('deviceGroups.noAvailableDevices', 'No devices available to add')}
                                </p>
                            </div>
                        ) : (
                            <select
                                value={selectedDeviceId}
                                onChange={(e) => setSelectedDeviceId(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            >
                                <option value="">
                                    {t('deviceGroups.chooseDevice', 'Choose a device...')}
                                </option>
                                {(availableDevices || []).map((device) => (
                                    <option key={device.id} value={device.id}>
                                        {device.name} ({device.id})
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div className="flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                        >
                            {t('common.cancel', 'Cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !selectedDeviceId || availableDevices.length === 0}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                            {isLoading ? (
                                t('common.adding', 'Adding...')
                            ) : (
                                t('deviceGroups.addDevice', 'Add Device')
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default DeviceGroupsManager;