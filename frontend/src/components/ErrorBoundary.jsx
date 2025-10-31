import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import errorHandler from '../services/errorHandler';

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing.
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
            errorId: null
        };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI
        return {
            hasError: true,
            errorId: `error_${Date.now()}`
        };
    }

    componentDidCatch(error, errorInfo) {
        // Log the error to our error handler
        const processedError = errorHandler.handle(error, {
            showToast: false, // Don't show toast, we'll show custom UI
            context: this.props.context || 'React Component',
            severity: 'error'
        });

        // Get user-friendly message
        const userFriendlyMessage = this.getUserFriendlyMessage(error);

        // Update state with error details
        this.setState({
            error: error,
            errorInfo: errorInfo,
            processedError: processedError,
            userFriendlyMessage: userFriendlyMessage
        });

        // Log to console for debugging
        console.error('Error Boundary caught an error:', {
            message: error.message,
            name: error.name,
            userFriendlyMessage,
            stack: error.stack
        });

        // You could also log to an external error reporting service here
        // e.g., Sentry, LogRocket, etc.
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }
    }

    getUserFriendlyMessage(error) {
        if (!error) return 'An unexpected error occurred.';

        const message = error.message || '';

        // Pattern matching for common errors with user-friendly messages
        if (message.includes('Cannot access') && message.includes('before initialization')) {
            return 'A component failed to load properly. This might be a temporary issue with loading the page.';
        }

        if (message.includes('Network') || message.includes('Failed to fetch') || message.includes('fetch')) {
            return 'Unable to connect to the server. Please check your internet connection and try again.';
        }

        if (message.includes('undefined is not an object') || message.includes('Cannot read property') || message.includes('Cannot read properties of undefined')) {
            return 'Some required data is missing. This might be resolved by refreshing the page.';
        }

        if (message.includes('null is not an object') || message.includes('Cannot read properties of null')) {
            return 'A required component is not available. Please try refreshing the page.';
        }

        if (message.includes('permission') || message.includes('unauthorized') || message.includes('403')) {
            return 'You don\'t have permission to access this feature. Please contact your administrator.';
        }

        if (message.includes('404') || message.includes('not found')) {
            return 'The requested resource was not found. It may have been moved or deleted.';
        }

        if (message.includes('timeout') || message.includes('timed out')) {
            return 'The request took too long to complete. Please try again.';
        }

        if (message.includes('parse') || message.includes('JSON')) {
            return 'Received invalid data from the server. Please try again.';
        }

        // Default friendly message
        return 'Something unexpected happened. Don\'t worry, your data is safe. Please try refreshing the page.';
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
            errorId: null
        });

        // Call custom reset handler if provided
        if (this.props.onReset) {
            this.props.onReset();
        }
    };

    handleRefresh = () => {
        window.location.reload();
    };

    handleGoHome = () => {
        window.location.href = '/';
    };

    render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            if (this.props.fallback) {
                return this.props.fallback(this.state.error, this.handleReset);
            }

            // Default error UI
            return (
                <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                    <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
                        {/* Error Icon */}
                        <div className="flex justify-center mb-6">
                            <div className="bg-red-100 rounded-full p-4">
                                <AlertTriangle className="w-16 h-16 text-red-600" />
                            </div>
                        </div>

                        {/* Error Title */}
                        <h1 className="text-3xl font-bold text-gray-900 text-center mb-4">
                            Oops! Something went wrong
                        </h1>

                        {/* User-Friendly Error Message */}
                        <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-lg p-4">
                            <p className="text-red-800 text-center text-lg font-medium">
                                {this.state.userFriendlyMessage}
                            </p>
                        </div>

                        {/* Helpful Suggestions */}
                        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm font-semibold text-blue-900 mb-2">💡 What you can do:</p>
                            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                                <li>Click "Refresh Page" below to reload</li>
                                <li>Clear your browser cache and try again</li>
                                <li>Return to the home page and navigate back</li>
                                <li>If the problem persists, contact support</li>
                            </ul>
                        </div>

                        {/* Error Details */}
                        {this.state.error && (
                            <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
                                <details>
                                    <summary className="text-sm font-semibold text-gray-700 cursor-pointer hover:text-gray-900 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 text-red-500" />
                                        Debug Information (click to expand)
                                    </summary>
                                    <div className="mt-3 space-y-3">
                                        <div>
                                            <p className="text-xs font-semibold text-gray-600 mb-1">Error Message:</p>
                                            <div className="text-xs font-mono text-red-600 bg-red-50 p-2 rounded overflow-auto">
                                                {this.state.error.toString()}
                                            </div>
                                        </div>
                                        {this.state.error.stack && (
                                            <div>
                                                <p className="text-xs font-semibold text-gray-600 mb-1">Stack Trace:</p>
                                                <pre className="text-xs font-mono text-gray-600 bg-white p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap border border-gray-200">
                                                    {this.state.error.stack}
                                                </pre>
                                            </div>
                                        )}
                                        {this.state.errorInfo && (
                                            <div>
                                                <p className="text-xs font-semibold text-gray-600 mb-1">Component Stack:</p>
                                                <pre className="text-xs font-mono text-gray-600 bg-white p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap border border-gray-200">
                                                    {this.state.errorInfo.componentStack}
                                                </pre>
                                            </div>
                                        )}
                                        <div className="pt-2 border-t border-gray-200">
                                            <p className="text-xs text-gray-500">
                                                💡 Tip: Copy this information when reporting the issue for faster resolution.
                                            </p>
                                        </div>
                                    </div>
                                </details>
                            </div>
                        )}

                        {/* Error ID */}
                        <p className="text-xs text-gray-500 text-center mb-6">
                            Error ID: {this.state.errorId}
                        </p>

                        {/* Action Buttons */}
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <button
                                onClick={this.handleReset}
                                className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Try Again
                            </button>

                            <button
                                onClick={this.handleRefresh}
                                className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Refresh Page
                            </button>

                            <button
                                onClick={this.handleGoHome}
                                className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                            >
                                <Home className="w-4 h-4" />
                                Go Home
                            </button>
                        </div>

                        {/* Help Text */}
                        <div className="mt-8 pt-6 border-t border-gray-200">
                            <p className="text-sm text-gray-600 text-center">
                                If this problem persists, please contact support with the error ID above.
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

/**
 * Lightweight Error Boundary for specific sections
 * Shows a more compact error UI suitable for smaller components
 */
export class SectionErrorBoundary extends ErrorBoundary {
    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback(this.state.error, this.handleReset);
            }

            return (
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                    <div className="flex items-start gap-4">
                        <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-red-900 mb-2">
                                Error Loading {this.props.sectionName || 'Content'}
                            </h3>
                            <p className="text-sm text-red-700 mb-4">
                                {this.state.userFriendlyMessage || this.getUserFriendlyMessage(this.state.error)}
                            </p>
                            <button
                                onClick={this.handleReset}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Try Again
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
