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
    EyeOff,
    GitBranch,
    RotateCcw,
    Clock
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
    const [showSensitive, setShowSensitive] = useState({});

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
        { id: 'platform', label: 'Platform Update', icon: RotateCcw },
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
                                        <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                                            <GitBranch className="w-4 h-4 mr-1" />
                                            {t('settings.system.version', 'Version')}
                                        </h4>
                                        <div className="space-y-1">
                                            <p className="text-gray-900 font-mono text-sm">
                                                {systemInfo?.version?.commit || 'unknown'}
                                            </p>
                                            {systemInfo?.version?.branch && (
                                                <p className="text-xs text-gray-600">
                                                    {systemInfo.version.branch} branch
                                                </p>
                                            )}
                                            {systemInfo?.version?.date && (
                                                <p className="text-xs text-gray-500">
                                                    {new Date(systemInfo.version.date).toLocaleDateString()}
                                                </p>
                                            )}
                                        </div>
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

                        {/* Platform Update Tab */}
                        {activeTab === 'platform' && (
                            <PlatformUpdateTab />
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
                                                            const isVisible = showSensitive[varName] || false;

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
                                                                                type={isSensitive && !isVisible ? 'password' : 'text'}
                                                                                value={envVars[varName] || ''}
                                                                                onChange={(e) => handleEnvVarChange(varName, e.target.value)}
                                                                                placeholder={isSensitive ? '***MASKED***' : `Enter ${varName}`}
                                                                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                                                                disabled={isSensitive && envVars[varName] === '***MASKED***'}
                                                                            />
                                                                            {isSensitive && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setShowSensitive(prev => ({ ...prev, [varName]: !isVisible }))}
                                                                                    className="p-2 text-gray-400 hover:text-gray-600"
                                                                                >
                                                                                    {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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

// Platform Update Tab Component
function PlatformUpdateTab() {
    const { t } = useTranslation();
    const [updating, setUpdating] = useState(false);
    const [showLogs, setShowLogs] = useState(false);

    // Query system version
    const { data: versionData, isLoading: versionLoading, refetch: refetchVersion } = useQuery(
        'system-version',
        apiService.getSystemVersion,
        {
            refetchInterval: 30000,
            onError: (error) => {
                console.error('Failed to load version info:', error);
            }
        }
    );

    // Query update status
    const { data: updateStatus, isLoading: updateLoading } = useQuery(
        'update-status',
        apiService.getUpdateStatus,
        {
            onError: (error) => {
                console.error('Failed to check update status:', error);
            }
        }
    );

    // Query update progress (only when updating)
    const { data: progressData, isLoading: progressLoading } = useQuery(
        'update-progress',
        apiService.getUpdateProgress,
        {
            enabled: updating,
            refetchInterval: 1000, // Poll every second when updating
            onSuccess: (data) => {
                const status = data?.status;
                if (status && !status.isRunning && updating) {
                    setUpdating(false);
                    if (status.error) {
                        toast.error(`Update failed: ${status.error}`);
                    } else {
                        toast.success('Platform update completed successfully!');
                        refetchVersion();
                    }
                }
            },
            onError: (error) => {
                console.error('Failed to get update progress:', error);
            }
        }
    );

    // Update platform mutation
    const updatePlatformMutation = useMutation(
        apiService.updatePlatform,
        {
            onSuccess: () => {
                toast.success('Platform update started! Monitor progress below.');
                setUpdating(true);
            },
            onError: (error) => {
                const message = error.response?.data?.error || 'Failed to start platform update';
                toast.error(message);
                setUpdating(false);
            }
        }
    );

    const handleUpdate = async () => {
        if (!updateStatus?.updateAvailable) {
            toast.error('Update script is not available on this system');
            return;
        }

        const confirmed = window.confirm(
            'Are you sure you want to update the platform? This will restart the system and may take several minutes. Make sure no critical operations are running.'
        );

        if (confirmed) {
            setUpdating(true);
            updatePlatformMutation.mutate();
        }
    };

    const version = versionData?.version || {};

    return (
        <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6 flex items-center">
                <RotateCcw className="w-5 h-5 mr-2 text-blue-600" />
                Platform Update
            </h3>

            <div className="space-y-6">
                {/* Current Version Info */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="text-md font-medium text-gray-900 mb-4 flex items-center">
                        <GitBranch className="w-4 h-4 mr-2" />
                        Current Version
                    </h4>

                    {versionLoading ? (
                        <div className="animate-pulse">
                            <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div className="flex justify-between">
                                <span className="font-medium text-gray-700">Commit:</span>
                                <span className="font-mono text-gray-900">{version.commit || 'unknown'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-medium text-gray-700">Branch:</span>
                                <span className="text-gray-900">{version.branch || 'unknown'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-medium text-gray-700">Author:</span>
                                <span className="text-gray-900">{version.author || 'unknown'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-medium text-gray-700">Date:</span>
                                <span className="text-gray-900 flex items-center">
                                    <Clock className="w-3 h-3 mr-1" />
                                    {version.date ? new Date(version.date).toLocaleDateString() : 'unknown'}
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="mt-4 pt-4 border-t border-gray-200">
                        <button
                            onClick={() => refetchVersion()}
                            disabled={versionLoading}
                            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${versionLoading ? 'animate-spin' : ''}`} />
                            Refresh Version Info
                        </button>
                    </div>
                </div>

                {/* Update Section */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="text-md font-medium text-gray-900 mb-4 flex items-center">
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Platform Update
                    </h4>

                    {updateLoading ? (
                        <div className="animate-pulse">
                            <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
                            <div className="h-10 bg-gray-200 rounded w-32"></div>
                        </div>
                    ) : updateStatus?.updateAvailable ? (
                        <div>
                            <div className="mb-4">
                                <div className="flex items-center text-green-600 mb-2">
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    <span className="text-sm font-medium">Update script available</span>
                                </div>
                                <p className="text-sm text-gray-600 mb-4">
                                    Script: <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{updateStatus.updateScript}</code>
                                </p>
                                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
                                    <div className="flex">
                                        <AlertTriangle className="w-5 h-5 text-yellow-400 mr-2" />
                                        <div className="text-sm">
                                            <p className="text-yellow-800 font-medium">Important:</p>
                                            <ul className="text-yellow-700 mt-2 list-disc list-inside space-y-1">
                                                <li>The update process will restart the entire system</li>
                                                <li>All users will be disconnected temporarily</li>
                                                <li>The process may take several minutes to complete</li>
                                                <li>Make sure no critical operations are running</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleUpdate}
                                disabled={updating}
                                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                                    updating
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                                }`}
                            >
                                {updating ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                                        Updating...
                                    </>
                                ) : (
                                    <>
                                        <RotateCcw className="w-4 h-4 mr-2" />
                                        Update Platform
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center text-red-600 mb-2">
                                <X className="w-4 h-4 mr-2" />
                                <span className="text-sm font-medium">Update script not available</span>
                            </div>
                            <p className="text-sm text-gray-600 mb-4">
                                The <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">update-system</code> command
                                was not found on this system. Platform updates are not available.
                            </p>
                            <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                                <div className="text-sm">
                                    <p className="text-gray-800 font-medium">To enable platform updates:</p>
                                    <ul className="text-gray-600 mt-2 list-disc list-inside space-y-1">
                                        <li>Create an <code className="bg-white px-1 py-0.5 rounded text-xs">update-system</code> script</li>
                                        <li>Make it executable and place it in your system PATH</li>
                                        <li>Or create <code className="bg-white px-1 py-0.5 rounded text-xs">update-system.sh</code> in the project directory</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Progress Tracking Section - Only show when updating */}
                {updating && progressData?.status && (
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h4 className="text-md font-medium text-gray-900 mb-4 flex items-center">
                            <Clock className="w-4 h-4 mr-2" />
                            Update Progress
                        </h4>

                        <div className="space-y-4">
                            {/* Progress Bar */}
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-gray-600">Progress</span>
                                    <span className="font-medium text-gray-900">
                                        {progressData.status.progress}%
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                        className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                                        style={{ width: `${progressData.status.progress}%` }}
                                    ></div>
                                </div>
                            </div>

                            {/* Current Step */}
                            <div className="flex items-center text-sm">
                                <span className="text-gray-600 mr-2">Current step:</span>
                                <span className="font-medium text-gray-900 flex items-center">
                                    {progressData.status.isRunning && (
                                        <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                                    )}
                                    {progressData.status.currentStep || 'Initializing...'}
                                </span>
                            </div>

                            {/* Duration */}
                            {progressData.status.duration && (
                                <div className="flex items-center text-sm text-gray-600">
                                    <span className="mr-2">Duration:</span>
                                    <span>{Math.floor(progressData.status.duration / 1000)}s</span>
                                </div>
                            )}

                            {/* Error Message */}
                            {progressData.status.error && (
                                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                                    <div className="flex items-start">
                                        <X className="w-4 h-4 text-red-400 mt-0.5 mr-2 flex-shrink-0" />
                                        <div>
                                            <h5 className="text-sm font-medium text-red-800">Update Failed</h5>
                                            <p className="mt-1 text-sm text-red-700">{progressData.status.error}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Logs Section */}
                            {progressData.status.logs && progressData.status.logs.length > 0 && (
                                <div className="mt-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <h5 className="text-sm font-medium text-gray-900">Update Logs</h5>
                                        <button
                                            onClick={() => setShowLogs(!showLogs)}
                                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
                                        >
                                            {showLogs ? (
                                                <>
                                                    <EyeOff className="w-3 h-3 mr-1" />
                                                    Hide Logs
                                                </>
                                            ) : (
                                                <>
                                                    <Eye className="w-3 h-3 mr-1" />
                                                    Show Logs ({progressData.status.logs.length})
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    {showLogs && (
                                        <div className="bg-gray-900 text-gray-100 rounded-md p-4 font-mono text-xs overflow-auto max-h-60">
                                            {progressData.status.logs.slice(-20).map((log, index) => (
                                                <div
                                                    key={index}
                                                    className={`mb-1 ${
                                                        log.type === 'error' ? 'text-red-300' : 'text-gray-300'
                                                    }`}
                                                >
                                                    <span className="text-gray-500 mr-2">
                                                        {new Date(log.timestamp).toLocaleTimeString()}
                                                    </span>
                                                    {log.message}
                                                </div>
                                            ))}
                                            {progressData.status.logs.length > 20 && (
                                                <div className="text-gray-500 text-center mt-2">
                                                    ... showing last 20 entries of {progressData.status.logs.length} total
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Settings;