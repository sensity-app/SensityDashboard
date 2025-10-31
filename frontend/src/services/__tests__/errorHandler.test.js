import errorHandler from '../errorHandler';

const toastError = jest.fn();

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        error: (...args) => toastError(...args),
        success: jest.fn(),
        loading: jest.fn(),
        dismiss: jest.fn(),
        promise: jest.fn(),
    },
}));

describe('errorHandler service', () => {
    beforeEach(() => {
        toastError.mockClear();
        errorHandler.errorLog = [];
    });

    it('handles API not found errors with friendly messaging', () => {
        const apiError = {
            response: {
                status: 404,
                data: { error: 'Device not found' },
            },
            message: 'Request failed with status code 404',
        };

        const result = errorHandler.handle(apiError, { context: 'Fetch Device' });

        expect(result).toMatchObject({
            type: 'not_found_error',
            status: 404,
            userMessage: 'Device not found',
            context: 'Fetch Device',
            isApiError: true,
        });
        expect(toastError).toHaveBeenCalledWith(
            'Device not found',
            expect.objectContaining({ duration: 4000 })
        );
    });

    it('handles network errors and logs appropriately', () => {
        const networkError = {
            request: {},
            message: 'Network Error',
        };

        const result = errorHandler.handle(networkError, { context: 'Load Dashboard' });

        expect(result).toMatchObject({
            type: 'network_error',
            userMessage: 'Network error. Please check your internet connection.',
            context: 'Load Dashboard',
            isNetworkError: true,
        });
        expect(toastError).toHaveBeenCalledWith(
            'Network error. Please check your internet connection.',
            expect.any(Object)
        );
    });

    it('supports JavaScript errors without showing toast when disabled', () => {
        const jsError = new Error('Unexpected failure');

        const result = errorHandler.handle(jsError, {
            context: 'Render Component',
            showToast: false,
        });

        expect(result).toMatchObject({
            type: 'javascript_error',
            userMessage: 'An unexpected error occurred. Please refresh the page.',
            context: 'Render Component',
            isJavaScriptError: true,
        });
        expect(toastError).not.toHaveBeenCalled();
    });
});

