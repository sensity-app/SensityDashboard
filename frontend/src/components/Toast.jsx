import React, { createContext, useContext, useState, useCallback } from 'react';
import './Toast.css';

/**
 * Toast Notification System
 *
 * Usage:
 * 1. Wrap your app with ToastProvider
 * 2. Use the useToast hook to show notifications
 *
 * Example:
 * const { showToast } = useToast();
 * showToast('Device updated successfully!', 'success');
 * showToast('Failed to connect to device', 'error');
 */

const ToastContext = createContext(null);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
};

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((message, type = 'info', duration = 5000) => {
        const id = Date.now() + Math.random();
        const toast = { id, message, type, duration };

        setToasts(prev => [...prev, toast]);

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }

        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    // Convenience methods
    const success = useCallback((message, duration) => {
        return showToast(message, 'success', duration);
    }, [showToast]);

    const error = useCallback((message, duration) => {
        return showToast(message, 'error', duration);
    }, [showToast]);

    const warning = useCallback((message, duration) => {
        return showToast(message, 'warning', duration);
    }, [showToast]);

    const info = useCallback((message, duration) => {
        return showToast(message, 'info', duration);
    }, [showToast]);

    const loading = useCallback((message) => {
        return showToast(message, 'loading', 0); // No auto-dismiss
    }, [showToast]);

    const value = {
        showToast,
        removeToast,
        success,
        error,
        warning,
        info,
        loading
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </ToastContext.Provider>
    );
};

const ToastContainer = ({ toasts, onRemove }) => {
    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <Toast
                    key={toast.id}
                    toast={toast}
                    onRemove={() => onRemove(toast.id)}
                />
            ))}
        </div>
    );
};

const Toast = ({ toast, onRemove }) => {
    const { message, type } = toast;

    const icons = {
        success: (
            <svg className="toast-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
        ),
        error: (
            <svg className="toast-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
        ),
        warning: (
            <svg className="toast-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
        ),
        info: (
            <svg className="toast-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
        ),
        loading: (
            <div className="toast-spinner">
                <div className="spinner-circle"></div>
            </div>
        )
    };

    return (
        <div className={`toast toast-${type}`}>
            <div className="toast-content">
                <div className="toast-icon-wrapper">
                    {icons[type] || icons.info}
                </div>
                <div className="toast-message">{message}</div>
            </div>
            {type !== 'loading' && (
                <button className="toast-close" onClick={onRemove}>
                    <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </button>
            )}
        </div>
    );
};

/**
 * Higher-order function to wrap async operations with toast notifications
 *
 * Usage:
 * const { withToast } = useToast();
 *
 * const handleSave = withToast(
 *   async () => {
 *     await api.updateDevice(data);
 *   },
 *   {
 *     loading: 'Saving device...',
 *     success: 'Device saved successfully!',
 *     error: 'Failed to save device'
 *   }
 * );
 */
export const useToastWithAsync = () => {
    const { loading, success, error, removeToast } = useToast();

    const withToast = useCallback(async (asyncFn, messages = {}) => {
        const {
            loading: loadingMsg = 'Loading...',
            success: successMsg = 'Success!',
            error: errorMsg = 'An error occurred'
        } = messages;

        let toastId;
        if (loadingMsg) {
            toastId = loading(loadingMsg);
        }

        try {
            const result = await asyncFn();
            if (toastId) removeToast(toastId);
            if (successMsg) success(successMsg);
            return result;
        } catch (err) {
            if (toastId) removeToast(toastId);
            const message = err.response?.data?.error || err.message || errorMsg;
            error(message);
            throw err;
        }
    }, [loading, success, error, removeToast]);

    return { withToast };
};

export default ToastProvider;
