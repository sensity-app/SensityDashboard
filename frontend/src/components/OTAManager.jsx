import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { X, Upload, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { websocketService } from '../services/websocket';

function OTAManager({ device, onClose }) {
    const { t } = useTranslation();
    const [selectedFirmware, setSelectedFirmware] = useState('');
    const [uploadingFirmware, setUploadingFirmware] = useState(false);
    const [otaEnabled, setOtaEnabled] = useState(device.ota_enabled || false);
    const queryClient = useQueryClient();

    // Get available firmware versions
    const { data: firmwareVersions = [] } = useQuery(
        ['firmware-versions', device.device_type],
        async () => {
            const response = await apiService.getFirmwareVersions(device.device_type || 'esp8266');
            // Handle both array and object responses
            return Array.isArray(response) ? response : (response?.versions || response?.firmware_versions || []);
        }
    );

    // Get current OTA status
    const { data: otaStatus, refetch: refetchOTAStatus } = useQuery(
        ['ota-status', device.id],
        () => apiService.getOTAStatus(device.id),
        { refetchInterval: 5000 }
    );

    // Toggle OTA enabled mutation
    const toggleOTAMutation = useMutation(
        (enabled) => apiService.updateDeviceConfig(device.id, { ota_enabled: enabled }),
        {
            onSuccess: (data) => {
                setOtaEnabled(data.config.ota_enabled);
                toast.success(t('otaManager.toast.otaToggleSuccess'));
                queryClient.invalidateQueries(['device', device.id]);
            },
            onError: (error) => {
                toast.error(t('otaManager.toast.otaToggleFailed', { message: error.message || t('common.error') }));
            }
        }
    );

    // Schedule OTA update mutation
    const scheduleUpdateMutation = useMutation(
        ({ firmwareVersionId, forced }) =>
            apiService.scheduleOTAUpdate(device.id, firmwareVersionId, forced),
        {
            onSuccess: () => {
                toast.success(t('otaManager.toast.scheduleSuccess'));
                refetchOTAStatus();
            },
            onError: (error) => {
                toast.error(t('otaManager.toast.scheduleFailed', { message: error.message || t('common.error') }));
            }
        }
    );

    // Cancel OTA update mutation
    const cancelUpdateMutation = useMutation(
        () => apiService.cancelOTAUpdate(device.id),
        {
            onSuccess: () => {
                toast.success(t('otaManager.toast.cancelSuccess'));
                refetchOTAStatus();
            },
            onError: () => {
                toast.error(t('otaManager.toast.cancelFailed'));
            }
        }
    );

    // Upload firmware mutation
    const uploadFirmwareMutation = useMutation(
        (formData) => apiService.uploadFirmware(formData),
        {
            onSuccess: () => {
                toast.success(t('otaManager.toast.uploadSuccess'));
                queryClient.invalidateQueries(['firmware-versions']);
                setUploadingFirmware(false);
            },
            onError: (error) => {
                toast.error(t('otaManager.toast.uploadFailed', { message: error.message || t('common.error') }));
                setUploadingFirmware(false);
            }
        }
    );

    // WebSocket updates for OTA progress
    useEffect(() => {
        const handleOTAProgress = (data) => {
            refetchOTAStatus();
        };

        websocketService.on(`device:${device.id}:ota_progress`, handleOTAProgress);

        return () => {
            websocketService.off(`device:${device.id}:ota_progress`, handleOTAProgress);
        };
    }, [device.id, refetchOTAStatus]);

    const handleScheduleUpdate = () => {
        if (!selectedFirmware) {
            toast.error(t('otaManager.toast.selectVersion'));
            return;
        }

        const forced = !otaEnabled;

        if (forced) {
            const confirmed = window.confirm(
                t('otaManager.confirm.forcedUpdate',
                    'OTA is currently disabled. This will force the update and may take longer. Continue?')
            );
            if (!confirmed) return;
        }

        scheduleUpdateMutation.mutate({
            firmwareVersionId: parseInt(selectedFirmware),
            forced
        });
    };

    const handleCancelUpdate = () => {
        cancelUpdateMutation.mutate();
    };

    const handleFirmwareUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.bin')) {
            toast.error(t('otaManager.toast.invalidFirmware'));
            return;
        }

        const version = prompt(t('otaManager.prompt.version', 'Enter firmware version (e.g., 2.1.0):'));
        if (!version) return;

        const releaseNotes = prompt(t('otaManager.prompt.releaseNotes', 'Enter release notes (optional):')) || '';

        const formData = new FormData();
        formData.append('firmware', file);
        formData.append('version', version);
        formData.append('device_type', device.device_type || 'esp8266');
        formData.append('release_notes', releaseNotes);

        setUploadingFirmware(true);
        uploadFirmwareMutation.mutate(formData);
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'completed':
                return <CheckCircle className="h-5 w-5 text-green-600" />;
            case 'failed':
                return <AlertTriangle className="h-5 w-5 text-red-600" />;
            case 'pending':
            case 'downloading':
            case 'installing':
                return <Clock className="h-5 w-5 text-blue-600" />;
            default:
                return null;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'completed':
                return 'bg-green-100 text-green-800';
            case 'failed':
                return 'bg-red-100 text-red-800';
            case 'pending':
            case 'downloading':
            case 'installing':
                return 'bg-blue-100 text-blue-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const formatOtaStatus = (status) => {
        if (!status) {
            return t('otaManager.status.unknown', 'Unknown');
        }
        return t(`otaManager.status.${status}`, status.toUpperCase());
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">{t('otaManager.title')}</h2>
                        <p className="text-sm text-gray-500">{device.name}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Current Status */}
                    <div className="bg-gray-50 rounded-lg p-4">
                        <h3 className="text-lg font-medium text-gray-900 mb-3">{t('otaManager.status.heading')}</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm font-medium text-gray-500">{t('otaManager.status.currentFirmware')}</p>
                                <p className="text-sm text-gray-900">{device.firmware_version || t('common.unknown')}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-500 mb-2">{t('otaManager.status.otaEnabled')}</p>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => toggleOTAMutation.mutate(!otaEnabled)}
                                        disabled={toggleOTAMutation.isLoading}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${otaEnabled ? 'bg-green-600' : 'bg-gray-200'
                                            } ${toggleOTAMutation.isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${otaEnabled ? 'translate-x-6' : 'translate-x-1'
                                                }`}
                                        />
                                    </button>
                                    <span className={`text-sm font-medium ${otaEnabled ? 'text-green-700' : 'text-gray-500'}`}>
                                        {otaEnabled ? t('common.enabled') : t('common.disabled')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {otaStatus && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                        {getStatusIcon(otaStatus.status)}
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(otaStatus.status)}`}>
                                            {formatOtaStatus(otaStatus.status)}
                                        </span>
                                        <span className="text-sm text-gray-900">
                                            {otaStatus.status === 'downloading' && `${otaStatus.progress_percent}%`}
                                        </span>
                                    </div>
                                    {(otaStatus.status === 'pending' || otaStatus.status === 'downloading') && (
                                        <button
                                            onClick={handleCancelUpdate}
                                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                                            disabled={cancelUpdateMutation.isLoading}
                                        >
                                            {t('otaManager.actions.cancelUpdate')}
                                        </button>
                                    )}
                                </div>

                                {otaStatus.status === 'downloading' && (
                                    <div className="mt-2">
                                        <div className="bg-gray-200 rounded-full h-2">
                                            <div
                                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                                style={{ width: `${otaStatus.progress_percent}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {otaStatus.error_message && (
                                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                                        {otaStatus.error_message}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Available Firmware */}
                    <div>
                        <h3 className="text-lg font-medium text-gray-900 mb-3">{t('otaManager.firmware.availableHeading')}</h3>

                        {firmwareVersions.length === 0 ? (
                            <p className="text-gray-500 text-sm">{t('otaManager.firmware.none')}</p>
                        ) : (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {firmwareVersions.map((firmware) => (
                                    <div
                                        key={firmware.id}
                                        className={`border rounded-lg p-3 cursor-pointer transition-colors ${selectedFirmware === firmware.id.toString()
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                        onClick={() => setSelectedFirmware(firmware.id.toString())}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-medium text-gray-900">v{firmware.version}</p>
                                                <p className="text-sm text-gray-500">
                                                    {firmware.device_type} • {new Date(firmware.created_at).toLocaleDateString()}
                                                </p>
                                                {firmware.release_notes && (
                                                    <p className="text-sm text-gray-600 mt-1">{firmware.release_notes}</p>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-medium text-gray-900">{firmware.file_size}</p>
                                                <p className="text-xs text-gray-500">{t('otaManager.firmware.sizeLabel')}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Upload New Firmware */}
                    <div>
                        <h3 className="text-lg font-medium text-gray-900 mb-3">{t('otaManager.upload.heading')}</h3>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                            <div className="text-center">
                                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                                <div className="mt-2">
                                    <label htmlFor="firmware-upload" className="cursor-pointer">
                                        <span className="text-blue-600 hover:text-blue-500 font-medium">
                                            {t('otaManager.upload.cta')}
                                        </span>
                                        <input
                                            id="firmware-upload"
                                            type="file"
                                            accept=".bin"
                                            className="sr-only"
                                            onChange={handleFirmwareUpload}
                                            disabled={uploadingFirmware}
                                        />
                                    </label>
                                </div>
                                <p className="text-xs text-gray-500">
                                    {t('otaManager.upload.hint')}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end space-x-3 pt-4 border-t">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            onClick={handleScheduleUpdate}
                            disabled={
                                !selectedFirmware ||
                                scheduleUpdateMutation.isLoading ||
                                (otaStatus && (otaStatus.status === 'pending' || otaStatus.status === 'downloading'))
                            }
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {scheduleUpdateMutation.isLoading
                                ? t('otaManager.actions.scheduling')
                                : t('otaManager.actions.schedule')}
                        </button>
                    </div>

                    {!otaEnabled && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <div className="flex">
                                <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                                <div className="ml-3">
                                    <h3 className="text-sm font-medium text-yellow-800">
                                        {t('otaManager.disabledWarning.title', 'OTA Updates Disabled')}
                                    </h3>
                                    <p className="text-sm text-yellow-700 mt-2">
                                        {t('otaManager.disabledWarning.body',
                                            'This device has OTA updates disabled. Enable OTA updates above for automatic firmware updates, or force the update (which may take longer).')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default OTAManager;
