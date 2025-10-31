import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import '@testing-library/jest-dom';
import AlertPanel from '../../components/AlertPanel';
import { apiService } from '../../services/api';

jest.mock('../../services/api');
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, fallback) => fallback || key
    })
}));

const mockAlerts = [
    {
        id: 1,
        device_name: 'Temperature Sensor',
        sensor_name: 'temperature',
        severity: 'critical',
        message: 'Critical temperature reached',
        value: 35,
        threshold: 30,
        acknowledged: false,
        created_at: new Date().toISOString()
    },
    {
        id: 2,
        device_name: 'Humidity Sensor',
        sensor_name: 'humidity',
        severity: 'high',
        message: 'High humidity detected',
        value: 85,
        threshold: 80,
        acknowledged: false,
        created_at: new Date().toISOString()
    },
    {
        id: 3,
        device_name: 'Pressure Sensor',
        sensor_name: 'pressure',
        severity: 'medium',
        message: 'Pressure fluctuation',
        acknowledged: true,
        created_at: new Date().toISOString()
    }
];

describe('AlertPanel Component', () => {
    let queryClient;

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } }
        });
        jest.clearAllMocks();
    });

    const renderAlertPanel = (props = {}) => {
        return render(
            <QueryClientProvider client={queryClient}>
                <AlertPanel {...props} />
            </QueryClientProvider>
        );
    };

    it('should render alerts list', async () => {
        apiService.getAlerts = jest.fn().mockResolvedValue({ alerts: mockAlerts });

        renderAlertPanel();

        await waitFor(() => {
            expect(screen.getByText('Temperature Sensor')).toBeInTheDocument();
            expect(screen.getByText('Humidity Sensor')).toBeInTheDocument();
        });
    });

    it('should display severity badges with correct colors', async () => {
        apiService.getAlerts = jest.fn().mockResolvedValue({ alerts: mockAlerts });

        renderAlertPanel();

        await waitFor(() => {
            const criticalBadge = screen.getByText('critical');
            const highBadge = screen.getByText('high');

            expect(criticalBadge).toBeInTheDocument();
            expect(criticalBadge).toHaveClass('severity-critical');
            expect(highBadge).toHaveClass('severity-high');
        });
    });

    it('should filter alerts by severity', async () => {
        apiService.getAlerts = jest.fn().mockResolvedValue({ alerts: mockAlerts });

        renderAlertPanel();

        await waitFor(() => {
            expect(screen.getByText('Temperature Sensor')).toBeInTheDocument();
        });

        const severityFilter = screen.getByLabelText(/severity/i);
        fireEvent.change(severityFilter, { target: { value: 'critical' } });

        await waitFor(() => {
            expect(screen.getByText('Temperature Sensor')).toBeInTheDocument();
            expect(screen.queryByText('Humidity Sensor')).not.toBeInTheDocument();
        });
    });

    it('should filter unacknowledged alerts', async () => {
        apiService.getAlerts = jest.fn().mockResolvedValue({ alerts: mockAlerts });

        renderAlertPanel();

        const unacknowledgedFilter = screen.getByLabelText(/unacknowledged only/i);
        fireEvent.click(unacknowledgedFilter);

        await waitFor(() => {
            expect(screen.getByText('Temperature Sensor')).toBeInTheDocument();
            expect(screen.queryByText('Pressure Sensor')).not.toBeInTheDocument();
        });
    });

    it('should acknowledge alert', async () => {
        apiService.getAlerts = jest.fn().mockResolvedValue({ alerts: mockAlerts });
        apiService.acknowledgeAlert = jest.fn().mockResolvedValue({ success: true });

        renderAlertPanel();

        await waitFor(() => {
            expect(screen.getByText('Temperature Sensor')).toBeInTheDocument();
        });

        const acknowledgeButton = screen.getAllByRole('button', { name: /acknowledge/i })[0];
        fireEvent.click(acknowledgeButton);

        await waitFor(() => {
            expect(apiService.acknowledgeAlert).toHaveBeenCalledWith(1);
        });
    });

    it('should show acknowledge confirmation dialog', async () => {
        apiService.getAlerts = jest.fn().mockResolvedValue({ alerts: mockAlerts });

        renderAlertPanel({ showAcknowledgeDialog: true });

        await waitFor(() => {
            const button = screen.getAllByRole('button', { name: /acknowledge/i })[0];
            fireEvent.click(button);
        });

        expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    it('should bulk acknowledge alerts', async () => {
        apiService.getAlerts = jest.fn().mockResolvedValue({ alerts: mockAlerts });
        apiService.bulkAcknowledgeAlerts = jest.fn().mockResolvedValue({ success: true });

        renderAlertPanel();

        await waitFor(() => {
            expect(screen.getByText('Temperature Sensor')).toBeInTheDocument();
        });

        // Select multiple alerts
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]);
        fireEvent.click(checkboxes[1]);

        const bulkAcknowledgeButton = screen.getByRole('button', { name: /acknowledge selected/i });
        fireEvent.click(bulkAcknowledgeButton);

        await waitFor(() => {
            expect(apiService.bulkAcknowledgeAlerts).toHaveBeenCalledWith([1, 2]);
        });
    });

    it('should display alert details on click', async () => {
        apiService.getAlerts = jest.fn().mockResolvedValue({ alerts: mockAlerts });

        renderAlertPanel();

        await waitFor(() => {
            const alertRow = screen.getByText('Temperature Sensor');
            fireEvent.click(alertRow);
        });

        expect(screen.getByText('Alert Details')).toBeInTheDocument();
        expect(screen.getByText(/value: 35/i)).toBeInTheDocument();
        expect(screen.getByText(/threshold: 30/i)).toBeInTheDocument();
    });

    it('should sort alerts by date', async () => {
        apiService.getAlerts = jest.fn().mockResolvedValue({ alerts: mockAlerts });

        renderAlertPanel();

        await waitFor(() => {
            const sortButton = screen.getByRole('button', { name: /sort/i });
            fireEvent.click(sortButton);
        });

        const sortOptions = screen.getByRole('option', { name: /date/i });
        fireEvent.click(sortOptions);

        // Verify sorting applied
        expect(apiService.getAlerts).toHaveBeenCalledWith(
            expect.objectContaining({ sort: 'date' })
        );
    });

    it('should paginate alerts', async () => {
        const manyAlerts = Array(50).fill(null).map((_, i) => ({
            id: i + 1,
            device_name: `Device ${i + 1}`,
            severity: 'medium',
            message: `Alert ${i + 1}`,
            acknowledged: false,
            created_at: new Date().toISOString()
        }));

        apiService.getAlerts = jest.fn().mockResolvedValue({
            alerts: manyAlerts.slice(0, 20),
            total: 50
        });

        renderAlertPanel();

        await waitFor(() => {
            expect(screen.getByText('Device 1')).toBeInTheDocument();
        });

        const nextButton = screen.getByRole('button', { name: /next/i });
        fireEvent.click(nextButton);

        await waitFor(() => {
            expect(apiService.getAlerts).toHaveBeenCalledWith(
                expect.objectContaining({ page: 2 })
            );
        });
    });

    it('should handle empty alerts', async () => {
        apiService.getAlerts = jest.fn().mockResolvedValue({ alerts: [] });

        renderAlertPanel();

        await waitFor(() => {
            expect(screen.getByText(/no alerts/i)).toBeInTheDocument();
        });
    });

    it('should display loading state', () => {
        apiService.getAlerts = jest.fn(() => new Promise(() => { }));

        renderAlertPanel();

        expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should handle API errors', async () => {
        apiService.getAlerts = jest.fn().mockRejectedValue(new Error('API Error'));

        renderAlertPanel();

        await waitFor(() => {
            expect(screen.getByText(/error/i)).toBeInTheDocument();
        });
    });

    it('should show alert count badge', async () => {
        apiService.getAlerts = jest.fn().mockResolvedValue({ alerts: mockAlerts });

        renderAlertPanel({ showCount: true });

        await waitFor(() => {
            expect(screen.getByText('3')).toBeInTheDocument();
        });
    });

    it('should auto-refresh alerts', async () => {
        jest.useFakeTimers();
        apiService.getAlerts = jest.fn().mockResolvedValue({ alerts: mockAlerts });

        renderAlertPanel({ autoRefresh: true, refreshInterval: 10000 });

        await waitFor(() => {
            expect(apiService.getAlerts).toHaveBeenCalledTimes(1);
        });

        jest.advanceTimersByTime(10000);

        await waitFor(() => {
            expect(apiService.getAlerts).toHaveBeenCalledTimes(2);
        });

        jest.useRealTimers();
    });

    it('should play sound for critical alerts', async () => {
        const mockPlay = jest.fn();
        window.HTMLMediaElement.prototype.play = mockPlay;

        apiService.getAlerts = jest.fn().mockResolvedValue({
            alerts: [mockAlerts[0]] // Critical alert only
        });

        renderAlertPanel({ soundEnabled: true });

        await waitFor(() => {
            expect(mockPlay).toHaveBeenCalled();
        });
    });
});
