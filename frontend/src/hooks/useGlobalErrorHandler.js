import { useEffect } from 'react';
import toast from 'react-hot-toast';

/**
 * Hook to catch and handle async errors globally
 * ErrorBoundary can't catch async errors, so we need this
 */
export const useGlobalErrorHandler = () => {
    useEffect(() => {
        const handleUnhandledRejection = (event) => {
            console.error('Unhandled promise rejection:', event.reason);

            const message = getUserFriendlyMessage(event.reason);

            toast.error(message, {
                duration: 5000,
                position: 'top-center',
            });

            // Prevent default browser error console
            event.preventDefault();
        };

        const handleError = (event) => {
            console.error('Global error:', event.error);

            const message = getUserFriendlyMessage(event.error);

            toast.error(message, {
                duration: 5000,
                position: 'top-center',
            });
        };

        window.addEventListener('unhandledrejection', handleUnhandledRejection);
        window.addEventListener('error', handleError);

        return () => {
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
            window.removeEventListener('error', handleError);
        };
    }, []);
};

/**
 * Get user-friendly error message
 */
function getUserFriendlyMessage(error) {
    if (!error) return 'An unexpected error occurred';

    const message = error.message || error.toString() || '';

    // Network errors
    if (message.includes('Network') || message.includes('Failed to fetch') || message.includes('fetch')) {
        return '❌ Connection issue. Please check your internet and try again.';
    }

    // Permission errors
    if (message.includes('permission') || message.includes('unauthorized') || message.includes('403')) {
        return '🔒 You don\'t have permission for this action.';
    }

    // Not found errors
    if (message.includes('404') || message.includes('not found')) {
        return '🔍 Resource not found. It may have been deleted.';
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
        return '⏱️ Request timed out. Please try again.';
    }

    // Data parsing errors
    if (message.includes('parse') || message.includes('JSON') || message.includes('Unexpected token')) {
        return '⚠️ Received invalid data. Please refresh and try again.';
    }

    // Initialization errors
    if (message.includes('Cannot access') && message.includes('before initialization')) {
        return '🔄 Loading issue detected. Please refresh the page.';
    }

    // Undefined/null errors
    if (message.includes('undefined') || message.includes('null') || message.includes('Cannot read')) {
        return '⚠️ Missing data. Please refresh the page.';
    }

    // Server errors
    if (message.includes('500') || message.includes('Internal Server Error')) {
        return '🔧 Server error. Please try again in a moment.';
    }

    // Default message
    return '⚠️ Something went wrong. Please try again.';
}

export default useGlobalErrorHandler;
