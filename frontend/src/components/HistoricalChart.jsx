import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Calendar, Download, Settings } from 'lucide-react';
import { apiService } from '../services/api';
import { useTranslation } from 'react-i18next';

const computeStats = (series) => {
    const values = series
        .map(point => point.value)
        .filter((value) => value !== null && value !== undefined && Number.isFinite(value));

    if (!values.length) {
        return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / values.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const percentile = (p) => {
        if (sorted.length === 1) return sorted[0];
        const index = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
        return sorted[index];
    };

    const p10 = percentile(0.1);
    const p90 = percentile(0.9);

    return {
        count: values.length,
        mean,
        median,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        stdDev,
        p10,
        p90,
        recommendedMin: parseFloat((Math.min(p10, mean - 2 * stdDev)).toFixed(2)),
        recommendedMax: parseFloat((Math.max(p90, mean + 2 * stdDev)).toFixed(2))
    };
};

function HistoricalChart({ deviceId, sensorPin, sensorName, sensorUnit }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [timeRange, setTimeRange] = useState('24h');
    const [aggregation, setAggregation] = useState('raw');
    const [chartType, setChartType] = useState('line');
    const { t } = useTranslation();

    const timeRanges = useMemo(() => ({
        '1h': { label: t('telemetry.timeRanges.1h', '1 Hour'), hours: 1 },
        '6h': { label: t('telemetry.timeRanges.6h', '6 Hours'), hours: 6 },
        '24h': { label: t('telemetry.timeRanges.24h', '24 Hours'), hours: 24 },
        '7d': { label: t('telemetry.timeRanges.7d', '7 Days'), hours: 168 },
        '30d': { label: t('telemetry.timeRanges.30d', '30 Days'), hours: 720 }
    }), [t]);

    useEffect(() => {
        // Debounce the data loading to prevent rate limiting
        const timeoutId = setTimeout(() => {
            loadHistoricalData();
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [deviceId, sensorPin, timeRange, aggregation]);

    const loadHistoricalData = async () => {
        if (!deviceId || !sensorPin) return;

        setLoading(true);
        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - timeRanges[timeRange].hours * 60 * 60 * 1000);

            const response = await apiService.getHistoricalTelemetry(
                deviceId,
                sensorPin,
                startDate.toISOString(),
                endDate.toISOString(),
                timeRange === '7d' || timeRange === '30d' ? 'hourly' : aggregation
            );

            const rawPoints = Array.isArray(response)
                ? response
                : (response?.telemetry || response?.history || []);

            const formattedData = rawPoints.map(point => {
                const timestampValue = point.timestamp || point.hour_timestamp || point.time;
                const parsedTimestamp = timestampValue
                    ? new Date(timestampValue).getTime()
                    : null;

                const parsedValue = parseFloat(point.value ?? point.processed_value ?? point.raw_value);
                const parsedMin = point.min_value !== undefined ? parseFloat(point.min_value) : undefined;
                const parsedMax = point.max_value !== undefined ? parseFloat(point.max_value) : undefined;

                return {
                    timestamp: parsedTimestamp,
                    value: Number.isFinite(parsedValue) ? parsedValue : null,
                    min_value: Number.isFinite(parsedMin) ? parsedMin : undefined,
                    max_value: Number.isFinite(parsedMax) ? parsedMax : undefined,
                    formattedTime: timestampValue ? new Date(timestampValue).toLocaleString() : ''
                };
            }).filter(point => point.timestamp !== null);

            setData(formattedData);
        } catch (error) {
            console.error('Error loading historical data:', error);
        } finally {
            setLoading(false);
        }
    };

    const stats = useMemo(() => computeStats(data), [data]);

    const downloadData = () => {
        const csvContent = [
            [
                t('telemetry.csv.timestamp', 'Timestamp'),
                t('telemetry.csv.value', 'Value'),
                t('telemetry.csv.minValue', 'Min Value'),
                t('telemetry.csv.maxValue', 'Max Value')
            ].join(','),
            ...(data || []).map(row => [
                row.formattedTime,
                row.value,
                row.min_value || '',
                row.max_value || ''
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sensorName}_${timeRange}_data.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const formatXAxisTick = (timestamp) => {
        const date = new Date(timestamp);
        if (timeRange === '1h' || timeRange === '6h') {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (timeRange === '24h') {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (timeRange === '7d') {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    };

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload || !payload.length) return null;

        return (
            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                <p className="font-medium text-gray-900">
                    {new Date(label).toLocaleString()}
                </p>
                {payload.map((entry, index) => {
                    const value = entry.value;
                    const formattedValue = value !== null && value !== undefined && Number.isFinite(value)
                        ? value.toFixed(2)
                        : '—';

                    return (
                        <p key={index} className="text-sm" style={{ color: entry.color }}>
                            {entry.name}: {formattedValue} {sensorUnit}
                        </p>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="bg-white rounded-lg shadow-lg p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                        {t('telemetry.historyTitle', { name: sensorName })}
                    </h3>
                    <p className="text-sm text-gray-500">
                        {t('telemetry.sensorMeta', { pin: sensorPin, unit: sensorUnit })}
                    </p>
                </div>

                <div className="flex space-x-2">
                    <button
                        onClick={downloadData}
                        className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                        disabled={loading || data.length === 0}
                    >
                        <Download className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap gap-4 mb-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('telemetry.controls.timeRange')}
                    </label>
                    <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value)}
                        className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                        {Object.entries(timeRanges).map(([key, range]) => (
                            <option key={key} value={key}>{range.label}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('telemetry.controls.chartType')}
                    </label>
                    <select
                        value={chartType}
                        onChange={(e) => setChartType(e.target.value)}
                        className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                        <option value="line">{t('telemetry.controls.chartOptions.line')}</option>
                        <option value="area">{t('telemetry.controls.chartOptions.area')}</option>
                    </select>
                </div>

                {timeRange !== '7d' && timeRange !== '30d' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t('telemetry.controls.dataPoints')}
                        </label>
                        <select
                            value={aggregation}
                            onChange={(e) => setAggregation(e.target.value)}
                            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                        >
                            <option value="raw">{t('telemetry.controls.aggregation.raw')}</option>
                            <option value="hourly">{t('telemetry.controls.aggregation.hourly')}</option>
                        </select>
                    </div>
                )}
            </div>

            {/* Chart */}
            <div className="h-80 w-full">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                ) : data.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        {t('telemetry.noData')}
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        {chartType === 'area' ? (
                            <AreaChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="timestamp"
                                    type="number"
                                    scale="time"
                                    domain={['dataMin', 'dataMax']}
                                    tickFormatter={formatXAxisTick}
                                />
                                <YAxis />
                                <Tooltip content={<CustomTooltip />} />
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#3b82f6"
                                    fill="#93c5fd"
                                    fillOpacity={0.6}
                                />
                                {aggregation === 'hourly' && (
                                    <>
                                        <Area
                                            type="monotone"
                                            dataKey="max_value"
                                            stroke="#ef4444"
                                            fill="transparent"
                                            strokeDasharray="5 5"
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="min_value"
                                            stroke="#22c55e"
                                            fill="transparent"
                                            strokeDasharray="5 5"
                                        />
                                    </>
                                )}
                            </AreaChart>
                        ) : (
                            <LineChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="timestamp"
                                    type="number"
                                    scale="time"
                                    domain={['dataMin', 'dataMax']}
                                    tickFormatter={formatXAxisTick}
                                />
                                <YAxis />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend />
                                <Line
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    dot={data.length < 50}
                                    name="Value"
                                />
                                {aggregation === 'hourly' && (
                                    <>
                                        <Line
                                            type="monotone"
                                            dataKey="max_value"
                                            stroke="#ef4444"
                                            strokeWidth={1}
                                            strokeDasharray="5 5"
                                            dot={false}
                                            name="Max"
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="min_value"
                                            stroke="#22c55e"
                                            strokeWidth={1}
                                            strokeDasharray="5 5"
                                            dot={false}
                                            name="Min"
                                        />
                                    </>
                                )}
                            </LineChart>
                        )}
                    </ResponsiveContainer>
                )}
            </div>

            {stats && (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('telemetry.baseline.mean', 'Average')}</p>
                        <p className="text-xl font-bold text-gray-900">{stats.mean.toFixed(2)} {sensorUnit}</p>
                        <p className="text-xs text-gray-500 mt-1">{t('telemetry.baseline.median', 'Median')}: {stats.median.toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('telemetry.baseline.range', 'Observed Range')}</p>
                        <p className="text-xl font-bold text-gray-900">{stats.min.toFixed(2)} – {stats.max.toFixed(2)} {sensorUnit}</p>
                        <p className="text-xs text-gray-500 mt-1">{t('telemetry.baseline.spread', 'Std Dev')}: {stats.stdDev.toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('telemetry.baseline.recommended', 'Suggested Thresholds')}</p>
                        <p className="text-xl font-bold text-gray-900">{stats.recommendedMin.toFixed(2)} – {stats.recommendedMax.toFixed(2)} {sensorUnit}</p>
                        <p className="text-xs text-gray-500 mt-1">{t('telemetry.baseline.percentileWindow', 'Based on neutral historical behavior')}.</p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default HistoricalChart;
