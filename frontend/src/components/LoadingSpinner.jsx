import React from 'react';
import './LoadingSpinner.css';

/**
 * Reusable Loading Spinner Component
 *
 * Usage:
 * <LoadingSpinner /> - Default spinner
 * <LoadingSpinner size="small" /> - Small spinner
 * <LoadingSpinner size="large" /> - Large spinner
 * <LoadingSpinner text="Loading..." /> - With custom text
 * <LoadingSpinner overlay /> - Full page overlay
 */
const LoadingSpinner = ({
    size = 'medium',
    text = '',
    overlay = false,
    className = ''
}) => {
    const sizeClasses = {
        small: 'spinner-small',
        medium: 'spinner-medium',
        large: 'spinner-large'
    };

    if (overlay) {
        return (
            <div className="spinner-overlay">
                <div className="spinner-container">
                    <div className={`spinner ${sizeClasses[size]}`}>
                        <div className="spinner-circle"></div>
                    </div>
                    {text && <p className="spinner-text">{text}</p>}
                </div>
            </div>
        );
    }

    return (
        <div className={`spinner-inline ${className}`}>
            <div className={`spinner ${sizeClasses[size]}`}>
                <div className="spinner-circle"></div>
            </div>
            {text && <p className="spinner-text">{text}</p>}
        </div>
    );
};

/**
 * Button with loading state
 *
 * Usage:
 * <LoadingButton
 *   loading={isLoading}
 *   onClick={handleClick}
 * >
 *   Submit
 * </LoadingButton>
 */
export const LoadingButton = ({
    loading = false,
    disabled = false,
    children,
    onClick,
    className = '',
    variant = 'primary',
    type = 'button',
    ...props
}) => {
    return (
        <button
            type={type}
            className={`loading-button loading-button-${variant} ${className} ${loading ? 'loading' : ''}`}
            onClick={onClick}
            disabled={disabled || loading}
            {...props}
        >
            {loading && (
                <span className="button-spinner">
                    <div className="spinner spinner-small">
                        <div className="spinner-circle"></div>
                    </div>
                </span>
            )}
            <span className={loading ? 'button-text-hidden' : ''}>
                {children}
            </span>
        </button>
    );
};

/**
 * Card with loading state
 *
 * Usage:
 * <LoadingCard loading={isLoading}>
 *   <p>content here</p>
 * </LoadingCard>
 */
export const LoadingCard = ({ loading, children, height = '200px' }) => {
    if (loading) {
        return (
            <div className="loading-card" style={{ minHeight: height }}>
                <LoadingSpinner size="medium" />
            </div>
        );
    }

    return <>{children}</>;
};

/**
 * Skeleton loader for lists
 *
 * Usage:
 * <SkeletonLoader count={3} />
 */
export const SkeletonLoader = ({ count = 1, height = '60px', className = '' }) => {
    return (
        <div className={`skeleton-container ${className}`}>
            {Array.from({ length: count }).map((_, index) => (
                <div
                    key={index}
                    className="skeleton-item"
                    style={{ height }}
                >
                    <div className="skeleton-animation"></div>
                </div>
            ))}
        </div>
    );
};

/**
 * Inline loading indicator for text
 *
 * Usage:
 * <InlineLoader /> Loading...
 */
export const InlineLoader = () => {
    return (
        <span className="inline-loader">
            <div className="spinner spinner-small">
                <div className="spinner-circle"></div>
            </div>
        </span>
    );
};

export default LoadingSpinner;
