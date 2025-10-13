import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import {
    Key,
    CheckCircle,
    XCircle,
    AlertTriangle,
    RefreshCw,
    Trash2,
    Shield,
    Users,
    Monitor,
    Calendar,
    Zap,
    TrendingUp,
    Info
} from 'lucide-react';
import toast from 'react-hot-toast';

import { apiService } from '../services/api';

/**
 * Shared license management panel used in settings, modal overlay, and standalone page.
 */
function LicenseManagerPanel() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [showActivateModal, setShowActivateModal] = useState(false);
    const [licenseKey, setLicenseKey] = useState('');
    const formatFeatureLabel = useCallback(
        (featureKey) => t(`license.featureLabels.${featureKey}`, featureKey.replace(/_/g, ' ')),
        [t]
    );

    // Query license status
    const { data: licenseStatus, isLoading } = useQuery(
        'license-status',
        () => apiService.getLicenseStatus(),
        {
            refetchInterval: 60000, // Refresh every minute
            select: (data) => data.license
        }
    );

    // Query license info (detailed)
    const { data: licenseInfo } = useQuery(
        'license-info',
        () => apiService.getLicenseInfo(),
        {
            select: (data) => data.license,
            retry: false
        }
    );

    // Query features
    const { data: features } = useQuery(
        'license-features',
        () => apiService.getLicenseFeatures(),
        {
            select: (data) => data.features
        }
    );

    // Query limits
    const { data: limits } = useQuery(
        'license-limits',
        () => apiService.getLicenseLimits(),
        {
            select: (data) => data.limits
        }
    );

    // Activate license mutation
    const activateMutation = useMutation(
        (key) => apiService.activateLicense(key),
        {
            onSuccess: (data) => {
                if (data.success) {
                    toast.success(t('license.activateSuccess', 'License activated successfully!'));
                    setShowActivateModal(false);
                    setLicenseKey('');
                    queryClient.invalidateQueries('license-status');
                    queryClient.invalidateQueries('license-info');
                    queryClient.invalidateQueries('license-features');
                    queryClient.invalidateQueries('license-limits');
                } else {
                    toast.error(data.error || t('license.activateFailed', 'Failed to activate license'));
                }
            },
            onError: () => {
                toast.error(t('license.activateFailed', 'Failed to activate license'));
            }
        }
    );

    // Validate license mutation
    const validateMutation = useMutation(
        () => apiService.validateLicense(),
        {
            onSuccess: (data) => {
                if (data.success) {
                    toast.success(t('license.validateSuccess', 'License validated successfully'));
                    queryClient.invalidateQueries('license-status');
                } else {
                    toast.error(t('license.validateFailed', 'License validation failed'));
                }
            },
            onError: () => {
                toast.error(t('license.validateFailed', 'Failed to validate license'));
            }
        }
    );

    // Remove license mutation
    const removeMutation = useMutation(
        () => apiService.removeLicense(),
        {
            onSuccess: () => {
                toast.success(t('license.removeSuccess', 'License removed'));
                queryClient.invalidateQueries('license-status');
                queryClient.invalidateQueries('license-info');
                queryClient.invalidateQueries('license-features');
                queryClient.invalidateQueries('license-limits');
            },
            onError: () => {
                toast.error(t('license.removeFailed', 'Failed to remove license'));
            }
        }
    );

    const handleActivate = () => {
        if (!licenseKey.trim()) {
            toast.error(t('license.enterKeyPrompt', 'Please enter a license key'));
            return;
        }
        activateMutation.mutate(licenseKey);
    };

    const getLicenseTypeLabel = (type) => {
        const labels = {
            trial: t('license.types.trial', 'Trial'),
            starter: t('license.types.starter', 'Starter'),
            professional: t('license.types.professional', 'Professional'),
            enterprise: t('license.types.enterprise', 'Enterprise'),
            lifetime: t('license.types.lifetime', 'Lifetime')
        };
        return labels[type] || type;
    };

    const getLicenseTypeColor = (type) => {
        const colors = {
            trial: 'bg-yellow-100 text-yellow-800',
            starter: 'bg-blue-100 text-blue-800',
            professional: 'bg-purple-100 text-purple-800',
            enterprise: 'bg-indigo-100 text-indigo-800',
            lifetime: 'bg-green-100 text-green-800'
        };
        return colors[type] || 'bg-gray-100 text-gray-800';
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">
                        <Key className="w-6 h-6 text-primary" />
                        <span>{t('license.managementTitle', 'License Management')}</span>
                    </h2>
                    <div className="flex items-center space-x-3">
                        {licenseStatus?.valid && (
                            <button
                                onClick={() => validateMutation.mutate()}
                                disabled={validateMutation.isLoading}
                                className="btn-secondary flex items-center space-x-2"
                            >
                                <RefreshCw className={`w-4 h-4 ${validateMutation.isLoading ? 'animate-spin' : ''}`} />
                                <span>{t('license.actions.validate', 'Validate')}</span>
                            </button>
                        )}
                        <button
                            onClick={() => setShowActivateModal(true)}
                            className="btn-primary flex items-center space-x-2"
                        >
                            <Key className="w-4 h-4" />
                            <span>{licenseStatus?.valid ? t('license.actions.change', 'Change License') : t('license.actions.activate', 'Activate License')}</span>
                        </button>
                    </div>
                </div>

                {/* License Status Card */}
                <div className="p-6">
                    {!licenseStatus?.valid ? (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                            <AlertTriangle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                                {t('license.noActiveTitle', 'No Active License')}
                            </h3>
                            <p className="text-yellow-700 mb-4">
                                {t('license.noActiveDescription', 'Please activate a license to unlock all features')}
                            </p>
                            <button
                                onClick={() => setShowActivateModal(true)}
                                className="btn-primary"
                            >
                                {t('license.actions.activate', 'Activate License')}
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* License Type */}
                            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <p className="text-indigo-100 text-sm mb-1">{t('license.typeLabel', 'License Type')}</p>
                                        <h3 className="text-2xl font-bold">
                                            {getLicenseTypeLabel(licenseStatus.license_type)}
                                        </h3>
                                    </div>
                                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${getLicenseTypeColor(licenseStatus.license_type)}`}>
                                        {licenseStatus.license_type}
                                    </div>
                                </div>
                                <div className="space-y-2 text-sm text-indigo-100">
                                    <div className="flex items-center space-x-2">
                                        <CheckCircle className="w-4 h-4" />
                                        <span>{t('license.validStatus', 'Status')}: {licenseStatus.valid ? t('license.statusActive', 'Active') : t('license.statusInactive', 'Inactive')}</span>
                                    </div>
                                    {licenseStatus.offline_mode && (
                                        <div className="flex items-center space-x-2 text-yellow-100">
                                            <AlertTriangle className="w-4 h-4" />
                                            <span>{t('license.offlineMode', 'Operating in offline validation mode')}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Expiry Information */}
                            <div className="rounded-xl border border-gray-200 p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <p className="text-sm font-medium text-gray-500">{t('license.expiration', 'Expiration')}</p>
                                        <h3 className="text-2xl font-semibold text-gray-900">
                                            {licenseStatus.days_until_expiry !== null
                                                ? `${licenseStatus.days_until_expiry} ${t('common.daysLabel', 'days')}`
                                                : t('license.noExpiry', 'No expiry date')}
                                        </h3>
                                    </div>
                                    <div className="rounded-full bg-blue-100 text-blue-600 p-3">
                                        <Calendar className="w-6 h-6" />
                                    </div>
                                </div>
                                <div className="space-y-2 text-sm text-gray-500">
                                    <div className="flex items-center space-x-2">
                                        <Calendar className="w-4 h-4" />
                                        <span>{t('license.expiresAt', 'Expires at')}: {licenseStatus.expires_at ? new Date(licenseStatus.expires_at).toLocaleDateString() : t('common.notAvailable', 'N/A')}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Calendar className="w-4 h-4" />
                                        <span>{t('license.lastValidated', 'Last validated')}: {licenseStatus.last_validated_at ? new Date(licenseStatus.last_validated_at).toLocaleString() : t('common.never', 'Never')}</span>
                                    </div>
                                    {licenseStatus.days_until_expiry !== null && licenseStatus.days_until_expiry <= 30 && (
                                        <div className="flex items-center space-x-2 text-yellow-600">
                                            <AlertTriangle className="w-4 h-4" />
                                            <span>{t('license.expiringSoon', 'License expiring soon, please renew')}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Usage Limits */}
            {licenseStatus?.valid && limits && (
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">
                            <TrendingUp className="w-5 h-5 text-primary" />
                            <span>{t('license.usageTitle', 'Usage Overview')}</span>
                        </h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Devices */}
                        <div className="bg-gray-50 rounded-lg p-5">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <p className="text-sm font-medium text-gray-500">{t('license.devices', 'Devices')}</p>
                                    <h4 className="text-xl font-semibold text-gray-900">
                                        {limits.devices.current} / {limits.devices.max}
                                    </h4>
                                </div>
                                <div className="rounded-full bg-indigo-100 text-indigo-600 p-3">
                                    <Monitor className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        limits.devices.percentage_used >= 90 ? 'bg-red-500' :
                                            limits.devices.percentage_used >= 75 ? 'bg-yellow-500' : 'bg-indigo-500'
                                    }`}
                                    style={{ width: `${Math.min(limits.devices.percentage_used, 100)}%` }}
                                />
                            </div>
                            <p className="text-sm text-gray-500 mt-3">
                                {t('license.devicesAvailable', '{{count}} device slots available', { count: limits.devices.available })}
                            </p>
                        </div>

                        {/* Users */}
                        <div className="bg-gray-50 rounded-lg p-5">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <p className="text-sm font-medium text-gray-500">{t('license.users', 'Users')}</p>
                                    <h4 className="text-xl font-semibold text-gray-900">
                                        {limits.users.current} / {limits.users.max}
                                    </h4>
                                </div>
                                <div className="rounded-full bg-blue-100 text-blue-600 p-3">
                                    <Users className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        limits.users.percentage_used >= 90 ? 'bg-red-500' :
                                            limits.users.percentage_used >= 75 ? 'bg-yellow-500' : 'bg-blue-500'
                                    }`}
                                    style={{ width: `${Math.min(limits.users.percentage_used, 100)}%` }}
                                />
                            </div>
                            <p className="text-sm text-gray-500 mt-3">
                                {t('license.usersAvailable', '{{count}} user slots available', { count: limits.users.available })}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Features */}
            {licenseStatus?.valid && features && (
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">
                            <Shield className="w-5 h-5 text-primary" />
                            <span>{t('license.featuresTitle', 'Included Features')}</span>
                        </h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(features).map(([key, enabled]) => (
                            <div
                                key={key}
                                className={`border rounded-lg p-4 flex items-start space-x-3 ${
                                    enabled ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'
                                }`}
                            >
                                {enabled ? (
                                    <CheckCircle className="w-5 h-5 text-green-500 mt-1" />
                                ) : (
                                    <XCircle className="w-5 h-5 text-gray-400 mt-1" />
                                )}
                                <div>
                                    <h4 className="font-medium text-gray-900">
                                        {formatFeatureLabel(key)}
                                    </h4>
                                    <p className="text-sm text-gray-500">
                                        {enabled
                                            ? t('license.featureEnabled', 'Enabled in current license')
                                            : t('license.featureNotEnabled', 'Upgrade to unlock')}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Advanced details */}
            {licenseStatus?.valid && licenseInfo && (
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">
                            <Info className="w-5 h-5 text-primary" />
                            <span>{t('license.detailsTitle', 'License Details')}</span>
                        </h3>
                        {licenseStatus?.valid && (
                            <button
                                onClick={() => removeMutation.mutate()}
                                disabled={removeMutation.isLoading}
                                className="btn-ghost text-red-600 hover:text-red-700 flex items-center space-x-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                <span>{t('license.actions.remove', 'Remove License')}</span>
                            </button>
                        )}
                    </div>

                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div>
                                <h4 className="text-sm font-medium text-gray-500 mb-1">
                                    {t('license.maskedKey', 'License Key')}
                                </h4>
                                <p className="font-mono text-sm text-gray-900 bg-gray-50 rounded-md px-3 py-2">
                                    {licenseInfo.license_key || t('license.notAvailable', 'Not available')}
                                </p>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-gray-500 mb-1">
                                    {t('license.instanceId', 'Instance ID')}
                                </h4>
                                <p className="font-mono text-sm text-gray-900 bg-gray-50 rounded-md px-3 py-2">
                                    {licenseInfo.instance_id}
                                </p>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-gray-500 mb-1">
                                    {t('license.hardwareId', 'Hardware ID')}
                                </h4>
                                <p className="font-mono text-sm text-gray-900 bg-gray-50 rounded-md px-3 py-2 break-all">
                                    {licenseInfo.hardware_id}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                                    {t('license.validationHistory', 'Validation History')}
                                </h4>
                                <ul className="space-y-2 text-sm text-gray-600">
                                    <li className="flex items-center space-x-2">
                                        <Zap className="w-4 h-4 text-blue-500" />
                                        <span>{t('license.activatedAt', 'Activated at')}: {licenseInfo.activated_at ? new Date(licenseInfo.activated_at).toLocaleString() : t('common.notAvailable', 'N/A')}</span>
                                    </li>
                                    <li className="flex items-center space-x-2">
                                        <RefreshCw className="w-4 h-4 text-green-500" />
                                        <span>{t('license.lastValidated', 'Last validated')}: {licenseInfo.last_validated_at ? new Date(licenseInfo.last_validated_at).toLocaleString() : t('common.never', 'Never')}</span>
                                    </li>
                                    <li className="flex items-center space-x-2">
                                        <TrendingUp className="w-4 h-4 text-indigo-500" />
                                        <span>{t('license.nextValidation', 'Next validation due')}: {licenseInfo.next_validation_due ? new Date(licenseInfo.next_validation_due).toLocaleString() : t('common.notAvailable', 'N/A')}</span>
                                    </li>
                                </ul>
                            </div>

                            {licenseInfo.is_offline_mode && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                    <div className="flex items-start space-x-3">
                                        <AlertTriangle className="w-5 h-5 text-yellow-600" />
                                        <div>
                                            <h4 className="text-sm font-semibold text-yellow-800">
                                                {t('license.offlineWarningTitle', 'Offline Validation Mode')}
                                            </h4>
                                            <p className="text-sm text-yellow-700 mt-1">
                                                {t('license.offlineWarningDescription', 'License validation failed {{count}} times.', {
                                                    count: licenseInfo.validation_failures || 0
                                                })}
                                            </p>
                                            {licenseInfo.grace_period_ends_at && (
                                                <p className="text-xs text-yellow-700 mt-2">
                                                    {t('license.gracePeriodEnds', 'Grace period ends: {{date}}', {
                                                        date: new Date(licenseInfo.grace_period_ends_at).toLocaleString()
                                                    })}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Activate License Modal */}
            {showActivateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-70">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-gray-900">
                                {licenseStatus?.valid
                                    ? t('license.changeTitle', 'Change License')
                                    : t('license.activateTitle', 'Activate License')}
                            </h3>
                            <button
                                onClick={() => setShowActivateModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('license.enterKeyLabel', 'Enter your license key')}
                                </label>
                                <textarea
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                    rows={3}
                                    value={licenseKey}
                                    onChange={(e) => setLicenseKey(e.target.value)}
                                    placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                                />
                                <p className="text-xs text-gray-500 mt-2">
                                    {t('license.keyHint', 'Paste the license key you received after purchase.')}
                                </p>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3 bg-gray-50">
                            <button
                                onClick={() => setShowActivateModal(false)}
                                className="btn-secondary"
                            >
                                {t('common.cancel', 'Cancel')}
                            </button>
                            <button
                                onClick={handleActivate}
                                className="btn-primary"
                                disabled={activateMutation.isLoading}
                            >
                                {activateMutation.isLoading
                                    ? t('common.processing', 'Processing...')
                                    : licenseStatus?.valid
                                        ? t('license.actions.update', 'Update License')
                                        : t('license.actions.activate', 'Activate License')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default LicenseManagerPanel;
