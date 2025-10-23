import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { useTranslation } from 'react-i18next';
import {
    Brain,
    TrendingUp,
    AlertTriangle,
    CheckCircle,
    Clock,
    BarChart3,
    Target,
    Zap,
    RefreshCw,
    Monitor,
    Activity,
    Heart
} from 'lucide-react';
import toast from 'react-hot-toast';

import { apiService } from '../services/api';
import DeviceHealthDashboard from './DeviceHealthDashboard';

function AnalyticsDashboardPage() {
    const { t } = useTranslation();
    const [selectedDeviceId, setSelectedDeviceId] = useState(null);
    const [activeTab, setActiveTab] = useState('sensors'); // 'sensors' or 'health'

    // Fetch devices
    const { data: devicesData, isLoading: devicesLoading } = useQuery(
        'devices',
        () => apiService.getDevices(),
        {
            select: (data) => data.devices || data || []
        }
    );

    const devices = devicesData || [];

    // Auto-select first device
    useEffect(() => {
        if (!selectedDeviceId && devices.length > 0) {
            setSelectedDeviceId(devices[0].id);
        }
    }, [devices, selectedDeviceId]);

    if (devicesLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-16 space-y-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
                <p className="text-gray-500">{t('common.loading', 'Loading...')}</p>
            </div>
        );
    }

    if (devices.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow p-12 text-center">
                <Monitor className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                    {t('analytics.noDevices', 'No Devices Found')}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                    {t('analytics.noDevicesDescription', 'Add devices to start viewing analytics.')}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Device Selector and Tabs */}
            <div className="bg-white rounded-lg shadow">
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <div className="flex items-center space-x-3">
                        <Brain className="h-6 w-6 text-blue-600" />
                        <h2 className="text-lg font-medium text-gray-900">
                            {t('analytics.title', 'Device Analytics & Health')}
                        </h2>
                    </div>
                    <div className="flex items-center space-x-4">
                        <label className="text-sm text-gray-600">{t('analytics.selectDevice', 'Device:')}</label>
                        <select
                            value={selectedDeviceId || ''}
                            onChange={(e) => setSelectedDeviceId(e.target.value)}
                            className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[200px]"
                        >
                            {devices.map((device) => (
                                <option key={device.id} value={device.id}>
                                    {device.name || device.id}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200">
                    <nav className="flex -mb-px px-6" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab('sensors')}
                            className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === 'sensors'
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <Activity className="h-4 w-4" />
                                {t('analytics.tabs.sensorAnalytics', 'Sensor Analytics')}
                            </div>
                        </button>
                        <button
                            onClick={() => setActiveTab('health')}
                            className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === 'health'
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <Heart className="h-4 w-4" />
                                {t('analytics.tabs.deviceHealth', 'Device Health')}
                            </div>
                        </button>
                    </nav>
                </div>
            </div>

            {/* Tab Content */}
            {selectedDeviceId && (
                <>
                    {activeTab === 'sensors' && <AnalyticsDashboard deviceId={selectedDeviceId} />}
                    {activeTab === 'health' && <DeviceHealthDashboard preSelectedDeviceId={selectedDeviceId} />}
                </>
            )}
        </div>
    );
}

function AnalyticsDashboard({ deviceId, onRecommendationApply }) {
    const { t } = useTranslation();
    const [selectedSensor, setSelectedSensor] = useState(null);
    const [timeRange, setTimeRange] = useState('30d');

    // Get device analytics summary
    const { data: summary, isLoading: summaryLoading, refetch } = useQuery(
        ['device-analytics-summary', deviceId, timeRange],
        () => apiService.getDeviceAnalyticsSummary(deviceId, timeRange),
        {
            enabled: !!deviceId,
            refetchOnWindowFocus: false,
            staleTime: 10 * 60 * 1000 // 10 minutes
        }
    );

    // Get sensor recommendations when sensor is selected
    const { data: recommendations, isLoading: recommendationsLoading } = useQuery(
        ['sensor-recommendations', deviceId, selectedSensor?.pin, timeRange],
        () => apiService.getSensorRecommendations(deviceId, selectedSensor.pin, timeRange),
        {
            enabled: !!deviceId && !!selectedSensor,
            refetchOnWindowFocus: false,
            staleTime: 15 * 60 * 1000 // 15 minutes
        }
    );

    // Get anomalies for selected sensor
    const { data: anomalies, isLoading: anomaliesLoading } = useQuery(
        ['sensor-anomalies', deviceId, selectedSensor?.pin],
        () => apiService.getAnomalies(deviceId, selectedSensor.pin, '24h'),
        {
            enabled: !!deviceId && !!selectedSensor,
            refetchOnWindowFocus: false,
            staleTime: 5 * 60 * 1000 // 5 minutes
        }
    );

    const handleApplyRecommendations = async (sensor, recs) => {
        try {
            // This would typically call an API to update sensor rules
            // For now, we'll just show the recommendations to the user
            if (onRecommendationApply) {
                onRecommendationApply(sensor, recs);
            }
            toast.success(t('analytics.recommendationsApplied', 'Recommendations applied successfully'));
        } catch (error) {
            toast.error(t('analytics.applyError', 'Failed to apply recommendations'));
        }
    };

    const getConfidenceColor = (confidence) => {
        switch (confidence) {
            case 'high': return 'text-green-600 bg-green-100';
            case 'medium': return 'text-yellow-600 bg-yellow-100';
            case 'low': return 'text-red-600 bg-red-100';
            default: return 'text-gray-600 bg-gray-100';
        }
    };

    if (summaryLoading) {
        return (
            <div className="bg-white rounded-lg shadow p-6">
                <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/4 mb-6"></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="p-4 border rounded">
                                <div className="h-3 bg-gray-200 rounded w-3/4 mb-2"></div>
                                <div className="h-6 bg-gray-200 rounded w-1/2"></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!summary?.sensors?.length) {
        return (
            <div className="bg-white rounded-lg shadow p-6 text-center">
                <Brain className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                    {t('analytics.noData', 'No Analytics Data')}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                    {t('analytics.noDataDescription', 'Not enough historical data for analytics. At least 50 data points needed per sensor.')}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header and Controls */}
            <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        <Brain className="h-6 w-6 text-blue-600" />
                        <h2 className="text-lg font-medium text-gray-900">
                            {t('analytics.intelligentAnalytics', 'Intelligent Analytics')}
                        </h2>
                    </div>
                    <div className="flex items-center space-x-4">
                        <select
                            value={timeRange}
                            onChange={(e) => setTimeRange(e.target.value)}
                            className="border border-gray-300 rounded-md px-3 py-1 text-sm"
                        >
                            <option value="7d">{t('common.last7Days', 'Last 7 days')}</option>
                            <option value="30d">{t('common.last30Days', 'Last 30 days')}</option>
                            <option value="90d">{t('common.last90Days', 'Last 90 days')}</option>
                        </select>
                        <button
                            onClick={() => refetch()}
                            className="p-2 text-gray-400 hover:text-gray-600"
                        >
                            <RefreshCw className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">
                            {summary.summary?.analyzedSensors || 0}
                        </div>
                        <div className="text-sm text-gray-500">
                            {t('analytics.sensorsAnalyzed', 'Sensors Analyzed')}
                        </div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                            {summary.summary?.averageDataQuality || 0}
                        </div>
                        <div className="text-sm text-gray-500">
                            {t('analytics.avgDataQuality', 'Avg Data Quality')}
                        </div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-yellow-600">
                            {summary.summary?.sensorsWithAnomalies || 0}
                        </div>
                        <div className="text-sm text-gray-500">
                            {t('analytics.sensorsWithAnomalies', 'With Anomalies')}
                        </div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">
                            {summary.sensors?.filter(s => s.recommendations?.confidence === 'high').length || 0}
                        </div>
                        <div className="text-sm text-gray-500">
                            {t('analytics.highConfidence', 'High Confidence')}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sensors Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {summary.sensors.map((sensor) => (
                    <SensorAnalyticsCard
                        key={sensor.pin}
                        sensor={sensor}
                        isSelected={selectedSensor?.pin === sensor.pin}
                        onSelect={() => setSelectedSensor(sensor)}
                        onApplyRecommendations={handleApplyRecommendations}
                    />
                ))}
            </div>

            {/* Detailed View */}
            {selectedSensor && (
                <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-medium text-gray-900">
                            {selectedSensor.name} - {t('analytics.detailedAnalysis', 'Detailed Analysis')}
                        </h3>
                    </div>

                    <div className="p-6">
                        {recommendationsLoading ? (
                            <div className="animate-pulse space-y-4">
                                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                <div className="h-20 bg-gray-200 rounded"></div>
                            </div>
                        ) : recommendations ? (
                            <RecommendationsDetail
                                recommendations={recommendations.recommendations}
                                sensor={selectedSensor}
                                anomalies={anomalies}
                                onApply={handleApplyRecommendations}
                            />
                        ) : (
                            <div className="text-center py-8">
                                <AlertTriangle className="mx-auto h-12 w-12 text-gray-400" />
                                <p className="mt-2 text-gray-500">
                                    {t('analytics.insufficientData', 'Insufficient data for detailed analysis')}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function SensorAnalyticsCard({ sensor, isSelected, onSelect, onApplyRecommendations }) {
    const { t } = useTranslation();

    const getConfidenceColor = (confidence) => {
        switch (confidence) {
            case 'high': return 'text-green-600 bg-green-100';
            case 'medium': return 'text-yellow-600 bg-yellow-100';
            case 'low': return 'text-red-600 bg-red-100';
            default: return 'text-gray-600 bg-gray-100';
        }
    };

    const getDataQualityColor = (score) => {
        if (score >= 80) return 'text-green-600';
        if (score >= 60) return 'text-yellow-600';
        return 'text-red-600';
    };

    const getRecommendationIcon = () => {
        if (!sensor.recommendations?.hasEnoughData) {
            return <Clock className="h-5 w-5 text-gray-400" />;
        }

        switch (sensor.recommendations.confidence) {
            case 'high':
                return <CheckCircle className="h-5 w-5 text-green-500" />;
            case 'medium':
                return <Target className="h-5 w-5 text-yellow-500" />;
            default:
                return <AlertTriangle className="h-5 w-5 text-red-500" />;
        }
    };

    return (
        <div
            className={`bg-white rounded-lg shadow-sm border p-4 cursor-pointer transition-all ${
                isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={onSelect}
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                    {getRecommendationIcon()}
                    <h4 className="text-sm font-medium text-gray-900">{sensor.name}</h4>
                </div>
                <span className="text-xs text-gray-500">Pin {sensor.pin}</span>
            </div>

            <div className="space-y-2">
                <div className="flex justify-between text-xs">
                    <span className="text-gray-500">{t('analytics.sensorType', 'Type')}:</span>
                    <span className="font-medium">{sensor.sensorType}</span>
                </div>

                {sensor.recommendations?.hasEnoughData ? (
                    <>
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-500">{t('analytics.confidence', 'Confidence')}:</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                getConfidenceColor(sensor.recommendations.confidence)
                            }`}>
                                {sensor.recommendations.confidence}
                            </span>
                        </div>

                        <div className="flex justify-between text-xs">
                            <span className="text-gray-500">{t('analytics.dataQuality', 'Data Quality')}:</span>
                            <span className={`font-medium ${
                                getDataQualityColor(sensor.dataQuality?.score || 0)
                            }`}>
                                {sensor.dataQuality?.score || 0}%
                            </span>
                        </div>

                        {sensor.recentAnomalies > 0 && (
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-500">{t('analytics.recentAnomalies', 'Recent Anomalies')}:</span>
                                <span className="text-red-600 font-medium">{sensor.recentAnomalies}</span>
                            </div>
                        )}

                        {sensor.recommendations.confidence === 'high' && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onApplyRecommendations(sensor, sensor.recommendations);
                                }}
                                className="w-full mt-2 bg-blue-600 text-white text-xs py-1 px-2 rounded hover:bg-blue-700"
                            >
                                <Zap className="h-3 w-3 inline mr-1" />
                                {t('analytics.applyRecommendations', 'Apply Recommendations')}
                            </button>
                        )}
                    </>
                ) : (
                    <div className="text-xs text-gray-500 text-center py-2">
                        {sensor.recommendations?.message || t('analytics.collectingData', 'Collecting data...')}
                    </div>
                )}
            </div>
        </div>
    );
}

function RecommendationsDetail({ recommendations, sensor, anomalies, onApply }) {
    const { t } = useTranslation();

    if (!recommendations.hasEnoughData) {
        return (
            <div className="text-center py-8">
                <Clock className="mx-auto h-12 w-12 text-gray-400" />
                <h4 className="mt-2 text-sm font-medium text-gray-900">
                    {t('analytics.insufficientData', 'Insufficient Data')}
                </h4>
                <p className="mt-1 text-sm text-gray-500">
                    {recommendations.message}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                    {t('analytics.dataPoints', 'Data Points')}: {recommendations.dataPoints} / {recommendations.minDataPoints}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Statistics */}
            <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">
                    {t('analytics.statisticalAnalysis', 'Statistical Analysis')}
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="bg-gray-50 p-3 rounded">
                        <div className="text-gray-500">{t('analytics.mean', 'Mean')}</div>
                        <div className="font-medium">{recommendations.statistics?.mean} {sensor.unit}</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                        <div className="text-gray-500">{t('analytics.stdDev', 'Std Dev')}</div>
                        <div className="font-medium">{recommendations.statistics?.stdDev} {sensor.unit}</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                        <div className="text-gray-500">{t('analytics.outliers', 'Outliers')}</div>
                        <div className="font-medium">{recommendations.statistics?.outlierPercentage}%</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                        <div className="text-gray-500">{t('analytics.dataPoints', 'Data Points')}</div>
                        <div className="font-medium">{recommendations.statistics?.count}</div>
                    </div>
                </div>
            </div>

            {/* Recommended Thresholds */}
            <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">
                    {t('analytics.recommendedThresholds', 'Recommended Thresholds')}
                </h4>
                <div className="space-y-3">
                    <ThresholdBar
                        label={t('analytics.optimal', 'Optimal')}
                        min={recommendations.recommendations?.optimal?.min}
                        max={recommendations.recommendations?.optimal?.max}
                        unit={sensor.unit}
                        color="bg-green-200"
                    />
                    <ThresholdBar
                        label={t('analytics.warning', 'Warning')}
                        min={recommendations.recommendations?.warning?.min}
                        max={recommendations.recommendations?.warning?.max}
                        unit={sensor.unit}
                        color="bg-yellow-200"
                    />
                    <ThresholdBar
                        label={t('analytics.critical', 'Critical')}
                        min={recommendations.recommendations?.critical?.min}
                        max={recommendations.recommendations?.critical?.max}
                        unit={sensor.unit}
                        color="bg-red-200"
                    />
                </div>
            </div>

            {/* Reasoning */}
            {recommendations.recommendations?.reasoning && (
                <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                        {t('analytics.reasoning', 'Analysis Reasoning')}
                    </h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                        {recommendations.recommendations.reasoning.map((reason, index) => (
                            <li key={index} className="flex items-start">
                                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                                {reason}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Recent Anomalies */}
            {anomalies?.anomalies?.length > 0 && (
                <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                        {t('analytics.recentAnomalies', 'Recent Anomalies')}
                    </h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                        {anomalies.anomalies.map((anomaly, index) => (
                            <div key={index} className="flex items-center justify-between text-sm bg-red-50 p-2 rounded">
                                <div>
                                    <span className="font-medium">{anomaly.value} {sensor.unit}</span>
                                    <span className="text-gray-500 ml-2">
                                        ({anomaly.deviation.toFixed(1)}σ {anomaly.type})
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500">
                                    {new Date(anomaly.timestamp).toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Apply Button */}
            <div className="flex justify-end space-x-3">
                <button
                    onClick={() => onApply(sensor, recommendations.recommendations)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center"
                >
                    <Zap className="h-4 w-4 mr-2" />
                    {t('analytics.applyRecommendations', 'Apply Recommendations')}
                </button>
            </div>
        </div>
    );
}

function ThresholdBar({ label, min, max, unit, color }) {
    return (
        <div className="flex items-center space-x-3 text-sm">
            <div className="w-16 text-right">{label}:</div>
            <div className={`flex-1 h-2 ${color} rounded relative`}>
                <div className="absolute inset-y-0 left-0 flex items-center">
                    <span className="text-xs text-gray-600 ml-1">
                        {min !== undefined ? `${min}${unit}` : '−∞'}
                    </span>
                </div>
                <div className="absolute inset-y-0 right-0 flex items-center">
                    <span className="text-xs text-gray-600 mr-1">
                        {max !== undefined ? `${max}${unit}` : '+∞'}
                    </span>
                </div>
            </div>
        </div>
    );
}

function getConfidenceColor(confidence) {
    switch (confidence) {
        case 'high': return 'text-green-600 bg-green-100';
        case 'medium': return 'text-yellow-600 bg-yellow-100';
        case 'low': return 'text-red-600 bg-red-100';
        default: return 'text-gray-600 bg-gray-100';
    }
}

export default AnalyticsDashboardPage;
export { AnalyticsDashboard };