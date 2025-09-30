import { useCallback } from 'react';
import errorHandler, { handleError, showSuccess, showWarning, showInfo } from '../services/errorHandler';

/**
 * Custom hook for error handling in functional components
 *
 * Provides convenient methods for handling errors with consistent UX
 *
 * @example
 * const { handleError, showSuccess, handleAsyncError } = useErrorHandler('Device Management');
 *
 * // Handle error with context
 * try {
 *   await deleteDevice(id);
 *   showSuccess('Device deleted successfully');
 * } catch (error) {
 *   handleError(error, { customMessage: 'Failed to delete device' });
 * }
 *
 * // Or use handleAsyncError wrapper
 * const handleDelete = handleAsyncError(
 *   async (id) => {
 *     await deleteDevice(id);
 *     showSuccess('Device deleted successfully');
 *   },
 *   { errorMessage: 'Failed to delete device' }
 * );
 */
export function useErrorHandler(defaultContext = 'Application') {
    /**
     * Handle an error with the global error handler
     */
    const handleErrorWithContext = useCallback((error, options = {}) => {
        return handleError(error, {
            context: defaultContext,
            ...options
        });
    }, [defaultContext]);

    /**
     * Wrap an async function with automatic error handling
     *
     * @param {Function} asyncFn - The async function to wrap
     * @param {Object} options - Error handling options
     * @returns {Function} Wrapped function
     */
    const handleAsyncError = useCallback((asyncFn, options = {}) => {
        return async (...args) => {
            try {
                return await asyncFn(...args);
            } catch (error) {
                handleErrorWithContext(error, {
                    customMessage: options.errorMessage,
                    ...options
                });
                if (options.rethrow) {
                    throw error;
                }
                return options.defaultValue;
            }
        };
    }, [handleErrorWithContext]);

    /**
     * Handle errors from React Query mutations
     */
    const createMutationHandlers = useCallback((options = {}) => {
        return {
            onError: (error) => {
                handleErrorWithContext(error, {
                    customMessage: options.errorMessage,
                    ...options.onErrorOptions
                });
                if (options.onError) {
                    options.onError(error);
                }
            },
            onSuccess: (data) => {
                if (options.successMessage) {
                    showSuccess(options.successMessage);
                }
                if (options.onSuccess) {
                    options.onSuccess(data);
                }
            }
        };
    }, [handleErrorWithContext]);

    /**
     * Safe async operation with loading state
     *
     * @param {Function} operation - Async operation to perform
     * @param {Object} callbacks - Success and error callbacks
     * @returns {Promise}
     */
    const safeAsync = useCallback(async (operation, callbacks = {}) => {
        const {
            onSuccess,
            onError,
            successMessage,
            errorMessage,
            showLoading = false,
            loadingMessage = 'Loading...'
        } = callbacks;

        let loadingToast = null;

        try {
            if (showLoading) {
                loadingToast = errorHandler.loading(loadingMessage);
            }

            const result = await operation();

            if (loadingToast) {
                errorHandler.dismiss(loadingToast);
            }

            if (successMessage) {
                showSuccess(successMessage);
            }

            if (onSuccess) {
                onSuccess(result);
            }

            return { success: true, data: result, error: null };

        } catch (error) {
            if (loadingToast) {
                errorHandler.dismiss(loadingToast);
            }

            const processedError = handleErrorWithContext(error, {
                customMessage: errorMessage
            });

            if (onError) {
                onError(processedError);
            }

            return { success: false, data: null, error: processedError };
        }
    }, [handleErrorWithContext]);

    /**
     * Validate and handle form errors
     */
    const handleFormError = useCallback((error, formFields = {}) => {
        const processedError = handleErrorWithContext(error, {
            showToast: false
        });

        // If it's a validation error with field-specific errors
        if (processedError.type === 'validation_error' && processedError.data?.errors) {
            const fieldErrors = {};
            processedError.data.errors.forEach(err => {
                if (err.param && formFields[err.param]) {
                    fieldErrors[err.param] = err.msg;
                }
            });

            // Show summary toast
            showWarning(
                Object.keys(fieldErrors).length > 0
                    ? 'Please check the form for errors'
                    : processedError.userMessage
            );

            return { fieldErrors, generalError: processedError.userMessage };
        }

        // Show general error toast
        errorHandler.handle(error, {
            context: defaultContext
        });

        return {
            fieldErrors: {},
            generalError: processedError.userMessage
        };
    }, [handleErrorWithContext, defaultContext]);

    return {
        // Main error handler
        handleError: handleErrorWithContext,

        // Notification methods
        showSuccess,
        showWarning,
        showInfo,

        // Utility methods
        handleAsyncError,
        createMutationHandlers,
        safeAsync,
        handleFormError,

        // Direct access to error handler
        errorHandler
    };
}

export default useErrorHandler;
