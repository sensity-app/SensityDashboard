import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';
import { Clock, Plus, Edit, Trash2, Volume, VolumeX, Save, X } from 'lucide-react';
import { apiService } from '../services/api';
import { useTranslation } from 'react-i18next';

function SilentModeManager() {
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    const [selectedDevice, setSelectedDevice] = useState('');
    const [selectedLocation, setSelectedLocation] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        startTime: '22:00',
        endTime: '08:00',
        daysOfWeek: [],
        deviceId: '',
        locationId: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        alertTypes: [],
        severityThreshold: null,
        enabled: true
    });

    // Fetch devices and locations for selectors
    const { data: devices = [] } = useQuery('devices', apiService.getDevices);
    const { data: locations = [] } = useQuery('locations', apiService.getLocations);

    // Fetch silent mode schedules
    const { data: schedules = [], isLoading, refetch } = useQuery(
        ['silentModeSchedules', selectedDevice, selectedLocation],
        () => apiService.getSilentModeSchedules(selectedDevice || null, selectedLocation || null),
        {
            enabled: !!selectedDevice || !!selectedLocation || (!selectedDevice && !selectedLocation)
        }
    );

    // Mutations
    const createMutation = useMutation(apiService.createSilentModeSchedule, {
        onSuccess: () => {
        toast.success(t('silentMode.toasts.created'));
            queryClient.invalidateQueries('silentModeSchedules');
            resetForm();
        },
        onError: (error) => {
            toast.error('Failed to create silent mode schedule');
            console.error(error);
        }
    });

    const updateMutation = useMutation(
        ({ id, data }) => apiService.updateSilentModeSchedule(id, data),
        {
            onSuccess: () => {
            toast.success(t('silentMode.toasts.updated'));
                queryClient.invalidateQueries('silentModeSchedules');
                resetForm();
            },
            onError: (error) => {
                toast.error('Failed to update silent mode schedule');
                console.error(error);
            }
        }
    );

    const deleteMutation = useMutation(apiService.deleteSilentModeSchedule, {
        onSuccess: () => {
        toast.success(t('silentMode.toasts.deleted'));
            queryClient.invalidateQueries('silentModeSchedules');
        },
        onError: (error) => {
            toast.error('Failed to delete silent mode schedule');
            console.error(error);
        }
    });

    const resetForm = () => {
        setFormData({
            name: '',
            startTime: '22:00',
            endTime: '08:00',
            daysOfWeek: [],
            deviceId: '',
            locationId: '',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            alertTypes: [],
            severityThreshold: null,
            enabled: true
        });
        setShowForm(false);
        setEditingSchedule(null);
    };

    const handleEdit = (schedule) => {
        setFormData({
            name: schedule.name,
            startTime: schedule.start_time,
            endTime: schedule.end_time,
            daysOfWeek: schedule.days_of_week,
            deviceId: schedule.device_id || '',
            locationId: schedule.location_id || '',
            timezone: schedule.timezone,
            alertTypes: schedule.alert_types || [],
            severityThreshold: schedule.severity_threshold,
            enabled: schedule.enabled
        });
        setEditingSchedule(schedule);
        setShowForm(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            toast.error(t('silentMode.errors.nameRequired'));
            return;
        }

        if (formData.daysOfWeek.length === 0) {
            toast.error(t('silentMode.errors.daysRequired'));
            return;
        }

        if (!formData.deviceId && !formData.locationId) {
            toast.error(t('silentMode.errors.scopeRequired'));
            return;
        }

        const submitData = {
            ...formData,
            deviceId: formData.deviceId || null,
            locationId: formData.locationId ? parseInt(formData.locationId) : null,
            alertTypes: formData.alertTypes.length > 0 ? formData.alertTypes : null
        };

        if (editingSchedule) {
            updateMutation.mutate({ id: editingSchedule.id, data: submitData });
        } else {
            createMutation.mutate(submitData);
        }
    };

    const handleDelete = (schedule) => {
        if (window.confirm(t('silentMode.confirmDelete', { name: schedule.name }))) {
            deleteMutation.mutate(schedule.id);
        }
    };

    const toggleDay = (day) => {
        setFormData(prev => ({
            ...prev,
            daysOfWeek: prev.daysOfWeek.includes(day)
                ? prev.daysOfWeek.filter(d => d !== day)
                : [...prev.daysOfWeek, day]
        }));
    };

    const daysOfWeek = useMemo(() => ([
        { value: 0, label: t('common.days.short.sun') },
        { value: 1, label: t('common.days.short.mon') },
        { value: 2, label: t('common.days.short.tue') },
        { value: 3, label: t('common.days.short.wed') },
        { value: 4, label: t('common.days.short.thu') },
        { value: 5, label: t('common.days.short.fri') },
        { value: 6, label: t('common.days.short.sat') }
    ]), [t]);

    const alertTypes = ['sensor_threshold', 'device_offline', 'low_battery', 'connection_lost'];
    const severityLevels = ['low', 'medium', 'high', 'critical'];

    const formatTimeRange = (start, end) => {
        const startTime = new Date(`2000-01-01T${start}:00`);
        const endTime = new Date(`2000-01-01T${end}:00`);

        const formatTime = (time) => time.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        return `${formatTime(startTime)} - ${formatTime(endTime)}`;
    };

    const formatDays = (days) => {
        if (!Array.isArray(days) || days.length === 0) return t('silentMode.schedule.noDays');
        if (days.length === 7) return t('silentMode.schedule.everyDay');
        if (days.length === 5 && !days.includes(0) && !days.includes(6)) return t('silentMode.schedule.weekdays');
        if (days.length === 2 && days.includes(0) && days.includes(6)) return t('silentMode.schedule.weekends');

        return days.map(day => daysOfWeek.find(d => d.value === day)?.label).join(', ');
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">{t('silentMode.title')}</h2>
                    <p className="text-gray-600">{t('silentMode.subtitle')}</p>
                </div>
                <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                    <Plus className="h-4 w-4" />
                    <span>{t('silentMode.addSchedule')}</span>
                </button>
            </div>

            {/* Filters */}
            <div className="flex space-x-4">
                <select
                    value={selectedDevice}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                    <option value="">{t('silentMode.filters.allDevices')}</option>
                    {Array.isArray(devices) && devices.map(device => (
                        <option key={device.id} value={device.id}>{device.name}</option>
                    ))}
                </select>
                <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                    <option value="">{t('silentMode.filters.allLocations')}</option>
                    {Array.isArray(locations) && locations.map(location => (
                        <option key={location.id} value={location.id}>{location.name}</option>
                    ))}
                </select>
            </div>

            {/* Schedules List */}
            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            ) : schedules.length === 0 ? (
                <div className="text-center py-8">
                    <VolumeX className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">{t('silentMode.empty.title')}</h3>
                    <p className="mt-1 text-sm text-gray-500">{t('silentMode.empty.subtitle')}</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {Array.isArray(schedules) && schedules.map(schedule => (
                        <div key={schedule.id} className="bg-white border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center space-x-3">
                                        {schedule.enabled ? (
                                            <VolumeX className="h-5 w-5 text-red-500" />
                                        ) : (
                                            <Volume className="h-5 w-5 text-gray-400" />
                                        )}
                                        <div>
                                            <h3 className="font-medium text-gray-900">{schedule.name}</h3>
                                            <div className="text-sm text-gray-500 space-y-1">
                                                <div className="flex items-center space-x-4">
                                                    <span className="flex items-center">
                                                        <Clock className="h-4 w-4 mr-1" />
                                                        {formatTimeRange(schedule.start_time, schedule.end_time)}
                                                    </span>
                                                    <span>{formatDays(schedule.days_of_week)}</span>
                                                </div>
                                                {schedule.device_name && (
                                                    <span className="text-blue-600">{t('silentMode.badges.device', { name: schedule.device_name })}</span>
                                                )}
                                                {schedule.location_name && (
                                                    <span className="text-green-600">{t('silentMode.badges.location', { name: schedule.location_name })}</span>
                                                )}
                                                {schedule.severity_threshold && (
                                                    <span className="text-orange-600">
                                                        {t('silentMode.badges.severityThreshold', { level: schedule.severity_threshold })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        schedule.enabled
                                            ? 'bg-red-100 text-red-800'
                                            : 'bg-gray-100 text-gray-800'
                                    }`}>
                                        {schedule.enabled ? t('silentMode.status.active') : t('silentMode.status.inactive')}
                                    </span>
                                    <button
                                        onClick={() => handleEdit(schedule)}
                                        className="p-1 text-gray-400 hover:text-blue-600"
                                    >
                                        <Edit className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(schedule)}
                                        className="p-1 text-gray-400 hover:text-red-600"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create/Edit Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-screen overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-medium">
                                {editingSchedule ? t('silentMode.modal.editTitle') : t('silentMode.modal.createTitle')}
                            </h3>
                            <button
                                onClick={resetForm}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {t('silentMode.form.nameLabel')}
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                                    placeholder={t('silentMode.form.namePlaceholder')}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        {t('silentMode.form.startTime')}
                                    </label>
                                    <input
                                        type="time"
                                        value={formData.startTime}
                                        onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        {t('silentMode.form.endTime')}
                                    </label>
                                    <input
                                        type="time"
                                        value={formData.endTime}
                                        onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('silentMode.form.daysLabel')}
                                </label>
                                <div className="flex space-x-1">
                                    {daysOfWeek.map(day => (
                                        <button
                                            key={day.value}
                                            type="button"
                                            onClick={() => toggleDay(day.value)}
                                            className={`px-3 py-2 text-sm font-medium rounded-md ${
                                                formData.daysOfWeek.includes(day.value)
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                        >
                                            {day.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        {t('silentMode.form.deviceLabel')}
                                    </label>
                                    <select
                                        value={formData.deviceId}
                                        onChange={(e) => setFormData(prev => ({ ...prev, deviceId: e.target.value }))}
                                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                                    >
                                        <option value="">{t('silentMode.form.devicePlaceholder')}</option>
                                        {Array.isArray(devices) && devices.map(device => (
                                            <option key={device.id} value={device.id}>{device.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        {t('silentMode.form.locationLabel')}
                                    </label>
                                    <select
                                        value={formData.locationId}
                                        onChange={(e) => setFormData(prev => ({ ...prev, locationId: e.target.value }))}
                                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                                    >
                                        <option value="">{t('silentMode.form.locationPlaceholder')}</option>
                                        {Array.isArray(locations) && locations.map(location => (
                                            <option key={location.id} value={location.id}>{location.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {t('silentMode.form.severityLabel')}
                                </label>
                                <select
                                    value={formData.severityThreshold || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, severityThreshold: e.target.value || null }))}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                                >
                                    <option value="">{t('silentMode.form.allSeverities')}</option>
                                    {Array.isArray(severityLevels) && severityLevels.map(level => (
                                        <option key={level} value={level}>
                                            {t('silentMode.form.silenceLevel', { level: t(`silentMode.severityLevels.${level}`) })}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="enabled"
                                    checked={formData.enabled}
                                    onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                />
                                <label htmlFor="enabled" className="ml-2 text-sm text-gray-700">
                                    {t('silentMode.form.enabledLabel')}
                                </label>
                            </div>

                            <div className="flex justify-end space-x-3 pt-4">
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={createMutation.isLoading || updateMutation.isLoading}
                                    className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                                >
                                    <Save className="h-4 w-4" />
                                    <span>
                                        {editingSchedule ? t('silentMode.form.updateAction') : t('silentMode.form.createAction')}
                                    </span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default SilentModeManager;
