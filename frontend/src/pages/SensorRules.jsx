import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2, Trash2, Copy, Filter, TrendingUp, AlertTriangle, Target } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';

function SensorRulesPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [filterScope, setFilterScope] = useState('all'); // all, device, location, group
    const [filterEntity, setFilterEntity] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [selectedSensorType, setSelectedSensorType] = useState('all');

    // Fetch all sensor rules with scope filter
    const { data: rulesData = [], isLoading, refetch } = useQuery(
        ['sensor-rules', filterScope, filterEntity, selectedSensorType],
        async () => {
            const response = await apiService.getAllSensorRules({
                scope: filterScope !== 'all' ? filterScope : undefined,
                entity_id: filterEntity,
                sensor_type: selectedSensorType !== 'all' ? selectedSensorType : undefined
            });
            return Array.isArray(response) ? response : (response?.rules || []);
        },
        { refetchOnWindowFocus: false }
    );

    // Fetch devices for filtering
    const { data: devices = [] } = useQuery('devices', apiService.getDevices);

    // Fetch locations for filtering
    const { data: locations = [] } = useQuery('locations', apiService.getLocations);

    // Fetch sensor types
    const { data: sensorTypes = [] } = useQuery('sensor-types', async () => {
        const response = await apiService.getSensorTypes();
        return Array.isArray(response) ? response : (response?.sensor_types || []);
    });

    // Delete mutation
    const deleteMutation = useMutation(
        ({ deviceId, sensorId, ruleId }) => apiService.deleteSensorRule(deviceId, sensorId, ruleId),
        {
            onSuccess: () => {
                toast.success(t('sensorRules.deleteSuccess', 'Rule deleted successfully'));
                refetch();
            },
            onError: (error) => {
                toast.error(t('sensorRules.deleteError', 'Failed to delete rule'));
            }
        }
    );

    const handleDelete = (rule) => {
        if (window.confirm(t('sensorRules.confirmDelete', 'Are you sure you want to delete this rule?'))) {
            deleteMutation.mutate({
                deviceId: rule.device_id,
                sensorId: rule.device_sensor_id,
                ruleId: rule.id
            });
        }
    };

    const getSeverityColor = (severity) => {
        const colors = {
            low: 'bg-blue-100 text-blue-800',
            medium: 'bg-yellow-100 text-yellow-800',
            high: 'bg-orange-100 text-orange-800',
            critical: 'bg-red-100 text-red-800'
        };
        return colors[severity] || colors.medium;
    };

    const getScopeIcon = (scope) => {
        switch (scope) {
            case 'device': return '📱';
            case 'location': return '📍';
            case 'group': return '👥';
            default: return '⚙️';
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">
                    {t('sensorRules.title', 'Sensor Rules')}
                </h1>
                <p className="text-gray-500 mt-1">
                    {t('sensorRules.subtitle', 'Manage threshold-based alert rules for sensors across devices, locations, and groups')}
                </p>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Filter className="inline h-4 w-4 mr-1" />
                            {t('sensorRules.filterScope', 'Scope')}
                        </label>
                        <select
                            value={filterScope}
                            onChange={(e) => {
                                setFilterScope(e.target.value);
                                setFilterEntity(null);
                            }}
                            className="w-full rounded-md border-gray-300"
                        >
                            <option value="all">{t('sensorRules.allScopes', 'All Scopes')}</option>
                            <option value="device">{t('sensorRules.deviceScope', 'Device Level')}</option>
                            <option value="location">{t('sensorRules.locationScope', 'Location Level')}</option>
                            <option value="group">{t('sensorRules.groupScope', 'Group Level')}</option>
                        </select>
                    </div>

                    {filterScope === 'device' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('sensorRules.selectDevice', 'Select Device')}
                            </label>
                            <select
                                value={filterEntity || ''}
                                onChange={(e) => setFilterEntity(e.target.value)}
                                className="w-full rounded-md border-gray-300"
                            >
                                <option value="">{t('common.all', 'All')}</option>
                                {devices.map(device => (
                                    <option key={device.id} value={device.id}>
                                        {device.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {filterScope === 'location' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('sensorRules.selectLocation', 'Select Location')}
                            </label>
                            <select
                                value={filterEntity || ''}
                                onChange={(e) => setFilterEntity(e.target.value)}
                                className="w-full rounded-md border-gray-300"
                            >
                                <option value="">{t('common.all', 'All')}</option>
                                {locations.map(location => (
                                    <option key={location.id} value={location.id}>
                                        {location.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('sensorRules.sensorType', 'Sensor Type')}
                        </label>
                        <select
                            value={selectedSensorType}
                            onChange={(e) => setSelectedSensorType(e.target.value)}
                            className="w-full rounded-md border-gray-300"
                        >
                            <option value="all">{t('common.all', 'All Types')}</option>
                            {sensorTypes.map(type => (
                                <option key={type.id} value={type.name}>
                                    {type.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-end">
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center justify-center gap-2"
                        >
                            <Plus className="h-5 w-5" />
                            {t('sensorRules.createRule', 'Create Rule')}
                        </button>
                    </div>
                </div>
            </div>

            {/* Rules List */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="p-8 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                        <p className="text-gray-500 mt-2">{t('common.loading', 'Loading...')}</p>
                    </div>
                ) : rulesData.length === 0 ? (
                    <div className="p-8 text-center">
                        <Target className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500">{t('sensorRules.noRules', 'No sensor rules found')}</p>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                        >
                            {t('sensorRules.createFirst', 'Create Your First Rule')}
                        </button>
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('sensorRules.scope', 'Scope')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('sensorRules.sensor', 'Sensor')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('sensorRules.thresholds', 'Thresholds')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('sensorRules.severity', 'Severity')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('sensorRules.status', 'Status')}
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('common.actions', 'Actions')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {rulesData.map((rule) => (
                                <tr key={rule.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <span className="text-xl mr-2">{getScopeIcon(rule.scope)}</span>
                                            <div>
                                                <div className="text-sm font-medium text-gray-900">
                                                    {rule.device_name || rule.location_name || rule.group_name}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {rule.scope || 'device'}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-medium text-gray-900">
                                            {rule.sensor_name}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {rule.sensor_type} • {rule.pin}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-900">
                                            <div className="flex items-center gap-2">
                                                <TrendingUp className="h-4 w-4 text-red-500" />
                                                <span>{t('sensorRules.thresholdMaxLabel')}: {rule.threshold_max}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <TrendingUp className="h-4 w-4 text-blue-500 transform rotate-180" />
                                                <span>{t('sensorRules.thresholdMinLabel')}: {rule.threshold_min}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getSeverityColor(rule.severity)}`}>
                                            {rule.severity}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${rule.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                            }`}>
                                            {rule.enabled ? t('common.enabled', 'Enabled') : t('common.disabled', 'Disabled')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => {
                                                setEditingRule(rule);
                                                setShowCreateModal(true);
                                            }}
                                            className="text-indigo-600 hover:text-indigo-900 mr-3"
                                            title={t('common.edit', 'Edit')}
                                        >
                                            <Edit2 className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(rule)}
                                            className="text-red-600 hover:text-red-900"
                                            title={t('common.delete', 'Delete')}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Create/Edit Modal */}
            {showCreateModal && (
                <CreateRuleModal
                    rule={editingRule}
                    devices={devices}
                    locations={locations}
                    sensorTypes={sensorTypes}
                    onClose={() => {
                        setShowCreateModal(false);
                        setEditingRule(null);
                    }}
                    onSuccess={() => {
                        setShowCreateModal(false);
                        setEditingRule(null);
                        refetch();
                    }}
                />
            )}
        </div>
    );
}

function CreateRuleModal({ rule, devices, locations, onClose, onSuccess }) {
    const { t } = useTranslation();
    const [scope, setScope] = useState(rule?.scope || 'device');
    const [selectedEntity, setSelectedEntity] = useState(rule?.device_id || rule?.location_id || '');
    const [selectedSensor, setSelectedSensor] = useState(rule?.device_sensor_id || '');
    const [thresholdMin, setThresholdMin] = useState(rule?.threshold_min || 0);
    const [thresholdMax, setThresholdMax] = useState(rule?.threshold_max || 1000);
    const [severity, setSeverity] = useState(rule?.severity || 'medium');
    const [enabled, setEnabled] = useState(rule?.enabled !== false);
    const [ruleName, setRuleName] = useState(rule?.rule_name || '');
    const [showRecommendations, setShowRecommendations] = useState(false);

    // Fetch sensors for selected entity
    const { data: sensors = [] } = useQuery(
        ['device-sensors', selectedEntity],
        () => selectedEntity && scope === 'device' ? apiService.getDeviceSensors(selectedEntity) : Promise.resolve([]),
        { enabled: !!selectedEntity && scope === 'device' }
    );

    // Fetch threshold recommendations
    const { data: recommendations, isLoading: loadingRecommendations, refetch: fetchRecommendations } = useQuery(
        ['threshold-suggestions', selectedEntity, selectedSensor],
        () => apiService.getThresholdSuggestions(selectedEntity, selectedSensor, { days: 30 }),
        { enabled: false } // Only fetch when user clicks
    );

    const saveMutation = useMutation(
        async (data) => {
            if (rule) {
                // Update existing rule
                return apiService.updateSensorRule(selectedEntity, selectedSensor, rule.id, data);
            } else {
                // Create new rule
                return apiService.createOrUpdateSensorRule(selectedEntity, selectedSensor, data);
            }
        },
        {
            onSuccess: () => {
                toast.success(t('sensorRules.saveSuccess', 'Rule saved successfully'));
                onSuccess();
            },
            onError: (error) => {
                toast.error(t('sensorRules.saveError', 'Failed to save rule'));
            }
        }
    );

    const handleSubmit = (e) => {
        e.preventDefault();
        saveMutation.mutate({
            threshold_min: parseFloat(thresholdMin),
            threshold_max: parseFloat(thresholdMax),
            severity,
            enabled,
            rule_name: ruleName || `${selectedSensor} Threshold`
        });
    };

    const handleLoadRecommendations = () => {
        setShowRecommendations(true);
        fetchRecommendations();
    };

    const handleApplyRecommendations = () => {
        if (recommendations?.suggested_min !== undefined) {
            setThresholdMin(recommendations.suggested_min.toFixed(2));
        }
        if (recommendations?.suggested_max !== undefined) {
            setThresholdMax(recommendations.suggested_max.toFixed(2));
        }
        toast.success(t('sensorRules.recommendationsApplied', 'Recommended thresholds applied'));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl">
                <div className="border-b border-gray-200 p-6">
                    <h3 className="text-xl font-semibold text-gray-900">
                        {rule ? t('sensorRules.editRule', 'Edit Rule') : t('sensorRules.createRule', 'Create Rule')}
                    </h3>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('sensorRules.scope', 'Scope')}
                            </label>
                            <select
                                value={scope}
                                onChange={(e) => {
                                    setScope(e.target.value);
                                    setSelectedEntity('');
                                    setSelectedSensor('');
                                }}
                                className="w-full rounded-md border-gray-300"
                                disabled={!!rule}
                            >
                                <option value="device">{t('sensorRules.deviceScope', 'Device')}</option>
                                <option value="location">{t('sensorRules.locationScope', 'Location')}</option>
                                <option value="group">{t('sensorRules.groupScope', 'Group')}</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {scope === 'device' && t('sensorRules.selectDevice', 'Select Device')}
                                {scope === 'location' && t('sensorRules.selectLocation', 'Select Location')}
                                {scope === 'group' && t('sensorRules.selectGroup', 'Select Group')}
                            </label>
                            <select
                                value={selectedEntity}
                                onChange={(e) => {
                                    setSelectedEntity(e.target.value);
                                    setSelectedSensor('');
                                }}
                                className="w-full rounded-md border-gray-300"
                                disabled={!!rule}
                                required
                            >
                                <option value="">{t('common.select', 'Select...')}</option>
                                {scope === 'device' && devices.map(device => (
                                    <option key={device.id} value={device.id}>{device.name}</option>
                                ))}
                                {scope === 'location' && locations.map(location => (
                                    <option key={location.id} value={location.id}>{location.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {scope === 'device' && selectedEntity && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('sensorRules.selectSensor', 'Select Sensor')}
                            </label>
                            <select
                                value={selectedSensor}
                                onChange={(e) => setSelectedSensor(e.target.value)}
                                className="w-full rounded-md border-gray-300"
                                disabled={!!rule}
                                required
                            >
                                <option value="">{t('common.select', 'Select...')}</option>
                                {sensors.map(sensor => (
                                    <option key={sensor.id} value={sensor.id}>
                                        {sensor.name} ({sensor.sensor_type} - {sensor.pin})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('sensorRules.ruleName', 'Rule Name')}
                        </label>
                        <input
                            type="text"
                            value={ruleName}
                            onChange={(e) => setRuleName(e.target.value)}
                            className="w-full rounded-md border-gray-300"
                            placeholder={t('sensorRules.ruleNamePlaceholder', 'e.g., Temperature Alert')}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('sensorRules.minThreshold', 'Min Threshold')}
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={thresholdMin}
                                onChange={(e) => setThresholdMin(e.target.value)}
                                className="w-full rounded-md border-gray-300"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('sensorRules.maxThreshold', 'Max Threshold')}
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={thresholdMax}
                                onChange={(e) => setThresholdMax(e.target.value)}
                                className="w-full rounded-md border-gray-300"
                                required
                            />
                        </div>
                    </div>

                    {/* Threshold Recommendations */}
                    {scope === 'device' && selectedSensor && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-blue-600" />
                                    Recommended Thresholds
                                </h4>
                                {!showRecommendations && (
                                    <button
                                        type="button"
                                        onClick={handleLoadRecommendations}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 transition-colors"
                                    >
                                        <Target className="h-3 w-3" />
                                        Load Suggestions
                                    </button>
                                )}
                            </div>

                            {loadingRecommendations && (
                                <div className="flex items-center justify-center py-4">
                                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                                    <span className="ml-2 text-sm text-gray-600">{t('sensorRules.analyzingData', 'Analyzing historical data...')}</span>
                                </div>
                            )}

                            {showRecommendations && recommendations && !loadingRecommendations && (
                                <div className="space-y-3">
                                    <p className="text-xs text-gray-600">
                                        Based on {recommendations.data_points || 0} readings from the last {recommendations.period_days || 30} days
                                    </p>

                                    {recommendations.data_points > 0 ? (
                                        <>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-white rounded-lg p-3 border border-blue-200">
                                                    <div className="text-xs text-gray-600 mb-1">{t('sensorRules.suggestedMin', 'Suggested Min')}</div>
                                                    <div className="text-lg font-bold text-blue-900">
                                                        {recommendations.suggested_min?.toFixed(2) ?? 'N/A'}
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        Range: {recommendations.min?.toFixed(2)} - {recommendations.avg?.toFixed(2)}
                                                    </div>
                                                </div>
                                                <div className="bg-white rounded-lg p-3 border border-blue-200">
                                                    <div className="text-xs text-gray-600 mb-1">{t('sensorRules.suggestedMax', 'Suggested Max')}</div>
                                                    <div className="text-lg font-bold text-blue-900">
                                                        {recommendations.suggested_max?.toFixed(2) ?? 'N/A'}
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        Range: {recommendations.avg?.toFixed(2)} - {recommendations.max?.toFixed(2)}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-white rounded-lg p-3 border border-blue-200">
                                                <div className="grid grid-cols-3 gap-2 text-xs">
                                                    <div>
                                                        <span className="text-gray-600">Min:</span>{' '}
                                                        <span className="font-semibold">{recommendations.min?.toFixed(2)}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-600">Avg:</span>{' '}
                                                        <span className="font-semibold">{recommendations.avg?.toFixed(2)}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-600">Max:</span>{' '}
                                                        <span className="font-semibold">{recommendations.max?.toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={handleApplyRecommendations}
                                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                                            >
                                                <Target className="h-4 w-4" />
                                                Apply Recommended Thresholds
                                            </button>
                                        </>
                                    ) : (
                                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                            <div className="flex items-start gap-2">
                                                <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                                                <div className="text-sm text-yellow-800">
                                                    <p className="font-medium">Not enough data</p>
                                                    <p className="text-xs mt-1">
                                                        No historical readings available for this sensor in the last 30 days.
                                                        Collect more data before using recommendations.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {showRecommendations && !recommendations && !loadingRecommendations && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                                        <div className="text-sm text-red-800">
                                            <p className="font-medium">{t('sensorRules.failedToLoad', 'Failed to load recommendations')}</p>
                                            <p className="text-xs mt-1">
                                                Unable to fetch threshold suggestions. Try again later.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('sensorRules.severity', 'Severity')}
                            </label>
                            <select
                                value={severity}
                                onChange={(e) => setSeverity(e.target.value)}
                                className="w-full rounded-md border-gray-300"
                            >
                                <option value="low">{t('severity.low', 'Low')}</option>
                                <option value="medium">{t('severity.medium', 'Medium')}</option>
                                <option value="high">{t('severity.high', 'High')}</option>
                                <option value="critical">{t('severity.critical', 'Critical')}</option>
                            </select>
                        </div>
                        <div className="flex items-center">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={(e) => setEnabled(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                                />
                                <span className="text-sm font-medium text-gray-700">
                                    {t('sensorRules.enabled', 'Enabled')}
                                </span>
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                        >
                            {t('common.cancel', 'Cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={saveMutation.isLoading}
                            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {saveMutation.isLoading ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default SensorRulesPage;
