import toast from 'react-hot-toast';

/**
 * Enhanced toast utilities with better UX
 */

// Success toast with icon
export const showSuccess = (message, options = {}) => {
    return toast.success(message, {
        duration: 3000,
        icon: '✅',
        style: {
            background: '#10b981',
            color: '#fff',
            padding: '16px',
            borderRadius: '8px',
        },
        ...options,
    });
};

// Error toast with action button
export const showError = (message, options = {}) => {
    const { action, actionLabel = 'Retry' } = options;

    return toast.error(message, {
        duration: 5000,
        icon: '❌',
        style: {
            background: '#ef4444',
            color: '#fff',
            padding: '16px',
            borderRadius: '8px',
        },
        ...options,
    });
};

// Warning toast
export const showWarning = (message, options = {}) => {
    return toast(message, {
        duration: 4000,
        icon: '⚠️',
        style: {
            background: '#f59e0b',
            color: '#fff',
            padding: '16px',
            borderRadius: '8px',
        },
        ...options,
    });
};

// Info toast
export const showInfo = (message, options = {}) => {
    return toast(message, {
        duration: 3000,
        icon: 'ℹ️',
        style: {
            background: '#3b82f6',
            color: '#fff',
            padding: '16px',
            borderRadius: '8px',
        },
        ...options,
    });
};

// Loading toast with promise handling
export const showLoadingPromise = (promise, messages) => {
    return toast.promise(
        promise,
        {
            loading: messages.loading || 'Loading...',
            success: (data) => messages.success || 'Success!',
            error: (err) => messages.error || `Error: ${err.message}`,
        },
        {
            loading: {
                icon: '⏳',
            },
            success: {
                icon: '✅',
                duration: 3000,
            },
            error: {
                icon: '❌',
                duration: 5000,
            },
        }
    );
};

// Network error handler
export const handleNetworkError = (error) => {
    if (!navigator.onLine) {
        return showError('No internet connection. Please check your network.', {
            duration: 6000,
        });
    }

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        return showError('Request timed out. Please try again.', {
            duration: 5000,
        });
    }

    if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.error || error.response.data?.message;

        switch (status) {
            case 400:
                return showError(message || 'Invalid request. Please check your input.');
            case 401:
                return showError('Authentication required. Please login again.');
            case 403:
                return showError('You don\'t have permission to perform this action.');
            case 404:
                return showError(message || 'Resource not found.');
            case 409:
                return showError(message || 'Conflict: Resource already exists.');
            case 422:
                return showError(message || 'Validation error. Please check your input.');
            case 429:
                return showError('Too many requests. Please slow down.');
            case 500:
                return showError('Server error. Please try again later.');
            case 503:
                return showError('Service temporarily unavailable. Please try again later.');
            default:
                return showError(message || `Error: ${status}`);
        }
    }

    return showError(error.message || 'An unexpected error occurred.');
};

// Confirmation toast with custom actions
export const showConfirmation = (message, onConfirm, onCancel) => {
    const toastId = toast((t) => (
        <div className="flex flex-col gap-3">
            <span className="font-medium">{message}</span>
            <div className="flex gap-2">
                <button
                    onClick={() => {
                        onConfirm();
                        toast.dismiss(toastId);
                    }}
                    className="px-3 py-1 bg-white text-gray-900 rounded-md hover:bg-gray-100 text-sm font-medium"
                >
                    Confirm
                </button>
                <button
                    onClick={() => {
                        if (onCancel) onCancel();
                        toast.dismiss(toastId);
                    }}
                    className="px-3 py-1 bg-transparent text-white border border-white rounded-md hover:bg-white hover:text-gray-900 text-sm font-medium"
                >
                    Cancel
                </button>
            </div>
        </div>
    ), {
        duration: 10000,
        icon: '❓',
        style: {
            background: '#6366f1',
            color: '#fff',
            padding: '16px',
            borderRadius: '8px',
        },
    });

    return toastId;
};

export default {
    success: showSuccess,
    error: showError,
    warning: showWarning,
    info: showInfo,
    promise: showLoadingPromise,
    networkError: handleNetworkError,
    confirmation: showConfirmation,
};
