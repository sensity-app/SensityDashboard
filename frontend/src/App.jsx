import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from 'react-query';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Menu, X, AlertTriangle } from 'lucide-react';

import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import InitialSetup from './pages/InitialSetup';
import Dashboard from './pages/Dashboard';
import DeviceDetail from './pages/DeviceDetail';
import DeviceManagement from './pages/DeviceManagement';
import UserManagement from './pages/UserManagement';
import Settings from './pages/Settings';
import FirmwareBuilder from './pages/FirmwareBuilder';
import SerialMonitor from './pages/SerialMonitor';

import LanguageSelector from './components/LanguageSelector';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import DeviceGroupsManager from './components/DeviceGroupsManager';
import DeviceTagsManager from './components/DeviceTagsManager';
import DeviceLocationsManager from './components/DeviceLocationsManager';
import DeviceHealthDashboard from './components/DeviceHealthDashboard';
import AlertRulesManager from './components/AlertRulesManager';
import SilentModeManager from './components/SilentModeManager';
import ProtocolSettingsManager from './components/ProtocolSettingsManager';
import ErrorBoundary from './components/ErrorBoundary';
import { apiService } from './services/api';
import LicenseManagerPanel from './components/LicenseManagerPanel';

// Utility function to adjust color brightness
const adjustColorBrightness = (hexColor, amount) => {
    const usePound = hexColor[0] === "#";
    const col = usePound ? hexColor.slice(1) : hexColor;

    const num = parseInt(col, 16);
    let r = (num >> 16) + amount * 255;
    let g = ((num >> 8) & 0x00FF) + amount * 255;
    let b = (num & 0x0000FF) + amount * 255;

    r = r > 255 ? 255 : r < 0 ? 0 : r;
    g = g > 255 ? 255 : g < 0 ? 0 : g;
    b = b > 255 ? 255 : b < 0 ? 0 : b;

    return (usePound ? "#" : "") + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
};

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnMount: false, // Changed to false to prevent refetch on component mount
            refetchOnReconnect: false, // Changed to false to prevent refetch on network reconnect
        },
    },
});

function App() {
    const { i18n, t } = useTranslation();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [needsSetup, setNeedsSetup] = useState(false);
    const [hasUsers, setHasUsers] = useState(true);

    useEffect(() => {
        checkAuthAndSetup();
    }, []);

    const checkAuthAndSetup = async () => {
        try {
            // Check if system needs initial setup
            const setupCheck = await apiService.checkSetup();
            setHasUsers(setupCheck.hasUsers);

            if (setupCheck.needsSetup) {
                setNeedsSetup(true);
                setLoading(false);
                return;
            }

            // Check if user is already logged in
            const token = localStorage.getItem('token');
            if (token) {
                apiService.setAuthToken(token);
                const response = await apiService.getCurrentUser();
                setUser(response.user);
            }
        } catch (error) {
            // If token is invalid, remove it
            localStorage.removeItem('token');
            apiService.setAuthToken(null);
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = (userData, token) => {
        localStorage.setItem('token', token);
        apiService.setAuthToken(token);
        setUser(userData);
        if (userData?.preferred_language) {
            i18n.changeLanguage(userData.preferred_language);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        apiService.setAuthToken(null);
        setUser(null);
    };

    const handleSetupComplete = (userData, token) => {
        setNeedsSetup(false);
        setHasUsers(true);
        handleLogin(userData, token);
    };

    useEffect(() => {
        if (user?.preferred_language && i18n.language !== user.preferred_language) {
            i18n.changeLanguage(user.preferred_language);
        }
    }, [user?.preferred_language, i18n]);

    const handleUserLanguageChange = async (languageCode) => {
        const previousLanguage = user?.preferred_language || i18n.language;
        try {
            await apiService.updatePreferredLanguage(languageCode);
            setUser((prev) => prev ? ({ ...prev, preferred_language: languageCode }) : prev);
            toast.success(t('settings.languageChanged', 'Language changed successfully'));
        } catch (error) {
            const message = error.response?.data?.error || t('settings.languageUpdateFailed', 'Failed to update language');
            toast.error(message);
            i18n.changeLanguage(previousLanguage);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    if (needsSetup || !hasUsers) {
        return (
            <QueryClientProvider client={queryClient}>
                <div className="min-h-screen bg-gray-50">
                    <div className="absolute top-4 right-4">
                        <LanguageSelector compact={true} />
                    </div>
                    <InitialSetup onSetupComplete={handleSetupComplete} />
                    <Toaster position="top-right" />
                </div>
            </QueryClientProvider>
        );
    }

    return (
        <ErrorBoundary context="Application Root">
            <QueryClientProvider client={queryClient}>
                <Router>
                    <div className="min-h-screen bg-gray-50">
                        {user ? (
                            <AuthenticatedApp user={user} onLogout={handleLogout} onLanguageChange={handleUserLanguageChange} />
                        ) : (
                            <UnauthenticatedApp onLogin={handleLogin} />
                        )}
                        <Toaster position="top-right" />
                    </div>
                </Router>
            </QueryClientProvider>
        </ErrorBoundary>
    );
}

function AuthenticatedApp({ user, onLogout, onLanguageChange }) {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const currentPath = location.pathname;
    const [dropdownOpen, setDropdownOpen] = useState(null);
    const [appSettings, setAppSettings] = useState({
        branding: {
            companyName: 'IoT Monitoring Platform',
            primaryColor: '#2563eb',
            companyLogo: null
        }
    });
    const [isHeaderMinimal, setIsHeaderMinimal] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const dropdownRefs = useRef({});

    // Only enable auto-refetch on Dashboard and Devices pages
    // All other pages should not have polling to avoid interruptions
    const isOnDashboardOrDevices = currentPath === '/' || currentPath === '/devices';

    const { data: licenseFeaturesData, isLoading: licenseFeaturesLoading } = useQuery(
        'license-features',
        () => apiService.getLicenseFeatures(),
        {
            refetchInterval: isOnDashboardOrDevices ? 60000 : false,
            staleTime: isOnDashboardOrDevices ? 30000 : Infinity, // Never mark as stale on other pages
            cacheTime: Infinity // Keep in cache forever
        }
    );

    const licenseFeatures = useMemo(
        () => licenseFeaturesData?.features || {},
        [licenseFeaturesData]
    );

    const hasFeature = useCallback((featureKey) => {
        if (!featureKey) return true;
        if (licenseFeaturesLoading) return true;
        return licenseFeatures[featureKey] === true;
    }, [licenseFeatures, licenseFeaturesLoading]);

    const getFeatureLabel = useCallback(
        (featureKey) => t(`license.featureLabels.${featureKey}`, featureKey.replace(/_/g, ' ')),
        [t]
    );

    const FeatureGate = ({ feature, children }) => {
        if (!feature) {
            return children;
        }

        if (licenseFeaturesLoading) {
            return (
                <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-b-0 border-primary mb-4"></div>
                    <span>{t('common.loading', 'Loading...')}</span>
                </div>
            );
        }

        if (hasFeature(feature)) {
            return children;
        }

        return (
            <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-2xl shadow-sm p-8 text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-900">
                    {t('license.featureGate.title', 'Feature unavailable')}
                </h2>
                <p className="text-gray-600">
                    {isAdminUser
                        ? t('license.featureGate.adminCta', {
                            feature: getFeatureLabel(feature)
                        })
                        : t('license.featureGate.userCta', {
                            feature: getFeatureLabel(feature)
                        })}
                </p>
                {isAdminUser && (
                    <button
                        type="button"
                        onClick={() => navigate('/settings?tab=license')}
                        className="btn-primary"
                    >
                        {t('settings.tabs.license', 'License')}
                    </button>
                )}
            </div>
        );
    };

    const handleLanguageChange = async (languageCode) => {
        if (languageCode === (user?.preferred_language || i18n.language)) {
            return;
        }
        if (onLanguageChange) {
            await onLanguageChange(languageCode);
        }
    };

    // Load app settings on mount
    useEffect(() => {
        const loadSettings = async () => {
            // Try to load from localStorage first
            const savedSettings = localStorage.getItem('appSettings');
            if (savedSettings) {
                try {
                    const parsed = JSON.parse(savedSettings);
                    setAppSettings(prev => ({ ...prev, ...parsed }));
                    // Apply branding
                    if (parsed.branding?.primaryColor) {
                        document.documentElement.style.setProperty('--primary-color', parsed.branding.primaryColor);
                        // Calculate hover and focus colors
                        const primaryColor = parsed.branding.primaryColor;
                        const hoverColor = adjustColorBrightness(primaryColor, -0.1);
                        const focusColor = primaryColor;
                        document.documentElement.style.setProperty('--primary-hover', hoverColor);
                        document.documentElement.style.setProperty('--primary-focus', focusColor);
                    }
                } catch (error) {
                    console.error('Error loading app settings:', error);
                }
            }

            // Load from API
            try {
                const response = await apiService.getSettings();
                if (response?.data) {
                    const settings = response.data;
                    setAppSettings(prev => ({ ...prev, ...settings }));

                    // Apply branding
                    if (settings.branding?.primaryColor) {
                        document.documentElement.style.setProperty('--primary-color', settings.branding.primaryColor);
                        // Calculate hover and focus colors
                        const primaryColor = settings.branding.primaryColor;
                        const hoverColor = adjustColorBrightness(primaryColor, -0.1);
                        const focusColor = primaryColor;
                        document.documentElement.style.setProperty('--primary-hover', hoverColor);
                        document.documentElement.style.setProperty('--primary-focus', focusColor);
                    }

                    // Save to localStorage
                    localStorage.setItem('appSettings', JSON.stringify(settings));
                }
            } catch (error) {
                // Settings API might not be available
                console.warn('Could not load settings from API:', error);
            }
        };

        loadSettings();
        // Listen for settings changes
        window.addEventListener('storage', loadSettings);
        return () => window.removeEventListener('storage', loadSettings);
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Check if click is outside all dropdown elements
            const isOutside = !Object.values(dropdownRefs.current).some(ref =>
                ref && ref.contains(event.target)
            );

            if (isOutside && dropdownOpen !== null) {
                setDropdownOpen(null);
            }
        };

        if (dropdownOpen !== null) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [dropdownOpen]);

    // Handle scroll for minimal header
    useEffect(() => {
        const handleScroll = () => {
            const scrolled = window.scrollY > 100;
            setIsHeaderMinimal(scrolled);
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const { data: licenseStatusData, isLoading: licenseStatusLoading } = useQuery(
        'license-status',
        () => apiService.getLicenseStatus(),
        {
            refetchInterval: isOnDashboardOrDevices ? 60000 : false,
            staleTime: isOnDashboardOrDevices ? 30000 : Infinity, // Never mark as stale on other pages
            cacheTime: Infinity // Keep in cache forever
        }
    );
    const licenseStatus = licenseStatusData?.license;
    const shouldBlockForLicense = !licenseStatusLoading && licenseStatus && licenseStatus.valid === false;
    const isAdminUser = user.role === 'admin';

    const navigationItems = useMemo(() => {
        const items = [
            { path: '/', label: t('nav.dashboard', 'Dashboard'), icon: '📊', feature: 'basic_monitoring' },
            { path: '/devices', label: t('nav.devices', 'Devices'), icon: '🔧', feature: 'device_management' },
            {
                label: t('nav.monitoring', 'Monitoring'), icon: '📈', dropdown: true,
                items: [
                    { path: '/analytics', label: t('nav.analytics', 'Analytics'), icon: '🧠', feature: 'analytics_advanced' },
                    { path: '/device-health', label: t('nav.deviceHealth', 'Device Health'), icon: '🏥', feature: 'analytics_advanced' },
                    { path: '/alert-rules', label: t('nav.alertRules', 'Alert Rules'), icon: '⚙️', feature: 'analytics_basic' },
                    { path: '/silent-mode', label: t('nav.silentMode', 'Silent Mode'), icon: '🔕', feature: 'analytics_basic' },
                ]
            },
            {
                label: t('nav.organization', 'Organization'), icon: '🏷️', dropdown: true,
                items: [
                    { path: '/device-groups', label: t('nav.deviceGroups', 'Device Groups'), icon: '🏷️', feature: 'device_management' },
                    { path: '/device-tags', label: t('nav.deviceTags', 'Device Tags'), icon: '🏷️', feature: 'device_management' },
                    { path: '/device-locations', label: t('nav.deviceLocations', 'Device Locations'), icon: '📍', feature: 'device_management' }
                ]
            },
            {
                label: t('nav.tools', 'Tools'), icon: '🔧', dropdown: true,
                items: [
                    { path: '/firmware-builder', label: t('nav.firmwareBuilder', 'Firmware Builder'), icon: '⚙️', feature: 'device_management' },
                    { path: '/serial-monitor', label: t('nav.serialMonitor', 'Serial Monitor'), icon: '📺', feature: 'device_management' }
                ]
            }
        ];

        if (user.role === 'admin') {
            items.push({
                label: t('nav.administration', 'Administration'), icon: '⚙️', dropdown: true,
                items: [
                    { path: '/users', label: t('nav.userManagement', 'Users'), icon: '👥' },
                    { path: '/settings', label: t('nav.settings', 'Settings'), icon: '⚙️' },
                    { path: '/protocol-settings', label: t('nav.protocolSettings', 'Protocol Settings'), icon: '🔌', feature: 'custom_integrations' }
                ]
            });
        }

        return items;
    }, [t, user.role]);

    const visibleNavigationItems = useMemo(() => {
        const filterItems = (items) => items.reduce((acc, item) => {
            if (item.dropdown && Array.isArray(item.items)) {
                if (item.feature && !hasFeature(item.feature)) {
                    return acc;
                }
                const filteredSubItems = filterItems(item.items);
                if (filteredSubItems.length === 0) {
                    return acc;
                }
                acc.push({ ...item, items: filteredSubItems });
                return acc;
            }

            if (item.feature && !hasFeature(item.feature)) {
                return acc;
            }

            acc.push(item);
            return acc;
        }, []);

        return filterItems(navigationItems);
    }, [navigationItems, hasFeature]);

    const handleDropdownToggle = (index) => {
        if (dropdownOpen === index) {
            setDropdownOpen(null);
        } else {
            // Calculate position of the button
            const buttonElement = dropdownRefs.current[`button-${index}`];
            if (buttonElement) {
                const rect = buttonElement.getBoundingClientRect();
                setDropdownPosition({
                    top: rect.bottom,
                    left: rect.left,
                    width: Math.max(rect.width, 200)
                });
            }
            setDropdownOpen(index);
        }
    };

    const isPathActive = (path, items) => {
        if (path === currentPath) return true;
        if (items) {
            return items.some(item => item.path === currentPath);
        }
        return false;
    };

    return (
        <div className="min-h-screen">
            {shouldBlockForLicense && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/90 px-4">
                    <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 bg-red-600 text-white flex items-center space-x-3">
                            <AlertTriangle className="w-6 h-6" />
                            <div>
                                <h2 className="text-xl font-semibold">
                                    {t('license.blocker.title', 'License Required')}
                                </h2>
                                <p className="text-sm text-red-100">
                                    {licenseStatus?.requires_activation
                                        ? t('license.blocker.requiresActivation', 'Activate your license to continue using the platform.')
                                        : t('license.blocker.expired', 'Your license has expired. Please renew to regain access.')}
                                </p>
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-red-50 text-red-700 text-sm border-b border-red-100">
                            {isAdminUser
                                ? t('license.blocker.adminMessage', 'Enter a valid license key below to restore access for all users.')
                                : t('license.blocker.userMessage', 'Access is temporarily limited until an administrator renews the license.')}
                        </div>
                        {isAdminUser ? (
                            <div className="flex-1 overflow-y-auto px-6 py-6 bg-white">
                                <LicenseManagerPanel />
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center bg-white px-6 py-10">
                                <div className="max-w-md text-center space-y-4">
                                    <p className="text-gray-600">
                                        {licenseStatus?.expires_at
                                            ? t('license.blocker.expiredAt', 'Previous license expired on {{date}}.', {
                                                date: new Date(licenseStatus.expires_at).toLocaleDateString()
                                            })
                                            : t('license.blocker.noLicense', 'No active license is currently configured.')}
                                    </p>
                                    <p className="text-sm text-gray-500">
                                        {t('license.blocker.contactAdmin', 'Please contact your administrator to reactivate the platform.')}
                                    </p>
                                    <button
                                        onClick={onLogout}
                                        className="btn-secondary mx-auto"
                                    >
                                        {t('auth.logout', 'Logout')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Modern Header */}
            <header className={`nav-modern transition-all duration-300 sticky top-0 z-50 ${isHeaderMinimal ? 'py-2' : 'py-4'
                }`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className={`flex justify-between items-center transition-all duration-300 ${isHeaderMinimal ? 'py-2' : 'py-4'
                        }`}>
                        <div className="flex items-center space-x-2 sm:space-x-4 flex-1 min-w-0">
                            {/* Logo */}
                            {appSettings.branding?.companyLogo ? (
                                <div className={`flex-shrink-0 transition-all duration-300 ${isHeaderMinimal ? 'h-8 w-8' : 'h-10 sm:h-12 w-10 sm:w-12'
                                    }`}>
                                    <img
                                        src={`${appSettings.branding.companyLogo}?${Date.now()}`}
                                        alt="Company Logo"
                                        className="h-full w-full object-contain"
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                        }}
                                    />
                                </div>
                            ) : (
                                /* Company Name - only show if no logo */
                                <div className="min-w-0 flex-1">
                                    <h1 className={`font-bold text-gray-900 transition-all duration-300 truncate ${isHeaderMinimal ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl md:text-3xl'
                                        }`}>
                                        {appSettings.branding?.companyName || t('app.title', 'Sensity')}
                                    </h1>
                                    {!isHeaderMinimal && (
                                        <p className="text-gray-600 text-xs sm:text-sm truncate">
                                            {t('common.welcome', 'Welcome')}, {user.full_name || user.email}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className={`flex items-center flex-shrink-0 transition-all duration-300 ${isHeaderMinimal ? 'space-x-1 sm:space-x-2' : 'space-x-2 sm:space-x-4'
                            }`}>
                            {/* Mobile Menu Toggle */}
                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="lg:hidden btn-secondary p-2"
                                aria-label="Toggle menu"
                            >
                                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                            </button>

                            <div className={`transition-all duration-300 hidden sm:block ${isHeaderMinimal ? 'scale-75 sm:scale-90' : 'scale-90 sm:scale-100'
                                }`}>
                                <LanguageSelector compact={true} onLanguageChange={handleLanguageChange} />
                            </div>
                            {!isHeaderMinimal && (
                                <span className="badge badge-primary text-xs hidden md:inline-flex">
                                    {t(`roles.${user.role}`, user.role)}
                                </span>
                            )}
                            <button
                                onClick={onLogout}
                                className={`btn-danger transition-all duration-300 whitespace-nowrap hidden sm:inline-flex ${isHeaderMinimal ? 'px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm' : 'px-3 sm:px-4 py-2 text-sm'
                                    }`}
                            >
                                {t('auth.logout', 'Logout')}
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Desktop Navigation */}
            <nav className="glass-dark relative border-t border-white/10 z-50 hidden lg:block" style={{ overflow: 'visible' }}>
                <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
                    <div className="flex space-x-0.5 sm:space-x-1 scrollbar-hide" style={{ overflowX: 'auto', overflowY: 'visible' }}>
                        {visibleNavigationItems.map((item, index) => (
                            <div key={item.path || index} className="flex-shrink-0">
                                {item.dropdown ? (
                                    <>
                                        <button
                                            ref={el => dropdownRefs.current[`button-${index}`] = el}
                                            onClick={() => handleDropdownToggle(index)}
                                            className={`flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 md:px-4 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-all duration-200 rounded-t-lg whitespace-nowrap ${isPathActive(item.path, item.items)
                                                    ? 'text-white bg-gray-600 shadow-lg'
                                                    : 'text-white hover:text-gray-200 hover:bg-gray-700'
                                                }`}
                                        >
                                            <span className="text-sm sm:text-base">{item.icon}</span>
                                            <span className="hidden sm:inline">{item.label}</span>
                                            <ChevronDown className={`w-3 h-3 sm:w-4 sm:h-4 transition-transform duration-200 ${dropdownOpen === index ? 'rotate-180' : ''
                                                }`} />
                                        </button>
                                        {dropdownOpen === index && createPortal(
                                            <div
                                                ref={el => dropdownRefs.current[`dropdown-${index}`] = el}
                                                className="bg-white rounded-lg border border-gray-200 shadow-2xl"
                                                style={{
                                                    position: 'fixed',
                                                    top: `${dropdownPosition.top}px`,
                                                    left: `${dropdownPosition.left}px`,
                                                    minWidth: `${dropdownPosition.width}px`,
                                                    zIndex: 99999
                                                }}
                                            >
                                                {item.items.map((subItem) => (
                                                    <button
                                                        key={subItem.path}
                                                        onClick={() => {
                                                            navigate(subItem.path);
                                                            setDropdownOpen(null);
                                                        }}
                                                        className={`w-full flex items-center space-x-2 sm:space-x-3 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-left transition-all duration-200 first:rounded-t-lg last:rounded-b-lg hover:bg-gray-50 ${currentPath === subItem.path
                                                                ? 'bg-blue-50 text-blue-600 font-semibold'
                                                                : 'text-gray-700'
                                                            }`}
                                                    >
                                                        <span className="text-sm sm:text-base">{subItem.icon}</span>
                                                        <span>{subItem.label}</span>
                                                    </button>
                                                ))}
                                            </div>,
                                            document.body
                                        )}
                                    </>
                                ) : (
                                    <button
                                        onClick={() => navigate(item.path)}
                                        className={`flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 md:px-4 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-all duration-200 rounded-lg whitespace-nowrap ${currentPath === item.path
                                                ? 'text-white bg-primary shadow-lg border-b-2 border-primary-hover'
                                                : 'text-white hover:text-gray-200 hover:bg-gray-700'
                                            }`}
                                    >
                                        <span className="text-sm sm:text-base">{item.icon}</span>
                                        <span className="hidden sm:inline">{item.label}</span>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </nav>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
                <div className="lg:hidden fixed inset-0 z-50 animate-fade-in">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setMobileMenuOpen(false)}
                    />
                    {/* Menu Panel */}
                    <div className="absolute top-0 right-0 bottom-0 w-64 bg-white shadow-2xl overflow-y-auto animate-slide-in-right">
                        {/* Menu Header */}
                        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between z-10">
                            <h2 className="font-semibold text-gray-900">{t('nav.menu', 'Menu')}</h2>
                            <button
                                onClick={() => setMobileMenuOpen(false)}
                                className="p-2 hover:bg-gray-100 rounded-lg"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* User Info */}
                        <div className="p-4 border-b border-gray-200 bg-gray-50">
                            <p className="text-sm font-medium text-gray-900">{user.full_name || user.email}</p>
                            <p className="text-xs text-gray-600 mt-1">{t(`roles.${user.role}`, user.role)}</p>
                        </div>

                        {/* Navigation Items */}
                        <div className="p-2">
                            {visibleNavigationItems.map((item, index) => (
                                <div key={item.path || index} className="mb-1">
                                    {item.dropdown ? (
                                        <>
                                            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                {item.label}
                                            </div>
                                            {item.items.map((subItem) => (
                                                <button
                                                    key={subItem.path}
                                                    onClick={() => {
                                                        navigate(subItem.path);
                                                        setMobileMenuOpen(false);
                                                    }}
                                                    className={`w-full flex items-center space-x-3 px-4 py-2.5 text-sm rounded-lg transition-colors ${
                                                        currentPath === subItem.path
                                                            ? 'bg-blue-50 text-blue-600 font-medium'
                                                            : 'text-gray-700 hover:bg-gray-100'
                                                    }`}
                                                >
                                                    <span>{subItem.icon}</span>
                                                    <span>{subItem.label}</span>
                                                </button>
                                            ))}
                                        </>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                navigate(item.path);
                                                setMobileMenuOpen(false);
                                            }}
                                            className={`w-full flex items-center space-x-3 px-4 py-2.5 text-sm rounded-lg transition-colors ${
                                                currentPath === item.path
                                                    ? 'bg-blue-50 text-blue-600 font-medium'
                                                    : 'text-gray-700 hover:bg-gray-100'
                                            }`}
                                        >
                                            <span>{item.icon}</span>
                                            <span>{item.label}</span>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Mobile Menu Footer */}
                        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 space-y-2">
                            <div className="mb-2">
                                <LanguageSelector compact={false} onLanguageChange={handleLanguageChange} />
                            </div>
                            <button
                                onClick={() => {
                                    setMobileMenuOpen(false);
                                    onLogout();
                                }}
                                className="w-full btn-danger justify-center"
                            >
                                {t('auth.logout', 'Logout')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="max-w-7xl mx-auto py-4 px-4 sm:py-8 sm:px-6 lg:px-8" onClick={() => setDropdownOpen(null)}>
                <Routes>
                    <Route
                        path="/"
                        element={
                            <FeatureGate feature="basic_monitoring">
                                <Dashboard />
                            </FeatureGate>
                        }
                    />
                    <Route
                        path="/devices"
                        element={
                            <FeatureGate feature="device_management">
                                <DeviceManagement />
                            </FeatureGate>
                        }
                    />
                    <Route
                        path="/devices/:id"
                        element={
                            <FeatureGate feature="device_management">
                                <DeviceDetail />
                            </FeatureGate>
                        }
                    />
                    <Route
                        path="/analytics"
                        element={
                            <FeatureGate feature="analytics_advanced">
                                <AnalyticsDashboard />
                            </FeatureGate>
                        }
                    />
                    <Route
                        path="/device-groups"
                        element={
                            <FeatureGate feature="device_management">
                                <DeviceGroupsManager />
                            </FeatureGate>
                        }
                    />
                    <Route
                        path="/device-tags"
                        element={
                            <FeatureGate feature="device_management">
                                <DeviceTagsManager />
                            </FeatureGate>
                        }
                    />
                    <Route
                        path="/device-locations"
                        element={
                            <FeatureGate feature="device_management">
                                <DeviceLocationsManager />
                            </FeatureGate>
                        }
                    />
                    <Route
                        path="/device-health"
                        element={
                            <FeatureGate feature="analytics_advanced">
                                <DeviceHealthDashboard />
                            </FeatureGate>
                        }
                    />
                    <Route
                        path="/alert-rules"
                        element={
                            <FeatureGate feature="analytics_basic">
                                <AlertRulesManager />
                            </FeatureGate>
                        }
                    />
                    <Route
                        path="/silent-mode"
                        element={
                            <FeatureGate feature="analytics_basic">
                                <SilentModeManager />
                            </FeatureGate>
                        }
                    />
                    <Route
                        path="/firmware-builder"
                        element={
                            <FeatureGate feature="device_management">
                                <FirmwareBuilder />
                            </FeatureGate>
                        }
                    />
                    <Route
                        path="/serial-monitor"
                        element={
                            <FeatureGate feature="device_management">
                                <SerialMonitor />
                            </FeatureGate>
                        }
                    />
                    {user.role === 'admin' && (
                        <>
                            <Route path="/users" element={<UserManagement />} />
                            <Route path="/settings" element={<Settings />} />
                            <Route
                                path="/protocol-settings"
                                element={
                                    <FeatureGate feature="custom_integrations">
                                        <ProtocolSettingsManager />
                                    </FeatureGate>
                                }
                            />
                        </>
                    )}
                    <Route path="*" element={<Navigate to="/" />} />
                </Routes>
            </main>
        </div>
    );
}

function UnauthenticatedApp({ onLogin }) {
    return (
        <div className="min-h-screen">
            <div className="absolute top-4 right-4">
                <LanguageSelector compact={true} />
            </div>
            <Routes>
                <Route path="/login" element={<Login onLogin={onLogin} />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="*" element={<Navigate to="/login" />} />
            </Routes>
        </div>
    );
}

export default App;
