import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import Login from './pages/Login';
import Register from './pages/Register';
import InitialSetup from './pages/InitialSetup';
import Dashboard from './pages/Dashboard';
import DeviceDetail from './pages/DeviceDetail';
import UserManagement from './pages/UserManagement';

import LanguageSelector from './components/LanguageSelector';
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

    useEffect(() => {
        checkAuthAndSetup();
    }, []);

    const checkAuthAndSetup = async () => {
        try {
            // Check if system needs initial setup
            const setupCheck = await apiService.checkSetup();
            if (setupCheck.needsSetup) {
                setNeedsSetup(true);
                setLoading(false);
                return;
            }

            // Check if user is already logged in
            const token = localStorage.getItem('token');
            if (token) {
                apiService.setAuthToken(token);
                const userData = await apiService.getCurrentUser();
                setUser(userData);
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

    if (needsSetup) {
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

    return (
        <div className="min-h-screen">
            {/* Header */}
            <header className="bg-white shadow">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-6">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">
                                {t('app.title', 'IoT Monitoring Platform')}
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

            {/* Main Content */}
            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/devices/:id" element={<DeviceDetail />} />
                    {user.role === 'admin' && (
                        <Route path="/users" element={<UserManagement />} />
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