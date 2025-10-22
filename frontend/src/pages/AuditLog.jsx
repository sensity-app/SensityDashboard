import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import { Shield, User, Activity, Filter, Eye, Download, Search } from 'lucide-react';
import { apiService } from '../services/api';

const AuditLogPage = () => {
    const { t } = useTranslation();
    const [actionFilter, setActionFilter] = useState('all');
    const [userFilter, setUserFilter] = useState('all');
    const [dateRange, setDateRange] = useState('all'); // Changed default to 'all' to show all logs
    const [searchTerm, setSearchTerm] = useState('');

    // Fetch audit logs
    const { data: logsResponse = { logs: [], total: 0 }, isLoading, refetch } = useQuery(
        ['audit-logs', actionFilter, userFilter, dateRange],
        async () => {
            const filters = {};
            if (actionFilter !== 'all') filters.action_type = actionFilter;
            if (userFilter !== 'all') filters.user_id = userFilter;
            if (dateRange !== 'all') {
                const now = new Date();
                const ranges = {
                    '24h': 24 * 60 * 60 * 1000,
                    '7d': 7 * 24 * 60 * 60 * 1000,
                    '30d': 30 * 24 * 60 * 60 * 1000
                };
                const startDate = new Date(now.getTime() - ranges[dateRange]);
                filters.start_date = startDate.toISOString();
            }

            return apiService.getAuditLogs(filters);
        },
        { refetchInterval: 60000 }
    );

    // Fetch users for filtering
    const { data: usersData } = useQuery('users', apiService.getUsers);
    const users = Array.isArray(usersData) ? usersData : (usersData?.users || []);

    const getActionColor = (action) => {
        const colors = {
            'login': 'bg-blue-100 text-blue-800',
            'logout': 'bg-gray-100 text-gray-800',
            'device_created': 'bg-green-100 text-green-800',
            'device_updated': 'bg-yellow-100 text-yellow-800',
            'device_deleted': 'bg-red-100 text-red-800',
            'alert_acknowledged': 'bg-purple-100 text-purple-800',
            'alert_resolved': 'bg-green-100 text-green-800',
            'user_created': 'bg-green-100 text-green-800',
            'user_updated': 'bg-yellow-100 text-yellow-800',
            'user_deleted': 'bg-red-100 text-red-800',
            'settings_updated': 'bg-indigo-100 text-indigo-800',
            'firmware_uploaded': 'bg-purple-100 text-purple-800',
            'sensor_configured': 'bg-cyan-100 text-cyan-800'
        };
        return colors[action] || 'bg-gray-100 text-gray-800';
    };

    const getActionIcon = (action) => {
        if (action.includes('login')) return '🔐';
        if (action.includes('logout')) return '🚪';
        if (action.includes('device')) return '📱';
        if (action.includes('alert')) return '🔔';
        if (action.includes('user')) return '👤';
        if (action.includes('settings')) return '⚙️';
        if (action.includes('firmware')) return '⚡';
        if (action.includes('sensor')) return '📊';
        return '📝';
    };

    const formatDateTime = (date) => {
        if (!date) return '—';
        return new Date(date).toLocaleString();
    };

    const formatAction = (action) => {
        if (!action) return '—';
        return action.replace(/\./g, '_').split('_').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    };

    const logs = logsResponse?.logs || [];

    const normalizedLogs = useMemo(() => {
        return logs.map((log) => {
            const actionKey = log.action_type || log.action || '';
            const actionLabel = formatAction(actionKey);
            const userDisplay = log.user_email || log.username || log.user || log.email || 'Unknown';
            const userIdValue = log.user_id ?? log.userId ?? null;

            let metadata = log.metadata;
            if (typeof metadata === 'string') {
                try {
                    metadata = JSON.parse(metadata);
                } catch {
                    metadata = null;
                }
            }

            let detailsText = log.details || '';
            if (!detailsText && metadata && typeof metadata === 'object') {
                detailsText = Object.entries(metadata)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ');
            }

            if ((!detailsText || detailsText === '—') && (log.resource_type || log.resource_name)) {
                detailsText = [log.resource_type, log.resource_name].filter(Boolean).join(': ');
            }

            return {
                ...log,
                actionKey,
                actionLabel,
                userDisplay,
                userIdValue,
                metadata,
                detailsText: detailsText || '—'
            };
        });
    }, [logs]);

    const filteredLogs = normalizedLogs.filter(log => {
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            return (
                log.actionKey?.toLowerCase().includes(search) ||
                log.actionLabel?.toLowerCase().includes(search) ||
                log.userDisplay?.toLowerCase().includes(search) ||
                log.detailsText?.toLowerCase().includes(search) ||
                log.ip_address?.toLowerCase().includes(search)
            );
        }

        if (actionFilter !== 'all' && log.actionKey !== actionFilter) {
            return false;
        }

        if (userFilter !== 'all' && String(log.userIdValue) !== String(userFilter)) {
            return false;
        }

        return true;
    });

    const actionTypes = [
        ...new Set(normalizedLogs.map(log => log.actionKey).filter(Boolean))
    ].sort();

    const stats = {
        total: filteredLogs.length,
        logins: filteredLogs.filter(l => l.actionKey?.includes('login')).length,
        deviceChanges: filteredLogs.filter(l => l.actionKey?.includes('device')).length,
        alertActions: filteredLogs.filter(l => l.actionKey?.includes('alert')).length
    };

    const exportLogs = () => {
        const csv = [
            ['Timestamp', 'User', 'Action', 'IP Address', 'Details'].join(','),
            ...filteredLogs.map(log => [
                formatDateTime(log.created_at),
                log.userDisplay || 'Unknown',
                log.actionLabel,
                log.ip_address || '—',
                (log.detailsText || '').replace(/,/g, ';')
            ].join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-log-${new Date().toISOString()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-6 space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <Shield className="h-8 w-8 text-indigo-600" />
                        {t('audit.title', 'Audit Log')}
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        {t('audit.subtitle', 'Track user actions and system changes')}
                    </p>
                </div>
                <button
                    onClick={exportLogs}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-2"
                >
                    <Download className="h-4 w-4" />
                    {t('audit.export', 'Export CSV')}
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
                    <div className="relative z-10">
                        <p className="text-sm font-medium opacity-90">{t('audit.totalActions', 'Total Actions')}</p>
                        <p className="mt-2 text-3xl font-bold">{stats.total}</p>
                    </div>
                    <Shield className="absolute right-4 top-4 h-12 w-12 opacity-20" />
                </div>
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
                    <div className="relative z-10">
                        <p className="text-sm font-medium opacity-90">{t('audit.logins', 'Logins')}</p>
                        <p className="mt-2 text-3xl font-bold">{stats.logins}</p>
                    </div>
                    <User className="absolute right-4 top-4 h-12 w-12 opacity-20" />
                </div>
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-green-500 to-green-600 p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
                    <div className="relative z-10">
                        <p className="text-sm font-medium opacity-90">{t('audit.deviceChanges', 'Device Changes')}</p>
                        <p className="mt-2 text-3xl font-bold">{stats.deviceChanges}</p>
                    </div>
                    <Activity className="absolute right-4 top-4 h-12 w-12 opacity-20" />
                </div>
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
                    <div className="relative z-10">
                        <p className="text-sm font-medium opacity-90">{t('audit.alertActions', 'Alert Actions')}</p>
                        <p className="mt-2 text-3xl font-bold">{stats.alertActions}</p>
                    </div>
                    <Filter className="absolute right-4 top-4 h-12 w-12 opacity-20" />
                </div>
            </div>

            {/* Filters and Search */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Search className="inline h-4 w-4 mr-1" />
                            {t('audit.search', 'Search')}
                        </label>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={t('audit.searchPlaceholder', 'Search logs...')}
                            className="w-full rounded-md border-gray-300"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Filter className="inline h-4 w-4 mr-1" />
                            {t('audit.filterAction', 'Action Type')}
                        </label>
                        <select
                            value={actionFilter}
                            onChange={(e) => setActionFilter(e.target.value)}
                            className="w-full rounded-md border-gray-300"
                        >
                            <option value="all">{t('audit.allActions', 'All Actions')}</option>
                            {actionTypes.map(action => (
                                <option key={action} value={action}>
                                    {formatAction(action)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <User className="inline h-4 w-4 mr-1" />
                            {t('audit.filterUser', 'User')}
                        </label>
                        <select
                            value={userFilter}
                            onChange={(e) => setUserFilter(e.target.value)}
                            className="w-full rounded-md border-gray-300"
                        >
                            <option value="all">{t('audit.allUsers', 'All Users')}</option>
                            {users.map(user => (
                                <option key={user.id} value={user.id}>
                                    {user.username || user.email}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('audit.dateRange', 'Date Range')}
                        </label>
                        <select
                            value={dateRange}
                            onChange={(e) => setDateRange(e.target.value)}
                            className="w-full rounded-md border-gray-300"
                        >
                            <option value="24h">{t('audit.last24h', 'Last 24 Hours')}</option>
                            <option value="7d">{t('audit.last7d', 'Last 7 Days')}</option>
                            <option value="30d">{t('audit.last30d', 'Last 30 Days')}</option>
                            <option value="all">{t('audit.allTime', 'All Time')}</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Audit Log Table */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="p-8 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                        <p className="text-gray-500 mt-2">{t('common.loading', 'Loading...')}</p>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                            <Activity className="h-8 w-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            {t('audit.noLogs', 'No audit logs found')}
                        </h3>
                        <p className="text-sm text-gray-500 mb-4">
                            Audit logs will appear here when users perform actions like:
                        </p>
                        <div className="max-w-md mx-auto text-left bg-gray-50 rounded-lg p-4">
                            <ul className="space-y-2 text-sm text-gray-600">
                                <li className="flex items-center gap-2">
                                    <span className="text-blue-600">🔐</span> Login/Logout
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="text-green-600">📱</span> Creating/updating/deleting devices
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="text-yellow-600">🔔</span> Acknowledging/resolving alerts
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="text-purple-600">👤</span> User management actions
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="text-indigo-600">⚙️</span> System settings changes
                                </li>
                            </ul>
                        </div>
                        <p className="text-xs text-gray-500 mt-4">
                            Try changing the date range filter to "All Time" to see historical logs
                        </p>
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('audit.timestamp', 'Timestamp')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('audit.user', 'User')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('audit.action', 'Action')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('audit.details', 'Details')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('audit.ipAddress', 'IP Address')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredLogs.map((log, index) => (
                                <tr key={log.id || index} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {formatDateTime(log.created_at)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium">
                                                {(log.username || log.email || 'U').charAt(0).toUpperCase()}
                                            </div>
                                            <div className="ml-3">
                                            <div className="text-sm font-medium text-gray-900">
                                                {log.userDisplay || 'Unknown'}
                                            </div>
                                                <div className="text-xs text-gray-500">
                                                    {log.email}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 inline-flex items-center gap-1 text-xs leading-5 font-semibold rounded-full ${getActionColor(log.actionKey)}`}>
                                            <span>{getActionIcon(log.actionKey)}</span>
                                            {log.actionLabel}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {log.detailsText || '—'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {log.ip_address || '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination info */}
            <div className="mt-4 text-sm text-gray-500 text-center">
                {t('audit.showing', 'Showing')} {filteredLogs.length} {t('audit.entries', 'entries')}
            </div>
        </div>
    );
};

export default AuditLogPage;
