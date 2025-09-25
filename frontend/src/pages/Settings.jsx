import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import {
    Settings as SettingsIcon,
    Database,
    Download,
    Upload,
    Server,
    Mail,
    Shield,
    Save,
    RefreshCw,
    AlertTriangle,
    CheckCircle,
    Info,
    Image,
    X,
    Code,
    Eye,
    EyeOff
} from 'lucide-react';
import toast from 'react-hot-toast';

import { apiService } from '../services/api';

function Settings() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    const [activeTab, setActiveTab] = useState('system');
    const [backupLoading, setBackupLoading] = useState(false);
    const [envVars, setEnvVars] = useState({});
    const [envValidation, setEnvValidation] = useState({ valid: true, errors: [], warnings: [] });
    const [logoUploading, setLogoUploading] = useState(false);
    const [systemSettings, setSystemSettings] = useState({
        siteName: 'ESP8266 IoT Platform',
        adminEmail: '',
        backupRetentionDays: 30,
        logRetentionDays: 7,
        alertsEnabled: true,
        maintenanceMode: false
    });

    const [brandingSettings, setBrandingSettings] = useState({
        companyName: 'ESP8266 IoT Platform',
        companyLogo: null,
        logoPreview: null,
        favicon: null,
        primaryColor: '#2563eb',
        accentColor: '#1d4ed8'
    });

    // Load settings from localStorage on mount as fallback
    useEffect(() => {
        const savedSettings = localStorage.getItem('appSettings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                if (parsed.system) {
                    setSystemSettings(prev => ({ ...prev, ...parsed.system }));
                }
                if (parsed.branding) {
                    setBrandingSettings(prev => ({ ...prev, ...parsed.branding }));
                    // Apply saved branding
                    if (parsed.branding.primaryColor) {
                        document.documentElement.style.setProperty('--primary-color', parsed.branding.primaryColor);
                    }
                }
            } catch (error) {
                console.error('Error loading settings from localStorage:', error);
            }
        }
    }, []);

    // Query settings
    const { data: settingsData, isLoading: settingsLoading } = useQuery(
        'settings',
        () => apiService.getSettings(),
        {
            onSuccess: (data) => {
                if (data) {
                    setSystemSettings(prev => ({ ...prev, ...data.system }));
                    setBrandingSettings(prev => ({
                        ...prev,
                        ...data.branding,
                        logoPreview: data.branding?.companyLogo ? `/api/settings/logo?${Date.now()}` : null
                    }));
                    // Apply server branding
                    if (data.branding?.primaryColor) {
                        document.documentElement.style.setProperty('--primary-color', data.branding.primaryColor);
                    }
                }
            },
            onError: () => {
                // Settings endpoint might not exist yet - this is fine
            }
        }
    );

    // Query system info
    const { data: systemInfo, isLoading: systemLoading } = useQuery(
        'system-info',
        () => apiService.getSystemInfo ? apiService.getSystemInfo() : Promise.resolve({}),
        {
            refetchInterval: 30000,
            onError: () => {
                // System info endpoint might not exist yet
            }
        }
    );

    // Query system health
    const { data: systemHealth, isLoading: healthLoading } = useQuery(
        'system-health',
        () => apiService.getSystemHealth ? apiService.getSystemHealth() : Promise.resolve({}),
        {
            refetchInterval: 10000,
            onError: () => {
                // System health endpoint might not exist yet
            }
        }
    );

    // Query environment variables
    const { data: envData, isLoading: envLoading, refetch: refetchEnv } = useQuery(
        'environment-variables',
        () => apiService.getEnvironmentVariables(),
        {
            onSuccess: (data) => {
                if (data?.variables) {
                    setEnvVars(data.variables);
                }
            },
            onError: () => {
                // Environment variables endpoint might not be available
            }
        }
    );

    const handleBackupDatabase = async () => {
        setBackupLoading(true);
        try {
            // Create a backup download
            const response = await fetch('/api/system/backup', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Backup failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `esp8266-platform-backup-${new Date().toISOString().split('T')[0]}.sql`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);

            toast.success(t('settings.backupSuccess', 'Database backup downloaded successfully'));
        } catch (error) {
            console.error('Backup error:', error);
            toast.error(t('settings.backupError', 'Failed to create database backup'));
        } finally {
            setBackupLoading(false);
        }
    };

    // Save settings mutation
    const saveSettingsMutation = useMutation(
        (settings) => apiService.updateSettings(settings),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('settings');
                toast.success(t('settings.saveSuccess', 'Settings saved successfully'));
            },
            onError: (error) => {
                console.error('Save settings error:', error);
                toast.error(t('settings.saveError', 'Failed to save settings'));
            }
        }
    );

    const handleSaveSettings = async () => {
        const allSettings = {
            system: systemSettings,
            branding: {
                ...brandingSettings,
                logoPreview: undefined // Don't send preview data
            }
        };

        // Also save to localStorage as fallback
        localStorage.setItem('appSettings', JSON.stringify(allSettings));

        // Apply branding changes to the page
        if (brandingSettings.primaryColor) {
            document.documentElement.style.setProperty('--primary-color', brandingSettings.primaryColor);
        }

        // Dispatch event to notify other components of settings change
        window.dispatchEvent(new CustomEvent('settingsChanged', { detail: allSettings }));

        saveSettingsMutation.mutate(allSettings);
    };

    const handleLogoUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error('Please select a valid image file');
            return;
        }

        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            toast.error('Image file size must be less than 2MB');
            return;
        }

        setLogoUploading(true);

        try {
            // Create preview first
            const reader = new FileReader();
            reader.onload = (e) => {
                setBrandingSettings(prev => ({
                    ...prev,
                    logoPreview: e.target.result
                }));
            };
            reader.readAsDataURL(file);

            // Upload to server
            const formData = new FormData();
            formData.append('logo', file);

            await apiService.uploadLogo(formData);

            // Update branding settings to indicate logo exists
            setBrandingSettings(prev => ({
                ...prev,
                companyLogo: file.name
            }));

            // Refresh settings to get the server logo URL
            queryClient.invalidateQueries('settings');
            toast.success('Logo uploaded successfully');
        } catch (error) {
            console.error('Logo upload error:', error);
            toast.error('Failed to upload logo');
            // Reset preview on error
            setBrandingSettings(prev => ({
                ...prev,
                logoPreview: null
            }));
        } finally {
            setLogoUploading(false);
        }
    };

    const removeLogo = async () => {
        try {
            await apiService.removeLogo();
            setBrandingSettings(prev => ({
                ...prev,
                companyLogo: null,
                logoPreview: null
            }));
            queryClient.invalidateQueries('settings');
            toast.success('Logo removed');
        } catch (error) {
            console.error('Remove logo error:', error);
            toast.error('Failed to remove logo');
        }
    };

    // Environment variable handlers
    const handleEnvVarChange = (key, value) => {
        setEnvVars(prev => ({ ...prev, [key]: value }));

        // Validate on change
        const updatedVars = { ...envVars, [key]: value };
        apiService.validateEnvironmentVariables(updatedVars)
            .then(result => setEnvValidation(result.data))
            .catch(() => setEnvValidation({ valid: true, errors: [], warnings: [] }));
    };

    const handleSaveEnvVars = async () => {
        try {
            const response = await apiService.updateEnvironmentVariables(envVars);
            toast.success(`Environment variables updated successfully. ${response.data.requiresRestart ? 'Server restart required.' : ''}`);
            refetchEnv();
        } catch (error) {
            console.error('Save environment variables error:', error);
            toast.error('Failed to save environment variables');
        }
    };

    const tabs = [
        { id: 'system', label: t('settings.tabs.system', 'System'), icon: Server },
        { id: 'branding', label: t('settings.tabs.branding', 'Branding'), icon: Image },
        { id: 'environment', label: t('settings.tabs.environment', 'Environment'), icon: Code },
        { id: 'database', label: t('settings.tabs.database', 'Database'), icon: Database },
        { id: 'email', label: t('settings.tabs.email', 'Email'), icon: Mail },
        { id: 'security', label: t('settings.tabs.security', 'Security'), icon: Shield }
    ];

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center space-x-3">
                    <SettingsIcon className="h-8 w-8 text-blue-600" />
                    <h1 className="text-3xl font-bold text-gray-900">
                        {t('settings.title', 'System Settings')}
                    </h1>
                </div>
                <p className="mt-2 text-gray-600">
                    {t('settings.subtitle', 'Configure your IoT platform settings and system preferences')}
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Navigation Tabs */}
                <div className="lg:col-span-1">
                    <nav className="space-y-1">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                                        activeTab === tab.id
                                            ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-500'
                                            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                                >
                                    <Icon className="h-5 w-5 mr-3" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Content Area */}
                <div className="lg:col-span-3">
                    <div className="bg-white shadow rounded-lg">
                        {/* System Tab */}
                        {activeTab === 'system' && (
                            <div className="p-6">
                                <h3 className="text-lg font-medium text-gray-900 mb-4">
                                    {t('settings.system.title', 'System Information')}
                                </h3>

                                {/* System Status */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <h4 className="text-sm font-medium text-gray-700 mb-2">
                                            {t('settings.system.status', 'System Status')}
                                        </h4>
                                        <div className="flex items-center">
                                            <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                                            <span className="text-green-700">
                                                {t('settings.system.running', 'Running')}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <h4 className="text-sm font-medium text-gray-700 mb-2">
                                            {t('settings.system.uptime', 'Uptime')}
                                        </h4>
                                        <p className="text-gray-900">
                                            {systemHealth?.uptime || t('settings.system.unknown', 'Unknown')}
                                        </p>
                                    </div>

                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <h4 className="text-sm font-medium text-gray-700 mb-2">
                                            {t('settings.system.version', 'Version')}
                                        </h4>
                                        <p className="text-gray-900">
                                            {systemInfo?.version || '2.1.0'}
                                        </p>
                                    </div>

                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <h4 className="text-sm font-medium text-gray-700 mb-2">
                                            {t('settings.system.nodeVersion', 'Node.js Version')}
                                        </h4>
                                        <p className="text-gray-900">
                                            {systemInfo?.nodeVersion || 'Unknown'}
                                        </p>
                                    </div>
                                </div>

                                {/* System Settings Form */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            {t('settings.system.siteName', 'Site Name')}
                                        </label>
                                        <input
                                            type="text"
                                            value={systemSettings.siteName}
                                            onChange={(e) => setSystemSettings(prev => ({...prev, siteName: e.target.value}))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            {t('settings.system.adminEmail', 'Admin Email')}
                                        </label>
                                        <input
                                            type="email"
                                            value={systemSettings.adminEmail}
                                            onChange={(e) => setSystemSettings(prev => ({...prev, adminEmail: e.target.value}))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    <div className="flex items-center">
                                        <input
                                            type="checkbox"
                                            id="maintenanceMode"
                                            checked={systemSettings.maintenanceMode}
                                            onChange={(e) => setSystemSettings(prev => ({...prev, maintenanceMode: e.target.checked}))}
                                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                        />
                                        <label htmlFor="maintenanceMode" className="ml-2 block text-sm text-gray-700">
                                            {t('settings.system.maintenanceMode', 'Maintenance Mode')}
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Branding Tab */}
                        {activeTab === 'branding' && (
                            <div className="p-6">
                                <h3 className="text-lg font-medium text-gray-900 mb-6">
                                    {t('settings.branding.title', 'Brand Customization')}
                                </h3>

                                <div className="space-y-6">
                                    {/* Company Information */}
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-900 mb-4">
                                            {t('settings.branding.companyInfo', 'Company Information')}
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    {t('settings.branding.companyName', 'Company Name')}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={brandingSettings.companyName}
                                                    onChange={(e) => setBrandingSettings(prev => ({
                                                        ...prev,
                                                        companyName: e.target.value
                                                    }))}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Logo Management */}
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-900 mb-4">
                                            {t('settings.branding.logoManagement', 'Logo Management')}
                                        </h4>

                                        <div className="space-y-6">
                                            {/* Company Logo */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    {t('settings.branding.companyLogo', 'Company Logo')}
                                                    <span className="text-xs text-gray-500 ml-1">
                                                        (Used in header and login screen)
                                                    </span>
                                                </label>

                                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                                                    {brandingSettings.logoPreview ? (
                                                        <div className="space-y-4">
                                                            <div className="flex justify-center">
                                                                <img
                                                                    src={brandingSettings.logoPreview}
                                                                    alt="Company Logo Preview"
                                                                    className="max-h-24 max-w-full object-contain"
                                                                />
                                                            </div>
                                                            <div className="flex justify-center space-x-2">
                                                                <label className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700">
                                                                    {logoUploading ? 'Uploading...' : 'Change Logo'}
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        onChange={handleLogoUpload}
                                                                        className="hidden"
                                                                        disabled={logoUploading}
                                                                    />
                                                                </label>
                                                                <button
                                                                    onClick={removeLogo}
                                                                    className="bg-red-600 text-white px-4 py-2 rounded-md text-sm hover:bg-red-700"
                                                                    disabled={logoUploading}
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-4">
                                                            <Image className="w-12 h-12 text-gray-400 mx-auto" />
                                                            <div>
                                                                <label className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700">
                                                                    {logoUploading ? 'Uploading...' : 'Upload Logo'}
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        onChange={handleLogoUpload}
                                                                        className="hidden"
                                                                        disabled={logoUploading}
                                                                    />
                                                                </label>
                                                                <p className="text-xs text-gray-500 mt-2">
                                                                    PNG, JPG up to 2MB. Recommended: 200x60px
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Color Scheme */}
                                            <div>
                                                <h4 className="text-sm font-medium text-gray-900 mb-4">
                                                    {t('settings.branding.colorScheme', 'Color Scheme')}
                                                </h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            {t('settings.branding.primaryColor', 'Primary Color')}
                                                        </label>
                                                        <div className="flex items-center space-x-2">
                                                            <input
                                                                type="color"
                                                                value={brandingSettings.primaryColor}
                                                                onChange={(e) => setBrandingSettings(prev => ({
                                                                    ...prev,
                                                                    primaryColor: e.target.value
                                                                }))}
                                                                className="h-10 w-16 border border-gray-300 rounded cursor-pointer"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={brandingSettings.primaryColor}
                                                                onChange={(e) => setBrandingSettings(prev => ({
                                                                    ...prev,
                                                                    primaryColor: e.target.value
                                                                }))}
                                                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Preview */}
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-900 mb-4">
                                            {t('settings.branding.preview', 'Preview')}
                                        </h4>
                                        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                            <div className="flex items-center space-x-3 mb-4">
                                                {brandingSettings.logoPreview ? (
                                                    <img
                                                        src={brandingSettings.logoPreview}
                                                        alt="Preview"
                                                        className="h-8 object-contain"
                                                    />
                                                ) : (
                                                    <div className="h-8 w-24 bg-gray-300 rounded flex items-center justify-center text-xs">
                                                        Logo
                                                    </div>
                                                )}
                                                <h5 className="text-lg font-bold">{brandingSettings.companyName}</h5>
                                            </div>
                                            <div className="flex space-x-2">
                                                <div
                                                    className="px-4 py-2 text-white rounded text-sm"
                                                    style={{ backgroundColor: brandingSettings.primaryColor }}
                                                >
                                                    Primary Button
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Save Button */}
                                    <div className="flex justify-end pt-6 border-t">
                                        <button
                                            onClick={handleSaveSettings}
                                            disabled={saveSettingsMutation.isLoading}
                                            className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {saveSettingsMutation.isLoading ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                    <span>Saving...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Save className="w-4 h-4" />
                                                    <span>{t('settings.saveSettings', 'Save Settings')}</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Environment Variables Tab */}
                        {activeTab === 'environment' && (
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-medium text-gray-900">
                                        {t('settings.environment.title', 'Environment Variables')}
                                    </h3>
                                    <div className="flex items-center space-x-2">
                                        {envValidation.errors?.length > 0 && (
                                            <div className="flex items-center space-x-1 text-red-600">
                                                <AlertTriangle className="h-4 w-4" />
                                                <span className="text-sm">{envValidation.errors.length} error(s)</span>
                                            </div>
                                        )}
                                        {envValidation.warnings?.length > 0 && (
                                            <div className="flex items-center space-x-1 text-yellow-600">
                                                <AlertTriangle className="h-4 w-4" />
                                                <span className="text-sm">{envValidation.warnings.length} warning(s)</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {envLoading ? (
                                    <div className="animate-pulse space-y-4">
                                        {[1, 2, 3, 4, 5].map(i => (
                                            <div key={i} className="h-16 bg-gray-200 rounded"></div>
                                        ))}
                                    </div>
                                ) : (
                                    <>
                                        {/* No environment variables message */}
                                        {(!envVars || Object.keys(envVars).length === 0) && (
                                            <div className="mb-6 p-6 bg-yellow-50 border border-yellow-200 rounded-md">
                                                <div className="flex">
                                                    <Info className="h-5 w-5 text-yellow-400" />
                                                    <div className="ml-3">
                                                        <h3 className="text-sm font-medium text-yellow-800">No Environment Variables Found</h3>
                                                        <p className="mt-2 text-sm text-yellow-700">
                                                            The .env file doesn't exist or is empty. Environment variables are used to configure your application settings like database connections, API keys, and other sensitive configurations.
                                                        </p>
                                                        <p className="mt-2 text-sm text-yellow-700">
                                                            You can create environment variables below, and they will be saved to your .env file automatically.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Validation Messages */}
                                        {envValidation.errors?.length > 0 && (
                                            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                                                <div className="flex">
                                                    <AlertTriangle className="h-5 w-5 text-red-400" />
                                                    <div className="ml-3">
                                                        <h3 className="text-sm font-medium text-red-800">Errors</h3>
                                                        <ul className="mt-2 text-sm text-red-700">
                                                            {envValidation.errors.map((error, idx) => (
                                                                <li key={idx}>• {error}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {envValidation.warnings?.length > 0 && (
                                            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                                                <div className="flex">
                                                    <Info className="h-5 w-5 text-yellow-400" />
                                                    <div className="ml-3">
                                                        <h3 className="text-sm font-medium text-yellow-800">Warnings</h3>
                                                        <ul className="mt-2 text-sm text-yellow-700">
                                                            {envValidation.warnings.map((warning, idx) => (
                                                                <li key={idx}>• {warning}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Simple form to add environment variables when none exist */}
                                        {(!envVars || Object.keys(envVars).length === 0) && (
                                            <div className="mb-8">
                                                <h4 className="text-md font-semibold text-gray-800 mb-4 border-b pb-2">
                                                    Add Environment Variables
                                                </h4>
                                                <div className="space-y-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-4 bg-gray-50 rounded-lg">
                                                        <div>
                                                            <input
                                                                type="text"
                                                                placeholder="Variable Name (e.g., DB_HOST)"
                                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Tab' || e.key === 'Enter') {
                                                                        e.preventDefault();
                                                                        const key = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
                                                                        if (key) {
                                                                            e.target.value = key;
                                                                            e.target.nextSibling.focus();
                                                                        }
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            <div className="flex items-center space-x-2">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Value"
                                                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            const keyInput = e.target.parentElement.parentElement.previousSibling.firstChild;
                                                                            const key = keyInput.value.trim();
                                                                            const value = e.target.value.trim();

                                                                            if (key && value) {
                                                                                handleEnvVarChange(key, value);
                                                                                keyInput.value = '';
                                                                                e.target.value = '';
                                                                                keyInput.focus();
                                                                            }
                                                                        }
                                                                    }}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        const keyInput = e.target.closest('.grid').querySelector('input[placeholder*="Variable Name"]');
                                                                        const valueInput = e.target.closest('.flex').querySelector('input[placeholder="Value"]');
                                                                        const key = keyInput.value.trim();
                                                                        const value = valueInput.value.trim();

                                                                        if (key && value) {
                                                                            handleEnvVarChange(key, value);
                                                                            keyInput.value = '';
                                                                            valueInput.value = '';
                                                                            keyInput.focus();
                                                                        }
                                                                    }}
                                                                    className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                                                                >
                                                                    Add
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-gray-500">
                                                        Press Tab to format variable names, or Enter to add the variable
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Environment Variables by Category */}
                                        {envData?.categories && Object.entries(envData.categories).map(([category, variables]) => {
                                            const categoryVars = variables.filter(varName => envVars[varName] !== undefined);
                                            if (categoryVars.length === 0) return null;

                                            return (
                                                <div key={category} className="mb-8">
                                                    <h4 className="text-md font-semibold text-gray-800 mb-4 border-b pb-2">
                                                        {category}
                                                    </h4>
                                                    <div className="space-y-4">
                                                        {categoryVars.map(varName => {
                                                            const isSensitive = envData.sensitiveKeys?.includes(varName);
                                                            const [showSensitive, setShowSensitive] = React.useState(false);

                                                            return (
                                                                <div key={varName} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-4 bg-gray-50 rounded-lg">
                                                                    <div className="flex flex-col">
                                                                        <label className="text-sm font-medium text-gray-700 mb-1">
                                                                            {varName}
                                                                            {envData.sensitiveKeys?.includes(varName) && (
                                                                                <span className="ml-2 px-2 py-1 text-xs bg-red-100 text-red-800 rounded">
                                                                                    Sensitive
                                                                                </span>
                                                                            )}
                                                                        </label>
                                                                    </div>
                                                                    <div className="md:col-span-2">
                                                                        <div className="flex items-center space-x-2">
                                                                            <input
                                                                                type={isSensitive && !showSensitive ? 'password' : 'text'}
                                                                                value={envVars[varName] || ''}
                                                                                onChange={(e) => handleEnvVarChange(varName, e.target.value)}
                                                                                placeholder={isSensitive ? '***MASKED***' : `Enter ${varName}`}
                                                                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                                                                disabled={isSensitive && envVars[varName] === '***MASKED***'}
                                                                            />
                                                                            {isSensitive && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setShowSensitive(!showSensitive)}
                                                                                    className="p-2 text-gray-400 hover:text-gray-600"
                                                                                >
                                                                                    {showSensitive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Uncategorized Variables */}
                                        {Object.keys(envVars).filter(key => !envData?.categories ||
                                            !Object.values(envData.categories).flat().includes(key)).length > 0 && (
                                            <div className="mb-8">
                                                <h4 className="text-md font-semibold text-gray-800 mb-4 border-b pb-2">
                                                    Other Variables
                                                </h4>
                                                <div className="space-y-4">
                                                    {Object.keys(envVars)
                                                        .filter(key => !envData?.categories || !Object.values(envData.categories).flat().includes(key))
                                                        .map(varName => (
                                                        <div key={varName} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-4 bg-gray-50 rounded-lg">
                                                            <div className="flex flex-col">
                                                                <label className="text-sm font-medium text-gray-700 mb-1">
                                                                    {varName}
                                                                </label>
                                                            </div>
                                                            <div className="md:col-span-2">
                                                                <input
                                                                    type="text"
                                                                    value={envVars[varName] || ''}
                                                                    onChange={(e) => handleEnvVarChange(varName, e.target.value)}
                                                                    placeholder={`Enter ${varName}`}
                                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                                                />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Save Button */}
                                        <div className="flex justify-between items-center pt-6 border-t border-gray-200">
                                            <div className="text-sm text-gray-500">
                                                <Info className="h-4 w-4 inline mr-1" />
                                                Changes may require server restart to take effect
                                            </div>
                                            <button
                                                onClick={handleSaveEnvVars}
                                                disabled={envValidation.errors?.length > 0}
                                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                            >
                                                <Save className="h-4 w-4 mr-2" />
                                                Save Environment Variables
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Database Tab */}
                        {activeTab === 'database' && (
                            <div className="p-6">
                                <h3 className="text-lg font-medium text-gray-900 mb-4">
                                    {t('settings.database.title', 'Database Management')}
                                </h3>

                                <div className="space-y-6">
                                    {/* Database Info */}
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                        <div className="flex items-start">
                                            <Info className="h-5 w-5 text-blue-400 mt-0.5" />
                                            <div className="ml-3">
                                                <h4 className="text-sm font-medium text-blue-800">
                                                    {t('settings.database.info', 'Database Information')}
                                                </h4>
                                                <div className="mt-2 text-sm text-blue-700">
                                                    <p>{t('settings.database.type', 'Type')}: PostgreSQL</p>
                                                    <p>{t('settings.database.status', 'Status')}: Connected</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Backup Section */}
                                    <div>
                                        <h4 className="text-md font-medium text-gray-900 mb-3">
                                            {t('settings.database.backup', 'Backup & Restore')}
                                        </h4>

                                        <div className="space-y-3">
                                            <button
                                                onClick={handleBackupDatabase}
                                                disabled={backupLoading}
                                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {backupLoading ? (
                                                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                                ) : (
                                                    <Download className="h-4 w-4 mr-2" />
                                                )}
                                                {t('settings.database.createBackup', 'Create Backup')}
                                            </button>

                                            <p className="text-sm text-gray-600">
                                                {t('settings.database.backupDescription', 'Download a complete backup of your database including all devices, users, alerts, and telemetry data.')}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Retention Settings */}
                                    <div>
                                        <h4 className="text-md font-medium text-gray-900 mb-3">
                                            {t('settings.database.retention', 'Data Retention')}
                                        </h4>

                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    {t('settings.database.backupRetention', 'Backup Retention (days)')}
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="365"
                                                    value={systemSettings.backupRetentionDays}
                                                    onChange={(e) => setSystemSettings(prev => ({...prev, backupRetentionDays: parseInt(e.target.value)}))}
                                                    className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    {t('settings.database.logRetention', 'Log Retention (days)')}
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="90"
                                                    value={systemSettings.logRetentionDays}
                                                    onChange={(e) => setSystemSettings(prev => ({...prev, logRetentionDays: parseInt(e.target.value)}))}
                                                    className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Email Tab */}
                        {activeTab === 'email' && (
                            <div className="p-6">
                                <h3 className="text-lg font-medium text-gray-900 mb-4">
                                    {t('settings.email.title', 'Email Configuration')}
                                </h3>

                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                                    <div className="flex items-start">
                                        <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5" />
                                        <div className="ml-3">
                                            <p className="text-sm text-yellow-800">
                                                {t('settings.email.notice', 'Email settings are configured in the backend environment file (.env). Restart the application after making changes.')}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            {t('settings.email.smtpHost', 'SMTP Host')}
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="smtp.gmail.com"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            disabled
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            {t('settings.email.smtpPort', 'SMTP Port')}
                                        </label>
                                        <input
                                            type="number"
                                            placeholder="587"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            disabled
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            {t('settings.email.username', 'Username')}
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            disabled
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Security Tab */}
                        {activeTab === 'security' && (
                            <div className="p-6">
                                <h3 className="text-lg font-medium text-gray-900 mb-4">
                                    {t('settings.security.title', 'Security Settings')}
                                </h3>

                                <div className="space-y-6">
                                    <div>
                                        <h4 className="text-md font-medium text-gray-900 mb-3">
                                            {t('settings.security.authentication', 'Authentication')}
                                        </h4>
                                        <p className="text-sm text-gray-600 mb-3">
                                            {t('settings.security.authDescription', 'Configure authentication and session settings')}
                                        </p>

                                        <div className="space-y-3">
                                            <div className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    id="forceHttps"
                                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                                />
                                                <label htmlFor="forceHttps" className="ml-2 block text-sm text-gray-700">
                                                    {t('settings.security.forceHttps', 'Force HTTPS')}
                                                </label>
                                            </div>

                                            <div className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    id="requireStrongPasswords"
                                                    defaultChecked
                                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                                />
                                                <label htmlFor="requireStrongPasswords" className="ml-2 block text-sm text-gray-700">
                                                    {t('settings.security.strongPasswords', 'Require Strong Passwords')}
                                                </label>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-md font-medium text-gray-900 mb-3">
                                            {t('settings.security.sessions', 'Session Management')}
                                        </h4>

                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    {t('settings.security.sessionTimeout', 'Session Timeout (hours)')}
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="168"
                                                    defaultValue="24"
                                                    className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Save Button */}
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg">
                            <button
                                onClick={handleSaveSettings}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                                <Save className="h-4 w-4 mr-2" />
                                {t('settings.save', 'Save Settings')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Settings;