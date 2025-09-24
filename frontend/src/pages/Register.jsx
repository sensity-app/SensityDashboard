import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserPlus, Mail, Lock, User, Loader, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

import { apiService } from '../services/api';

function Register() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');

    const [invitation, setInvitation] = useState(null);
    const [invitationLoading, setInvitationLoading] = useState(true);
    const [invitationError, setInvitationError] = useState(null);

    const [formData, setFormData] = useState({
        email: '',
        fullName: '',
        password: '',
        confirmPassword: '',
        phone: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (token) {
            verifyInvitation();
        } else {
            setInvitationError('No invitation token provided');
            setInvitationLoading(false);
        }
    }, [token]);

    const verifyInvitation = async () => {
        try {
            const invitationData = await apiService.verifyInvitation(token);
            setInvitation(invitationData);
            setFormData(prev => ({
                ...prev,
                email: invitationData.email,
                fullName: invitationData.fullName
            }));
        } catch (error) {
            const message = error.response?.data?.error || 'Invalid invitation token';
            setInvitationError(message);
        } finally {
            setInvitationLoading(false);
        }
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.password !== formData.confirmPassword) {
            toast.error(t('auth.passwordMismatch', 'Passwords do not match'));
            return;
        }

        if (formData.password.length < 6) {
            toast.error(t('auth.passwordTooShort', 'Password must be at least 6 characters'));
            return;
        }

        setLoading(true);

        try {
            await apiService.register({
                ...formData,
                inviteToken: token
            });

            toast.success(t('auth.registrationSuccess', 'Account created successfully! You can now log in.'));
            navigate('/login');
        } catch (error) {
            const message = error.response?.data?.error || t('auth.registrationError', 'Registration failed');
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    if (invitationLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
                <div className="text-center">
                    <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
                    <p className="mt-4 text-gray-600">
                        {t('auth.verifyingInvitation', 'Verifying invitation...')}
                    </p>
                </div>
            </div>
        );
    }

    if (invitationError) {
        return (
            <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full text-center">
                    <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-red-100">
                        <XCircle className="h-6 w-6 text-red-600" />
                    </div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        {t('auth.invitationInvalid', 'Invalid Invitation')}
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        {invitationError}
                    </p>
                    <div className="mt-6">
                        <Link
                            to="/login"
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                        >
                            {t('auth.backToLogin', 'Back to Login')}
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-green-100">
                        <CheckCircle className="h-6 w-6 text-green-600" />
                    </div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        {t('auth.createAccount', 'Create your account')}
                    </h2>
                    <div className="mt-2 text-center">
                        <p className="text-sm text-gray-600">
                            {t('auth.invitedAs', 'You have been invited as')}{' '}
                            <span className="font-medium text-blue-600">
                                {t(`roles.${invitation?.role}`, invitation?.role)}
                            </span>
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                            {t('auth.expiresAt', 'Expires')}: {' '}
                            {invitation?.expiresAt ?
                                new Date(invitation.expiresAt).toLocaleDateString() :
                                'N/A'
                            }
                        </p>
                    </div>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                                {t('auth.email', 'Email address')}
                            </label>
                            <div className="relative mt-1">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    required
                                    disabled
                                    className="block w-full px-3 py-2 pl-10 border border-gray-300 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed sm:text-sm"
                                    value={formData.email}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                                {t('auth.fullName', 'Full Name')}
                            </label>
                            <div className="relative mt-1">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <User className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    id="fullName"
                                    name="fullName"
                                    type="text"
                                    required
                                    className="block w-full px-3 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    value={formData.fullName}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                                {t('auth.phone', 'Phone Number')} ({t('common.optional', 'Optional')})
                            </label>
                            <input
                                id="phone"
                                name="phone"
                                type="tel"
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                value={formData.phone}
                                onChange={handleChange}
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                {t('auth.password', 'Password')}
                            </label>
                            <div className="relative mt-1">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    className="block w-full px-3 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    placeholder={t('auth.passwordPlaceholder', 'Enter your password')}
                                    value={formData.password}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                                {t('auth.confirmPassword', 'Confirm Password')}
                            </label>
                            <div className="relative mt-1">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type="password"
                                    required
                                    className="block w-full px-3 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    placeholder={t('auth.confirmPasswordPlaceholder', 'Confirm your password')}
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading && <Loader className="h-4 w-4 mr-2 animate-spin" />}
                            {t('auth.createAccount', 'Create Account')}
                        </button>
                    </div>

                    <div className="text-center">
                        <p className="text-sm text-gray-600">
                            {t('auth.alreadyHaveAccount', 'Already have an account?')}{' '}
                            <Link
                                to="/login"
                                className="font-medium text-blue-600 hover:text-blue-500"
                            >
                                {t('auth.signIn', 'Sign in')}
                            </Link>
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default Register;