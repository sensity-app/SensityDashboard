import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { apiService } from '../services/api';

const AlertRulesManager = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [selectedSensorType, setSelectedSensorType] = useState('all');
    const [showApplyModal, setShowApplyModal] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [testValue, setTestValue] = useState('');
    const [testResult, setTestResult] = useState(null);

    // Fetch alert rule templates
    const { data: templatesData, isLoading: templatesLoading, error: templatesError } = useQuery(
        ['alert-rule-templates', selectedSensorType],
        () => apiService.getAlertRuleTemplates(selectedSensorType === 'all' ? undefined : selectedSensorType, true),
        {
            refetchInterval: 30000
        }
    );

    // Ensure templates is always an array - extract from response object
    const templates = Array.isArray(templatesData?.templates) ? templatesData.templates :
                      Array.isArray(templatesData) ? templatesData : [];

    // Fetch devices for template application
    const { data: devices = [], isLoading: devicesLoading } = useQuery(
        'devices',
        apiService.getDevices
    );

    // Create template mutation
    const createTemplateMutation = useMutation(
        apiService.createAlertRuleTemplate,
        {
            onSuccess: () => {
                queryClient.invalidateQueries('alert-rule-templates');
                setShowCreateForm(false);
                setEditingTemplate(null);
                resetForm();
            },
            onError: (error) => {
                console.error('Error creating template:', error);
                alert(t('alertRules.createError'));
            }
        }
    );

    // Update template mutation
    const updateTemplateMutation = useMutation(
        ({ templateId, templateData }) => apiService.updateAlertRuleTemplate(templateId, templateData),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('alert-rule-templates');
                setShowCreateForm(false);
                setEditingTemplate(null);
                resetForm();
            },
            onError: (error) => {
                console.error('Error updating template:', error);
                alert(t('alertRules.updateError'));
            }
        }
    );

    // Delete template mutation
    const deleteTemplateMutation = useMutation(
        ({ templateId, force }) => apiService.deleteAlertRuleTemplate(templateId, force),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('alert-rule-templates');
            },
            onError: (error) => {
                console.error('Error deleting template:', error);
                if (error.response?.status === 409) {
                    const forceDelete = window.confirm(t('alertRules.forceDeleteConfirm'));
                    if (forceDelete) {
                        deleteTemplateMutation.mutate({ templateId: error.templateId, force: true });
                    }
                } else {
                    alert(t('alertRules.deleteError'));
                }
            }
        }
    );

    // Apply template mutation
    const applyTemplateMutation = useMutation(
        ({ templateId, deviceSensorId, customizations }) =>
            apiService.applyRuleTemplate(templateId, deviceSensorId, customizations),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('sensors');
                setShowApplyModal(false);
                setSelectedTemplate(null);
                alert(t('alertRules.templateApplied'));
            },
            onError: (error) => {
                console.error('Error applying template:', error);
                alert(t('alertRules.applyError'));
            }
        }
    );

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        sensorType: 'temperature',
        ruleConfig: {
            conditions: [{
                type: 'threshold',
                operator: '>',
                value: 0
            }],
            severity: 'medium',
            message: '',
            evaluationWindow: 300
        }
    });

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            sensorType: 'temperature',
            ruleConfig: {
                conditions: [{
                    type: 'threshold',
                    operator: '>',
                    value: 0
                }],
                severity: 'medium',
                message: '',
                evaluationWindow: 300
            }
        });
    };

    const sensorTypes = [
        'temperature',
        'humidity',
        'pressure',
        'light',
        'motion',
        'gas',
        'sound',
        'vibration',
        'voltage',
        'current'
    ];

    const conditionTypes = [
        'threshold',
        'range',
        'change',
        'pattern'
    ];

    const operators = [
        '>', '<', '>=', '<=', '==', '!='
    ];

    const severityLevels = [
        'low',
        'medium',
        'high',
        'critical'
    ];

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            alert(t('alertRules.nameRequired'));
            return;
        }

        if (!formData.ruleConfig.message.trim()) {
            alert(t('alertRules.messageRequired'));
            return;
        }

        if (editingTemplate) {
            updateTemplateMutation.mutate({
                templateId: editingTemplate.id,
                templateData: formData
            });
        } else {
            createTemplateMutation.mutate(formData);
        }
    };

    const handleEdit = (template) => {
        setEditingTemplate(template);
        setFormData({
            name: template.name,
            description: template.description || '',
            sensorType: template.sensor_type,
            ruleConfig: template.rule_config
        });
        setShowCreateForm(true);
    };

    const handleDelete = (templateId, isSystemTemplate) => {
        if (isSystemTemplate) {
            alert(t('alertRules.cannotDeleteSystem'));
            return;
        }

        if (window.confirm(t('alertRules.deleteConfirm'))) {
            deleteTemplateMutation.mutate({ templateId, force: false });
        }
    };

    const addCondition = () => {
        setFormData({
            ...formData,
            ruleConfig: {
                ...formData.ruleConfig,
                conditions: [
                    ...formData.ruleConfig.conditions,
                    {
                        type: 'threshold',
                        operator: '>',
                        value: 0
                    }
                ]
            }
        });
    };

    const removeCondition = (index) => {
        const newConditions = formData.ruleConfig.conditions.filter((_, i) => i !== index);
        setFormData({
            ...formData,
            ruleConfig: {
                ...formData.ruleConfig,
                conditions: newConditions
            }
        });
    };

    const updateCondition = (index, field, value) => {
        const newConditions = [...formData.ruleConfig.conditions];
        newConditions[index] = {
            ...newConditions[index],
            [field]: value
        };
        setFormData({
            ...formData,
            ruleConfig: {
                ...formData.ruleConfig,
                conditions: newConditions
            }
        });
    };

    const handleTestRule = async () => {
        if (!selectedTemplate || !testValue) return;

        try {
            // This would be implemented if we had a test endpoint
            // const result = await apiService.evaluateAlertRule(selectedTemplate.id, parseFloat(testValue));
            // setTestResult(result);

            // For now, show a mock result
            setTestResult({
                triggered: parseFloat(testValue) > 25,
                message: `Test value ${testValue} would ${parseFloat(testValue) > 25 ? '' : 'not '}trigger alert`
            });
        } catch (error) {
            console.error('Error testing rule:', error);
            setTestResult({ error: t('alertRules.testError') });
        }
    };

    const getDeviceSensors = () => {
        const sensors = [];
        devices.forEach(device => {
            if (device.sensors) {
                device.sensors.forEach(sensor => {
                    sensors.push({
                        id: sensor.id,
                        label: `${device.name} - ${sensor.pin_number} (${sensor.sensor_type})`,
                        deviceId: device.id,
                        sensorType: sensor.sensor_type
                    });
                });
            }
        });
        return sensors;
    };

    if (templatesLoading) {
        return (
            <div className="flex justify-center items-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2">{t('common.loading')}</span>
            </div>
        );
    }

    if (templatesError) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <div className="text-red-800">
                    <strong>{t('common.error')}</strong>
                    <p>{t('alertRules.loadError')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{t('alertRules.title')}</h1>
                    <p className="text-gray-600 mt-1">{t('alertRules.subtitle')}</p>
                </div>
                <div className="flex space-x-3">
                    <select
                        value={selectedSensorType}
                        onChange={(e) => setSelectedSensorType(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="all">{t('alertRules.allSensorTypes')}</option>
                        {sensorTypes.map(type => (
                            <option key={type} value={type}>
                                {t(`sensors.types.${type}`)}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={() => setShowCreateForm(!showCreateForm)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center space-x-2"
                    >
                        <span>+</span>
                        <span>{t('alertRules.createTemplate')}</span>
                    </button>
                </div>
            </div>

            {/* Create/Edit Form */}
            {showCreateForm && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold mb-4">
                        {editingTemplate ? t('alertRules.editTemplate') : t('alertRules.createTemplate')}
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('alertRules.templateName')} *
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('alertRules.sensorType')} *
                                </label>
                                <select
                                    value={formData.sensorType}
                                    onChange={(e) => setFormData({ ...formData, sensorType: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                >
                                    {sensorTypes.map(type => (
                                        <option key={type} value={type}>
                                            {t(`sensors.types.${type}`)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('alertRules.description')}
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows="2"
                            />
                        </div>

                        {/* Conditions */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    {t('alertRules.conditions')} *
                                </label>
                                <button
                                    type="button"
                                    onClick={addCondition}
                                    className="bg-green-100 hover:bg-green-200 text-green-700 px-2 py-1 rounded text-sm"
                                >
                                    + {t('alertRules.addCondition')}
                                </button>
                            </div>
                            {formData.ruleConfig.conditions.map((condition, index) => (
                                <div key={index} className="border border-gray-200 rounded-md p-3 mb-2">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium">
                                            {t('alertRules.condition')} {index + 1}
                                        </span>
                                        {formData.ruleConfig.conditions.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeCondition(index)}
                                                className="text-red-600 hover:text-red-800"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <select
                                            value={condition.type}
                                            onChange={(e) => updateCondition(index, 'type', e.target.value)}
                                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                                        >
                                            {conditionTypes.map(type => (
                                                <option key={type} value={type}>
                                                    {t(`alertRules.conditionTypes.${type}`)}
                                                </option>
                                            ))}
                                        </select>
                                        <select
                                            value={condition.operator}
                                            onChange={(e) => updateCondition(index, 'operator', e.target.value)}
                                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                                        >
                                            {operators.map(op => (
                                                <option key={op} value={op}>{op}</option>
                                            ))}
                                        </select>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={condition.value}
                                            onChange={(e) => updateCondition(index, 'value', parseFloat(e.target.value))}
                                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('alertRules.severity')} *
                                </label>
                                <select
                                    value={formData.ruleConfig.severity}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        ruleConfig: { ...formData.ruleConfig, severity: e.target.value }
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {severityLevels.map(level => (
                                        <option key={level} value={level}>
                                            {t(`alertRules.severity.${level}`)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('alertRules.evaluationWindow')}
                                </label>
                                <input
                                    type="number"
                                    value={formData.ruleConfig.evaluationWindow}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        ruleConfig: { ...formData.ruleConfig, evaluationWindow: parseInt(e.target.value) }
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder={t('alertRules.evaluationWindowPlaceholder')}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('alertRules.alertMessage')} *
                            </label>
                            <input
                                type="text"
                                value={formData.ruleConfig.message}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    ruleConfig: { ...formData.ruleConfig, message: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder={t('alertRules.alertMessagePlaceholder')}
                                required
                            />
                        </div>

                        <div className="flex space-x-3">
                            <button
                                type="submit"
                                disabled={createTemplateMutation.isLoading || updateTemplateMutation.isLoading}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md disabled:opacity-50"
                            >
                                {editingTemplate ? t('common.update') : t('common.create')}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowCreateForm(false);
                                    setEditingTemplate(null);
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

            {/* Templates List */}
            <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold">{t('alertRules.existingTemplates')}</h2>
                </div>
                {templates.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">
                        <p>{t('alertRules.noTemplates')}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200">
                        {templates.map((template) => (
                            <div key={template.id} className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
                                            <span>{template.name}</span>
                                            {template.is_system_template && (
                                                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                                                    {t('alertRules.systemTemplate')}
                                                </span>
                                            )}
                                        </h3>
                                        <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                                        <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                                            <span>{t(`sensors.types.${template.sensor_type}`)}</span>
                                            <span>{t(`alertRules.severity.${template.rule_config.severity}`)}</span>
                                            <span>{template.rule_config.conditions.length} {t('alertRules.conditionsCount')}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <button
                                            onClick={() => {
                                                setSelectedTemplate(template);
                                                setShowApplyModal(true);
                                            }}
                                            className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1 rounded-md text-sm"
                                        >
                                            {t('alertRules.apply')}
                                        </button>
                                        {!template.is_system_template && (
                                            <>
                                                <button
                                                    onClick={() => handleEdit(template)}
                                                    className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded-md text-sm"
                                                >
                                                    {t('common.edit')}
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(template.id, template.is_system_template)}
                                                    className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded-md text-sm"
                                                >
                                                    {t('common.delete')}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-3 text-sm text-gray-600">
                                    <p><strong>{t('alertRules.alertMessage')}:</strong> {template.rule_config.message}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Apply Template Modal */}
            {showApplyModal && selectedTemplate && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-lg font-semibold mb-4">
                            {t('alertRules.applyTemplate', { templateName: selectedTemplate.name })}
                        </h2>
                        {devicesLoading ? (
                            <div className="text-center py-4">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        {t('alertRules.selectDeviceSensor')}
                                    </label>
                                    <select
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">{t('alertRules.selectSensor')}</option>
                                        {getDeviceSensors()
                                            .filter(sensor => sensor.sensorType === selectedTemplate.sensor_type)
                                            .map(sensor => (
                                                <option key={sensor.id} value={sensor.id}>
                                                    {sensor.label}
                                                </option>
                                            ))}
                                    </select>
                                </div>

                                {/* Test Rule */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        {t('alertRules.testRule')}
                                    </label>
                                    <div className="flex space-x-2">
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={testValue}
                                            onChange={(e) => setTestValue(e.target.value)}
                                            placeholder={t('alertRules.testValue')}
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <button
                                            onClick={handleTestRule}
                                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-md"
                                        >
                                            {t('alertRules.test')}
                                        </button>
                                    </div>
                                    {testResult && (
                                        <div className={`mt-2 p-2 rounded text-sm ${
                                            testResult.error ? 'bg-red-50 text-red-700' :
                                            testResult.triggered ? 'bg-red-50 text-red-700' :
                                            'bg-green-50 text-green-700'
                                        }`}>
                                            {testResult.error || testResult.message}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        <div className="flex justify-end space-x-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowApplyModal(false);
                                    setSelectedTemplate(null);
                                    setTestValue('');
                                    setTestResult(null);
                                }}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={() => {
                                    // Apply template logic would go here
                                    alert(t('alertRules.applyNotImplemented'));
                                }}
                                disabled={applyTemplateMutation.isLoading}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md disabled:opacity-50"
                            >
                                {t('alertRules.applyTemplate')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AlertRulesManager;