import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';

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

import LanguageSelector from './components/LanguageSelector';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import DeviceGroupsManager from './components/DeviceGroupsManager';
import DeviceTagsManager from './components/DeviceTagsManager';
import DeviceLocationsManager from './components/DeviceLocationsManager';
import DeviceHealthDashboard from './components/DeviceHealthDashboard';
import AlertRulesManager from './components/AlertRulesManager';
import SilentModeManager from './components/SilentModeManager';
import ProtocolSettingsManager from './components/ProtocolSettingsManager';
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
    const { i18n } = useTranslation();
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
                        <LanguageSelector />
                    </div>
                    <InitialSetup onSetupComplete={handleSetupComplete} />
                    <Toaster position="top-right" />
                </div>
            </QueryClientProvider>
        );
    }

    return (
        <QueryClientProvider client={queryClient}>
            <Router>
                <div className="min-h-screen bg-gray-50">
                    {user ? (
                        <AuthenticatedApp user={user} onLogout={handleLogout} />
                    ) : (
                        <UnauthenticatedApp onLogin={handleLogin} />
                    )}
                    <Toaster position="top-right" />
                </div>
            </Router>
        </QueryClientProvider>
    );
}

function AuthenticatedApp({ user, onLogout }) {
    const { t } = useTranslation();
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
        { path: '/firmware-builder', label: t('nav.firmwareBuilder', 'Firmware Builder'), icon: '🔧' },
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
        setDropdownOpen(dropdownOpen === index ? null : index);
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
            {/* Header */}
            <header className={`bg-white shadow transition-all duration-300 sticky top-0 z-40 ${
                isHeaderMinimal ? 'py-2' : 'py-4'
            }`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className={`flex justify-between items-center transition-all duration-300 ${
                        isHeaderMinimal ? 'py-2' : 'py-4'
                    }`}>
                        <div className="flex items-center space-x-4">
                            {/* Logo */}
                            {appSettings.branding?.companyLogo && (
                                <div className={`transition-all duration-300 ${
                                    isHeaderMinimal ? 'h-8 w-8' : 'h-12 w-12'
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
                            )}
                            {/* Company Name - only show if no logo or when not minimal */}
                            {(!appSettings.branding?.companyLogo || !isHeaderMinimal) && (
                                <div>
                                    <h1 className={`font-bold text-gray-900 transition-all duration-300 ${
                                        isHeaderMinimal ? 'text-lg' : 'text-3xl'
                                    }`}>
                                        {appSettings.branding?.companyName || t('app.title', 'IoT Monitoring Platform')}
                                    </h1>
                                    {!isHeaderMinimal && (
                                        <p className="text-gray-600 text-sm">
                                            {t('common.welcome', 'Welcome')}, {user.full_name || user.email}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className={`flex items-center transition-all duration-300 ${
                            isHeaderMinimal ? 'space-x-2' : 'space-x-4'
                        }`}>
                            <LanguageSelector />
                            {!isHeaderMinimal && (
                                <span className="text-sm text-gray-500">
                                    {t(`roles.${user.role}`, user.role)}
                                </span>
                            )}
                            <button
                                onClick={onLogout}
                                className={`text-white px-4 py-2 rounded-md transition-all duration-300 ${
                                    isHeaderMinimal ? 'text-sm' : ''
                                }`}
                                style={{
                                    backgroundColor: 'var(--primary-color, #dc2626)',
                                }}
                                onMouseEnter={(e) => {
                                    e.target.style.opacity = '0.9';
                                }}
                                onMouseLeave={(e) => {
                                    e.target.style.opacity = '1';
                                }}
                            >
                                {t('auth.logout', 'Logout')}
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Navigation */}
            <nav className="bg-gray-800 relative">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex space-x-1">
                        {navigationItems.map((item, index) => (
                            <div key={item.path || index} className="relative">
                                {item.dropdown ? (
                                    <div className="relative">
                                        <button
                                            onClick={() => handleDropdownToggle(index)}
                                            className={`flex items-center space-x-2 px-3 py-4 text-sm font-medium transition-colors rounded-t-md ${
                                                isPathActive(item.path, item.items)
                                                    ? 'text-white bg-gray-700'
                                                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                                            }`}
                                        >
                                            <span>{item.icon}</span>
                                            <span>{item.label}</span>
                                            <ChevronDown className={`w-4 h-4 transition-transform ${
                                                dropdownOpen === index ? 'rotate-180' : ''
                                            }`} />
                                        </button>
                                        {dropdownOpen === index && (
                                            <div className="absolute top-full left-0 w-48 bg-white rounded-b-md shadow-lg border border-gray-200 z-50">
                                                {item.items.map((subItem) => (
                                                    <button
                                                        key={subItem.path}
                                                        onClick={() => {
                                                            navigate(subItem.path);
                                                            setDropdownOpen(null);
                                                        }}
                                                        className={`w-full flex items-center space-x-2 px-4 py-3 text-sm text-left transition-colors ${
                                                            currentPath === subItem.path
                                                                ? 'bg-blue-50 text-blue-700'
                                                                : 'text-gray-700 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        <span>{subItem.icon}</span>
                                                        <span>{subItem.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => navigate(item.path)}
                                        className={`flex items-center space-x-2 px-3 py-4 text-sm font-medium transition-colors ${
                                            currentPath === item.path
                                                ? 'text-white border-b-2 border-blue-400'
                                                : 'text-gray-300 hover:text-white hover:bg-gray-700'
                                        }`}
                                    >
                                        <span>{item.icon}</span>
                                        <span>{item.label}</span>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8" onClick={() => setDropdownOpen(null)}>
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
                <LanguageSelector />
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