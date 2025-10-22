import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { AlertTriangle, CheckCircle, XCircle, Clock, Filter, Eye, Check, X, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';

const AlertsPage = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [statusFilter, setStatusFilter] = useState('all'); // all, open, acknowledged, resolved
    const [severityFilter, setSeverityFilter] = useState('all'); // all, critical, high, medium, low
    const [deviceFilter, setDeviceFilter] = useState('all');
    const [selectedAlert, setSelectedAlert] = useState(null);
    const [acknowledgeNote, setAcknowledgeNote] = useState('');

    // Fetch alerts
    const { data: alertsData = [], isLoading, refetch } = useQuery(
        ['alerts', statusFilter, severityFilter, deviceFilter],
        async () => {
            const filters = {};
            if (statusFilter !== 'all') filters.status = statusFilter;
            if (severityFilter !== 'all') filters.severity = severityFilter;
            if (deviceFilter !== 'all') filters.device_id = deviceFilter;

            const response = await apiService.getAlerts(filters);
            return Array.isArray(response) ? response : (response?.alerts || []);
        },
        { refetchInterval: 30000 }
    );

    // Fetch devices for filtering
    const { data: devices = [] } = useQuery(
        'devices',
        apiService.getDevices,
        {
            select: (data) => data?.devices || []
        }
    );

    // Acknowledge alert mutation
    const acknowledgeMutation = useMutation(
        ({ alertId, note }) => apiService.acknowledgeAlert(alertId, note),
        {
            onSuccess: () => {
                toast.success(t('alerts.acknowledgeSuccess', 'Alert acknowledged'));
                refetch();
                setSelectedAlert(null);
                setAcknowledgeNote('');
            },
            onError: () => {
                toast.error(t('alerts.acknowledgeError', 'Failed to acknowledge alert'));
            }
        }
    );

    // Resolve alert mutation
    const resolveMutation = useMutation(
        ({ alertId, note }) => apiService.resolveAlert(alertId, note),
        {
            onSuccess: () => {
                toast.success(t('alerts.resolveSuccess', 'Alert resolved'));
                refetch();
                setSelectedAlert(null);
                setAcknowledgeNote('');
            },
            onError: () => {
                toast.error(t('alerts.resolveError', 'Failed to resolve alert'));
            }
        }
    );

    const getSeverityColor = (severity) => {
        const colors = {
            critical: 'bg-red-100 text-red-800 border-red-200',
            high: 'bg-orange-100 text-orange-800 border-orange-200',
            medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
            low: 'bg-blue-100 text-blue-800 border-blue-200'
        };
        return colors[severity] || colors.medium;
    };

    const getStatusColor = (status) => {
        const colors = {
            open: 'bg-red-100 text-red-800',
            acknowledged: 'bg-yellow-100 text-yellow-800',
            resolved: 'bg-green-100 text-green-800'
        };
        return colors[status] || colors.open;
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'open': return <AlertTriangle className="h-4 w-4" />;
            case 'acknowledged': return <Clock className="h-4 w-4" />;
            case 'resolved': return <CheckCircle className="h-4 w-4" />;
            default: return <AlertTriangle className="h-4 w-4" />;
        }
    };

    const formatDateTime = (date) => {
        if (!date) return '—';
        return new Date(date).toLocaleString();
    };

    const stats = {
        total: alertsData.length,
        open: alertsData.filter(a => a.status === 'open').length,
        acknowledged: alertsData.filter(a => a.status === 'acknowledged').length,
        resolved: alertsData.filter(a => a.status === 'resolved').length,
        critical: alertsData.filter(a => a.severity === 'critical').length
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-6 space-y-6 animate-fade-in">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">
                    {t('alerts.title', 'Alerts')}
                </h1>
                <p className="text-gray-500 mt-1">
                    {t('alerts.subtitle', 'Monitor and manage system alerts')}
                </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
                    <div className="relative z-10">
                        <p className="text-sm font-medium opacity-90">{t('alerts.total', 'Total')}</p>
                        <p className="text-3xl font-bold mt-2">{stats.total}</p>
                    </div>
                    <AlertTriangle className="absolute right-4 top-4 h-12 w-12 opacity-20" />
                </div>
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-red-500 to-red-600 p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
                    <div className="relative z-10">
                        <p className="text-sm font-medium opacity-90">{t('alerts.open', 'Open')}</p>
                        <p className="text-3xl font-bold mt-2">{stats.open}</p>
                    </div>
                    <XCircle className="absolute right-4 top-4 h-12 w-12 opacity-20" />
                </div>
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-yellow-500 to-yellow-600 p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
                    <div className="relative z-10">
                        <p className="text-sm font-medium opacity-90">{t('alerts.acknowledged', 'Acknowledged')}</p>
                        <p className="text-3xl font-bold mt-2">{stats.acknowledged}</p>
                    </div>
                    <Clock className="absolute right-4 top-4 h-12 w-12 opacity-20" />
                </div>
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-green-500 to-green-600 p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
                    <div className="relative z-10">
                        <p className="text-sm font-medium opacity-90">{t('alerts.resolved', 'Resolved')}</p>
                        <p className="text-3xl font-bold mt-2">{stats.resolved}</p>
                    </div>
                    <CheckCircle className="absolute right-4 top-4 h-12 w-12 opacity-20" />
                </div>
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
                    <div className="relative z-10">
                        <p className="text-sm font-medium opacity-90">{t('alerts.critical', 'Critical')}</p>
                        <p className="text-3xl font-bold mt-2">{stats.critical}</p>
                    </div>
                    <AlertTriangle className="absolute right-4 top-4 h-12 w-12 opacity-20" />
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Filter className="inline h-4 w-4 mr-1" />
                            {t('alerts.filterStatus', 'Status')}
                        </label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full rounded-md border-gray-300"
                        >
                            <option value="all">{t('alerts.allStatuses', 'All Statuses')}</option>
                            <option value="open">{t('alerts.open', 'Open')}</option>
                            <option value="acknowledged">{t('alerts.acknowledged', 'Acknowledged')}</option>
                            <option value="resolved">{t('alerts.resolved', 'Resolved')}</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('alerts.filterSeverity', 'Severity')}
                        </label>
                        <select
                            value={severityFilter}
                            onChange={(e) => setSeverityFilter(e.target.value)}
                            className="w-full rounded-md border-gray-300"
                        >
                            <option value="all">{t('alerts.allSeverities', 'All Severities')}</option>
                            <option value="critical">{t('severity.critical', 'Critical')}</option>
                            <option value="high">{t('severity.high', 'High')}</option>
                            <option value="medium">{t('severity.medium', 'Medium')}</option>
                            <option value="low">{t('severity.low', 'Low')}</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('alerts.filterDevice', 'Device')}
                        </label>
                        <select
                            value={deviceFilter}
                            onChange={(e) => setDeviceFilter(e.target.value)}
                            className="w-full rounded-md border-gray-300"
                        >
                            <option value="all">{t('alerts.allDevices', 'All Devices')}</option>
                            {devices.map(device => (
                                <option key={device.id} value={device.id}>
                                    {device.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Alerts Table */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="p-8 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                        <p className="text-gray-500 mt-2">{t('common.loading', 'Loading...')}</p>
                    </div>
                ) : alertsData.length === 0 ? (
                    <div className="p-8 text-center">
                        <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-2" />
                        <p className="text-gray-500">{t('alerts.noAlerts', 'No alerts found')}</p>
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('alerts.severity', 'Severity')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('alerts.device', 'Device')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('alerts.message', 'Message')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('alerts.time', 'Time')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('alerts.status', 'Status')}
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('common.actions', 'Actions')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {alertsData.map((alert) => (
                                <tr key={alert.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${getSeverityColor(alert.severity)}`}>
                                            {alert.severity}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">
                                            {alert.device_name || 'Unknown Device'}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {alert.sensor_name || alert.alert_type}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-gray-900">{alert.message}</div>
                                        {alert.value && (
                                            <div className="text-xs text-gray-500">
                                                Value: {alert.value}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {formatDateTime(alert.created_at)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 inline-flex items-center gap-1 text-xs leading-5 font-semibold rounded-full ${getStatusColor(alert.status)}`}>
                                            {getStatusIcon(alert.status)}
                                            {alert.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {alert.status === 'open' && (
                                            <button
                                                onClick={() => setSelectedAlert(alert)}
                                                className="text-indigo-600 hover:text-indigo-900 mr-3"
                                                title={t('alerts.acknowledge', 'Acknowledge')}
                                            >
                                                <Check className="h-4 w-4" />
                                            </button>
                                        )}
                                        {(alert.status === 'open' || alert.status === 'acknowledged') && (
                                            <button
                                                onClick={() => {
                                                    setSelectedAlert(alert);
                                                    setAcknowledgeNote('resolve');
                                                }}
                                                className="text-green-600 hover:text-green-900 mr-3"
                                                title={t('alerts.resolve', 'Resolve')}
                                            >
                                                <CheckCircle className="h-4 w-4" />
                                            </button>
                                        )}
                                        <Link
                                            to={`/devices/${alert.device_id}`}
                                            className="text-gray-600 hover:text-gray-900"
                                            title={t('alerts.viewDevice', 'View Device')}
                                        >
                                            <Eye className="h-4 w-4" />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Acknowledge/Resolve Modal */}
            {selectedAlert && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md bg-white rounded-lg shadow-xl">
                        <div className="border-b border-gray-200 p-6">
                            <h3 className="text-xl font-semibold text-gray-900">
                                {acknowledgeNote === 'resolve'
                                    ? t('alerts.resolveAlert', 'Resolve Alert')
                                    : t('alerts.acknowledgeAlert', 'Acknowledge Alert')}
                            </h3>
                        </div>

                        <div className="p-6">
                            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                                <div className="text-sm font-medium text-gray-900">{selectedAlert.message}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {selectedAlert.device_name} • {formatDateTime(selectedAlert.created_at)}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <MessageSquare className="inline h-4 w-4 mr-1" />
                                    {t('alerts.addNote', 'Add Note (optional)')}
                                </label>
                                <textarea
                                    value={acknowledgeNote === 'resolve' ? '' : acknowledgeNote}
                                    onChange={(e) => setAcknowledgeNote(e.target.value)}
                                    className="w-full rounded-md border-gray-300"
                                    rows="3"
                                    placeholder={t('alerts.notePlaceholder', 'Describe the action taken...')}
                                    disabled={acknowledgeNote === 'resolve'}
                                />
                            </div>
                        </div>

                        <div className="border-t border-gray-200 p-6 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setSelectedAlert(null);
                                    setAcknowledgeNote('');
                                }}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                            >
                                {t('common.cancel', 'Cancel')}
                            </button>
                            <button
                                onClick={() => {
                                    if (acknowledgeNote === 'resolve') {
                                        resolveMutation.mutate({ alertId: selectedAlert.id, note: '' });
                                    } else {
                                        acknowledgeMutation.mutate({
                                            alertId: selectedAlert.id,
                                            note: acknowledgeNote
                                        });
                                    }
                                }}
                                className={`px-4 py-2 text-sm font-medium text-white rounded-md ${acknowledgeNote === 'resolve'
                                        ? 'bg-green-600 hover:bg-green-700'
                                        : 'bg-indigo-600 hover:bg-indigo-700'
                                    }`}
                                disabled={acknowledgeMutation.isLoading || resolveMutation.isLoading}
                            >
                                {acknowledgeNote === 'resolve'
                                    ? t('alerts.resolve', 'Resolve')
                                    : t('alerts.acknowledge', 'Acknowledge')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AlertsPage;
