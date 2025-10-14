import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, AlertTriangle, Settings, Zap, Clock, Activity, Signal, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { websocketService } from '../services/websocket';
import HistoricalChart from '../components/HistoricalChart';
import SensorRuleEditor from '../components/SensorRuleEditor';
import OTAManager from '../components/OTAManager';

function DeviceDetail() {
    const { id } = useParams();
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    const [realtimeData, setRealtimeData] = useState({});
    const [selectedSensor, setSelectedSensor] = useState(null);
    const [showRuleEditor, setShowRuleEditor] = useState(false);
    const [showOTAManager, setShowOTAManager] = useState(false);
    const [showSensorEditor, setShowSensorEditor] = useState(false);
    const [editingSensor, setEditingSensor] = useState(null);

    const { data: device, isLoading } = useQuery(
        ['device', id],
        () => apiService.getDevice(id),
        {
            refetchOnWindowFocus: false, // Disable auto-refresh
            enabled: !!id,
            select: (data) => data.device
        }
    );

    const { data: sensors = [], isLoading: sensorsLoading, error: sensorsError } = useQuery(
        ['device-sensors', id],
        () => apiService.getDeviceSensors(id),
        {
            enabled: !!id,
            refetchOnWindowFocus: false, // Disable auto-refresh
            select: (data) => data.sensors || data || []
        }
    );

    useEffect(() => {
        if (!selectedSensor && sensors && sensors.length > 0) {
            setSelectedSensor(sensors[0]);
        }
    }, [sensors, selectedSensor]);

    const { data: stats = [] } = useQuery(
        ['device-stats', id],
        () => apiService.getDeviceStats(id, '24h'),
        {
            enabled: !!id,
            refetchOnWindowFocus: false, // Disable auto-refresh
            select: (data) => {
                // Ensure we always return an array
                if (!data) return [];
                if (Array.isArray(data.stats)) return data.stats;
                if (Array.isArray(data)) return data;
                return [];
            }
        }
    );

    const { data: alerts = [] } = useQuery(
        ['device-alerts', id],
        () => apiService.getDeviceAlerts(id),
        {
            enabled: !!id,
            refetchOnWindowFocus: false, // Disable auto-refresh
            select: (data) => data.alerts || data || []
        }
    );

    const updateSensorMutation = useMutation(
        ({ deviceId, sensorId, payload }) => apiService.updateSensor(deviceId, sensorId, payload)
    );

    useEffect(() => {
        if (!id) return;

        const handleTelemetryUpdate = (data) => {
            setRealtimeData((prev) => ({
                ...prev,
                [data.pin]: {
                    ...data,
                    timestamp: new Date(data.timestamp)
                }
            }));
        };

        const handleDeviceUpdate = (data) => {
            queryClient.setQueryData(['device', id], (old) => ({
                ...old,
                ...data
            }));
        };

        const handleConfigUpdate = () => {
            queryClient.invalidateQueries(['device', id]);
        };

        if (websocketService && typeof websocketService.subscribe === 'function') {
            websocketService.subscribe('device', id);
            websocketService.on(`device:${id}:telemetry`, handleTelemetryUpdate);
            websocketService.on(`device:${id}:updated`, handleDeviceUpdate);
            websocketService.on(`device:${id}:config_updated`, handleConfigUpdate);
        }

        return () => {
            if (websocketService && typeof websocketService.unsubscribe === 'function') {
                websocketService.unsubscribe('device', id);
                websocketService.off(`device:${id}:telemetry`, handleTelemetryUpdate);
                websocketService.off(`device:${id}:updated`, handleDeviceUpdate);
                websocketService.off(`device:${id}:config_updated`, handleConfigUpdate);
            }
        };
    }, [id, queryClient]);

    const formatRelativeTime = (date) => {
        if (!date) return t('deviceDetail.relative.never', 'Never');
        const value = typeof date === 'string' ? new Date(date) : date;
        const diff = Date.now() - value.getTime();
        if (diff < 0) return t('deviceDetail.relative.justNow', 'Just now');
        const minutes = Math.floor(diff / (1000 * 60));
        if (minutes < 1) {
            return t('deviceDetail.relative.justNow', 'Just now');
        }

        if (minutes < 60) {
            return t('deviceDetail.relative.minutes', '{{count}} min ago', {
                count: minutes
            });
        }

        const hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return t('deviceDetail.relative.hours', '{{hours}}h {{minutes}}m ago', {
                hours,
                minutes: minutes % 60
            });
        }

        const days = Math.floor(hours / 24);
        if (days < 7) {
            return t('deviceDetail.relative.days', '{{count}} day(s) ago', {
                count: days
            });
        }

        return value.toLocaleString();
    };

    const formatDuration = (seconds) => {
        if (!seconds && seconds !== 0) return '—';
        const totalMinutes = Math.floor(seconds / 60);
        const days = Math.floor(totalMinutes / (60 * 24));
        const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
        const minutes = totalMinutes % 60;
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    const formatSignalStrength = (value) => {
        if (value === null || value === undefined) return '—';
        return `${value} dBm`;
    };

    const getSignalQualityLabel = (value) => {
        if (value === null || value === undefined) {
            return t('deviceDetail.signalQuality.none', 'No data');
        }
        if (value >= -55) return t('deviceDetail.signalQuality.excellent', 'Excellent');
        if (value >= -65) return t('deviceDetail.signalQuality.veryGood', 'Very good');
        if (value >= -75) return t('deviceDetail.signalQuality.fair', 'Fair');
        if (value >= -90) return t('deviceDetail.signalQuality.weak', 'Weak');
        return t('deviceDetail.signalQuality.poor', 'Poor');
    };

    const statsByPin = useMemo(() => {
        const map = new Map();
        // Ensure stats is an array before calling forEach
        const statsArray = Array.isArray(stats) ? stats : [];
        statsArray.forEach((entry) => {
            if (entry && entry.pin) {
                map.set(entry.pin, entry);
            }
        });
        return map;
    }, [stats]);

    const sortedSensors = useMemo(() => {
        return Array.isArray(sensors)
            ? [...sensors].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            : [];
    }, [sensors]);

    const activeAlerts = useMemo(() => (Array.isArray(alerts) ? alerts.slice(0, 5) : []), [alerts]);

    const getStatusIcon = (status) => {
        switch (status) {
            case 'online':
                return <Wifi className="h-12 w-12 text-white" />;
            case 'offline':
                return <WifiOff className="h-12 w-12 text-white" />;
            case 'alarm':
                return <AlertTriangle className="h-12 w-12 text-white" />;
            default:
                return <WifiOff className="h-12 w-12 text-white" />;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'online':
                return 'bg-green-100 text-green-800';
            case 'offline':
                return 'bg-gray-100 text-gray-800';
            case 'alarm':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const formatStatusLabel = (status) => {
        if (!status) {
            return t('deviceDetail.status.unknown');
        }
        return t(`deviceDetail.status.${status}`, { defaultValue: status });
    };

    const getSensorStateBadge = (state) => {
        switch (state) {
            case 'fresh':
                return { label: t('deviceDetail.sensorBadge.live'), className: 'bg-emerald-100 text-emerald-700' };
            case 'stale':
                return { label: t('deviceDetail.sensorBadge.stale'), className: 'bg-amber-100 text-amber-700' };
            default:
                return { label: t('deviceDetail.sensorBadge.awaiting'), className: 'bg-gray-100 text-gray-600' };
        }
    };

    const formatStat = (value) => {
        const numeric = parseFloat(value);
        return Number.isFinite(numeric) ? numeric.toFixed(2) : '—';
    };

    const getSensorDisplayData = (sensor) => {
        const realtime = realtimeData[sensor.pin];
        const stat = statsByPin.get(sensor.pin);
        const value = realtime
            ? realtime.processed_value
            : (stat?.avg_value ? parseFloat(stat.avg_value) : null);
        const timestamp = realtime?.timestamp ? new Date(realtime.timestamp) : null;
        const state = realtime
            ? (Date.now() - new Date(realtime.timestamp).getTime() <= 120000 ? 'fresh' : 'stale')
            : 'unknown';

        return {
            value,
            timestamp,
            state,
            unit: realtime?.unit || sensor.unit || stat?.unit || '',
            stat
        };
    };

    const lastHeartbeatLabel = formatRelativeTime(device?.last_heartbeat ? new Date(device.last_heartbeat) : null);
    const uptimeLabel = formatDuration(device?.uptime_seconds);
    const wifiStrengthLabel = formatSignalStrength(device?.wifi_signal_strength);
    const signalQualityLabel = getSignalQualityLabel(device?.wifi_signal_strength);
    const statusLabel = formatStatusLabel(device?.status);
    const targetFirmware = device?.target_firmware_version && device?.target_firmware_version !== device?.firmware_version
        ? device.target_firmware_version
        : null;

    const deviceMetrics = [
        {
            label: t('deviceDetail.metrics.status'),
            value: statusLabel,
            icon: Activity,
            hint: t('deviceDetail.metrics.statusHint', { when: lastHeartbeatLabel })
        },
        {
            label: t('deviceDetail.metrics.uptime'),
            value: uptimeLabel,
            icon: Clock,
            hint: device?.uptime_seconds
                ? t('deviceDetail.metrics.uptimeHint', { hours: Math.max(1, Math.floor(device.uptime_seconds / 3600)) })
                : t('deviceDetail.metrics.uptimeUnknown')
        },
        {
            label: t('deviceDetail.metrics.signal'),
            value: wifiStrengthLabel,
            icon: Signal,
            hint: signalQualityLabel
        },
        {
            label: t('deviceDetail.metrics.firmware'),
            value: device?.firmware_version || t('deviceDetail.metrics.firmwareUnknown'),
            icon: TrendingUp,
            hint: targetFirmware
                ? t('deviceDetail.metrics.firmwareTarget', { version: targetFirmware })
                : t('deviceDetail.metrics.firmwareCurrent')
        }
    ];

    const severityColors = {
        low: 'bg-emerald-50 text-emerald-700',
        medium: 'bg-amber-50 text-amber-700',
        high: 'bg-orange-50 text-orange-700',
        critical: 'bg-red-50 text-red-700'
    };

    const formatSeverityLabel = (severity) => {
        if (!severity) {
            return t('deviceDetail.alertSeverity.info', 'Info');
        }
        const key = `deviceDetail.alertSeverity.${severity.toLowerCase?.() || 'info'}`;
        return t(key, severity.toUpperCase());
    };

    const handleSensorHistory = (sensor) => {
        if (!sensor) return;
        setSelectedSensor(sensor);
        const historySection = document.getElementById('sensor-history');
        if (historySection) {
            historySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    if (isLoading) {
        return <div className="p-6">{t('deviceDetail.loadingDevice')}</div>;
    }

    if (!device) {
        return <div className="p-6">{t('deviceDetail.notFound')}</div>;
    }

    return (
        <div className="p-6 space-y-6">
            <div className="space-y-6">
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-500 text-white shadow-lg">
                    <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top,_#a855f7,_transparent_45%)]" />
                    <div className="relative z-10 flex flex-col gap-6 p-6 lg:p-8">
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0">
                                    {getStatusIcon(device.status)}
                                </div>
                                <div>
                                    <p className="uppercase text-xs tracking-[0.3em] text-indigo-100">{t('deviceDetail.eyebrow')}</p>
                                    <h1 className="text-3xl font-semibold text-white">{device.name}</h1>
                                    <p className="text-indigo-100">{device.location_name || t('deviceDetail.unassigned')}</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={() => {
                                        if (sortedSensors.length === 0) {
                                            toast.error(t('deviceDetail.manageRulesEmpty'));
                                            return;
                                        }
                                        setSelectedSensor(sortedSensors[0]);
                                        setShowRuleEditor(true);
                                    }}
                                    className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
                                >
                                    <Settings className="h-4 w-4" />
                                    {t('deviceDetail.manageRules')}
                                </button>
                                <button
                                    onClick={() => setShowOTAManager(true)}
                                    className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-indigo-600 shadow hover:bg-indigo-50"
                                >
                                    <Zap className="h-4 w-4" />
                                    {t('deviceDetail.otaUpdate')}
                                </button>
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-xl bg-white/10 p-4 backdrop-blur">
                                <p className="text-sm text-indigo-100">{t('devices.deviceId')}</p>
                                <p className="text-lg font-semibold break-all">{device.id}</p>
                                <p className="mt-1 text-xs text-indigo-100/80">{t('deviceDetail.metrics.statusHint', { when: lastHeartbeatLabel })}</p>
                            </div>
                            <div className="rounded-xl bg-white/10 p-4 backdrop-blur">
                                <p className="text-sm text-indigo-100">{t('deviceDetail.metrics.firmware')}</p>
                                <p className="text-lg font-semibold">{device.firmware_version || t('deviceDetail.metrics.firmwareUnknown')}</p>
                                <p className="mt-1 text-xs text-indigo-100/80">{targetFirmware ? t('deviceDetail.metrics.firmwareTarget', { version: targetFirmware }) : t('deviceDetail.metrics.firmwareCurrent')}</p>
                            </div>
                            <div className="rounded-xl bg-white/10 p-4 backdrop-blur">
                                <p className="text-sm text-indigo-100">{t('deviceDetail.ipAddress')}</p>
                                <p className="text-lg font-semibold">{device.ip_address || t('deviceDetail.valueUnknown')}</p>
                                <p className="mt-1 text-xs text-indigo-100/80">{t('deviceDetail.metrics.uptimeLabel', { value: uptimeLabel })}</p>
                            </div>
                            <div className="rounded-xl bg-white/10 p-4 backdrop-blur">
                                <p className="text-sm text-indigo-100">{t('deviceDetail.wifiSignal')}</p>
                                <p className="text-lg font-semibold">{wifiStrengthLabel}</p>
                                <p className="mt-1 text-xs text-indigo-100/80">{signalQualityLabel}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                    <div className="space-y-6">
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {deviceMetrics.map(({ label, value, icon: Icon, hint }) => (
                                <div key={label} className="flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">{label}</p>
                                        <p className="text-lg font-semibold text-gray-900">{value || '—'}</p>
                                        <p className="mt-1 text-xs text-gray-400">{hint}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <section className="space-y-4">
                            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <h2 className="text-xl font-semibold text-gray-900">{t('deviceDetail.sensorSectionTitle')}</h2>
                                    <p className="text-sm text-gray-500">
                                    {sortedSensors.length
                                        ? t('deviceDetail.sensorSectionDescription')
                                        : t('deviceDetail.sensorSectionEmptyHint')}
                                    </p>
                                </div>
                                {sortedSensors.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => handleSensorHistory(selectedSensor || sortedSensors[0])}
                                            className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                        >
                                            View history
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                                {sensorsLoading ? (
                                    <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-12 text-center">
                                        <div className="h-12 w-12 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent"></div>
                                    <p className="mt-4 text-sm text-indigo-500">{t('deviceDetail.loadingSensors')}</p>
                                    </div>
                                ) : sensorsError ? (
                                    <div className="col-span-full rounded-xl border border-red-200 bg-red-50 p-6 text-center">
                                    <p className="font-medium text-red-600">{t('deviceDetail.loadSensorsError')}</p>
                                        <p className="mt-1 text-sm text-red-500">{sensorsError.message}</p>
                                    </div>
                                ) : !sortedSensors.length ? (
                                    <div className="col-span-full rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
                                    <p className="font-medium text-gray-700">{t('deviceDetail.sensorSectionEmpty')}</p>
                                    <p className="mt-1 text-sm text-gray-500">{t('deviceDetail.sensorSectionEmptyHint')}</p>
                                    </div>
                                ) : (
                                    sortedSensors.map((sensor) => {
                                        const display = getSensorDisplayData(sensor);
                                        const badge = getSensorStateBadge(display.state);
                                        const isActive = selectedSensor?.id === sensor.id;

                                        return (
                                            <div
                                                key={sensor.id}
                                                className={`relative flex h-full flex-col gap-4 rounded-xl border bg-white p-5 transition-all ${
                                                    isActive ? 'border-indigo-400 shadow-lg ring-2 ring-indigo-100' : 'border-gray-100 shadow-sm hover:shadow-md'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <h3 className="text-lg font-semibold text-gray-900">{sensor.name || t('deviceDetail.defaultSensorName', { pin: sensor.pin })}</h3>
                                                        <p className="text-xs text-gray-500">{t('deviceDetail.sensorPinType', { pin: sensor.pin, type: sensor.sensor_type || sensor.type })}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${badge.className}`}>
                                                            {badge.label}
                                                        </span>
                                                        <button
                                                            onClick={() => {
                                                                setEditingSensor(sensor);
                                                                setShowSensorEditor(true);
                                                            }}
                                                            className="rounded-full border border-gray-200 p-2 text-gray-500 hover:text-gray-700"
                                                            title={t('deviceDetail.calibrateSensor')}
                                                        >
                                                            <Settings className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="flex items-end gap-3">
                                                    <span className="text-3xl font-semibold text-gray-900">
                                                        {display.value !== null && display.value !== undefined ? display.value.toFixed(2) : '—'}
                                                    </span>
                                                    {display.unit && <span className="text-sm text-gray-500">{display.unit}</span>}
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    {display.timestamp
                                                        ? t('deviceDetail.lastUpdated', { when: formatRelativeTime(display.timestamp) })
                                                        : t('deviceDetail.awaitingFirstReading')}
                                                </p>

                                                {display.stat && (
                                                    <div className="grid grid-cols-3 gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
                                                        <div>
                                                            <p className="text-xs text-gray-500">{t('deviceDetail.metricMin')}</p>
                                                            <p className="font-medium text-gray-900">{formatStat(display.stat.min_value)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-gray-500">{t('deviceDetail.metricAvg')}</p>
                                                            <p className="font-medium text-gray-900">{formatStat(display.stat.avg_value)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-gray-500">{t('deviceDetail.metricMax')}</p>
                                                            <p className="font-medium text-gray-900">{formatStat(display.stat.max_value)}</p>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="mt-auto flex flex-wrap gap-2 pt-2 text-sm">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedSensor(sensor);
                                                            setShowRuleEditor(true);
                                                        }}
                                                        className="inline-flex items-center gap-2 rounded-full border border-indigo-200 px-3 py-1.5 font-medium text-indigo-600 hover:bg-indigo-50"
                                                    >
                                                        {t('deviceDetail.manageRules')}
                                                    </button>
                                                    <button
                                                        onClick={() => handleSensorHistory(sensor)}
                                                        className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-50"
                                                    >
                                                        {t('deviceDetail.viewHistory')}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </section>

                        <section id="sensor-history" className="space-y-4">
                            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                <div>
                                <h2 className="text-xl font-semibold text-gray-900">{t('deviceDetail.historyTitle')}</h2>
                                <p className="text-sm text-gray-500">
                                    {selectedSensor
                                        ? t('deviceDetail.historySubtitle', { sensor: selectedSensor.name || t('deviceDetail.defaultSensorName', { pin: selectedSensor.pin }) })
                                        : t('deviceDetail.historyPrompt')}
                                </p>
                                </div>
                                {sortedSensors.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <label className="text-sm text-gray-600">{t('deviceDetail.sensorLabel')}</label>
                                        <select
                                            value={selectedSensor?.id || ''}
                                            onChange={(e) => {
                                                const next = sortedSensors.find((sensor) => String(sensor.id) === e.target.value);
                                                if (next) {
                                                    setSelectedSensor(next);
                                                }
                                            }}
                                            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                                        >
                                            <option value="" disabled>{t('deviceDetail.historySelectPlaceholder')}</option>
                                            {sortedSensors.map((sensor) => (
                                                <option key={sensor.id} value={sensor.id}>
                                                    {sensor.name || t('deviceDetail.defaultSensorName', { pin: sensor.pin })}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>

                            {selectedSensor ? (
                                <HistoricalChart
                                    deviceId={id}
                                    sensorPin={selectedSensor.pin}
                                    sensorName={selectedSensor.name || t('deviceDetail.defaultSensorName', { pin: selectedSensor.pin })}
                                    sensorUnit={selectedSensor.unit || ''}
                                />
                            ) : (
                                <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
                                    {t('deviceDetail.historyNoSensor')}
                                </div>
                            )}
                        </section>
                    </div>

                    <aside className="space-y-6">
                        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-gray-900">{t('deviceDetail.liveConnection')}</h3>
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(device.status)}`}>
                                    {(device.status ? t(`deviceDetail.status.${device.status}`, { defaultValue: device.status }) : t('deviceDetail.status.unknown')).toUpperCase()}
                                </span>
                            </div>
                            <dl className="mt-4 space-y-3 text-sm">
                                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                    <dt className="text-gray-500">{t('deviceDetail.lastHeartbeat')}</dt>
                                    <dd className="font-medium text-gray-900">{lastHeartbeatLabel}</dd>
                                </div>
                                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                    <dt className="text-gray-500">{t('deviceDetail.ipAddress')}</dt>
                                    <dd className="font-medium text-gray-900">{device.ip_address || t('deviceDetail.valueUnknown')}</dd>
                                </div>
                                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                    <dt className="text-gray-500">{t('deviceDetail.wifiSignal')}</dt>
                                    <dd className="font-medium text-gray-900">{wifiStrengthLabel}</dd>
                                </div>
                                <div className="flex items-center justify-between">
                                    <dt className="text-gray-500">{t('deviceDetail.targetFirmware')}</dt>
                                    <dd className="font-medium text-gray-900">{targetFirmware || t('deviceDetail.targetFirmwareNone')}</dd>
                                </div>
                            </dl>
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-gray-900">{t('deviceDetail.alertsHeading')}</h3>
                                <span className="text-xs text-gray-400">{t('deviceDetail.alertsCount', { count: activeAlerts.length })}</span>
                            </div>
                            <div className="mt-4 space-y-3">
                                {activeAlerts.length === 0 ? (
                                    <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                                        {t('deviceDetail.alertsEmpty')}
                                    </p>
                                ) : (
                                    activeAlerts.map((alert) => (
                                        <div key={alert.id || `${alert.alert_type}-${alert.triggered_at || alert.created_at}`} className="rounded-lg border border-gray-200 p-4">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-900">
                                                        {alert.alert_type || t('deviceDetail.alerts.defaultType', 'Alert')}
                                                    </p>
                                                    <p className="mt-1 text-xs text-gray-500">
                                                        {alert.message || t('deviceDetail.alerts.noContext', 'No additional context')}
                                                    </p>
                                                </div>
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${severityColors[alert.severity?.toLowerCase?.()] || 'bg-gray-100 text-gray-700'}`}>
                                                    {formatSeverityLabel(alert.severity)}
                                                </span>
                                            </div>
                                            <p className="mt-3 text-xs text-gray-400">
                                                {t('deviceDetail.triggeredAgo', {
                                                    when: formatRelativeTime(alert.triggered_at ? new Date(alert.triggered_at) : alert.created_at ? new Date(alert.created_at) : null)
                                                })}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="mt-4 text-right">
                                <Link
                                    to={`/alerts?device=${id}`}
                                    className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-500"
                                >
                                    {t('deviceDetail.viewAllAlerts')}
                                </Link>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>

            {showRuleEditor && selectedSensor && (
                <SensorRuleEditor
                    sensor={selectedSensor}
                    onClose={() => {
                        setShowRuleEditor(false);
                        setSelectedSensor(null);
                    }}
                />
            )}

            {showOTAManager && (
                <OTAManager
                    device={device}
                    onClose={() => setShowOTAManager(false)}
                />
            )}

            {showSensorEditor && editingSensor && (
                <SensorEditorModal
                    sensor={editingSensor}
                    deviceId={id}
                    onClose={() => {
                        setShowSensorEditor(false);
                        setEditingSensor(null);
                    }}
                    onSave={() => {
                        queryClient.invalidateQueries(['device-sensors', id]);
                        setShowSensorEditor(false);
                        setEditingSensor(null);
                    }}
                    mutation={updateSensorMutation}
                />
            )}
        </div>
    );
}

function SensorEditorModal({ sensor, deviceId, onClose, onSave, mutation }) {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        name: sensor?.name || '',
        calibration_offset: sensor?.calibration_offset || 0,
        calibration_multiplier: sensor?.calibration_multiplier || 1,
        enabled: sensor?.enabled !== false
    });
    const [triggerOTA, setTriggerOTA] = useState(true);

    const handleSubmit = (e) => {
        e.preventDefault();
        mutation.mutate(
            {
                deviceId,
                sensorId: sensor.id,
                payload: formData
            },
            {
                onSuccess: () => {
                    toast.success(t('deviceDetail.toast.sensorUpdated'));
                    if (triggerOTA) {
                        toast.info(t('deviceDetail.toast.otaQueued'));
                    }
                    onSave();
                },
                onError: (error) => {
                    toast.error(t('deviceDetail.toast.sensorUpdateFailed', {
                        message: error.response?.data?.error || error.message
                    }));
                }
            }
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-gray-900">{t('deviceDetail.modal.title', { name: sensor.name })}</h3>

                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t('deviceDetail.modal.name')}</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">{t('deviceDetail.modal.offset')}</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.calibration_offset}
                                onChange={(e) => setFormData({ ...formData, calibration_offset: parseFloat(e.target.value) })}
                                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">{t('deviceDetail.modal.multiplier')}</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.calibration_multiplier}
                                onChange={(e) => setFormData({ ...formData, calibration_multiplier: parseFloat(e.target.value) })}
                                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                            />
                        </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={formData.enabled}
                            onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        {t('deviceDetail.modal.enabled')}
                    </label>

                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                        <label className="flex items-start gap-2 text-sm text-blue-700">
                            <input
                                type="checkbox"
                                checked={triggerOTA}
                                onChange={(e) => setTriggerOTA(e.target.checked)}
                                className="mt-1 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span>
                                {t('deviceDetail.modal.triggerOta')}
                                <p className="text-xs text-blue-600/80">{t('deviceDetail.modal.triggerOtaHint')}</p>
                            </span>
                        </label>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={mutation.isLoading}
                        >
                            {t('deviceDetail.modal.cancel')}
                        </button>
                        <button
                            type="submit"
                            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={mutation.isLoading}
                        >
                            {mutation.isLoading ? t('deviceDetail.modal.saving') : t('deviceDetail.modal.save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default DeviceDetail;
