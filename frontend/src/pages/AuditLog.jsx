import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import { Shield, User, Activity, Filter, Eye, Download, Search } from 'lucide-react';
import { apiService } from '../services/api';

const AuditLogPage = () => {
    const { t } = useTranslation();
    const [actionFilter, setActionFilter] = useState('all');
    const [userFilter, setUserFilter] = useState('all');
    const [dateRange, setDateRange] = useState('7d'); // 24h, 7d, 30d, all
    const [searchTerm, setSearchTerm] = useState('');

    // Fetch audit logs
    const { data: logsData = [], isLoading, refetch } = useQuery(
        ['audit-logs', actionFilter, userFilter, dateRange],
        async () => {
            const filters = {};
            if (actionFilter !== 'all') filters.action = actionFilter;
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

            const response = await apiService.getAuditLogs(filters);
            return Array.isArray(response) ? response : (response?.logs || []);
        },
        { refetchInterval: 60000 }
    );

    // Fetch users for filtering
    const { data: users = [] } = useQuery('users', apiService.getUsers);

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
        return action.split('_').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    };

    const filteredLogs = logsData.filter(log => {
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            return (
                log.action?.toLowerCase().includes(search) ||
                log.username?.toLowerCase().includes(search) ||
                log.details?.toLowerCase().includes(search) ||
                log.ip_address?.toLowerCase().includes(search)
            );
        }
        return true;
    });

    const actionTypes = [
        ...new Set(logsData.map(log => log.action))
    ].sort();

    const stats = {
        total: filteredLogs.length,
        logins: filteredLogs.filter(l => l.action === 'login').length,
        deviceChanges: filteredLogs.filter(l => l.action?.includes('device')).length,
        alertActions: filteredLogs.filter(l => l.action?.includes('alert')).length
    };

    const exportLogs = () => {
        const csv = [
            ['Timestamp', 'User', 'Action', 'IP Address', 'Details'].join(','),
            ...filteredLogs.map(log => [
                formatDateTime(log.created_at),
                log.username || 'Unknown',
                log.action,
                log.ip_address || '—',
                (log.details || '').replace(/,/g, ';')
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
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <Shield className="h-8 w-8 text-indigo-600" />
                        {t('audit.title', 'Audit Log')}
                    </h1>
                    <p className="text-gray-500 mt-1">
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                    <div className="text-sm font-medium text-gray-500">{t('audit.totalActions', 'Total Actions')}</div>
                    <div className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 border border-blue-200">
                    <div className="text-sm font-medium text-blue-600">{t('audit.logins', 'Logins')}</div>
                    <div className="text-2xl font-bold text-blue-700 mt-1">{stats.logins}</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 border border-green-200">
                    <div className="text-sm font-medium text-green-600">{t('audit.deviceChanges', 'Device Changes')}</div>
                    <div className="text-2xl font-bold text-green-700 mt-1">{stats.deviceChanges}</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 border border-purple-200">
                    <div className="text-sm font-medium text-purple-600">{t('audit.alertActions', 'Alert Actions')}</div>
                    <div className="text-2xl font-bold text-purple-700 mt-1">{stats.alertActions}</div>
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
                    <div className="p-8 text-center">
                        <Activity className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500">{t('audit.noLogs', 'No audit logs found')}</p>
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
                                                    {log.username || 'Unknown'}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {log.email}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 inline-flex items-center gap-1 text-xs leading-5 font-semibold rounded-full ${getActionColor(log.action)}`}>
                                            <span>{getActionIcon(log.action)}</span>
                                            {formatAction(log.action)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {log.details || '—'}
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
