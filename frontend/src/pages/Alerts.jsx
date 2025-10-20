import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { AlertTriangle, Loader2, X, Check, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

import { apiService } from '../services/api';

const severityBadgeClass = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-green-100 text-green-700'
};

const statusBadgeClass = {
    open: 'bg-red-100 text-red-700',
    acknowledged: 'bg-yellow-100 text-yellow-700',
    resolved: 'bg-green-100 text-green-700'
};

const formatDateTime = (value) => {
    if (!value) {
        return '—';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '—';
    }
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

const AlertsPage = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const deviceId = searchParams.get('device');

    const queryKey = useMemo(() => ['alerts', deviceId], [deviceId]);
    const queryFilters = useMemo(() => (deviceId ? { device_id: deviceId } : {}), [deviceId]);

    const {
        data: alerts = [],
        isLoading,
        error,
        isFetching
    } = useQuery(
        queryKey,
        () => apiService.getAlerts(queryFilters),
        {
            select: (response) => response?.alerts || response || [],
            keepPreviousData: true,
            refetchInterval: 30000 // Refresh every 30 seconds to show new events
        }
    );

    // Mutation for acknowledging alerts
    const acknowledgeMutation = useMutation(
        ({ alertId, note }) => apiService.acknowledgeAlert(alertId, note),
        {
            onSuccess: () => {
                queryClient.invalidateQueries(queryKey);
                toast.success(t('alerts.acknowledgeSuccess', 'Alert acknowledged successfully'));
            },
            onError: (error) => {
                toast.error(error?.response?.data?.error || t('alerts.acknowledgeError', 'Failed to acknowledge alert'));
            }
        }
    );

    // Mutation for resolving alerts
    const resolveMutation = useMutation(
        ({ alertId, note }) => apiService.resolveAlert(alertId, note),
        {
            onSuccess: () => {
                queryClient.invalidateQueries(queryKey);
                toast.success(t('alerts.resolveSuccess', 'Alert resolved successfully'));
            },
            onError: (error) => {
                toast.error(error?.response?.data?.error || t('alerts.resolveError', 'Failed to resolve alert'));
            }
        }
    );

    const handleAcknowledge = (alertId) => {
        if (window.confirm(t('alerts.confirmAcknowledge', 'Are you sure you want to acknowledge this alert?'))) {
            acknowledgeMutation.mutate({ alertId, note: '' });
        }
    };

    const handleResolve = (alertId) => {
        if (window.confirm(t('alerts.confirmResolve', 'Are you sure you want to resolve this alert?'))) {
            resolveMutation.mutate({ alertId, note: '' });
        }
    };

    const formatSeverity = (severity) => {
        if (!severity) {
            return t('alerts.low');
        }
        const normalized = severity.toLowerCase();
        return t(`alerts.${normalized}`, severity);
    };

    const formatStatus = (status) => {
        if (!status) {
            return t('alerts.open');
        }
        const normalized = status.toLowerCase();
        return t(`alerts.${normalized}`, status);
    };

    const headingDescription = deviceId
        ? t('alerts.deviceFilter', { id: deviceId })
        : t('alerts.alertList');

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">{t('alerts.title')}</h1>
                    <p className="text-sm text-gray-500">{headingDescription}</p>
                </div>
                <div className="flex items-center gap-2">
                    {deviceId && (
                        <Link
                            to="/alerts"
                            className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                        >
                            <X className="mr-2 h-4 w-4 text-gray-400" />
                            {t('alerts.clearFilter')}
                        </Link>
                    )}
                    {deviceId && (
                        <Link
                            to={`/devices/${deviceId}`}
                            className="btn-secondary"
                        >
                            {t('alerts.backToDevice')}
                        </Link>
                    )}
                </div>
            </div>

            {isLoading && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-16 text-center text-indigo-500">
                    <Loader2 className="h-8 w-8 animate-spin mb-4" />
                    <p>{t('common.loading')}</p>
                </div>
            )}

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-600">
                    <AlertTriangle className="mx-auto mb-2 h-6 w-6" />
                    <p className="font-medium">{t('alerts.loadFailed', 'Failed to load alerts')}</p>
                    <p className="mt-1 text-sm text-red-500">{error.message}</p>
                </div>
            )}

            {!isLoading && !error && alerts.length === 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
                    <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                    <h2 className="text-lg font-semibold text-gray-700">{t('alerts.noAlertsFound')}</h2>
                    <p className="mt-2 text-sm text-gray-500">
                        {deviceId ? t('alerts.noAlertsForDevice') : t('alerts.noAlertsDescription')}
                    </p>
                </div>
            )}

            {alerts.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                        {t('alerts.alertType')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                        {t('alerts.message')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                        {t('alerts.severity')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                        {t('alerts.status')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                        {t('alerts.triggeredAt')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                        {t('alerts.deviceColumn')}
                                    </th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                        {t('alerts.actions', 'Actions')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {alerts.map((alert) => {
                                    const severity = alert.severity?.toLowerCase?.() || 'low';
                                    const status = alert.status?.toLowerCase?.() || 'open';
                                    const triggeredAt = alert.triggered_at || alert.created_at;

                                    return (
                                        <tr key={alert.id || `${alert.alert_type}-${triggeredAt || Math.random()}`}>
                                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                                {alert.alert_type || t('alerts.defaultType')}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600">
                                                {alert.message || t('alerts.noContext')}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${severityBadgeClass[severity] || 'bg-gray-100 text-gray-700'}`}>
                                                    {formatSeverity(severity)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass[status] || 'bg-gray-100 text-gray-700'}`}>
                                                    {formatStatus(status)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600">
                                                {formatDateTime(triggeredAt)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-indigo-600">
                                                {alert.device_id ? (
                                                    <Link to={`/devices/${alert.device_id}`} className="hover:underline">
                                                        {alert.device_name || alert.device_id}
                                                    </Link>
                                                ) : (
                                                    '—'
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <div className="flex items-center gap-2">
                                                    {status === 'open' && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                handleAcknowledge(alert.id);
                                                            }}
                                                            className="inline-flex items-center gap-1 rounded-md bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-200 transition-colors"
                                                            disabled={acknowledgeMutation.isLoading}
                                                        >
                                                            <Check className="h-3 w-3" />
                                                            {t('alerts.acknowledge', 'Acknowledge')}
                                                        </button>
                                                    )}
                                                    {(status === 'open' || status === 'acknowledged') && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                handleResolve(alert.id);
                                                            }}
                                                            className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200 transition-colors"
                                                            disabled={resolveMutation.isLoading}
                                                        >
                                                            <CheckCircle className="h-3 w-3" />
                                                            {t('alerts.resolve', 'Resolve')}
                                                        </button>
                                                    )}
                                                    {status === 'resolved' && (
                                                        <span className="text-xs text-gray-500">{t('alerts.noActions', 'No actions')}</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {isFetching && (
                        <div className="flex items-center justify-center border-t border-gray-100 bg-gray-50 py-2 text-xs text-gray-500">
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            {t('common.refreshing', 'Refreshing...')}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AlertsPage;
