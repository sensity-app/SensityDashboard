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
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-6 space-y-6">
                <div className="flex flex-col items-center justify-center p-16 space-y-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
                    <p className="text-gray-500">{t('common.loading', 'Loading groups...')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-6 space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <FolderPlus className="h-8 w-8 text-indigo-600" />
                        {t('deviceGroups.title', 'Device Groups')}
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        {t('deviceGroups.subtitle', 'Organize and manage your device groups')}
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateForm(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:from-indigo-700 hover:to-indigo-800 transition-all duration-200 hover:scale-105"
                >
                    <Plus className="h-5 w-5" />
                    {t('deviceGroups.createGroup', 'Create Group')}
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 shadow-lg">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-indigo-100">{t('deviceGroups.totalGroups', 'Total Groups')}</p>
                            <p className="mt-2 text-3xl font-bold text-white">{groups.groups?.length || 0}</p>
                        </div>
                        <Folder className="h-12 w-12 text-indigo-200 opacity-80" />
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-green-500 to-green-600 p-6 shadow-lg">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-green-100">{t('deviceGroups.totalDevices', 'Total Devices')}</p>
                            <p className="mt-2 text-3xl font-bold text-white">
                                {groups.groups?.reduce((sum, g) => sum + (g.device_count || 0), 0) || 0}
                            </p>
                        </div>
                        <Monitor className="h-12 w-12 text-green-200 opacity-80" />
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 p-6 shadow-lg">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-purple-100">{t('deviceGroups.avgDevicesPerGroup', 'Avg per Group')}</p>
                            <p className="mt-2 text-3xl font-bold text-white">
                                {groups.groups?.length > 0
                                    ? Math.round(groups.groups.reduce((sum, g) => sum + (g.device_count || 0), 0) / groups.groups.length)
                                    : 0}
                            </p>
                        </div>
                        <Users className="h-12 w-12 text-purple-200 opacity-80" />
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Groups List */}
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        {t('deviceGroups.allGroups', 'All Groups')}
                    </h3>

                    {groups.groups?.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-lg">
                            <Folder className="mx-auto h-16 w-16 text-gray-300" />
                            <h4 className="mt-4 text-lg font-semibold text-gray-700">
                                {t('deviceGroups.noGroups', 'No groups yet')}
                            </h4>
                            <p className="mt-2 text-sm text-gray-500">
                                {t('deviceGroups.createFirstGroup', 'Create your first device group to organize your devices.')}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[600px] overflow-y-auto">
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

                {/* Group Details */}
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
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
                        <div className="flex flex-col items-center justify-center text-center py-16">
                            <Users className="h-16 w-16 text-gray-300 mb-4" />
                            <h4 className="text-lg font-semibold text-gray-700">
                                {t('deviceGroups.selectGroup', 'Select a group')}
                            </h4>
                            <p className="mt-2 text-sm text-gray-500">
                                {t('deviceGroups.selectGroupDescription', 'Choose a group from the left to view and manage its devices.')}
                            </p>
                        </div>
                    )}
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
            className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                isSelected
                    ? 'border-indigo-500 bg-indigo-50 shadow-md scale-[1.02]'
                    : 'border-gray-200 hover:border-indigo-300 bg-white hover:shadow-lg hover:scale-[1.01]'
            }`}
            onClick={() => onSelect(group)}
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                    <div
                        className="w-6 h-6 rounded-lg shadow-sm"
                        style={{ backgroundColor: group.color }}
                    ></div>
                    <h4 className="font-semibold text-gray-900">{group.name}</h4>
                </div>
                <div className="flex items-center space-x-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit();
                        }}
                        className="p-2 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                        <Edit className="h-4 w-4" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        className="p-2 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {group.description && (
                <p className="text-sm text-gray-600 mb-3">{group.description}</p>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="flex items-center gap-1.5">
                    <Monitor className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">
                        {group.device_count} {t('deviceGroups.devices', 'devices')}
                    </span>
                </div>
                {group.created_by_email && (
                    <span className="text-xs text-gray-500 truncate max-w-[150px]">
                        {group.created_by_email}
                    </span>
                )}
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
            <div className="flex flex-col items-center justify-center p-16 space-y-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
                <p className="text-gray-500">{t('common.loading', 'Loading...')}</p>
            </div>
        );
    }

    const devices = groupDetails?.group?.devices || [];

    return (
        <div className="space-y-6 max-h-[600px] overflow-y-auto">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <div
                        className="w-8 h-8 rounded-lg shadow-sm"
                        style={{ backgroundColor: group.color }}
                    ></div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">{group.name}</h3>
                        {group.description && (
                            <p className="text-sm text-gray-600 mt-1">{group.description}</p>
                        )}
                    </div>
                </div>
                <button
                    onClick={onAddDevice}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-green-600 to-green-700 px-3 py-2 text-sm font-semibold text-white shadow-md hover:from-green-700 hover:to-green-800 transition-all duration-200 hover:scale-105"
                >
                    <Plus className="h-4 w-4" />
                    {t('deviceGroups.addDevice', 'Add Device')}
                </button>
            </div>

            <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-gray-500" />
                    {t('deviceGroups.devicesInGroup', 'Devices in Group')} ({devices.length})
                </h4>

                {devices.length === 0 ? (
                    <div className="text-center py-12 bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl">
                        <Monitor className="mx-auto h-16 w-16 text-gray-300" />
                        <p className="mt-4 text-sm font-medium text-gray-700">
                            {t('deviceGroups.noDevicesInGroup', 'No devices in this group yet.')}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                            {t('deviceGroups.clickAddDevice', 'Click "Add Device" to get started')}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {(devices || []).map((device) => (
                            <div
                                key={device.id}
                                className="flex items-center justify-between p-4 bg-gradient-to-br from-white to-gray-50 rounded-xl border border-gray-200 hover:shadow-md transition-all duration-200"
                            >
                                <div className="flex items-center space-x-3">
                                    <div className={`w-3 h-3 rounded-full shadow-sm ${
                                        device.current_status === 'online' ? 'bg-green-500' :
                                        device.current_status === 'alarm' ? 'bg-red-500' : 'bg-gray-400'
                                    }`}></div>
                                    <div>
                                        <h5 className="font-semibold text-gray-900">{device.name}</h5>
                                        <p className="text-xs text-gray-500 font-mono">
                                            {device.id}
                                        </p>
                                        {device.location_name && (
                                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                                <Monitor className="h-3 w-3" />
                                                {device.location_name}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className={`px-3 py-1 text-xs font-semibold rounded-full shadow-sm ${
                                        device.current_status === 'online' ? 'bg-gradient-to-r from-green-500 to-green-600 text-white' :
                                        device.current_status === 'alarm' ? 'bg-gradient-to-r from-red-500 to-red-600 text-white' :
                                        'bg-gradient-to-r from-gray-400 to-gray-500 text-white'
                                    }`}>
                                        {device.current_status?.toUpperCase() || 'UNKNOWN'}
                                    </span>

                                    <button
                                        onClick={() => onRemoveDevice(device.id)}
                                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 transform transition-all">
                <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-blue-50">
                    <h3 className="text-xl font-semibold text-gray-900">
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

                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 mt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                        >
                            {t('common.cancel', 'Cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-lg hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-50 transition-all shadow-md font-medium"
                        >
                            {isLoading ? (
                                <span className="flex items-center gap-2">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                    {t('common.saving', 'Saving...')}
                                </span>
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
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 transform transition-all">
                <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50">
                    <h3 className="text-xl font-semibold text-gray-900">
                        {t('deviceGroups.addDeviceToGroup', 'Add Device to Group')}
                    </h3>
                    <div className="flex items-center gap-2 mt-2">
                        <div
                            className="w-4 h-4 rounded shadow-sm"
                            style={{ backgroundColor: group.color }}
                        ></div>
                        <p className="text-sm text-gray-600 font-medium">
                            {group.name}
                        </p>
                    </div>
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

                    <div className="flex justify-end space-x-3 border-t border-gray-200 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                        >
                            {t('common.cancel', 'Cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !selectedDeviceId || availableDevices.length === 0}
                            className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 disabled:opacity-50 transition-all shadow-md font-medium"
                        >
                            {isLoading ? (
                                <span className="flex items-center gap-2">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                    {t('common.adding', 'Adding...')}
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <Plus className="h-4 w-4" />
                                    {t('deviceGroups.addDevice', 'Add Device')}
                                </span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default DeviceGroupsManager;