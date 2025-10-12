import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import './MobileMenu.css';

/**
 * Mobile Hamburger Menu Component
 *
 * Features:
 * - Slide-out sidebar navigation
 * - Overlay backdrop
 * - Touch-friendly interactions
 * - Responsive breakpoints
 * - Smooth animations
 *
 * Usage:
 * <MobileMenu>
 *   <nav>
 *     <a href="/dashboard">Dashboard</a>
 *     <a href="/devices">Devices</a>
 *   </nav>
 * </MobileMenu>
 */

const MobileMenu = ({ children, className = '' }) => {
    const [isOpen, setIsOpen] = useState(false);

    // Close menu on escape key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen]);

    // Prevent body scroll when menu is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    const toggleMenu = () => {
        setIsOpen(!isOpen);
    };

    const closeMenu = () => {
        setIsOpen(false);
    };

    return (
        <>
            {/* Hamburger Button */}
            <button
                className="mobile-menu-button"
                onClick={toggleMenu}
                aria-label={isOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={isOpen}
            >
                {isOpen ? (
                    <X size={24} />
                ) : (
                    <Menu size={24} />
                )}
            </button>

            {/* Overlay */}
            {isOpen && (
                <div
                    className="mobile-menu-overlay"
                    onClick={closeMenu}
                    role="presentation"
                />
            )}

            {/* Slide-out Menu */}
            <div className={`mobile-menu-sidebar ${isOpen ? 'open' : ''} ${className}`}>
                <div className="mobile-menu-content">
                    {children}
                </div>
            </div>
        </>
    );
};

/**
 * Mobile Menu Item Component
 *
 * Usage:
 * <MobileMenuItem icon={<Home />} href="/dashboard">
 *   Dashboard
 * </MobileMenuItem>
 */
export const MobileMenuItem = ({ icon, href, onClick, children, active = false }) => {
    const handleClick = (e) => {
        if (onClick) {
            onClick(e);
        }
    };

    const className = `mobile-menu-item ${active ? 'active' : ''}`;

    if (href) {
        return (
            <a href={href} className={className} onClick={handleClick}>
                {icon && <span className="mobile-menu-icon">{icon}</span>}
                <span className="mobile-menu-label">{children}</span>
            </a>
        );
    }

    return (
        <button className={className} onClick={handleClick}>
            {icon && <span className="mobile-menu-icon">{icon}</span>}
            <span className="mobile-menu-label">{children}</span>
        </button>
    );
};

/**
 * Mobile Menu Section Component
 *
 * Usage:
 * <MobileMenuSection title="Navigation">
 *   <MobileMenuItem>...</MobileMenuItem>
 * </MobileMenuSection>
 */
export const MobileMenuSection = ({ title, children }) => {
    return (
        <div className="mobile-menu-section">
            {title && <h3 className="mobile-menu-section-title">{title}</h3>}
            <div className="mobile-menu-section-content">
                {children}
            </div>
        </div>
    );
};

/**
 * Mobile Menu Header Component
 *
 * Usage:
 * <MobileMenuHeader
 *   logo="/logo.png"
 *   title="Sensity"
 *   subtitle="IoT Platform"
 * />
 */
export const MobileMenuHeader = ({ logo, title, subtitle }) => {
    return (
        <div className="mobile-menu-header">
            {logo && <img src={logo} alt={title} className="mobile-menu-logo" />}
            <div className="mobile-menu-title-group">
                {title && <h2 className="mobile-menu-title">{title}</h2>}
                {subtitle && <p className="mobile-menu-subtitle">{subtitle}</p>}
            </div>
        </div>
    );
};

/**
 * Hook to detect mobile device
 */
export const useIsMobile = (breakpoint = 768) => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth <= breakpoint);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);

        return () => window.removeEventListener('resize', checkMobile);
    }, [breakpoint]);

    return isMobile;
};

export default MobileMenu;
