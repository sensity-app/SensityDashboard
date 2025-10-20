import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Save, X, AlertCircle, CheckCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';

function SensorManagerModal({ device, sensors, onClose, onSave }) {
    const { t } = useTranslation();
    const [localSensors, setLocalSensors] = useState([...sensors]);
    const [isLoading, setIsLoading] = useState(false);
    const [sensorTypes, setSensorTypes] = useState([]);
    const [showAddSensorPanel, setShowAddSensorPanel] = useState(false);

    // Available pins based on device type
    const availablePins = device?.device_type === 'esp32'
        ? ['A0', 'D0', 'D1', 'D2', 'D4', 'D5', 'D12', 'D13', 'D14', 'D15', 'D16', 'D17', 'D18', 'D19', 'D21', 'D22', 'D23', 'D25', 'D26', 'D27', 'D32', 'D33']
        : ['A0', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'];

    // Fetch available sensor types
    useEffect(() => {
        const fetchSensorTypes = async () => {
            try {
                const response = await apiService.getSensorTypes();
                const types = Array.isArray(response) ? response : (response?.sensor_types || []);
                setSensorTypes(types);
            } catch (error) {
                console.error('Failed to fetch sensor types:', error);
                toast.error(t('deviceDetail.sensorManager.fetchTypesError', 'Failed to load sensor types'));
            }
        };
        fetchSensorTypes();
    }, [t]);

    // Get used pins
    const usedPins = useMemo(() => {
        return localSensors.reduce((acc, sensor) => {
            if (!acc[sensor.pin]) acc[sensor.pin] = [];
            acc[sensor.pin].push(sensor);
            return acc;
        }, {});
    }, [localSensors]);

    // Check for pin conflicts
    const pinConflicts = useMemo(() => {
        return Object.entries(usedPins)
            .filter(([_, sensors]) => sensors.length > 1)
            .map(([pin]) => pin);
    }, [usedPins]);

    // Get sensor type details
    const getSensorTypeDetails = (typeId) => {
        return sensorTypes.find(t => t.id === typeId);
    };

    const handleAddSensorType = (sensorType) => {
        // Find first available pin
        const usedPinsList = localSensors.map(s => s.pin);
        const nextAvailablePin = availablePins.find(pin => !usedPinsList.includes(pin));

        if (!nextAvailablePin) {
            toast.error(t('deviceDetail.sensorManager.noPinsAvailable', 'No available pins. Please remove a sensor first.'));
            return;
        }

        const newSensor = {
            id: `new_${Date.now()}`,
            pin: nextAvailablePin,
            sensor_type_id: sensorType.id,
            sensor_type: sensorType.name,
            name: `${sensorType.name} on ${nextAvailablePin}`,
            enabled: true,
            calibration_offset: 0,
            calibration_multiplier: 1,
            sensitivity: 1.0, // Default sensitivity
            threshold_min: sensorType.default_min || 0,
            threshold_max: sensorType.default_max || 1000,
            isNew: true
        };

        setLocalSensors([...localSensors, newSensor]);
        setShowAddSensorPanel(false);
        toast.success(t('deviceDetail.sensorManager.sensorAdded', 'Sensor added'));
    };

    const handleRemoveSensor = (sensorId) => {
        setLocalSensors(localSensors.filter(s => s.id !== sensorId));
    };

    const handleSensorChange = (sensorId, field, value) => {
        setLocalSensors(localSensors.map(s =>
            s.id === sensorId ? { ...s, [field]: value } : s
        ));
    };

    const handlePinChange = (sensorId, newPin) => {
        // Check if pin is already used
        const isUsed = localSensors.some(s => s.id !== sensorId && s.pin === newPin);
        if (isUsed) {
            toast.error(t('deviceDetail.sensorManager.pinInUse', 'Pin {{pin}} is already in use', { pin: newPin }));
            return;
        }
        handleSensorChange(sensorId, 'pin', newPin);
    };

    const handleSave = async () => {
        // Validate no pin conflicts
        if (pinConflicts.length > 0) {
            toast.error(t('deviceDetail.sensorManager.pinConflictsError', 'Please resolve pin conflicts before saving'));
            return;
        }

        setIsLoading(true);
        try {
            // Delete removed sensors
            const removedSensors = sensors.filter(s => !localSensors.find(ls => ls.id === s.id));
            for (const sensor of removedSensors) {
                if (!sensor.id.toString().startsWith('new_')) {
                    await apiService.deleteSensor(device.id, sensor.id);
                }
            }

            // Create or update sensors
            for (const sensor of localSensors) {
                let sensorId = sensor.id;

                if (sensor.isNew) {
                    // Create new sensor
                    const response = await apiService.createSensor(device.id, {
                        pin: sensor.pin,
                        sensor_type_id: sensor.sensor_type_id,
                        name: sensor.name,
                        enabled: sensor.enabled,
                        calibration_offset: sensor.calibration_offset || 0,
                        calibration_multiplier: (sensor.calibration_multiplier || 1) * (sensor.sensitivity || 1),
                        threshold_min: sensor.threshold_min,
                        threshold_max: sensor.threshold_max
                    });
                    sensorId = response.sensor?.id || response.id;
                } else {
                    // Update existing sensor
                    await apiService.updateSensor(device.id, sensor.id, {
                        name: sensor.name,
                        enabled: sensor.enabled,
                        calibration_offset: sensor.calibration_offset,
                        calibration_multiplier: (sensor.calibration_multiplier || 1) * (sensor.sensitivity || 1),
                        threshold_min: sensor.threshold_min,
                        threshold_max: sensor.threshold_max,
                        trigger_ota: false
                    });
                }
            }

            toast.success(t('deviceDetail.sensorManager.saveSuccess', 'Sensor configuration saved! Device will update on next heartbeat.'));
            onSave();
        } catch (error) {
            console.error('Failed to save sensors:', error);
            toast.error(t('deviceDetail.sensorManager.saveError', 'Failed to save sensor configuration'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-2xl flex flex-col">
                {/* Header */}
                <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-600 to-indigo-700 p-6 text-white">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-2xl font-bold">
                                {t('deviceDetail.sensorManager.title', 'Manage Sensors')}
                            </h3>
                            <p className="mt-1 text-sm text-indigo-100">
                                {t('deviceDetail.sensorManager.subtitle', 'Configure sensors for {{device}}', { device: device?.name || device?.id })}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="rounded-full p-2 text-white/80 hover:bg-white/20 hover:text-white"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Pin Conflicts Warning */}
                    {pinConflicts.length > 0 && (
                        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="font-semibold text-red-900">
                                        {t('deviceDetail.sensorManager.pinConflicts', 'Pin Conflicts Detected')}
                                    </h4>
                                    <p className="text-sm text-red-700 mt-1">
                                        {t('deviceDetail.sensorManager.pinConflictsDesc', 'The following pins are used by multiple sensors: {{pins}}', {
                                            pins: pinConflicts.join(', ')
                                        })}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Add Sensor Section */}
                    {!showAddSensorPanel && (
                        <button
                            onClick={() => setShowAddSensorPanel(true)}
                            className="mb-6 w-full inline-flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50 px-6 py-4 text-sm font-medium text-indigo-700 hover:border-indigo-400 hover:bg-indigo-100 transition-colors"
                        >
                            <Plus className="h-5 w-5" />
                            {t('deviceDetail.sensorManager.addNewSensor', 'Add New Sensor')}
                        </button>
                    )}

                    {/* Sensor Type Picker */}
                    {showAddSensorPanel && (
                        <div className="mb-6 rounded-xl border-2 border-indigo-200 bg-indigo-50 p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-lg font-semibold text-gray-900">
                                    {t('deviceDetail.sensorManager.selectSensorType', 'Select Sensor Type')}
                                </h4>
                                <button
                                    onClick={() => setShowAddSensorPanel(false)}
                                    className="text-gray-500 hover:text-gray-700"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {sensorTypes.map((sensorType) => {
                                    const count = localSensors.filter(s => s.sensor_type_id === sensorType.id).length;
                                    return (
                                        <div
                                            key={sensorType.id}
                                            className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer"
                                            onClick={() => handleAddSensorType(sensorType)}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <h5 className="font-semibold text-gray-900">{sensorType.name}</h5>
                                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                                    sensorType.pin_type === 'analog'
                                                        ? 'bg-green-100 text-green-800'
                                                        : 'bg-blue-100 text-blue-800'
                                                }`}>
                                                    {sensorType.pin_type || 'digital'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-600 mb-3">
                                                {sensorType.description || `Unit: ${sensorType.unit}`}
                                            </p>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-gray-500">
                                                    {count} configured
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleAddSensorType(sensorType);
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                                                >
                                                    <Plus className="h-3 w-3" />
                                                    Add
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Configured Sensors */}
                    <div className="space-y-4">
                        {localSensors.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <Info className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                                <p>{t('deviceDetail.sensorManager.noSensors', 'No sensors configured yet. Click "Add New Sensor" to get started.')}</p>
                            </div>
                        ) : (
                            localSensors.map((sensor) => {
                                const sensorTypeDetails = getSensorTypeDetails(sensor.sensor_type_id);
                                const hasPinConflict = pinConflicts.includes(sensor.pin);

                                return (
                                    <div
                                        key={sensor.id}
                                        className={`rounded-xl border-2 ${
                                            hasPinConflict
                                                ? 'border-red-300 bg-red-50'
                                                : 'border-gray-200 bg-white'
                                        } shadow-sm hover:shadow-md transition-shadow`}
                                    >
                                        {/* Sensor Header */}
                                        <div className="p-5 bg-gradient-to-r from-gray-50 to-gray-100">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-white ${
                                                        hasPinConflict ? 'bg-red-500' : 'bg-indigo-600'
                                                    }`}>
                                                        {sensor.pin}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-semibold text-gray-900">{sensor.name}</h4>
                                                        <p className="text-sm text-gray-600">
                                                            {sensorTypeDetails?.name || sensor.sensor_type} • {sensorTypeDetails?.unit || ''}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={sensor.enabled}
                                                            onChange={(e) => handleSensorChange(sensor.id, 'enabled', e.target.checked)}
                                                            className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        <span className="text-sm font-medium text-gray-700">
                                                            {sensor.enabled ? (
                                                                <span className="flex items-center gap-1 text-green-600">
                                                                    <CheckCircle className="h-4 w-4" />
                                                                    Enabled
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-500">Disabled</span>
                                                            )}
                                                        </span>
                                                    </label>
                                                    <button
                                                        onClick={() => handleRemoveSensor(sensor.id)}
                                                        className="rounded-full p-2 text-red-600 hover:bg-red-100 transition-colors"
                                                        title={t('deviceDetail.sensorManager.remove', 'Remove Sensor')}
                                                    >
                                                        <Trash2 className="h-5 w-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Sensor Configuration */}
                                        <div className="p-5 space-y-4">
                                            {/* Basic Settings */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        {t('deviceDetail.sensorManager.pin', 'Pin')} {hasPinConflict && <span className="text-red-600">*</span>}
                                                    </label>
                                                    <select
                                                        value={sensor.pin}
                                                        onChange={(e) => handlePinChange(sensor.id, e.target.value)}
                                                        className={`w-full rounded-lg border ${
                                                            hasPinConflict ? 'border-red-300' : 'border-gray-300'
                                                        } px-4 py-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200`}
                                                    >
                                                        {availablePins.map(pin => (
                                                            <option key={pin} value={pin}>
                                                                {pin}
                                                                {usedPins[pin]?.length > 0 && pin !== sensor.pin && (
                                                                    <> {t('deviceDetail.sensorManager.pinInUse', '(in use)')}</>
                                                                )}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        {t('deviceDetail.sensorManager.name', 'Sensor Name')}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={sensor.name}
                                                        onChange={(e) => handleSensorChange(sensor.id, 'name', e.target.value)}
                                                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                                                        placeholder={t('deviceDetail.sensorManager.namePlaceholder', 'e.g., Living Room Temperature')}
                                                    />
                                                </div>
                                            </div>

                                            {/* Sensitivity & Calibration */}
                                            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                                                <h5 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                                                    <Info className="h-4 w-4" />
                                                    {t('deviceDetail.sensorManager.sensitivityCalibration', 'Sensitivity & Calibration')}
                                                </h5>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            {t('deviceDetail.sensorManager.sensitivity', 'Sensitivity')}
                                                        </label>
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            min="0.1"
                                                            max="10"
                                                            value={sensor.sensitivity || 1.0}
                                                            onChange={(e) => handleSensorChange(sensor.id, 'sensitivity', parseFloat(e.target.value) || 1.0)}
                                                            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                                                        />
                                                        <p className="text-xs text-gray-600 mt-1">
                                                            {t('deviceDetail.sensorManager.sensitivityHint', 'Higher = more detail')}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            {t('deviceDetail.sensorManager.offset', 'Offset')}
                                                        </label>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={sensor.calibration_offset || 0}
                                                            onChange={(e) => handleSensorChange(sensor.id, 'calibration_offset', parseFloat(e.target.value) || 0)}
                                                            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            {t('deviceDetail.sensorManager.multiplier', 'Multiplier')}
                                                        </label>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0.01"
                                                            value={sensor.calibration_multiplier || 1}
                                                            onChange={(e) => handleSensorChange(sensor.id, 'calibration_multiplier', parseFloat(e.target.value) || 1)}
                                                            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                                                        />
                                                    </div>
                                                </div>
                                                <p className="text-xs text-gray-600 mt-2">
                                                    {t('deviceDetail.sensorManager.calibrationFormula', 'Final value = (raw + offset) × multiplier × sensitivity')}
                                                </p>
                                            </div>

                                            {/* Thresholds */}
                                            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                                                <h5 className="text-sm font-semibold text-amber-900 mb-3">
                                                    {t('deviceDetail.sensorManager.thresholds', 'Thresholds (for device-side alerts)')}
                                                </h5>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            {t('deviceDetail.sensorManager.minThreshold', 'Minimum')}
                                                        </label>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={sensor.threshold_min || 0}
                                                            onChange={(e) => handleSensorChange(sensor.id, 'threshold_min', parseFloat(e.target.value) || 0)}
                                                            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            {t('deviceDetail.sensorManager.maxThreshold', 'Maximum')}
                                                        </label>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={sensor.threshold_max || 1000}
                                                            onChange={(e) => handleSensorChange(sensor.id, 'threshold_max', parseFloat(e.target.value) || 1000)}
                                                            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex justify-between items-center">
                    <div className="text-sm text-gray-600">
                        <p>{t('deviceDetail.sensorManager.configNote', 'Config pushed to device on next heartbeat (~1-5 min)')}</p>
                        {pinConflicts.length > 0 && (
                            <p className="text-red-600 font-medium mt-1">
                                ⚠️ {t('deviceDetail.sensorManager.resolvePinConflicts', 'Resolve pin conflicts before saving')}
                            </p>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            disabled={isLoading}
                        >
                            {t('deviceDetail.sensorManager.cancel', 'Cancel')}
                        </button>
                        <button
                            onClick={handleSave}
                            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors shadow-lg shadow-indigo-500/30"
                            disabled={isLoading || pinConflicts.length > 0}
                        >
                            <Save className="h-4 w-4" />
                            {isLoading ? t('deviceDetail.sensorManager.saving', 'Saving...') : t('deviceDetail.sensorManager.save', 'Save & Push Config')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SensorManagerModal;
