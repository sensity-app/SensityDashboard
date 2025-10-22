import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { useTranslation } from 'react-i18next';
import { apiService } from '../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

const DeviceHealthDashboard = () => {
    const { t } = useTranslation();
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [timeRange, setTimeRange] = useState('24h');
    const [selectedMetrics, setSelectedMetrics] = useState(['overall_score', 'uptime_percentage', 'data_quality_score']);

    // Fetch devices
    const { data: devices = [], isLoading: devicesLoading } = useQuery(
        'devices',
        apiService.getDevices,
        {
            select: (data) => data?.devices || []
        }
    );

    // Fetch device health for selected device
    const { data: deviceHealth, isLoading: healthLoading, error: healthError } = useQuery(
        ['device-health', selectedDevice?.id],
        () => apiService.getDeviceHealth(selectedDevice.id),
        {
            enabled: !!selectedDevice,
            refetchInterval: 30000
        }
    );

    // Fetch device health history
    const { data: healthHistory = [], isLoading: historyLoading } = useQuery(
        ['device-health-history', selectedDevice?.id, timeRange, selectedMetrics],
        () => apiService.getDeviceHealthHistory(selectedDevice.id, timeRange, selectedMetrics.join(',')),
        {
            enabled: !!selectedDevice,
            refetchInterval: 60000
        }
    );

    useEffect(() => {
        if (devices.length > 0 && !selectedDevice) {
            setSelectedDevice(devices[0]);
        }
    }, [devices, selectedDevice]);

    const getHealthScoreColor = (score) => {
        if (score >= 90) return 'text-green-600';
        if (score >= 70) return 'text-yellow-600';
        if (score >= 50) return 'text-orange-600';
        return 'text-red-600';
    };

    const getHealthScoreBgColor = (score) => {
        if (score >= 90) return 'bg-green-100';
        if (score >= 70) return 'bg-yellow-100';
        if (score >= 50) return 'bg-orange-100';
        return 'bg-red-100';
    };

    const formatMetricValue = (metric, value) => {
        switch (metric) {
            case 'uptime_percentage':
            case 'data_quality_score':
            case 'communication_stability':
                return `${value.toFixed(1)}%`;
            case 'overall_score':
                return `${value.toFixed(0)}/100`;
            case 'avg_response_time':
                return `${value.toFixed(0)}ms`;
            case 'memory_usage':
                return `${value.toFixed(1)}%`;
            case 'error_rate':
                return `${value.toFixed(2)}%`;
            default:
                return value.toFixed(1);
        }
    };

    const availableMetrics = [
        { key: 'overall_score', label: t('deviceHealth.metrics.overallScore'), color: '#3B82F6' },
        { key: 'uptime_percentage', label: t('deviceHealth.metrics.uptimePercentage'), color: '#10B981' },
        { key: 'data_quality_score', label: t('deviceHealth.metrics.dataQualityScore'), color: '#8B5CF6' },
        { key: 'communication_stability', label: t('deviceHealth.metrics.communicationStability'), color: '#F59E0B' },
        { key: 'avg_response_time', label: t('deviceHealth.metrics.avgResponseTime'), color: '#EF4444' },
        { key: 'memory_usage', label: t('deviceHealth.metrics.memoryUsage'), color: '#EC4899' },
        { key: 'error_rate', label: t('deviceHealth.metrics.errorRate'), color: '#6B7280' }
    ];

    const healthMetrics = deviceHealth?.metrics || deviceHealth?.currentHealth || {};
    const healthScore = deviceHealth?.score?.score ?? deviceHealth?.healthScore?.score ?? healthMetrics.overall_score ?? null;
    const healthIssues = deviceHealth?.score?.issues || deviceHealth?.issues || [];
    const healthRecommendations = deviceHealth?.recommendations || [];
    const recentHealthHistory = deviceHealth?.recentHistory || [];

    const normalizedHistory = useMemo(() => {
        const rawHistory = Array.isArray(healthHistory) ? healthHistory : (healthHistory?.history || []);
        return rawHistory.map(point => {
            const timestamp = new Date(point.timestamp || point.created_at || Date.now()).getTime();
            const normalized = { ...point, timestamp };

            Object.keys(normalized).forEach(key => {
                if (key === 'timestamp') return;
                const value = normalized[key];
                if (typeof value === 'string' && value !== '') {
                    const parsed = parseFloat(value);
                    if (Number.isFinite(parsed)) {
                        normalized[key] = parsed;
                    }
                }
            });

            return normalized;
        });
    }, [healthHistory]);

    if (devicesLoading) {
        return (
            <div className="flex justify-center items-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2">{t('common.loading')}</span>
            </div>
        );
    }

    if (devices.length === 0) {
        return (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <div className="text-yellow-800">
                    <strong>{t('deviceHealth.noDevices')}</strong>
                    <p>{t('deviceHealth.noDevicesMessage')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-6 space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{t('deviceHealth.title')}</h1>
                    <p className="text-gray-600 mt-1">{t('deviceHealth.subtitle')}</p>
                </div>
                <div className="flex space-x-3">
                    {/* Device Selector */}
                    <select
                        value={selectedDevice?.id || ''}
                        onChange={(e) => {
                            const device = devices.find(d => d.id === parseInt(e.target.value));
                            setSelectedDevice(device);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {Array.isArray(devices) && devices.map((device) => (
                            <option key={device.id} value={device.id}>
                                {device.name}
                            </option>
                        ))}
                    </select>
                    {/* Time Range Selector */}
                    <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="1h">{t('deviceHealth.timeRanges.1h')}</option>
                        <option value="24h">{t('deviceHealth.timeRanges.24h')}</option>
                        <option value="7d">{t('deviceHealth.timeRanges.7d')}</option>
                        <option value="30d">{t('deviceHealth.timeRanges.30d')}</option>
                    </select>
                </div>
            </div>

            {/* Current Health Status */}
            {selectedDevice && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold mb-4">
                        {t('deviceHealth.currentStatus', { deviceName: selectedDevice.name })}
                    </h2>
                    {healthLoading ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                        </div>
                    ) : healthError ? (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                            <p className="text-yellow-800 font-medium">{t('deviceHealth.noDataYet', 'No health data available yet')}</p>
                            <p className="text-yellow-700 text-sm mt-2">
                                {t('deviceHealth.waitingForTelemetry', 'Waiting for device to send telemetry data. This usually happens within a few minutes.')}
                            </p>
                            <ul className="mt-3 text-sm text-yellow-700 list-disc list-inside space-y-1">
                                <li>{t('deviceHealth.checkOnline', 'Verify device is online and connected')}</li>
                                <li>{t('deviceHealth.checkHeartbeat', 'Check device last heartbeat timestamp')}</li>
                                <li>{t('deviceHealth.waitMinutes', 'Wait 2-5 minutes for first telemetry')}</li>
                            </ul>
                        </div>
                    ) : deviceHealth ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Overall Score */}
                            <div className={`${healthScore ? getHealthScoreBgColor(healthScore) : 'bg-gray-50'} rounded-lg p-4`}>
                                <h3 className="text-sm font-medium text-gray-700">{t('deviceHealth.overallScore')}</h3>
                                <p className={`text-2xl font-bold ${healthScore ? getHealthScoreColor(healthScore) : 'text-gray-500'}`}>
                                    {healthScore ? `${healthScore}/100` : '—'}
                                </p>
                                {!healthScore && (
                                    <p className="text-xs text-gray-500 mt-1">{t('deviceHealth.noData', 'No data')}</p>
                                )}
                            </div>
                            {/* Uptime */}
                            <div className="bg-green-50 rounded-lg p-4">
                                <h3 className="text-sm font-medium text-gray-700">{t('deviceHealth.uptime')}</h3>
                                <p className="text-2xl font-bold text-green-600">
                                    {healthMetrics.uptime_percentage !== undefined
                                        ? `${healthMetrics.uptime_percentage.toFixed(1)}%`
                                        : '—'}
                                </p>
                            </div>
                            {/* Data Quality */}
                            <div className="bg-blue-50 rounded-lg p-4">
                                <h3 className="text-sm font-medium text-gray-700">{t('deviceHealth.dataQuality')}</h3>
                                <p className="text-2xl font-bold text-blue-600">
                                    {healthMetrics.data_quality_score !== undefined
                                        ? `${healthMetrics.data_quality_score.toFixed(1)}%`
                                        : '—'}
                                </p>
                            </div>
                            {/* Last Contact */}
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h3 className="text-sm font-medium text-gray-700">{t('deviceHealth.lastContact')}</h3>
                                <p className="text-sm font-medium text-gray-900">
                                    {healthMetrics.last_heartbeat || healthMetrics.last_contact
                                        ? new Date(healthMetrics.last_heartbeat || healthMetrics.last_contact).toLocaleString()
                                        : t('deviceHealth.never')}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-gray-500">{t('deviceHealth.noHealthData')}</p>
                    )}

                    {/* Health Issues & Recommendations */}
{healthIssues.length > 0 && (
                        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <h3 className="text-sm font-medium text-yellow-800 mb-2">
                                {t('deviceHealth.healthIssues')}
                            </h3>
                            <ul className="space-y-1">
                                {healthIssues.map((issue, index) => (
                                    <li key={index} className="text-sm text-yellow-700">
                                        • {issue.message || issue}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Recommendations */}
{healthRecommendations.length > 0 && (
                        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h3 className="text-sm font-medium text-blue-800 mb-2">
                                {t('deviceHealth.recommendations')}
                            </h3>
                            <ul className="space-y-3">
                                {healthRecommendations.map((recommendation, index) => (
                                    <li key={index} className="text-sm">
                                        <div className="flex items-start gap-2">
                                            <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${
                                                recommendation.priority === 'critical' ? 'bg-red-100 text-red-700' :
                                                recommendation.priority === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                                                'bg-blue-100 text-blue-700'
                                            }`}>
                                                {recommendation.priority || 'info'}
                                            </span>
                                            <div className="flex-1">
                                                <p className="font-medium text-gray-900">{recommendation.title}</p>
                                                <p className="text-gray-600 mt-0.5">{recommendation.description}</p>
                                                {recommendation.action && (
                                                    <p className="text-gray-500 text-xs mt-1 italic">→ {recommendation.action}</p>
                                                )}
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Metrics Selection */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-lg font-semibold mb-4">{t('deviceHealth.selectMetrics')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Array.isArray(availableMetrics) && availableMetrics.map((metric) => (
                        <label key={metric.key} className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={selectedMetrics.includes(metric.key)}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setSelectedMetrics([...selectedMetrics, metric.key]);
                                    } else {
                                        setSelectedMetrics(selectedMetrics.filter(m => m !== metric.key));
                                    }
                                }}
                                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                            />
                            <div className="flex items-center space-x-2">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: metric.color }}
                                ></div>
                                <span className="text-sm">{metric.label}</span>
                            </div>
                        </label>
                    ))}
                </div>
            </div>

            {/* Health History Chart */}
            {selectedDevice && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold mb-4">
                        {t('deviceHealth.historyChart')} - {timeRange}
                    </h2>
                    {historyLoading ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                        </div>
                    ) : normalizedHistory.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <p>{t('deviceHealth.noHistoryData')}</p>
                        </div>
                    ) : (
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={normalizedHistory}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="timestamp"
                                        tickFormatter={(timestamp) => new Date(timestamp).toLocaleString()}
                                    />
                                    <YAxis />
                                    <Tooltip
                                        labelFormatter={(timestamp) => new Date(timestamp).toLocaleString()}
                                        formatter={(value, name) => [
                                            formatMetricValue(name, value),
                                            availableMetrics.find(m => m.key === name)?.label || name
                                        ]}
                                    />
                                    <Legend />
                                    {Array.isArray(selectedMetrics) && selectedMetrics.map((metric) => {
                                        const metricInfo = availableMetrics.find(m => m.key === metric);
                                        return (
                                            <Line
                                                key={metric}
                                                type="monotone"
                                                dataKey={metric}
                                                stroke={metricInfo?.color}
                                                strokeWidth={2}
                                                dot={false}
                                                name={metric}
                                            />
                                        );
                                    })}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            )}

            {/* Device Health Summary for All Devices */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-lg font-semibold mb-4">{t('deviceHealth.allDevicesSummary')}</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('deviceHealth.deviceName')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('deviceHealth.status')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('deviceHealth.overallScore')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('deviceHealth.uptime')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('deviceHealth.lastContact')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {t('common.actions')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {Array.isArray(devices) && devices.map((device) => (
                                <tr key={device.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {device.name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                            device.is_online
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-red-100 text-red-800'
                                        }`}>
                                            {device.is_online ? t('common.online') : t('common.offline')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {device.health_score ? (
                                            <span className={getHealthScoreColor(device.health_score)}>
                                                {device.health_score}/100
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">{t('common.noData')}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {device.uptime_percentage ? (
                                            `${device.uptime_percentage.toFixed(1)}%`
                                        ) : (
                                            <span className="text-gray-400">{t('common.noData')}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {device.last_seen ?
                                            new Date(device.last_seen).toLocaleString() :
                                            t('deviceHealth.never')
                                        }
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <button
                                            onClick={() => setSelectedDevice(device)}
                                            className="text-blue-600 hover:text-blue-900"
                                        >
                                            {t('deviceHealth.viewDetails')}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default DeviceHealthDashboard;
