import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Calendar, Download, Settings } from 'lucide-react';
import { apiService } from '../services/api';

function HistoricalChart({ deviceId, sensorPin, sensorName, sensorUnit }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [timeRange, setTimeRange] = useState('24h');
    const [aggregation, setAggregation] = useState('raw');
    const [chartType, setChartType] = useState('line');

    const timeRanges = {
        '1h': { label: '1 Hour', hours: 1 },
        '6h': { label: '6 Hours', hours: 6 },
        '24h': { label: '24 Hours', hours: 24 },
        '7d': { label: '7 Days', hours: 168 },
        '30d': { label: '30 Days', hours: 720 }
    };

    useEffect(() => {
        loadHistoricalData();
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

            const formattedData = Array.isArray(response) ? response.map(point => ({
                timestamp: new Date(point.timestamp).getTime(),
                value: parseFloat(point.value),
                min_value: point.min_value ? parseFloat(point.min_value) : undefined,
                max_value: point.max_value ? parseFloat(point.max_value) : undefined,
                formattedTime: new Date(point.timestamp).toLocaleString()
            })) : [];

            setData(formattedData);
        } catch (error) {
            console.error('Error loading historical data:', error);
        } finally {
            setLoading(false);
        }
    };

    const downloadData = () => {
        const csvContent = [
            ['Timestamp', 'Value', 'Min Value', 'Max Value'].join(','),
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
                {payload.map((entry, index) => (
                    <p key={index} className="text-sm" style={{ color: entry.color }}>
                        {entry.name}: {entry.value?.toFixed(2)} {sensorUnit}
                    </p>
                ))}
            </div>
        );
    };

    return (
        <div className="bg-white rounded-lg shadow-lg p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">{sensorName} History</h3>
                    <p className="text-sm text-gray-500">Pin {sensorPin} • {sensorUnit}</p>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Time Range</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Chart Type</label>
                    <select
                        value={chartType}
                        onChange={(e) => setChartType(e.target.value)}
                        className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                        <option value="line">Line Chart</option>
                        <option value="area">Area Chart</option>
                    </select>
                </div>

                {timeRange !== '7d' && timeRange !== '30d' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Data Points</label>
                        <select
                            value={aggregation}
                            onChange={(e) => setAggregation(e.target.value)}
                            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                        >
                            <option value="raw">Raw Data</option>
                            <option value="hourly">Hourly Average</option>
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
                        No data available for the selected time range
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
        </div>
    );
}

export default HistoricalChart;