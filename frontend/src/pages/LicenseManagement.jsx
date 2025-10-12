import React, { useState } from 'react';
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

function LicenseManagement() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [showActivateModal, setShowActivateModal] = useState(false);
    const [licenseKey, setLicenseKey] = useState('');

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
                    toast.success('License activated successfully!');
                    setShowActivateModal(false);
                    setLicenseKey('');
                    queryClient.invalidateQueries('license-status');
                    queryClient.invalidateQueries('license-info');
                    queryClient.invalidateQueries('license-features');
                    queryClient.invalidateQueries('license-limits');
                } else {
                    toast.error(data.error || 'Failed to activate license');
                }
            },
            onError: () => {
                toast.error('Failed to activate license');
            }
        }
    );

    // Validate license mutation
    const validateMutation = useMutation(
        () => apiService.validateLicense(),
        {
            onSuccess: (data) => {
                if (data.success) {
                    toast.success('License validated successfully');
                    queryClient.invalidateQueries('license-status');
                } else {
                    toast.error('License validation failed');
                }
            },
            onError: () => {
                toast.error('Failed to validate license');
            }
        }
    );

    // Remove license mutation
    const removeMutation = useMutation(
        () => apiService.removeLicense(),
        {
            onSuccess: () => {
                toast.success('License removed');
                queryClient.invalidateQueries('license-status');
                queryClient.invalidateQueries('license-info');
                queryClient.invalidateQueries('license-features');
                queryClient.invalidateQueries('license-limits');
            },
            onError: () => {
                toast.error('Failed to remove license');
            }
        }
    );

    const handleActivate = () => {
        if (!licenseKey.trim()) {
            toast.error('Please enter a license key');
            return;
        }
        activateMutation.mutate(licenseKey);
    };

    const getLicenseTypeLabel = (type) => {
        const labels = {
            trial: 'Trial',
            starter: 'Starter',
            professional: 'Professional',
            enterprise: 'Enterprise',
            lifetime: 'Lifetime'
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
                        <span>License Management</span>
                    </h2>
                    <div className="flex items-center space-x-3">
                        {licenseStatus?.valid && (
                            <button
                                onClick={() => validateMutation.mutate()}
                                disabled={validateMutation.isLoading}
                                className="btn-secondary flex items-center space-x-2"
                            >
                                <RefreshCw className={`w-4 h-4 ${validateMutation.isLoading ? 'animate-spin' : ''}`} />
                                <span>Validate</span>
                            </button>
                        )}
                        <button
                            onClick={() => setShowActivateModal(true)}
                            className="btn-primary flex items-center space-x-2"
                        >
                            <Key className="w-4 h-4" />
                            <span>{licenseStatus?.valid ? 'Change License' : 'Activate License'}</span>
                        </button>
                    </div>
                </div>

                {/* License Status Card */}
                <div className="p-6">
                    {!licenseStatus?.valid ? (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                            <AlertTriangle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                                No Active License
                            </h3>
                            <p className="text-yellow-700 mb-4">
                                Please activate a license to unlock all features
                            </p>
                            <button
                                onClick={() => setShowActivateModal(true)}
                                className="btn-primary"
                            >
                                Activate License
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* License Type */}
                            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <p className="text-indigo-100 text-sm mb-1">License Type</p>
                                        <h3 className="text-2xl font-bold">
                                            {getLicenseTypeLabel(licenseStatus.license_type)}
                                        </h3>
                                    </div>
                                    <Shield className="w-12 h-12 text-indigo-200" />
                                </div>
                                <div className="flex items-center space-x-2">
                                    <CheckCircle className="w-5 h-5 text-green-300" />
                                    <span className="text-sm">Active & Validated</span>
                                </div>
                            </div>

                            {/* Expiration */}
                            <div className="bg-white border border-gray-200 rounded-xl p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <p className="text-gray-500 text-sm mb-1">Expiration</p>
                                        <h3 className="text-2xl font-bold text-gray-900">
                                            {licenseStatus.days_until_expiry !== null
                                                ? `${licenseStatus.days_until_expiry} days`
                                                : 'Never'}
                                        </h3>
                                    </div>
                                    <Calendar className="w-12 h-12 text-gray-300" />
                                </div>
                                {licenseStatus.days_until_expiry !== null && licenseStatus.days_until_expiry <= 30 && (
                                    <div className="flex items-center space-x-2 text-orange-600">
                                        <AlertTriangle className="w-5 h-5" />
                                        <span className="text-sm">Expires soon</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Usage Limits */}
            {limits && (
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">
                            <TrendingUp className="w-5 h-5 text-primary" />
                            <span>Usage & Limits</span>
                        </h3>
                    </div>
                    <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Devices */}
                            <div className="border border-gray-200 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center space-x-2">
                                        <Monitor className="w-5 h-5 text-gray-400" />
                                        <span className="font-medium text-gray-900">Devices</span>
                                    </div>
                                    <span className="text-sm text-gray-500">
                                        {limits.devices.current} / {limits.devices.max}
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2.5">
                                    <div
                                        className={`h-2.5 rounded-full ${
                                            limits.devices.percentage_used >= 90
                                                ? 'bg-red-600'
                                                : limits.devices.percentage_used >= 70
                                                ? 'bg-yellow-600'
                                                : 'bg-green-600'
                                        }`}
                                        style={{ width: `${Math.min(limits.devices.percentage_used, 100)}%` }}
                                    ></div>
                                </div>
                                <p className="text-sm text-gray-500 mt-2">
                                    {limits.devices.available} devices available
                                </p>
                            </div>

                            {/* Users */}
                            <div className="border border-gray-200 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center space-x-2">
                                        <Users className="w-5 h-5 text-gray-400" />
                                        <span className="font-medium text-gray-900">Users</span>
                                    </div>
                                    <span className="text-sm text-gray-500">
                                        {limits.users.current} / {limits.users.max}
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2.5">
                                    <div
                                        className={`h-2.5 rounded-full ${
                                            limits.users.percentage_used >= 90
                                                ? 'bg-red-600'
                                                : limits.users.percentage_used >= 70
                                                ? 'bg-yellow-600'
                                                : 'bg-green-600'
                                        }`}
                                        style={{ width: `${Math.min(limits.users.percentage_used, 100)}%` }}
                                    ></div>
                                </div>
                                <p className="text-sm text-gray-500 mt-2">
                                    {limits.users.available} users available
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Features */}
            {features && (
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">
                            <Zap className="w-5 h-5 text-primary" />
                            <span>Available Features</span>
                        </h3>
                    </div>
                    <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {Object.entries(features).map(([key, enabled]) => (
                                <div
                                    key={key}
                                    className={`flex items-center space-x-3 p-3 rounded-lg border ${
                                        enabled
                                            ? 'border-green-200 bg-green-50'
                                            : 'border-gray-200 bg-gray-50'
                                    }`}
                                >
                                    {enabled ? (
                                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                                    ) : (
                                        <XCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                    )}
                                    <span
                                        className={`text-sm font-medium ${
                                            enabled ? 'text-green-900' : 'text-gray-500'
                                        }`}
                                    >
                                        {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* License Details */}
            {licenseInfo && (
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">
                            <Info className="w-5 h-5 text-primary" />
                            <span>License Details</span>
                        </h3>
                        {licenseStatus?.valid && (
                            <button
                                onClick={() => {
                                    if (confirm('Are you sure you want to remove this license?')) {
                                        removeMutation.mutate();
                                    }
                                }}
                                className="btn-ghost text-red-600 hover:bg-red-50"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Remove License
                            </button>
                        )}
                    </div>
                    <div className="p-6">
                        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <dt className="text-sm font-medium text-gray-500">License Key</dt>
                                <dd className="mt-1 text-sm text-gray-900 font-mono">{licenseInfo.license_key}</dd>
                            </div>
                            <div>
                                <dt className="text-sm font-medium text-gray-500">Status</dt>
                                <dd className="mt-1">
                                    <span className={`badge ${licenseInfo.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                                        {licenseInfo.status}
                                    </span>
                                </dd>
                            </div>
                            <div>
                                <dt className="text-sm font-medium text-gray-500">Activated</dt>
                                <dd className="mt-1 text-sm text-gray-900">
                                    {licenseInfo.activated_at ? new Date(licenseInfo.activated_at).toLocaleString() : 'N/A'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-sm font-medium text-gray-500">Last Validated</dt>
                                <dd className="mt-1 text-sm text-gray-900">
                                    {licenseInfo.last_validated_at ? new Date(licenseInfo.last_validated_at).toLocaleString() : 'Never'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-sm font-medium text-gray-500">Instance ID</dt>
                                <dd className="mt-1 text-sm text-gray-900 font-mono">{licenseInfo.instance_id}</dd>
                            </div>
                            <div>
                                <dt className="text-sm font-medium text-gray-500">Hardware ID</dt>
                                <dd className="mt-1 text-sm text-gray-900 font-mono truncate">{licenseInfo.hardware_id}</dd>
                            </div>
                            {licenseInfo.is_offline_mode && (
                                <div className="md:col-span-2">
                                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                        <div className="flex items-start space-x-3">
                                            <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-medium text-orange-900">Offline Mode</p>
                                                <p className="text-sm text-orange-700 mt-1">
                                                    License validation failed {licenseInfo.validation_failures} times.
                                                    {licenseInfo.grace_period_ends_at && (
                                                        <> Grace period ends: {new Date(licenseInfo.grace_period_ends_at).toLocaleString()}</>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </dl>
                    </div>
                </div>
            )}

            {/* Activate License Modal */}
            {showActivateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
                        <div className="p-6 border-b border-gray-200">
                            <h3 className="text-xl font-semibold text-gray-900">Activate License</h3>
                        </div>
                        <div className="p-6">
                            <div className="form-group">
                                <label className="form-label">License Key</label>
                                <input
                                    type="text"
                                    value={licenseKey}
                                    onChange={(e) => setLicenseKey(e.target.value)}
                                    placeholder="Enter your license key"
                                    className="input-field font-mono"
                                    autoFocus
                                />
                                <p className="text-sm text-gray-500 mt-2">
                                    Enter the license key you received from your purchase
                                </p>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
                            <button
                                onClick={() => {
                                    setShowActivateModal(false);
                                    setLicenseKey('');
                                }}
                                className="btn-secondary"
                                disabled={activateMutation.isLoading}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleActivate}
                                disabled={activateMutation.isLoading || !licenseKey.trim()}
                                className="btn-primary"
                            >
                                {activateMutation.isLoading ? 'Activating...' : 'Activate'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default LicenseManagement;
