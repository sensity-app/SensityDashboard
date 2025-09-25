import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';

import Login from './pages/Login';
import Register from './pages/Register';
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
import DeviceHealthDashboard from './components/DeviceHealthDashboard';
import AlertRulesManager from './components/AlertRulesManager';
import { apiService } from './services/api';

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
            primaryColor: '#2563eb'
        }
    });

    // Load app settings on mount
    useEffect(() => {
        const loadSettings = () => {
            // Try to load from localStorage first
            const savedSettings = localStorage.getItem('appSettings');
            if (savedSettings) {
                try {
                    const parsed = JSON.parse(savedSettings);
                    setAppSettings(prev => ({ ...prev, ...parsed }));
                    // Apply branding
                    if (parsed.branding?.primaryColor) {
                        document.documentElement.style.setProperty('--primary-color', parsed.branding.primaryColor);
                    }
                } catch (error) {
                    console.error('Error loading app settings:', error);
                }
            }
        };

        loadSettings();
        // Listen for settings changes
        window.addEventListener('storage', loadSettings);
        return () => window.removeEventListener('storage', loadSettings);
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
            ]
        },
        {
            label: t('nav.organization', 'Organization'), icon: '🏷️', dropdown: true,
            items: [
                { path: '/device-groups', label: t('nav.deviceGroups', 'Device Groups'), icon: '🏷️' },
                { path: '/device-tags', label: t('nav.deviceTags', 'Device Tags'), icon: '🏷️' },
            ]
        },
        { path: '/firmware-builder', label: t('nav.firmwareBuilder', 'Firmware Builder'), icon: '🔧' },
        ...(user.role === 'admin' ? [
            {
                label: t('nav.administration', 'Administration'), icon: '⚙️', dropdown: true,
                items: [
                    { path: '/users', label: t('nav.userManagement', 'Users'), icon: '👥' },
                    { path: '/settings', label: t('nav.settings', 'Settings'), icon: '⚙️' }
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
            <header className="bg-white shadow">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-6">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">
                                {appSettings.branding?.companyName || t('app.title', 'IoT Monitoring Platform')}
                            </h1>
                            <p className="text-gray-600">
                                {t('common.welcome', 'Welcome')}, {user.full_name || user.email}
                            </p>
                        </div>
                        <div className="flex items-center space-x-4">
                            <LanguageSelector />
                            <span className="text-sm text-gray-500">
                                {t(`roles.${user.role}`, user.role)}
                            </span>
                            <button
                                onClick={onLogout}
                                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
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
                    <Route path="/device-health" element={<DeviceHealthDashboard />} />
                    <Route path="/alert-rules" element={<AlertRulesManager />} />
                    <Route path="/firmware-builder" element={<FirmwareBuilder />} />
                    {user.role === 'admin' && (
                        <>
                            <Route path="/users" element={<UserManagement />} />
                            <Route path="/settings" element={<Settings />} />
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
                <Route path="*" element={<Navigate to="/login" />} />
            </Routes>
        </div>
    );
}

export default App;