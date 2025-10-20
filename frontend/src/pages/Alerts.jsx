import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { AlertTriangle, Loader2, X, Check, CheckCircle, Filter, ChevronDown, ChevronUp, Search, Cpu, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

import { apiService } from '../services/api';

const severityBadgeClass = {
    critical: 'bg-gradient-to-br from-red-500 to-red-600 text-white',
    high: 'bg-gradient-to-br from-orange-500 to-orange-600 text-white',
    medium: 'bg-gradient-to-br from-yellow-500 to-orange-600 text-white',
    low: 'bg-gradient-to-br from-green-500 to-emerald-600 text-white'
};

const statusBadgeClass = {
    active: 'bg-gradient-to-br from-red-500 to-red-600 text-white',
    open: 'bg-gradient-to-br from-red-500 to-red-600 text-white',
    acknowledged: 'bg-gradient-to-br from-yellow-500 to-orange-600 text-white',
    resolved: 'bg-gradient-to-br from-green-500 to-emerald-600 text-white'
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

    const [searchQuery, setSearchQuery] = useState('');
    const [severityFilter, setSeverityFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [showFilters, setShowFilters] = useState(false);

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
            refetchInterval: 30000
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

    const handleAcknowledge = (alertId, e) => {
        e.preventDefault();
        acknowledgeMutation.mutate({ alertId, note: '' });
    };

    const handleResolve = (alertId, e) => {
        e.preventDefault();
        resolveMutation.mutate({ alertId, note: '' });
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
            return t('alerts.active');
        }
        const normalized = status.toLowerCase();
        const translationKey = normalized === 'active' ? 'open' : normalized;
        return t(`alerts.${translationKey}`, status);
    };

    // Filter alerts
    const filteredAlerts = alerts.filter(alert => {
        const matchesSearch = !searchQuery ||
            alert.alert_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            alert.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            alert.device_name?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesSeverity = severityFilter === 'all' ||
            alert.severity?.toLowerCase() === severityFilter;

        const matchesStatus = statusFilter === 'all' ||
            alert.status?.toLowerCase() === statusFilter;

        return matchesSearch && matchesSeverity && matchesStatus;
    });

    // Calculate stats
    const stats = {
        total: alerts.length,
        active: alerts.filter(a => a.status?.toLowerCase() === 'active').length,
        critical: alerts.filter(a => a.severity?.toLowerCase() === 'critical').length,
        resolved: alerts.filter(a => a.status?.toLowerCase() === 'resolved').length
    };

    const headingDescription = deviceId
        ? t('alerts.deviceFilter', { id: deviceId })
        : t('alerts.alertList');

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">{t('alerts.title')}</h1>
                    <p className="text-sm text-gray-500">{headingDescription}</p>
                </div>
                <div className="flex items-center gap-2">
                    {deviceId && (
                        <>
                            <Link
                                to="/alerts"
                                className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                            >
                                <X className="mr-2 h-4 w-4 text-gray-400" />
                                {t('alerts.clearFilter')}
                            </Link>
                            <Link
                                to={`/devices/${deviceId}`}
                                className="btn-secondary"
                            >
                                {t('alerts.backToDevice')}
                            </Link>
                        </>
                    )}
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-6 text-white shadow-sm">
                    <div className="relative z-10">
                        <p className="text-sm font-medium opacity-90">{t('alerts.totalAlerts', 'Total Alerts')}</p>
                        <p className="mt-2 text-3xl font-bold">{stats.total}</p>
                    </div>
                    <AlertTriangle className="absolute right-4 top-4 h-16 w-16 opacity-20" />
                </div>

                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-red-500 to-red-600 p-6 text-white shadow-sm">
                    <div className="relative z-10">
                        <p className="text-sm font-medium opacity-90">{t('alerts.activeAlerts', 'Active Alerts')}</p>
                        <p className="mt-2 text-3xl font-bold">{stats.active}</p>
                    </div>
                    <AlertTriangle className="absolute right-4 top-4 h-16 w-16 opacity-20" />
                </div>

                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-orange-500 to-red-600 p-6 text-white shadow-sm">
                    <div className="relative z-10">
                        <p className="text-sm font-medium opacity-90">{t('alerts.criticalAlerts', 'Critical Alerts')}</p>
                        <p className="mt-2 text-3xl font-bold">{stats.critical}</p>
                    </div>
                    <AlertTriangle className="absolute right-4 top-4 h-16 w-16 opacity-20" />
                </div>

                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 p-6 text-white shadow-sm">
                    <div className="relative z-10">
                        <p className="text-sm font-medium opacity-90">{t('alerts.resolvedAlerts', 'Resolved Alerts')}</p>
                        <p className="mt-2 text-3xl font-bold">{stats.resolved}</p>
                    </div>
                    <CheckCircle className="absolute right-4 top-4 h-16 w-16 opacity-20" />
                </div>
            </div>

            {/* Search and Filters */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('alerts.searchPlaceholder', 'Search alerts...')}
                                className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                                showFilters
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            <Filter className="h-4 w-4" />
                            {t('alerts.filters', 'Filters')}
                            {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                    </div>

                    {showFilters && (
                        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                    {t('alerts.severity', 'Severity')}
                                </label>
                                <select
                                    value={severityFilter}
                                    onChange={(e) => setSeverityFilter(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                >
                                    <option value="all">{t('alerts.allSeverities', 'All Severities')}</option>
                                    <option value="critical">{t('alerts.critical', 'Critical')}</option>
                                    <option value="high">{t('alerts.high', 'High')}</option>
                                    <option value="medium">{t('alerts.medium', 'Medium')}</option>
                                    <option value="low">{t('alerts.low', 'Low')}</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                    {t('alerts.status', 'Status')}
                                </label>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                >
                                    <option value="all">{t('alerts.allStatuses', 'All Statuses')}</option>
                                    <option value="active">{t('alerts.open', 'Open')}</option>
                                    <option value="acknowledged">{t('alerts.acknowledged', 'Acknowledged')}</option>
                                    <option value="resolved">{t('alerts.resolved', 'Resolved')}</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                {filteredAlerts.length > 0 && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
                        {t('alerts.showingResults', 'Showing {{count}} of {{total}} alerts', {
                            count: filteredAlerts.length,
                            total: alerts.length
                        })}
                    </div>
                )}
            </div>

            {/* Loading State */}
            {isLoading && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-16 text-center text-indigo-500">
                    <Loader2 className="h-8 w-8 animate-spin mb-4" />
                    <p>{t('common.loading')}</p>
                </div>
            )}

            {/* Error State */}
            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-600">
                    <AlertTriangle className="mx-auto mb-2 h-6 w-6" />
                    <p className="font-medium">{t('alerts.loadFailed', 'Failed to load alerts')}</p>
                    <p className="mt-1 text-sm text-red-500">{error.message}</p>
                </div>
            )}

            {/* Empty State */}
            {!isLoading && !error && filteredAlerts.length === 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
                    <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                    <h2 className="text-lg font-semibold text-gray-700">{t('alerts.noAlertsFound')}</h2>
                    <p className="mt-2 text-sm text-gray-500">
                        {deviceId ? t('alerts.noAlertsForDevice') : t('alerts.noAlertsDescription')}
                    </p>
                </div>
            )}

            {/* Alerts Grid */}
            {filteredAlerts.length > 0 && (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {filteredAlerts.map((alert) => {
                        const severity = alert.severity?.toLowerCase?.() || 'low';
                        const status = alert.status?.toLowerCase?.() || 'active';
                        const triggeredAt = alert.triggered_at || alert.created_at;

                        return (
                            <div
                                key={alert.id || `${alert.alert_type}-${triggeredAt || Math.random()}`}
                                className="group relative overflow-hidden rounded-xl bg-white p-6 shadow-sm border border-gray-200 transition-all duration-200 hover:shadow-lg hover:scale-[1.02] animate-fade-in"
                            >
                                {/* Status Badge */}
                                <div className={`absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-semibold shadow-md ${statusBadgeClass[status] || 'bg-gray-100 text-gray-700'}`}>
                                    {formatStatus(status)}
                                </div>

                                {/* Alert Type with Badge */}
                                <div className="mb-3 pr-20">
                                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                                        {alert.alert_type || t('alerts.defaultType')}
                                    </h3>
                                    {alert.alert_type === 'threshold_crossing' && (
                                        <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                            <Cpu className="h-3 w-3" />
                                            {t('alerts.firmwareDetected', 'Device-detected')}
                                        </span>
                                    )}
                                    {alert.alert_type === 'RULE_VIOLATION' && (
                                        <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                                            <FileText className="h-3 w-3" />
                                            {t('alerts.ruleTriggered', 'Rule-triggered')}
                                        </span>
                                    )}
                                </div>

                                {/* Message */}
                                <p className="mb-4 text-sm text-gray-600 line-clamp-2">
                                    {alert.message || t('alerts.noContext')}
                                </p>

                                {/* Metadata Grid */}
                                <div className="mb-4 grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                        <p className="font-medium text-gray-500">{t('alerts.severity')}</p>
                                        <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${severityBadgeClass[severity] || 'bg-gray-100 text-gray-700'}`}>
                                            {formatSeverity(severity)}
                                        </span>
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-500">{t('alerts.triggeredAt')}</p>
                                        <p className="mt-1 text-gray-900">{formatDateTime(triggeredAt)}</p>
                                    </div>
                                    {alert.device_id && (
                                        <div className="col-span-2">
                                            <p className="font-medium text-gray-500">{t('alerts.deviceColumn')}</p>
                                            <Link
                                                to={`/devices/${alert.device_id}`}
                                                className="mt-1 text-indigo-600 hover:underline block"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {alert.device_name || alert.device_id}
                                            </Link>
                                        </div>
                                    )}
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
                                    {status === 'active' && (
                                        <>
                                            <button
                                                onClick={(e) => handleAcknowledge(alert.id, e)}
                                                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-yellow-50 px-3 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-100 transition-colors disabled:opacity-50"
                                                disabled={acknowledgeMutation.isLoading}
                                            >
                                                <Check className="h-4 w-4" />
                                                {t('alerts.acknowledge', 'Acknowledge')}
                                            </button>
                                            <button
                                                onClick={(e) => handleResolve(alert.id, e)}
                                                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
                                                disabled={resolveMutation.isLoading}
                                            >
                                                <CheckCircle className="h-4 w-4" />
                                                {t('alerts.resolve', 'Resolve')}
                                            </button>
                                        </>
                                    )}
                                    {status === 'acknowledged' && (
                                        <button
                                            onClick={(e) => handleResolve(alert.id, e)}
                                            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
                                            disabled={resolveMutation.isLoading}
                                        >
                                            <CheckCircle className="h-4 w-4" />
                                            {t('alerts.resolve', 'Resolve')}
                                        </button>
                                    )}
                                    {status === 'resolved' && (
                                        <span className="flex-1 text-center text-sm text-gray-500">
                                            {t('alerts.noActions', 'No actions available')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Refreshing Indicator */}
            {isFetching && !isLoading && (
                <div className="flex items-center justify-center rounded-lg bg-gray-50 py-3 text-xs text-gray-500">
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    {t('common.refreshing', 'Refreshing...')}
                </div>
            )}
        </div>
    );
};

export default AlertsPage;
