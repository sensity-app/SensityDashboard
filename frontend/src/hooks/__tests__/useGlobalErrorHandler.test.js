import React from 'react';
import { render, act } from '@testing-library/react';
import useGlobalErrorHandler from '../useGlobalErrorHandler';

const toastError = jest.fn();

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        error: (...args) => toastError(...args),
    },
}));

const TestComponent = () => {
    useGlobalErrorHandler();
    return null;
};

describe('useGlobalErrorHandler', () => {
    beforeEach(() => {
        toastError.mockClear();
    });

    it('displays toast for unhandled promise rejections', () => {
        render(<TestComponent />);

        const rejectionEvent = new Event('unhandledrejection');
        rejectionEvent.reason = new Error('Network unreachable');
        rejectionEvent.preventDefault = jest.fn();

        act(() => {
            window.dispatchEvent(rejectionEvent);
        });

        expect(toastError).toHaveBeenCalledWith(
            '❌ Connection issue. Please check your internet and try again.',
            expect.objectContaining({
                duration: 5000,
                position: 'top-center',
            })
        );
        expect(rejectionEvent.preventDefault).toHaveBeenCalled();
    });

    it('displays toast for global errors', () => {
        render(<TestComponent />);

        const errorEvent = new Event('error');
        errorEvent.error = new Error('Operation timed out');

        act(() => {
            window.dispatchEvent(errorEvent);
        });

        expect(toastError).toHaveBeenCalledWith(
            '⏱️ Request timed out. Please try again.',
            expect.objectContaining({
                duration: 5000,
                position: 'top-center',
            })
        );
    });

    it('removes listeners on unmount', () => {
        const { unmount } = render(<TestComponent />);
        unmount();

        const errorEvent = new Event('error');
        errorEvent.error = new Error('Should be ignored');

        act(() => {
            window.dispatchEvent(errorEvent);
        });

        expect(toastError).not.toHaveBeenCalled();
    });
});

