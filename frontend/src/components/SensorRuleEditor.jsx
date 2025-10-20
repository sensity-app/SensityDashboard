import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { X, Plus, Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { Trans, useTranslation } from 'react-i18next';

function SensorRuleEditor({ sensor, deviceId, onClose }) {
    const { t } = useTranslation();
    const [rules, setRules] = useState(sensor.rules || []);
    const queryClient = useQueryClient();

    const conditionOptions = useMemo(() => {
        const conditions = t('sensorRuleEditor.conditions', { returnObjects: true });
        return [
            {
                value: 'greater_than',
                label: conditions?.greaterThan?.label || 'Greater than',
                preview: conditions?.greaterThan?.preview || 'greater than'
            },
            {
                value: 'less_than',
                label: conditions?.lessThan?.label || 'Less than',
                preview: conditions?.lessThan?.preview || 'less than'
            },
            {
                value: 'equals',
                label: conditions?.equals?.label || 'Equals',
                preview: conditions?.equals?.preview || 'equal to'
            },
            {
                value: 'not_equals',
                label: conditions?.notEquals?.label || 'Not equals',
                preview: conditions?.notEquals?.preview || 'not equal to'
            },
            {
                value: 'between',
                label: conditions?.between?.label || 'Between',
                preview: conditions?.between?.preview || 'between'
            },
            {
                value: 'outside_range',
                label: conditions?.outsideRange?.label || 'Outside range',
                preview: conditions?.outsideRange?.preview || 'outside'
            }
        ];
    }, [t]);

    const severityOptions = useMemo(() => {
        const severity = t('sensorRuleEditor.severity', { returnObjects: true });
        return [
            {
                value: 'low',
                label: severity?.low?.label || 'Low',
                preview: severity?.low?.preview || 'low',
                color: 'bg-yellow-100 text-yellow-800'
            },
            {
                value: 'medium',
                label: severity?.medium?.label || 'Medium',
                preview: severity?.medium?.preview || 'medium',
                color: 'bg-orange-100 text-orange-800'
            },
            {
                value: 'high',
                label: severity?.high?.label || 'High',
                preview: severity?.high?.preview || 'high',
                color: 'bg-red-100 text-red-800'
            },
            {
                value: 'critical',
                label: severity?.critical?.label || 'Critical',
                preview: severity?.critical?.preview || 'critical',
                color: 'bg-red-200 text-red-900'
            }
        ];
    }, [t]);

    const channelLabels = useMemo(() => {
        const channels = t('sensorRuleEditor.channels', { returnObjects: true });
        return {
            email: channels?.email || 'Email',
            sms: channels?.sms || 'SMS',
            webhook: channels?.webhook || 'Webhook',
            in_app: channels?.inApp || 'In-app'
        };
    }, [t]);

    const saveRulesMutation = useMutation(
        async (updatedRules) => {
            // Delete removed rules first
            const currentRuleIds = new Set(updatedRules.filter(r => r.id).map(r => r.id));
            const originalRuleIds = (sensor.rules || []).filter(r => r.id).map(r => r.id);
            const removedRuleIds = originalRuleIds.filter(id => !currentRuleIds.has(id));

            for (const ruleId of removedRuleIds) {
                await apiService.deleteSensorRule(deviceId, sensor.id, ruleId);
            }

            // Create or update rules
            const promises = updatedRules.map(rule => {
                const ruleData = {
                    rule_name: rule.rule_name,
                    condition: rule.condition,
                    threshold_value: parseFloat(rule.value),
                    severity: rule.severity,
                    enabled: rule.enabled,
                    notification_channels: rule.notification_channels
                };

                if (rule.id) {
                    // Update existing rule
                    return apiService.updateSensorRule(deviceId, sensor.id, rule.id, ruleData);
                } else {
                    // Create new rule
                    return apiService.createSensorRule(deviceId, sensor.id, ruleData);
                }
            });

            return Promise.all(promises);
        },
        {
            onSuccess: () => {
                toast.success(t('sensorRuleEditor.toast.updateSuccess'));
                queryClient.invalidateQueries(['device-sensors', deviceId]);
                queryClient.invalidateQueries(['device', deviceId]);
                onClose();
            },
            onError: (error) => {
                console.error('Save rules error:', error);
                toast.error(
                    t('sensorRuleEditor.toast.updateError', {
                        message: error?.response?.data?.error || error.message || ''
                    })
                );
            }
        }
    );

    const addRule = () => {
        const newRule = {
            id: null,
            rule_name: '',
            condition: 'greater_than',
            value: '',
            severity: 'medium',
            enabled: true,
            notification_channels: ['email']
        };
        setRules([...rules, newRule]);
    };

    const updateRule = (index, field, value) => {
        const updatedRules = rules.map((rule, i) =>
            i === index ? { ...rule, [field]: value } : rule
        );
        setRules(updatedRules);
    };

    const removeRule = (index) => {
        const updatedRules = rules.filter((_, i) => i !== index);
        setRules(updatedRules);
    };

    const handleSave = () => {
        const validRules = rules.filter(rule =>
            rule.rule_name && rule.value && !isNaN(parseFloat(rule.value))
        );

        if (validRules.length !== rules.length) {
            toast.error(t('sensorRuleEditor.toast.validationError'));
            return;
        }

        saveRulesMutation.mutate(validRules);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">{t('sensorRuleEditor.title')}</h2>
                        <p className="text-sm text-gray-500">
                            {t('sensorRuleEditor.subtitle', { name: sensor.name, pin: sensor.pin })}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Rules List */}
                    <div className="space-y-4">
                        {rules.map((rule, index) => (
                            <div key={index} className="border border-gray-200 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            checked={rule.enabled}
                                            onChange={(e) => updateRule(index, 'enabled', e.target.checked)}
                                            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                        />
                                        <input
                                            type="text"
                                            value={rule.rule_name}
                                            onChange={(e) => updateRule(index, 'rule_name', e.target.value)}
                                            placeholder={t('sensorRuleEditor.fields.namePlaceholder')}
                                            className="text-lg font-medium border-none focus:ring-0 p-0 placeholder-gray-400"
                                        />
                                    </div>
                                    <button
                                        onClick={() => removeRule(index)}
                                        className="text-red-600 hover:text-red-800"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            {t('sensorRuleEditor.fields.condition')}
                                        </label>
                                        <select
                                            value={rule.condition}
                                            onChange={(e) => updateRule(index, 'condition', e.target.value)}
                                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                        >
                                            {conditionOptions.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            {t('sensorRuleEditor.fields.value')}
                                        </label>
                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={rule.value}
                                                onChange={(e) => updateRule(index, 'value', e.target.value)}
                                                placeholder={t('sensorRuleEditor.fields.valuePlaceholder')}
                                                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
                                            />
                                            <span className="text-sm text-gray-500">{sensor.unit}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            {t('sensorRuleEditor.fields.severity')}
                                        </label>
                                        <select
                                            value={rule.severity}
                                            onChange={(e) => updateRule(index, 'severity', e.target.value)}
                                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                        >
                                            {severityOptions.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Notification Channels */}
                                <div className="mt-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        {t('sensorRuleEditor.fields.channels')}
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {['email', 'sms', 'webhook', 'in_app'].map((channel) => (
                                            <label key={channel} className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={rule.notification_channels?.includes(channel)}
                                                    onChange={(e) => {
                                                        const channels = rule.notification_channels || [];
                                                        if (e.target.checked) {
                                                            updateRule(index, 'notification_channels', [...channels, channel]);
                                                        } else {
                                                            updateRule(index, 'notification_channels',
                                                                channels.filter(c => c !== channel)
                                                            );
                                                        }
                                                    }}
                                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded mr-2"
                                                />
                                                <span className="text-sm text-gray-700">
                                                    {channelLabels[channel] || channel}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Rule Preview */}
                                <div className="mt-4 p-3 bg-gray-50 rounded-md">
                                    <p className="text-sm text-gray-600">
                                        {(() => {
                                            const severityInfo = severityOptions.find(s => s.value === rule.severity);
                                            return (
                                                <>
                                                    <AlertTriangle className="h-4 w-4 inline mr-1" />
                                                    <Trans
                                                        i18nKey="sensorRuleEditor.preview"
                                                        values={{
                                                            sensorName: sensor.name,
                                                            condition: conditionOptions.find(c => c.value === rule.condition)?.preview || rule.condition,
                                                            value: rule.value,
                                                            unit: sensor.unit
                                                        }}
                                                        components={{
                                                            severity: (
                                                                <span
                                                                    className={`px-1 py-0.5 text-xs rounded ${severityInfo?.color || ''}`}
                                                                >
                                                                    {severityInfo?.label || rule.severity}
                                                                </span>
                                                            )
                                                        }}
                                                    />
                                                </>
                                            );
                                        })()}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Add Rule Button */}
                    <button
                        onClick={addRule}
                        className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4 text-gray-600 hover:border-gray-400 hover:text-gray-700"
                    >
                        <Plus className="h-5 w-5 inline mr-2" />
                        {t('sensorRuleEditor.actions.add')}
                    </button>
                </div>

                {/* Footer */}
                <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saveRulesMutation.isLoading}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saveRulesMutation.isLoading
                            ? t('sensorRuleEditor.actions.saving')
                            : t('sensorRuleEditor.actions.save')}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SensorRuleEditor;
