import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    Mail,
    MessageSquare,
    Send,
    Webhook,
    Plus,
    Edit2,
    Trash2,
    Copy,
    Eye,
    X,
    Search,
    Filter,
    Bell,
    CheckCircle,
    AlertCircle,
    Smartphone,
    ChevronRight,
    Code,
    Zap
} from 'lucide-react';

import { apiService } from '../services/api';

function NotificationTemplates() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    // State
    const [searchQuery, setSearchQuery] = useState('');
    const [channelFilter, setChannelFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showTestModal, setShowTestModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(null);

    // Fetch templates
    const { data: templatesData, isLoading } = useQuery(
        ['notification-templates', { channel: channelFilter !== 'all' ? channelFilter : undefined, template_type: typeFilter !== 'all' ? typeFilter : undefined }],
        () => apiService.getNotificationTemplates({
            channel: channelFilter !== 'all' ? channelFilter : undefined,
            template_type: typeFilter !== 'all' ? typeFilter : undefined
        }),
        {
            refetchInterval: 30000,
            select: (data) => data.templates || []
        }
    );

    // Fetch available variables
    const { data: variablesData } = useQuery(
        'template-variables',
        () => apiService.getTemplateVariables(),
        {
            staleTime: Infinity
        }
    );

    const templates = templatesData || [];
    const availableVariables = variablesData?.variables || {};

    // Create mutation
    const createMutation = useMutation(
        (templateData) => apiService.createNotificationTemplate(templateData),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('notification-templates');
                toast.success(t('notificationTemplates.toast.createSuccess', 'Template created successfully'));
                setShowCreateModal(false);
            },
            onError: (error) => {
                toast.error(error.response?.data?.error || t('notificationTemplates.toast.createError', 'Failed to create template'));
            }
        }
    );

    // Update mutation
    const updateMutation = useMutation(
        ({ templateId, templateData }) => apiService.updateNotificationTemplate(templateId, templateData),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('notification-templates');
                toast.success(t('notificationTemplates.toast.updateSuccess', 'Template updated successfully'));
                setShowEditModal(false);
                setSelectedTemplate(null);
            },
            onError: (error) => {
                toast.error(error.response?.data?.error || t('notificationTemplates.toast.updateError', 'Failed to update template'));
            }
        }
    );

    // Delete mutation
    const deleteMutation = useMutation(
        (templateId) => apiService.deleteNotificationTemplate(templateId),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('notification-templates');
                toast.success(t('notificationTemplates.toast.deleteSuccess', 'Template deleted successfully'));
                setShowDeleteModal(false);
                setSelectedTemplate(null);
            },
            onError: (error) => {
                toast.error(error.response?.data?.error || t('notificationTemplates.toast.deleteError', 'Failed to delete template'));
            }
        }
    );

    // Test mutation
    const testMutation = useMutation(
        ({ templateId, variables }) => apiService.testNotificationTemplate(templateId, variables),
        {
            onSuccess: (data) => {
                toast.success(t('notificationTemplates.toast.testSuccess', 'Template test successful'));
                // Show rendered result
            },
            onError: (error) => {
                toast.error(error.response?.data?.error || t('notificationTemplates.toast.testError', 'Template test failed'));
            }
        }
    );

    // Filter templates
    const filteredTemplates = useMemo(() => {
        return templates.filter(template => {
            const matchesSearch = !searchQuery ||
                template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                template.description?.toLowerCase().includes(searchQuery.toLowerCase());

            return matchesSearch;
        });
    }, [templates, searchQuery]);

    // Channel icon
    const getChannelIcon = (channel) => {
        switch (channel) {
            case 'email': return <Mail className="h-5 w-5" />;
            case 'sms': return <Smartphone className="h-5 w-5" />;
            case 'telegram': return <Send className="h-5 w-5" />;
            case 'whatsapp': return <MessageSquare className="h-5 w-5" />;
            case 'webhook': return <Webhook className="h-5 w-5" />;
            default: return <Bell className="h-5 w-5" />;
        }
    };

    // Channel color
    const getChannelColor = (channel) => {
        switch (channel) {
            case 'email': return 'blue';
            case 'sms': return 'green';
            case 'telegram': return 'cyan';
            case 'whatsapp': return 'emerald';
            case 'webhook': return 'purple';
            default: return 'gray';
        }
    };

    // Type color
    const getTypeColor = (type) => {
        switch (type) {
            case 'alert': return 'red';
            case 'device_status': return 'orange';
            case 'system': return 'blue';
            case 'custom': return 'purple';
            default: return 'gray';
        }
    };

    const handleCreateTemplate = () => {
        setSelectedTemplate(null);
        setShowCreateModal(true);
    };

    const handleEditTemplate = (template) => {
        setSelectedTemplate(template);
        setShowEditModal(true);
    };

    const handleDeleteTemplate = (template) => {
        setSelectedTemplate(template);
        setShowDeleteModal(true);
    };

    const handleTestTemplate = (template) => {
        setSelectedTemplate(template);
        setShowTestModal(true);
    };

    const handleDuplicateTemplate = (template) => {
        setSelectedTemplate({
            ...template,
            id: null,
            name: `${template.name} (Copy)`,
            is_system: false
        });
        setShowCreateModal(true);
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-16 space-y-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
                <p className="text-gray-500">Loading templates...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">
                    {t('notificationTemplates.title', 'Notification Templates')}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                    {t('notificationTemplates.subtitle', 'Manage message templates for alerts and notifications')}
                </p>
            </div>
            <button
                onClick={handleCreateTemplate}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:from-indigo-700 hover:to-indigo-800 transition-all duration-200 hover:scale-105"
            >
                <Plus className="h-4 w-4" />
                {t('notificationTemplates.actions.create', 'Create Template')}
            </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    {/* Search */}
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder={t('notificationTemplates.filters.searchPlaceholder', 'Search templates...')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                </div>

                    {/* Channel Filter */}
                    <div className="flex items-center gap-2">
                        <Filter className="h-5 w-5 text-gray-400" />
                        <select
                            value={channelFilter}
                            onChange={(e) => setChannelFilter(e.target.value)}
                            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                            <option value="all">{t('notificationTemplates.filters.channels.all', 'All Channels')}</option>
                            <option value="email">{t('notificationTemplates.channels.email', 'Email')}</option>
                            <option value="sms">{t('notificationTemplates.channels.sms', 'SMS')}</option>
                            <option value="telegram">{t('notificationTemplates.channels.telegram', 'Telegram')}</option>
                            <option value="whatsapp">{t('notificationTemplates.channels.whatsapp', 'WhatsApp')}</option>
                            <option value="webhook">{t('notificationTemplates.channels.webhook', 'Webhook')}</option>
                        </select>
                    </div>

                    {/* Type Filter */}
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                        <option value="all">{t('notificationTemplates.filters.types.all', 'All Types')}</option>
                        <option value="alert">{t('notificationTemplates.types.alert', 'Alert')}</option>
                        <option value="device_status">{t('notificationTemplates.types.deviceStatus', 'Device Status')}</option>
                        <option value="system">{t('notificationTemplates.types.system', 'System')}</option>
                        <option value="custom">{t('notificationTemplates.types.custom', 'Custom')}</option>
                    </select>
                </div>
        </div>

            {/* Templates Grid */}
            <div className="grid grid-cols-1 gap-4">
                {filteredTemplates.length === 0 ? (
                    <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-200">
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                            <Bell className="h-8 w-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            {t('notificationTemplates.empty.title', 'No templates found')}
                        </h3>
                        <p className="text-sm text-gray-500 mb-4">
                            {searchQuery || channelFilter !== 'all' || typeFilter !== 'all'
                                ? t('notificationTemplates.empty.adjustFilters', 'Try adjusting your filters')
                                : t('notificationTemplates.empty.description', 'Create your first notification template to get started')}
                        </p>
                        {!searchQuery && channelFilter === 'all' && typeFilter === 'all' && (
                            <button
                                onClick={handleCreateTemplate}
                                className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
                            >
                                <Plus className="h-4 w-4" />
                                {t('notificationTemplates.actions.create', 'Create Template')}
                            </button>
                        )}
                    </div>
                ) : (
                    filteredTemplates.map((template) => {
                        const channelColor = getChannelColor(template.channel);
                        const typeColor = getTypeColor(template.template_type);
                        const channelLabel = t(`notificationTemplates.channels.${template.channel}`, template.channel);
                        const typeLabel = t(`notificationTemplates.types.${template.template_type}`, template.template_type);

                        return (
                            <div
                                key={template.id}
                                className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-4 flex-1">
                                        {/* Channel Icon */}
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-${channelColor}-100 text-${channelColor}-600`}>
                                            {getChannelIcon(template.channel)}
                                        </div>

                                        {/* Template Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <h3 className="font-semibold text-gray-900">
                                                    {template.name}
                                                </h3>
                                                {template.is_system && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                                        {t('notificationTemplates.badges.system', 'System')}
                                                    </span>
                                                )}
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-${channelColor}-100 text-${channelColor}-700`}>
                                                    {channelLabel}
                                                </span>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-${typeColor}-100 text-${typeColor}-700`}>
                                                    {typeLabel}
                                                </span>
                                                {!template.is_active && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                                                        {t('notificationTemplates.badges.inactive', 'Inactive')}
                                                    </span>
                                                )}
                                            </div>

                                            {template.description && (
                                                <p className="text-sm text-gray-600 mb-3">
                                                    {template.description}
                                                </p>
                                            )}

                                            {template.channel === 'email' && template.subject_template && (
                                                <div className="mb-2">
                                                    <p className="text-xs font-medium text-gray-500 mb-1">{t('notificationTemplates.labels.subject', 'Subject:')}</p>
                                                    <p className="text-sm text-gray-700 font-mono bg-gray-50 p-2 rounded">
                                                        {template.subject_template}
                                                    </p>
                                                </div>
                                            )}

                                            <div>
                                                <p className="text-xs font-medium text-gray-500 mb-1">{t('notificationTemplates.labels.bodyPreview', 'Body Preview:')}</p>
                                                <p className="text-sm text-gray-700 font-mono bg-gray-50 p-2 rounded line-clamp-2">
                                                    {template.body_template}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex flex-col gap-2 ml-4">
                                        <button
                                            onClick={() => handleTestTemplate(template)}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 text-xs font-medium hover:bg-purple-200 transition-colors"
                                            title={t('notificationTemplates.actions.testTitle', 'Test Template')}
                                        >
                                            <Zap className="h-3 w-3" />
                                            {t('notificationTemplates.actions.test', 'Test')}
                                        </button>
                                        <button
                                            onClick={() => handleDuplicateTemplate(template)}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 text-xs font-medium hover:bg-blue-200 transition-colors"
                                            title={t('notificationTemplates.actions.duplicateTitle', 'Duplicate Template')}
                                        >
                                            <Copy className="h-3 w-3" />
                                            {t('notificationTemplates.actions.duplicate', 'Copy')}
                                        </button>
                                        <button
                                            onClick={() => handleEditTemplate(template)}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 transition-colors"
                                            title={t('notificationTemplates.actions.editTitle', 'Edit Template')}
                                        >
                                            <Edit2 className="h-3 w-3" />
                                            {t('notificationTemplates.actions.edit', 'Edit')}
                                        </button>
                                        {!template.is_system && (
                                            <button
                                                onClick={() => handleDeleteTemplate(template)}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-medium hover:bg-red-200 transition-colors"
                                                title={t('notificationTemplates.actions.deleteTitle', 'Delete Template')}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                                {t('notificationTemplates.actions.delete', 'Delete')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Modals */}
            {showCreateModal && (
                <TemplateFormModal
                    template={selectedTemplate}
                    availableVariables={availableVariables}
                    onClose={() => {
                        setShowCreateModal(false);
                        setSelectedTemplate(null);
                    }}
                    onSave={(data) => createMutation.mutate(data)}
                    isLoading={createMutation.isLoading}
                />
            )}

            {showEditModal && selectedTemplate && (
                <TemplateFormModal
                    template={selectedTemplate}
                    availableVariables={availableVariables}
                    onClose={() => {
                        setShowEditModal(false);
                        setSelectedTemplate(null);
                    }}
                    onSave={(data) => updateMutation.mutate({ templateId: selectedTemplate.id, templateData: data })}
                    isLoading={updateMutation.isLoading}
                    isEdit
                />
            )}

            {showTestModal && selectedTemplate && (
                <TestTemplateModal
                    template={selectedTemplate}
                    availableVariables={availableVariables}
                    onClose={() => {
                        setShowTestModal(false);
                        setSelectedTemplate(null);
                    }}
                    onTest={(variables) => testMutation.mutate({ templateId: selectedTemplate.id, variables })}
                    isLoading={testMutation.isLoading}
                    testResult={testMutation.data}
                />
            )}

            {showDeleteModal && selectedTemplate && (
                <DeleteConfirmModal
                    template={selectedTemplate}
                    onClose={() => {
                        setShowDeleteModal(false);
                        setSelectedTemplate(null);
                    }}
                    onConfirm={() => deleteMutation.mutate(selectedTemplate.id)}
                    isLoading={deleteMutation.isLoading}
                />
            )}
        </div>
    );
}

// Template Form Modal
function TemplateFormModal({ template, availableVariables, onClose, onSave, isLoading, isEdit }) {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        name: template?.name || '',
        description: template?.description || '',
        template_type: template?.template_type || 'alert',
        channel: template?.channel || 'email',
        subject_template: template?.subject_template || '',
        body_template: template?.body_template || '',
        is_active: template?.is_active ?? true
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    const insertVariable = (variable, field) => {
        const placeholder = `{{${variable}}}`;
        setFormData(prev => ({
            ...prev,
            [field]: prev[field] + placeholder
        }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-600 to-indigo-700">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-white">
                            {isEdit
                                ? t('notificationTemplates.form.editTitle', 'Edit Template')
                                : t('notificationTemplates.form.createTitle', 'Create Template')}
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-white hover:text-gray-200 transition-colors"
                        >
                            <X className="h-6 w-6" />
                        </button>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
                    <div className="space-y-6">
                        {/* Basic Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('notificationTemplates.form.nameLabel', 'Name *')}
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    placeholder={t('notificationTemplates.form.namePlaceholder', 'my_custom_template')}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('notificationTemplates.form.channelLabel', 'Channel *')}
                                </label>
                                <select
                                    value={formData.channel}
                                    onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    required
                                >
                                    <option value="email">{t('notificationTemplates.channels.email', 'Email')}</option>
                                    <option value="sms">{t('notificationTemplates.channels.sms', 'SMS')}</option>
                                    <option value="telegram">{t('notificationTemplates.channels.telegram', 'Telegram')}</option>
                                    <option value="whatsapp">{t('notificationTemplates.channels.whatsapp', 'WhatsApp')}</option>
                                    <option value="webhook">{t('notificationTemplates.channels.webhook', 'Webhook')}</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('notificationTemplates.form.typeLabel', 'Type *')}
                                </label>
                                <select
                                    value={formData.template_type}
                                    onChange={(e) => setFormData({ ...formData, template_type: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    required
                                >
                                    <option value="alert">{t('notificationTemplates.types.alert', 'Alert')}</option>
                                    <option value="device_status">{t('notificationTemplates.types.deviceStatus', 'Device Status')}</option>
                                    <option value="system">{t('notificationTemplates.types.system', 'System')}</option>
                                    <option value="custom">{t('notificationTemplates.types.custom', 'Custom')}</option>
                                </select>
                            </div>

                            <div className="flex items-center">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_active}
                                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                    />
                                    <span className="text-sm font-medium text-gray-700">{t('notificationTemplates.form.activeLabel', 'Active')}</span>
                                </label>
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('notificationTemplates.form.descriptionLabel', 'Description')}
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                rows={2}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                placeholder={t('notificationTemplates.form.descriptionPlaceholder', 'Brief description of this template')}
                            />
                        </div>

                        {/* Subject (Email only) */}
                        {formData.channel === 'email' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('notificationTemplates.form.subjectLabel', 'Subject Template *')}
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        required
                                        value={formData.subject_template}
                                        onChange={(e) => setFormData({ ...formData, subject_template: e.target.value })}
                                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                                        placeholder={t('notificationTemplates.form.subjectPlaceholder', 'Alert: {{device_name}} - {{sensor_name}}')}
                                    />
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                    {t('notificationTemplates.form.variablesHint', 'Use {{ and }} for variables (e.g., {{device_name}})')}
                                </p>
                            </div>
                        )}

                        {/* Body Template */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('notificationTemplates.form.bodyLabel', 'Body Template *')}
                            </label>
                            <textarea
                                required
                                value={formData.body_template}
                                onChange={(e) => setFormData({ ...formData, body_template: e.target.value })}
                                rows={8}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                                placeholder={formData.channel === 'email'
                                    ? t('notificationTemplates.form.bodyPlaceholderEmail', '<h2>Alert from {{device_name}}</h2>\n<p>Sensor: {{sensor_name}}</p>\n<p>Value: {{current_value}}{{unit}}</p>')
                                    : t('notificationTemplates.form.bodyPlaceholder', 'Alert from {{device_name}}: {{sensor_name}} = {{current_value}}{{unit}}')
                                }
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                {formData.channel === 'email'
                                    ? t('notificationTemplates.form.bodyHelperHtml', 'HTML supported. Use {{ and }} for variables')
                                    : t('notificationTemplates.form.bodyHelper', 'Use {{ and }} for variables')}
                            </p>
                        </div>

                        {/* Available Variables */}
                        <div className="bg-blue-50 p-4 rounded-lg">
                            <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                                <Code className="h-4 w-4 text-blue-600" />
                                {t('notificationTemplates.form.availableVariablesTitle', 'Available Variables')}
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {Object.entries(availableVariables).map(([key, description]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => insertVariable(key, formData.channel === 'email' && formData.subject_template === formData.body_template ? 'subject_template' : 'body_template')}
                                        className="text-left px-3 py-2 bg-white rounded border border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                                        title={description}
                                    >
                                        <code className="text-xs text-blue-700">{`{{${key}}}`}</code>
                                        <p className="text-xs text-gray-600 mt-1 truncate">{description}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </form>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        disabled={isLoading}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    >
                        {isLoading ? (
                            <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                {t('common.saving')}
                            </>
                        ) : (
                            <>
                                <CheckCircle className="h-4 w-4" />
                                {isEdit
                                    ? t('notificationTemplates.form.updateAction', 'Update Template')
                                    : t('notificationTemplates.form.createAction', 'Create Template')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Test Template Modal
function TestTemplateModal({ template, availableVariables, onClose, onTest, isLoading, testResult }) {
    const { t } = useTranslation();
    const [testVariables, setTestVariables] = useState(() => {
        const vars = {};
        Object.keys(availableVariables).forEach(key => {
            vars[key] = '';
        });
        return vars;
    });

    const handleTest = () => {
        onTest(testVariables);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-purple-700">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-white">
                            {t('notificationTemplates.testModal.title', { name: template.name })}
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-white hover:text-gray-200 transition-colors"
                        >
                            <X className="h-6 w-6" />
                        </button>
                    </div>
                </div>

                {/* Form */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <p className="text-sm text-gray-600">
                        {t('notificationTemplates.testModal.instructions', 'Provide values for the template variables to see the rendered output:')}
                    </p>

                    {Object.entries(availableVariables).map(([key, description]) => (
                        <div key={key}>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <code className="text-xs bg-gray-100 px-2 py-1 rounded">{`{{${key}}}`}</code>
                                <span className="ml-2 text-gray-600">{description}</span>
                            </label>
                            <input
                                type="text"
                                value={testVariables[key]}
                                onChange={(e) => setTestVariables({ ...testVariables, [key]: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                placeholder={t('notificationTemplates.testModal.variablePlaceholder', { key })}
                            />
                        </div>
                    ))}

                    {testResult && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h4 className="text-sm font-medium text-green-900 mb-2">{t('notificationTemplates.testModal.renderedOutput', 'Rendered Output:')}</h4>
                            {template.channel === 'email' && testResult.subject && (
                                <div className="mb-3">
                                    <p className="text-xs font-medium text-gray-600 mb-1">{t('notificationTemplates.labels.subject', 'Subject:')}</p>
                                    <p className="text-sm text-gray-900 bg-white p-2 rounded border border-green-200">
                                        {testResult.subject}
                                    </p>
                                </div>
                            )}
                            <div>
                                <p className="text-xs font-medium text-gray-600 mb-1">{t('notificationTemplates.testModal.bodyLabel', 'Body:')}</p>
                                {template.channel === 'email' ? (
                                    <div
                                        className="text-sm bg-white p-4 rounded border border-green-200"
                                        dangerouslySetInnerHTML={{ __html: testResult.body }}
                                    />
                                ) : (
                                    <p className="text-sm text-gray-900 bg-white p-2 rounded border border-green-200 whitespace-pre-wrap">
                                        {testResult.body}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        {t('common.close', 'Close')}
                    </button>
                    <button
                        onClick={handleTest}
                        disabled={isLoading}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                    >
                        {isLoading ? (
                            <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                {t('notificationTemplates.testModal.testing', 'Testing...')}
                            </>
                        ) : (
                            <>
                                <Zap className="h-4 w-4" />
                                {t('notificationTemplates.testModal.testButton', 'Test Template')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Delete Confirm Modal
function DeleteConfirmModal({ template, onClose, onConfirm, isLoading }) {
    const { t } = useTranslation();
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                            <AlertCircle className="h-5 w-5 text-red-600" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900">
                            {t('notificationTemplates.deleteModal.title', 'Delete Template')}
                        </h2>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    <p className="text-gray-700">
                        {t('notificationTemplates.deleteModal.confirmationPrefix', 'Are you sure you want to delete the template')}{' '}
                        <strong>{template.name}</strong>?
                    </p>
                    <p className="mt-2 text-sm text-gray-600">
                        {t('notificationTemplates.deleteModal.warning', 'This action cannot be undone.')}
                    </p>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        disabled={isLoading}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                        {isLoading ? (
                            <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                {t('notificationTemplates.deleteModal.deleting', 'Deleting...')}
                            </>
                        ) : (
                            <>
                                <Trash2 className="h-4 w-4" />
                                {t('notificationTemplates.deleteModal.confirmButton', 'Delete Template')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default NotificationTemplates;
