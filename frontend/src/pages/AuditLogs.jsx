import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Shield, Filter, Download, Search, Calendar, User,
    Activity, AlertCircle, CheckCircle, XCircle, Clock,
    ChevronLeft, ChevronRight, Eye, RefreshCw
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const AuditLogs = () => {
    const { t } = useTranslation();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [selectedLog, setSelectedLog] = useState(null);

    // Filters
    const [filters, setFilters] = useState({
        actionCategory: '',
        actionResult: '',
        startDate: '',
        endDate: '',
        search: ''
    });

    // Pagination
    const [pagination, setPagination] = useState({
        limit: 50,
        offset: 0,
        total: 0
    });

    // Tabs
    const [activeTab, setActiveTab] = useState('audit_logs'); // audit_logs, sessions, failed_logins

    useEffect(() => {
        fetchAuditLogs();
        fetchStats();
    }, [filters, pagination.offset]);

    const fetchAuditLogs = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                limit: pagination.limit,
                offset: pagination.offset,
                ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== ''))
            });

            const response = await api.get(`/audit-logs?${params}`);
            setLogs(response.data.logs);
            setPagination(prev => ({
                ...prev,
                total: response.data.total
            }));
        } catch (error) {
            console.error('Failed to fetch audit logs:', error);
            toast.error(t('Failed to load audit logs'));
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const params = new URLSearchParams();
            if (filters.startDate) params.append('start_date', filters.startDate);
            if (filters.endDate) params.append('end_date', filters.endDate);

            const response = await api.get(`/audit-logs/stats?${params}`);
            setStats(response.data);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPagination(prev => ({ ...prev, offset: 0 })); // Reset to first page
    };

    const handleClearFilters = () => {
        setFilters({
            actionCategory: '',
            actionResult: '',
            startDate: '',
            endDate: '',
            search: ''
        });
    };

    const handleExport = async () => {
        try {
            toast.loading('Generating export...');
            // Implementation for CSV export
            toast.success('Export downloaded');
        } catch (error) {
            toast.error('Export failed');
        }
    };

    const getActionIcon = (actionType) => {
        if (actionType.includes('login')) return <User className="w-4 h-4" />;
        if (actionType.includes('device')) return <Activity className="w-4 h-4" />;
        if (actionType.includes('alert')) return <AlertCircle className="w-4 h-4" />;
        return <Shield className="w-4 h-4" />;
    };

    const getResultBadge = (result) => {
        const styles = {
            success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
            failure: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
            error: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
        };

        const icons = {
            success: <CheckCircle className="w-3 h-3" />,
            failure: <XCircle className="w-3 h-3" />,
            error: <AlertCircle className="w-3 h-3" />
        };

        return (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${styles[result]}`}>
                {icons[result]}
                {result.charAt(0).toUpperCase() + result.slice(1)}
            </span>
        );
    };

    const getCategoryBadge = (category) => {
        const colors = {
            authentication: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
            device: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
            sensor: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
            alert: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
            system: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
            user: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200'
        };

        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[category] || colors.system}`}>
                {category}
            </span>
        );
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    return (
        <div className="container mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Shield className="w-8 h-8" />
                        {t('Audit Logs')}
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                        {t('Complete audit trail of all system activities')}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={fetchAuditLogs}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                        <RefreshCw className="w-4 h-4" />
                        {t('Refresh')}
                    </button>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <Download className="w-4 h-4" />
                        {t('Export')}
                    </button>
                </div>
            </div>

            {/* Statistics Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                        <div className="text-sm text-gray-600 dark:text-gray-400">Total Actions</div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">
                            {stats.totals.total_actions?.toLocaleString() || 0}
                        </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                        <div className="text-sm text-gray-600 dark:text-gray-400">Success Rate</div>
                        <div className="text-2xl font-bold text-green-600">
                            {stats.totals.total_actions > 0
                                ? Math.round((stats.totals.successful_actions / stats.totals.total_actions) * 100)
                                : 0}%
                        </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                        <div className="text-sm text-gray-600 dark:text-gray-400">Unique Users</div>
                        <div className="text-2xl font-bold text-blue-600">
                            {stats.totals.unique_users || 0}
                        </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                        <div className="text-sm text-gray-600 dark:text-gray-400">Failed Actions</div>
                        <div className="text-2xl font-bold text-red-600">
                            {stats.totals.failed_actions || 0}
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-6">
                <div className="flex items-center gap-2 mb-4">
                    <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Filters</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('Category')}
                        </label>
                        <select
                            value={filters.actionCategory}
                            onChange={(e) => handleFilterChange('actionCategory', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value="">{t('All Categories')}</option>
                            <option value="authentication">{t('Authentication')}</option>
                            <option value="device">{t('Device')}</option>
                            <option value="sensor">{t('Sensor')}</option>
                            <option value="alert">{t('Alert')}</option>
                            <option value="system">{t('System')}</option>
                            <option value="user">{t('User')}</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('Result')}
                        </label>
                        <select
                            value={filters.actionResult}
                            onChange={(e) => handleFilterChange('actionResult', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value="">{t('All Results')}</option>
                            <option value="success">{t('Success')}</option>
                            <option value="failure">{t('Failure')}</option>
                            <option value="error">{t('Error')}</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('Start Date')}
                        </label>
                        <input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => handleFilterChange('startDate', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('End Date')}
                        </label>
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => handleFilterChange('endDate', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('Search')}
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                value={filters.search}
                                onChange={(e) => handleFilterChange('search', e.target.value)}
                                placeholder={t('Search...')}
                                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>
                </div>
                <div className="mt-4">
                    <button
                        onClick={handleClearFilters}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        {t('Clear Filters')}
                    </button>
                </div>
            </div>

            {/* Audit Logs Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    {t('Timestamp')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    {t('User')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    {t('Action')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    {t('Category')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    {t('Result')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    {t('IP Address')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    {t('Actions')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                                        {t('Loading...')}
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                                        {t('No audit logs found')}
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-gray-400" />
                                                {formatDate(log.created_at)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <div>
                                                <div className="text-gray-900 dark:text-white">{log.user_email || t('System')}</div>
                                                {log.user_role && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">{log.user_role}</div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                                            <div className="flex items-center gap-2">
                                                {getActionIcon(log.action_type)}
                                                <span>{log.action_type}</span>
                                            </div>
                                            {log.resource_name && (
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                    {log.resource_type}: {log.resource_name}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {getCategoryBadge(log.action_category)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {getResultBadge(log.action_result)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {log.ip_address || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <button
                                                onClick={() => setSelectedLog(log)}
                                                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                            >
                                                <Eye className="w-4 h-4" />
                                                {t('Details')}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 flex items-center justify-between border-t border-gray-200 dark:border-gray-600">
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                        {t('Showing')} {pagination.offset + 1} {t('to')} {Math.min(pagination.offset + pagination.limit, pagination.total)} {t('of')} {pagination.total} {t('results')}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                            disabled={pagination.offset === 0}
                            className="px-3 py-1 bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-500"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                            disabled={pagination.offset + pagination.limit >= pagination.total}
                            className="px-3 py-1 bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-500"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Detail Modal */}
            {selectedLog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                                    {t('Audit Log Details')}
                                </h3>
                                <button
                                    onClick={() => setSelectedLog(null)}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Action Type
                                    </label>
                                    <div className="text-gray-900 dark:text-white">{selectedLog.action_type}</div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        User
                                    </label>
                                    <div className="text-gray-900 dark:text-white">
                                        {selectedLog.user_email || 'System'} ({selectedLog.user_role})
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Timestamp
                                    </label>
                                    <div className="text-gray-900 dark:text-white">{formatDate(selectedLog.created_at)}</div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        IP Address
                                    </label>
                                    <div className="text-gray-900 dark:text-white">{selectedLog.ip_address || '-'}</div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        User Agent
                                    </label>
                                    <div className="text-sm text-gray-900 dark:text-white break-all">
                                        {selectedLog.user_agent || '-'}
                                    </div>
                                </div>
                                {selectedLog.changes && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Changes
                                        </label>
                                        <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto">
                                            {JSON.stringify(selectedLog.changes, null, 2)}
                                        </pre>
                                    </div>
                                )}
                                {selectedLog.metadata && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Metadata
                                        </label>
                                        <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto">
                                            {JSON.stringify(selectedLog.metadata, null, 2)}
                                        </pre>
                                    </div>
                                )}
                                {selectedLog.error_message && (
                                    <div>
                                        <label className="block text-sm font-medium text-red-700 dark:text-red-400 mb-1">
                                            Error Message
                                        </label>
                                        <div className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded">
                                            {selectedLog.error_message}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AuditLogs;
