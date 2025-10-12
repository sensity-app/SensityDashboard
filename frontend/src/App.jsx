import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Menu, X } from 'lucide-react';

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

    const navigationItems = [
        { path: '/', label: t('nav.dashboard', 'Dashboard'), icon: '📊' },
        { path: '/devices', label: t('nav.devices', 'Devices'), icon: '🔧' },
        {
            label: t('nav.monitoring', 'Monitoring'), icon: '📈', dropdown: true,
            items: [
                { path: '/analytics', label: t('nav.analytics', 'Analytics'), icon: '🧠' },
                { path: '/device-health', label: t('nav.deviceHealth', 'Device Health'), icon: '🏥' },
                { path: '/alert-rules', label: t('nav.alertRules', 'Alert Rules'), icon: '⚙️' },
                { path: '/silent-mode', label: t('nav.silentMode', 'Silent Mode'), icon: '🔕' },
            ]
        },
        {
            label: t('nav.organization', 'Organization'), icon: '🏷️', dropdown: true,
            items: [
                { path: '/device-groups', label: t('nav.deviceGroups', 'Device Groups'), icon: '🏷️' },
                { path: '/device-tags', label: t('nav.deviceTags', 'Device Tags'), icon: '🏷️' },
                { path: '/device-locations', label: t('nav.deviceLocations', 'Device Locations'), icon: '📍' }
            ]
        },
        {
            label: t('nav.tools', 'Tools'), icon: '🔧', dropdown: true,
            items: [
                { path: '/firmware-builder', label: t('nav.firmwareBuilder', 'Firmware Builder'), icon: '⚙️' },
                { path: '/serial-monitor', label: t('nav.serialMonitor', 'Serial Monitor'), icon: '📺' }
            ]
        },
        ...(user.role === 'admin' ? [
            {
                label: t('nav.administration', 'Administration'), icon: '⚙️', dropdown: true,
                items: [
                    { path: '/users', label: t('nav.userManagement', 'Users'), icon: '👥' },
                    { path: '/settings', label: t('nav.settings', 'Settings'), icon: '⚙️' },
                    { path: '/protocol-settings', label: t('nav.protocolSettings', 'Protocol Settings'), icon: '🔌' }
                ]
            }
        ] : [])
    ];

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
                        {navigationItems.map((item, index) => (
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
                            {navigationItems.map((item, index) => (
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
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/devices" element={<DeviceManagement />} />
                    <Route path="/devices/:id" element={<DeviceDetail />} />
                    <Route path="/analytics" element={<AnalyticsDashboard />} />
                    <Route path="/device-groups" element={<DeviceGroupsManager />} />
                    <Route path="/device-tags" element={<DeviceTagsManager />} />
                    <Route path="/device-locations" element={<DeviceLocationsManager />} />
                    <Route path="/device-health" element={<DeviceHealthDashboard />} />
                    <Route path="/alert-rules" element={<AlertRulesManager />} />
                    <Route path="/silent-mode" element={<SilentModeManager />} />
                    <Route path="/firmware-builder" element={<FirmwareBuilder />} />
                    <Route path="/serial-monitor" element={<SerialMonitor />} />
                    {user.role === 'admin' && (
                        <>
                            <Route path="/users" element={<UserManagement />} />
                            <Route path="/settings" element={<Settings />} />
                            <Route path="/protocol-settings" element={<ProtocolSettingsManager />} />
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
