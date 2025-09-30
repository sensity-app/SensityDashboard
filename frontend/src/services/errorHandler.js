import toast from 'react-hot-toast';

/**
 * Centralized Error Handler Service
 *
 * Provides consistent error handling across the application with:
 * - User-friendly error messages
 * - Automatic toast notifications
 * - Error logging
 * - Network error handling
 * - Validation error parsing
 */

class ErrorHandler {
    constructor() {
        this.errorLog = [];
        this.maxLogSize = 100;
        this.enableLogging = process.env.NODE_ENV === 'development';
    }

    /**
     * Main error handling method
     * @param {Error|Object} error - Error object or API error response
     * @param {Object} options - Configuration options
     * @param {boolean} options.showToast - Show toast notification (default: true)
     * @param {string} options.customMessage - Override error message
     * @param {string} options.context - Context for logging (e.g., 'Device Creation')
     * @param {Function} options.onError - Custom error callback
     * @param {string} options.severity - 'error' | 'warning' | 'info' (default: 'error')
     * @returns {Object} Processed error information
     */
    handle(error, options = {}) {
        const {
            showToast = true,
            customMessage = null,
            context = 'Unknown',
            onError = null,
            severity = 'error'
        } = options;

        // Process the error to get structured information
        const processedError = this.processError(error, context);

        // Log the error
        this.logError(processedError);

        // Show toast notification if enabled
        if (showToast) {
            const message = customMessage || processedError.userMessage;
            this.showToast(message, severity);
        }

        // Call custom error handler if provided
        if (onError && typeof onError === 'function') {
            onError(processedError);
        }

        return processedError;
    }

    /**
     * Process error into a structured format
     */
    processError(error, context) {
        const timestamp = new Date().toISOString();

        // Handle Axios/API errors
        if (error.response) {
            return this.processApiError(error, context, timestamp);
        }

        // Handle network errors
        if (error.request) {
            return this.processNetworkError(error, context, timestamp);
        }

        // Handle JavaScript errors
        if (error instanceof Error) {
            return this.processJavaScriptError(error, context, timestamp);
        }

        // Handle custom error objects
        return this.processCustomError(error, context, timestamp);
    }

    /**
     * Process API response errors
     */
    processApiError(error, context, timestamp) {
        const status = error.response.status;
        const data = error.response.data;

        let userMessage = 'An error occurred';
        let technicalMessage = error.message;
        let type = 'api_error';

        switch (status) {
            case 400:
                type = 'validation_error';
                userMessage = this.extractValidationErrors(data);
                break;

            case 401:
                type = 'authentication_error';
                userMessage = 'Your session has expired. Please log in again.';
                this.handleAuthError();
                break;

            case 403:
                type = 'authorization_error';
                userMessage = 'You do not have permission to perform this action.';
                break;

            case 404:
                type = 'not_found_error';
                userMessage = data.error || 'The requested resource was not found.';
                break;

            case 409:
                type = 'conflict_error';
                userMessage = data.error || 'A conflict occurred. This item may already exist.';
                break;

            case 422:
                type = 'validation_error';
                userMessage = data.error || 'Invalid data submitted.';
                break;

            case 429:
                type = 'rate_limit_error';
                userMessage = 'Too many requests. Please wait a moment and try again.';
                break;

            case 500:
            case 502:
            case 503:
            case 504:
                type = 'server_error';
                userMessage = 'Server error. Please try again later.';
                technicalMessage = data.error || error.message;
                break;

            default:
                userMessage = data.error || data.message || 'An unexpected error occurred.';
        }

        return {
            type,
            status,
            userMessage,
            technicalMessage,
            context,
            timestamp,
            data: data,
            isApiError: true
        };
    }

    /**
     * Process network errors (no response received)
     */
    processNetworkError(error, context, timestamp) {
        return {
            type: 'network_error',
            status: 0,
            userMessage: 'Network error. Please check your internet connection.',
            technicalMessage: error.message || 'No response received from server',
            context,
            timestamp,
            isNetworkError: true
        };
    }

    /**
     * Process JavaScript/Runtime errors
     */
    processJavaScriptError(error, context, timestamp) {
        return {
            type: 'javascript_error',
            status: null,
            userMessage: 'An unexpected error occurred. Please refresh the page.',
            technicalMessage: `${error.name}: ${error.message}`,
            stack: error.stack,
            context,
            timestamp,
            isJavaScriptError: true
        };
    }

    /**
     * Process custom error objects
     */
    processCustomError(error, context, timestamp) {
        return {
            type: 'custom_error',
            status: null,
            userMessage: error.message || 'An error occurred',
            technicalMessage: JSON.stringify(error),
            context,
            timestamp,
            data: error
        };
    }

    /**
     * Extract validation errors from API response
     */
    extractValidationErrors(data) {
        // Handle express-validator error format
        if (data.errors && Array.isArray(data.errors)) {
            const messages = data.errors.map(err => err.msg || err.message).filter(Boolean);
            if (messages.length > 0) {
                return messages.length === 1 ? messages[0] : messages.join(', ');
            }
        }

        // Handle single error message
        if (data.error) {
            return data.error;
        }

        if (data.message) {
            return data.message;
        }

        return 'Validation error. Please check your input.';
    }

    /**
     * Show toast notification
     */
    showToast(message, severity = 'error') {
        const options = {
            duration: severity === 'error' ? 5000 : 3000,
            position: 'top-right',
        };

        switch (severity) {
            case 'error':
                toast.error(message, options);
                break;
            case 'warning':
                toast(message, { ...options, icon: '⚠️' });
                break;
            case 'info':
                toast(message, { ...options, icon: 'ℹ️' });
                break;
            case 'success':
                toast.success(message, options);
                break;
            default:
                toast(message, options);
        }
    }

    /**
     * Log error to console and internal log
     */
    logError(processedError) {
        if (!this.enableLogging) return;

        // Add to internal log
        this.errorLog.unshift(processedError);
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog.pop();
        }

        // Console logging with context
        console.group(`🚨 Error: ${processedError.context}`);
        console.error('User Message:', processedError.userMessage);
        console.error('Technical:', processedError.technicalMessage);
        console.error('Type:', processedError.type);
        if (processedError.status) {
            console.error('Status:', processedError.status);
        }
        if (processedError.stack) {
            console.error('Stack:', processedError.stack);
        }
        console.error('Timestamp:', processedError.timestamp);
        console.groupEnd();
    }

    /**
     * Handle authentication errors
     */
    handleAuthError() {
        // Clear auth data
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        // Redirect to login after a short delay
        setTimeout(() => {
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }, 2000);
    }

    /**
     * Success notification helper
     */
    success(message, options = {}) {
        toast.success(message, {
            duration: 3000,
            position: 'top-right',
            ...options
        });
    }

    /**
     * Warning notification helper
     */
    warning(message, options = {}) {
        toast(message, {
            duration: 4000,
            position: 'top-right',
            icon: '⚠️',
            ...options
        });
    }

    /**
     * Info notification helper
     */
    info(message, options = {}) {
        toast(message, {
            duration: 3000,
            position: 'top-right',
            icon: 'ℹ️',
            ...options
        });
    }

    /**
     * Loading notification helper
     */
    loading(message) {
        return toast.loading(message, {
            position: 'top-right'
        });
    }

    /**
     * Dismiss a specific toast
     */
    dismiss(toastId) {
        toast.dismiss(toastId);
    }

    /**
     * Dismiss all toasts
     */
    dismissAll() {
        toast.dismiss();
    }

    /**
     * Get error log (for debugging)
     */
    getErrorLog() {
        return [...this.errorLog];
    }

    /**
     * Clear error log
     */
    clearErrorLog() {
        this.errorLog = [];
    }

    /**
     * Export error log as JSON
     */
    exportErrorLog() {
        const dataStr = JSON.stringify(this.errorLog, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `error-log-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }
}

// Create singleton instance
const errorHandler = new ErrorHandler();

// Export convenience methods
export const handleError = (error, options) => errorHandler.handle(error, options);
export const showSuccess = (message, options) => errorHandler.success(message, options);
export const showWarning = (message, options) => errorHandler.warning(message, options);
export const showInfo = (message, options) => errorHandler.info(message, options);
export const showLoading = (message) => errorHandler.loading(message);
export const dismissToast = (toastId) => errorHandler.dismiss(toastId);
export const dismissAllToasts = () => errorHandler.dismissAll();

export default errorHandler;
