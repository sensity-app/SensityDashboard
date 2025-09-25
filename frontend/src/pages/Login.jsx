import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock, Mail, Loader } from 'lucide-react';
import toast from 'react-hot-toast';

import { apiService } from '../services/api';

function Login({ onLogin }) {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const [loading, setLoading] = useState(false);
    const [branding, setBranding] = useState({
        companyName: 'IoT Monitoring Platform',
        companyLogo: null,
        primaryColor: '#2563eb'
    });

    // Load branding settings
    useEffect(() => {
        const loadBranding = async () => {
            try {
                // Try localStorage first
                const savedSettings = localStorage.getItem('appSettings');
                if (savedSettings) {
                    try {
                        const parsed = JSON.parse(savedSettings);
                        if (parsed.branding) {
                            setBranding(prev => ({ ...prev, ...parsed.branding }));
                        }
                    } catch (error) {
                        console.error('Error loading branding from localStorage:', error);
                    }
                }

                // Try to load from API
                const response = await apiService.getSettings();
                if (response?.data?.branding) {
                    setBranding(prev => ({ ...prev, ...response.data.branding }));
                }
            } catch (error) {
                // Settings API might not be available during login
                console.warn('Could not load branding settings:', error);
            }
        };

        loadBranding();
    }, []);

    // Apply branding colors
    useEffect(() => {
        if (branding.primaryColor) {
            document.documentElement.style.setProperty('--primary-color', branding.primaryColor);
        }
    }, [branding.primaryColor]);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await apiService.login(formData);
            toast.success(t('auth.loginSuccess', 'Login successful!'));
            onLogin(response.user, response.token);
        } catch (error) {
            const message = error.response?.data?.error || t('auth.loginError', 'Login failed');
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-gray-100">
            <div className="max-w-md w-full">
                {/* Login Card */}
                <div className="bg-white rounded-2xl shadow-xl p-8 space-y-8">
                    <div className="text-center">
                        {/* Logo or Icon */}
                        {branding.companyLogo ? (
                            <div className="mx-auto h-16 w-16 mb-6">
                                <img
                                    src={`${branding.companyLogo}?${Date.now()}`}
                                    alt="Company Logo"
                                    className="h-full w-full object-contain"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'flex';
                                    }}
                                />
                                <div
                                    className="mx-auto h-16 w-16 hidden items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-blue-200"
                                    style={{
                                        background: `linear-gradient(135deg, ${branding.primaryColor}20, ${branding.primaryColor}40)`
                                    }}
                                >
                                    <Lock className="h-8 w-8" style={{ color: branding.primaryColor }} />
                                </div>
                            </div>
                        ) : (
                            <div
                                className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-blue-200 mb-6"
                                style={{
                                    background: `linear-gradient(135deg, ${branding.primaryColor}20, ${branding.primaryColor}40)`
                                }}
                            >
                                <Lock className="h-8 w-8" style={{ color: branding.primaryColor }} />
                            </div>
                        )}

                        <h2 className="text-2xl font-bold text-gray-900 mb-2">
                            {t('auth.signInTitle', 'Welcome back')}
                        </h2>
                        <p className="text-gray-600 text-sm">
                            {branding.companyName || t('auth.iotPlatform', 'IoT Monitoring Platform')}
                        </p>
                    </div>

                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('auth.email', 'Email address')}
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        required
                                        autoComplete="email"
                                        className="input-field pl-10"
                                        placeholder={t('auth.email', 'Enter your email')}
                                        value={formData.email}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('auth.password', 'Password')}
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        required
                                        autoComplete="current-password"
                                        className="input-field pl-10"
                                        placeholder={t('auth.password', 'Enter your password')}
                                        value={formData.password}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="btn-primary w-full flex justify-center py-3 text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading && <Loader className="h-5 w-5 mr-2 animate-spin" />}
                                {t('auth.signIn', 'Sign in')}
                            </button>
                        </div>

                        {/* Only show forgot password link */}
                        <div className="text-center">
                            <Link
                                to="/forgot-password"
                                className="text-sm font-medium hover:underline"
                                style={{ color: branding.primaryColor }}
                            >
                                {t('auth.forgotPassword', 'Forgot your password?')}
                            </Link>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default Login;