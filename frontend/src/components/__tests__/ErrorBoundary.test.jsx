import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

const mockHandle = jest.fn(() => ({ userMessage: 'Handled' }));

jest.mock('../../services/errorHandler', () => ({
    __esModule: true,
    default: {
        handle: (...args) => mockHandle(...args),
    },
}));

const Thrower = () => {
    throw new Error('Boom goes the dynamite');
};

describe('ErrorBoundary', () => {
    const originalConsoleError = console.error;
    const originalLocation = window.location;

    beforeAll(() => {
        console.error = jest.fn();
        delete window.location;
        window.location = {
            reload: jest.fn(),
            href: '',
        };
    });

    afterAll(() => {
        console.error = originalConsoleError;
        window.location = originalLocation;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders fallback UI and logs error when child throws', () => {
        const onError = jest.fn();

        render(
            <ErrorBoundary onError={onError}>
                <Thrower />
            </ErrorBoundary>
        );

        expect(
            screen.getByText(/Oops! Something went wrong/i)
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Something unexpected happened/i)
        ).toBeInTheDocument();
        expect(mockHandle).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
            showToast: false,
            context: 'React Component',
            severity: 'error',
        }));
        expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
            componentStack: expect.any(String),
        }));
    });

    it('invokes onReset when Try Again button is clicked', () => {
        const onReset = jest.fn();

        render(
            <ErrorBoundary onReset={onReset}>
                <Thrower />
            </ErrorBoundary>
        );

        fireEvent.click(screen.getByRole('button', { name: /try again/i }));

        expect(onReset).toHaveBeenCalled();
    });

    it('reloads and navigates when action buttons are pressed', () => {
        render(
            <ErrorBoundary>
                <Thrower />
            </ErrorBoundary>
        );

        fireEvent.click(screen.getByRole('button', { name: /refresh page/i }));
        expect(window.location.reload).toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /go home/i }));
        expect(window.location.href).toBe('/');
    });
});

