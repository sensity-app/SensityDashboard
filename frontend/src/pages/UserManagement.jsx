import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import {
    UserPlus,
    Mail,
    Trash2,
    Clock,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Edit3,
    Users,
    Shield,
    User
} from 'lucide-react';
import toast from 'react-hot-toast';

import { apiService } from '../services/api';

function UserManagement() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [showInviteForm, setShowInviteForm] = useState(false);
    const [editingUser, setEditingUser] = useState(null);

    // Query users
    const { data: users = [], isLoading: usersLoading } = useQuery(
        'users',
        () => apiService.getUsers(),
        { refetchInterval: 30000 }
    );

    // Delete user mutation
    const deleteUserMutation = useMutation(
        apiService.deleteUser,
        {
            onSuccess: () => {
                queryClient.invalidateQueries('users');
                toast.success(t('users.deleteSuccess', 'User deleted successfully'));
            },
            onError: (error) => {
                console.error('Delete user error:', error);
                const message = error.response?.data?.error || t('users.deleteError', 'Failed to delete user');
                toast.error(message);
            }
        }
    );

    const handleDeleteUser = (user) => {
        if (window.confirm(t('users.deleteConfirm', 'Are you sure you want to delete this user? This action cannot be undone.'))) {
            deleteUserMutation.mutate(user.id);
        }
    };

    const handleEditUser = (user) => {
        setEditingUser(user);
        setShowInviteForm(true);
    };

    // Query invitations
    const { data: invitations = [], isLoading: invitationsLoading } = useQuery(
        'invitations',
        () => apiService.getInvitations(),
        { refetchInterval: 10000 }
    );

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Modern Header */}
            <div className="card animate-slide-up">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                            <Users className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">
                                {t('users.title', 'User Management')}
                            </h1>
                            <p className="text-gray-600 mt-1">Manage system users and permissions</p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setEditingUser(null);
                            setShowInviteForm(true);
                        }}
                        className="btn-primary flex items-center space-x-2"
                    >
                        <UserPlus className="h-4 w-4" />
                        <span>{t('users.inviteUser', 'Invite User')}</span>
                </button>
            </div>

            {/* Existing Users */}
            <div className="bg-white shadow rounded-lg">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-medium text-gray-900">
                        {t('users.existingUsers', 'Existing Users')}
                    </h2>
                </div>

                {usersLoading ? (
                    <div className="p-6">
                        <div className="animate-pulse space-y-4">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="flex items-center space-x-4">
                                    <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                                    <div className="flex-1">
                                        <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                                        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200">
                        {(users || []).map((user) => (
                            <div key={user.id} className="px-6 py-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-4">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                                            user.role === 'admin' ? 'bg-gradient-to-br from-red-100 to-red-200' :
                                            user.role === 'operator' ? 'bg-gradient-to-br from-yellow-100 to-yellow-200' :
                                            'bg-gradient-to-br from-gray-100 to-gray-200'
                                        }`}>
                                            <span className={`text-lg font-semibold ${
                                                user.role === 'admin' ? 'text-red-700' :
                                                user.role === 'operator' ? 'text-yellow-700' :
                                                'text-gray-700'
                                            }`}>
                                                {(user.full_name || user.email).charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center space-x-2 mb-1">
                                                <div className="font-semibold text-gray-900">
                                                    {user.full_name || user.email}
                                                </div>
                                                <span className={`badge ${
                                                    user.role === 'admin' ? 'badge-error' :
                                                    user.role === 'operator' ? 'badge-warning' :
                                                    'badge-primary'
                                                }`}>
                                                    <Shield className="w-3 h-3 mr-1" />
                                                    {t(`roles.${user.role}`, user.role)}
                                                </span>
                                            </div>
                                            <div className="flex items-center space-x-4 text-sm text-gray-500">
                                                <div className="flex items-center space-x-1">
                                                    <Mail className="w-3 h-3" />
                                                    <span>{user.email}</span>
                                                </div>
                                                <div className="flex items-center space-x-1">
                                                    <Clock className="w-3 h-3" />
                                                    <span>{new Date(user.created_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                        <button
                                            onClick={() => handleEditUser(user)}
                                            className="btn-ghost p-2 text-primary"
                                            title={t('common.edit')}
                                        >
                                            <Edit3 className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteUser(user)}
                                            className="btn-ghost p-2 text-red-600 hover:text-red-700"
                                            title={t('common.delete')}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Pending Invitations */}
            <div className="bg-white shadow rounded-lg">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-medium text-gray-900">
                        {t('users.pendingInvitations', 'Pending Invitations')}
                    </h2>
                </div>

                {invitationsLoading ? (
                    <div className="p-6">
                        <div className="animate-pulse space-y-4">
                            {[...Array(2)].map((_, i) => (
                                <div key={i} className="flex items-center space-x-4">
                                    <div className="h-8 w-8 bg-gray-200 rounded"></div>
                                    <div className="flex-1">
                                        <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                                        <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : invitations.length === 0 ? (
                    <div className="p-6 text-center">
                        <Mail className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">
                            {t('users.noPendingInvitations', 'No pending invitations')}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                            {t('users.inviteUsersToGetStarted', 'Invite users to get them started.')}
                        </p>
                    </div>
                ) : (
                    <InvitationsList invitations={invitations} />
                )}
            </div>

            {/* Invite/Edit Form Modal */}
            {showInviteForm && (
                <InviteUserModal
                    user={editingUser}
                    onClose={() => {
                        setShowInviteForm(false);
                        setEditingUser(null);
                    }}
                />
            )}
        </div>
    );
}

function InvitationsList({ invitations }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    const cancelInviteMutation = useMutation(
        (invitationId) => apiService.cancelInvitation(invitationId),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('invitations');
                toast.success(t('users.invitationCanceled', 'Invitation canceled'));
            },
            onError: () => {
                toast.error(t('users.failedToCancelInvitation', 'Failed to cancel invitation'));
            }
        }
    );

    const handleCancelInvitation = (invitation) => {
        if (window.confirm(t('users.confirmCancelInvitation', 'Are you sure you want to cancel this invitation?'))) {
            cancelInviteMutation.mutate(invitation.id);
        }
    };

    return (
        <div className="divide-y divide-gray-200">
            {Array.isArray(invitations) && invitations.map((invitation) => (
                <div key={invitation.id} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <div className="h-8 w-8 rounded bg-blue-100 flex items-center justify-center">
                                {invitation.isExpired ? (
                                    <XCircle className="h-4 w-4 text-red-500" />
                                ) : (
                                    <Clock className="h-4 w-4 text-blue-500" />
                                )}
                            </div>
                            <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">
                                    {invitation.fullName}
                                </div>
                                <div className="text-sm text-gray-500">
                                    {invitation.email}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center space-x-4">
                            <div className="text-right">
                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                    invitation.role === 'admin' ? 'bg-red-100 text-red-800' :
                                    invitation.role === 'operator' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-gray-100 text-gray-800'
                                }`}>
                                    {t(`roles.${invitation.role}`, invitation.role)}
                                </span>
                                <div className="text-xs text-gray-500 mt-1">
                                    {invitation.isExpired ? (
                                        <span className="text-red-500">
                                            {t('users.expired', 'Expired')}
                                        </span>
                                    ) : (
                                        <span>
                                            {t('users.expires', 'Expires')}: {new Date(invitation.expiresAt).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                    {t('users.invitedBy', 'By')}: {invitation.invitedBy}
                                </div>
                            </div>
                            <button
                                onClick={() => handleCancelInvitation(invitation)}
                                disabled={cancelInviteMutation.isLoading}
                                className="text-red-600 hover:text-red-800 disabled:opacity-50"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function InviteUserModal({ user, onClose }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const isEditing = !!user;
    const [formData, setFormData] = useState({
        email: user?.email || '',
        fullName: user?.full_name || '',
        role: user?.role || 'viewer'
    });

    const inviteMutation = useMutation(
        (data) => apiService.inviteUser(data),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('invitations');
                toast.success(t('users.invitationSent', 'Invitation sent successfully'));
                onClose();
            },
            onError: (error) => {
                const message = error.response?.data?.error || t('users.failedToSendInvitation', 'Failed to send invitation');
                toast.error(message);
            }
        }
    );

    const updateUserMutation = useMutation(
        ({ userId, userData }) => apiService.updateUser(userId, userData),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('users');
                toast.success(t('users.updateSuccess', 'User updated successfully'));
                onClose();
            },
            onError: (error) => {
                const message = error.response?.data?.error || t('users.updateError', 'Failed to update user');
                toast.error(message);
            }
        }
    );

    const handleSubmit = (e) => {
        e.preventDefault();

        if (isEditing) {
            updateUserMutation.mutate({
                userId: user.id,
                userData: {
                    full_name: formData.fullName,
                    role: formData.role
                }
            });
        } else {
            inviteMutation.mutate(formData);
        }
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

                <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
                    <div>
                        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
                            <UserPlus className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="mt-3 text-center sm:mt-5">
                            <h3 className="text-lg leading-6 font-medium text-gray-900">
                                {isEditing ? t('users.editUser', 'Edit User') : t('users.inviteNewUser', 'Invite New User')}
                            </h3>
                        </div>
                    </div>

                    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                {t('auth.fullName', 'Full Name')}
                            </label>
                            <input
                                type="text"
                                name="fullName"
                                required
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                value={formData.fullName}
                                onChange={handleChange}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                {t('auth.email', 'Email Address')}
                            </label>
                            <input
                                type="email"
                                name="email"
                                required={!isEditing}
                                disabled={isEditing}
                                className={`mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${isEditing ? 'bg-gray-100' : ''}`}
                                value={formData.email}
                                onChange={handleChange}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                {t('users.role', 'Role')}
                            </label>
                            <select
                                name="role"
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                value={formData.role}
                                onChange={handleChange}
                            >
                                <option value="viewer">{t('roles.viewer', 'Viewer')}</option>
                                <option value="operator">{t('roles.operator', 'Operator')}</option>
                                <option value="admin">{t('roles.admin', 'Administrator')}</option>
                            </select>
                        </div>

                        <div className="mt-6 flex space-x-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                {t('common.cancel', 'Cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={inviteMutation.isLoading || updateUserMutation.isLoading}
                                className="flex-1 bg-blue-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {(inviteMutation.isLoading || updateUserMutation.isLoading) ? (
                                    t('common.sending', 'Sending...')
                                ) : isEditing ? (
                                    t('common.update', 'Update')
                                ) : (
                                    t('users.sendInvitation', 'Send Invitation')
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default UserManagement;