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

        // Update state with error details
        this.setState({
            error: error,
            errorInfo: errorInfo,
            processedError: processedError
        });

        // You could also log to an external error reporting service here
        // e.g., Sentry, LogRocket, etc.
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }
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

                        {/* Error Message */}
                        <p className="text-gray-600 text-center mb-6">
                            We're sorry for the inconvenience. An unexpected error has occurred.
                        </p>

                        {/* Error Details (Development Only) */}
                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                                    Error Details (Development Mode):
                                </h3>
                                <div className="text-xs font-mono text-red-600 mb-2 overflow-auto">
                                    {this.state.error.toString()}
                                </div>
                                {this.state.errorInfo && (
                                    <details className="mt-2">
                                        <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                                            Stack Trace
                                        </summary>
                                        <pre className="mt-2 text-xs text-gray-600 overflow-auto max-h-48 whitespace-pre-wrap">
                                            {this.state.errorInfo.componentStack}
                                        </pre>
                                    </details>
                                )}
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
                                {this.state.error?.message || 'An unexpected error occurred'}
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
