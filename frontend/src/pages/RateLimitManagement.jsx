import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
    Shield,
    Activity,
    Users,
    Settings,
    RefreshCw,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Clock
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { apiService } from '../services/api';

function RateLimitManagement() {
    const queryClient = useQueryClient();
    const [selectedRole, setSelectedRole] = useState(null);
    const [selectedEndpoint, setSelectedEndpoint] = useState(null);
    const { t } = useTranslation();

    // Get rate limit statistics - NO auto-refresh
    const { data: stats, refetch: refetchStats } = useQuery(
        'rate-limit-stats',
        () => apiService.getRateLimitStats(),
        {
            refetchOnWindowFocus: false // Disable auto-refresh
        }
    );

    // Get rate limit configuration - NO auto-refresh
    const { data: config, refetch: refetchConfig } = useQuery(
        'rate-limit-config',
        () => apiService.getRateLimitConfig(),
        {
            refetchOnWindowFocus: false // Disable auto-refresh
        }
    );

    // Get blocked users - NO auto-refresh
    const { data: blockedUsers, refetch: refetchBlocked } = useQuery(
        'blocked-users',
        () => apiService.getBlockedUsers(),
        {
            refetchOnWindowFocus: false // Disable auto-refresh
        }
    );

    // Reset user rate limit mutation
    const resetMutation = useMutation(
        ({ userId, role, endpointType }) => apiService.resetRateLimit(userId, role, endpointType),
        {
            onSuccess: () => {
                toast.success(t('rateLimit.toast.resetSuccess'));
                refetchBlocked();
                refetchStats();
            },
            onError: (error) => {
                toast.error(
                    t('rateLimit.toast.resetError', { message: error.message || '' })
                );
            }
        }
    );

    // Update config mutation
    const updateConfigMutation = useMutation(
        ({ type, target, config }) => {
            if (type === 'role') {
                return apiService.updateRoleLimitConfig(target, config);
            } else {
                return apiService.updateEndpointLimitConfig(target, config);
            }
        },
        {
            onSuccess: () => {
                toast.success(t('rateLimit.toast.updateSuccess'));
                refetchConfig();
            },
            onError: (error) => {
                toast.error(
                    t('rateLimit.toast.updateError', { message: error.message || '' })
                );
            }
        }
    );

    const handleResetLimit = (userId, role = null, endpointType = null) => {
        if (window.confirm(t('rateLimit.confirmReset', { userId }))) {
            resetMutation.mutate({ userId, role, endpointType });
        }
    };

    const formatTimeRemaining = (seconds) => {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        return `${Math.floor(seconds / 3600)}h`;
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Shield className="h-8 w-8 text-blue-600" />
                        {t('rateLimit.title')}
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        {t('rateLimit.subtitle')}
                    </p>
                </div>
                <button
                    onClick={() => {
                        refetchStats();
                        refetchConfig();
                        refetchBlocked();
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                    <RefreshCw className="h-4 w-4" />
                    {t('rateLimit.actions.refresh')}
                </button>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">{t('rateLimit.stats.blockedUsers')}</p>
                            <p className="text-3xl font-bold text-red-600">
                                {stats?.stats?.totalBlockedUsers || 0}
                            </p>
                        </div>
                        <XCircle className="h-12 w-12 text-red-500 opacity-20" />
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">{t('rateLimit.stats.activeRateLimitedUsers')}</p>
                            <p className="text-3xl font-bold text-blue-600">
                                {stats?.stats?.activeRateLimitedUsers || 0}
                            </p>
                        </div>
                        <Users className="h-12 w-12 text-blue-500 opacity-20" />
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">{t('rateLimit.stats.totalKeys')}</p>
                            <p className="text-3xl font-bold text-green-600">
                                {stats?.stats?.totalRateLimitKeys || 0}
                            </p>
                        </div>
                        <Activity className="h-12 w-12 text-green-500 opacity-20" />
                    </div>
                </div>
            </div>

            {/* Blocked Users List */}
            {blockedUsers?.blocked?.length > 0 && (
                <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            {t('rateLimit.blocked.title')}
                        </h2>
                    </div>
                    <div className="divide-y divide-gray-200">
                        {blockedUsers.blocked.map((user) => (
                            <div key={user.key} className="px-6 py-4 flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-900">
                                        {t('rateLimit.blocked.userId', { id: user.userId })}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {t('rateLimit.blocked.blockedFor', {
                                            duration: formatTimeRemaining(user.blockedFor)
                                        })}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleResetLimit(user.userId)}
                                    disabled={resetMutation.isLoading}
                                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {t('rateLimit.actions.unblock')}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Configuration Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Role Limits */}
                <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                            <Users className="h-5 w-5 text-blue-500" />
                            {t('rateLimit.tables.roleTitle')}
                        </h2>
                    </div>
                    <div className="p-6">
                        <table className="min-w-full">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">
                                        {t('rateLimit.tables.headers.role')}
                                    </th>
                                    <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">
                                        {t('rateLimit.tables.headers.points')}
                                    </th>
                                    <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">
                                        {t('rateLimit.tables.headers.duration')}
                                    </th>
                                    <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">
                                        {t('rateLimit.tables.headers.block')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {config?.limits && Object.entries(config.limits).map(([role, limit]) => (
                                    <tr
                                        key={role}
                                        className="cursor-pointer hover:bg-gray-50"
                                        onClick={() => setSelectedRole({ role, ...limit })}
                                    >
                                        <td className="py-3 text-sm font-medium text-gray-900 capitalize">{role}</td>
                                        <td className="py-3 text-sm text-gray-500 text-right">{limit.points}</td>
                                        <td className="py-3 text-sm text-gray-500 text-right">{limit.duration}s</td>
                                        <td className="py-3 text-sm text-gray-500 text-right">{limit.blockDuration}s</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Endpoint Limits */}
                <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                            <Settings className="h-5 w-5 text-purple-500" />
                            {t('rateLimit.tables.endpointTitle')}
                        </h2>
                    </div>
                    <div className="p-6">
                        <table className="min-w-full">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">
                                        {t('rateLimit.tables.headers.endpoint')}
                                    </th>
                                    <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">
                                        {t('rateLimit.tables.headers.points')}
                                    </th>
                                    <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">
                                        {t('rateLimit.tables.headers.duration')}
                                    </th>
                                    <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">
                                        {t('rateLimit.tables.headers.block')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {config?.endpointLimits && Object.entries(config.endpointLimits).map(([endpoint, limit]) => (
                                    <tr
                                        key={endpoint}
                                        className="cursor-pointer hover:bg-gray-50"
                                        onClick={() => setSelectedEndpoint({ endpoint, ...limit })}
                                    >
                                        <td className="py-3 text-sm font-medium text-gray-900">{endpoint}</td>
                                        <td className="py-3 text-sm text-gray-500 text-right">{limit.points}</td>
                                        <td className="py-3 text-sm text-gray-500 text-right">{limit.duration}s</td>
                                        <td className="py-3 text-sm text-gray-500 text-right">{limit.blockDuration}s</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Configuration Guide */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {t('rateLimit.guide.title')}
                </h3>
                <ul className="text-sm text-blue-700 space-y-1">
                    <li>
                        • <strong>{t('rateLimit.guide.items.points.label')}</strong>{' '}
                        {t('rateLimit.guide.items.points.description')}
                    </li>
                    <li>
                        • <strong>{t('rateLimit.guide.items.duration.label')}</strong>{' '}
                        {t('rateLimit.guide.items.duration.description')}
                    </li>
                    <li>
                        • <strong>{t('rateLimit.guide.items.blockDuration.label')}</strong>{' '}
                        {t('rateLimit.guide.items.blockDuration.description')}
                    </li>
                    <li>• {t('rateLimit.guide.items.editInstruction')}</li>
                    <li>• {t('rateLimit.guide.items.redisNote')}</li>
                </ul>
            </div>
        </div>
    );
}

export default RateLimitManagement;
