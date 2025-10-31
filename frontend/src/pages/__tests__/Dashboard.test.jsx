import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import Dashboard from '../Dashboard';
import { apiService } from '../../services/api';

// Mock API service
jest.mock('../../services/api');

// Mock i18n
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, fallback) => fallback || key,
        i18n: { language: 'en' }
    })
}));

const mockDashboardData = {
    statistics: {
        total_devices: 150,
        online_devices: 142,
        offline_devices: 8,
        total_alerts: 23,
        critical_alerts: 5,
        unacknowledged_alerts: 12
    },
    recentAlerts: [
        {
            id: 1,
            device_name: 'Temperature Sensor 1',
            sensor_name: 'temperature',
            severity: 'high',
            message: 'Temperature exceeded threshold',
            created_at: new Date().toISOString()
        },
        {
            id: 2,
            device_name: 'Humidity Sensor 2',
            sensor_name: 'humidity',
            severity: 'medium',
            message: 'Humidity below normal',
            created_at: new Date().toISOString()
        }
    ],
    devicesByStatus: {
        online: 142,
        offline: 8
    },
    alertsBySeverity: {
        critical: 5,
        high: 8,
        medium: 7,
        low: 3
    }
};

describe('Dashboard Component', () => {
    let queryClient;

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false }
            }
        });
        jest.clearAllMocks();
    });

    const renderDashboard = () => {
        return render(
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <Dashboard />
                </BrowserRouter>
            </QueryClientProvider>
        );
    };

    it('should render dashboard with loading state', () => {
        apiService.getDashboardData = jest.fn(() => new Promise(() => { }));

        renderDashboard();

        expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should display dashboard statistics', async () => {
        apiService.getDashboardData = jest.fn().mockResolvedValue(mockDashboardData);

        renderDashboard();

        await waitFor(() => {
            expect(screen.getByText('150')).toBeInTheDocument(); // Total devices
            expect(screen.getByText('142')).toBeInTheDocument(); // Online devices
            expect(screen.getByText('23')).toBeInTheDocument(); // Total alerts
        });
    });

    it('should display critical alerts count prominently', async () => {
        apiService.getDashboardData = jest.fn().mockResolvedValue(mockDashboardData);

        renderDashboard();

        await waitFor(() => {
            const criticalAlerts = screen.getByText('5');
            expect(criticalAlerts).toBeInTheDocument();
        });
    });

    it('should render recent alerts list', async () => {
        apiService.getDashboardData = jest.fn().mockResolvedValue(mockDashboardData);

        renderDashboard();

        await waitFor(() => {
            expect(screen.getByText('Temperature Sensor 1')).toBeInTheDocument();
            expect(screen.getByText('Humidity Sensor 2')).toBeInTheDocument();
        });
    });

    it('should handle empty alerts', async () => {
        apiService.getDashboardData = jest.fn().mockResolvedValue({
            ...mockDashboardData,
            recentAlerts: []
        });

        renderDashboard();

        await waitFor(() => {
            expect(screen.getByText(/no recent alerts/i)).toBeInTheDocument();
        });
    });

    it('should display device status chart', async () => {
        apiService.getDashboardData = jest.fn().mockResolvedValue(mockDashboardData);

        renderDashboard();

        await waitFor(() => {
            expect(screen.getByText(/device status/i)).toBeInTheDocument();
        });
    });

    it('should display alerts by severity chart', async () => {
        apiService.getDashboardData = jest.fn().mockResolvedValue(mockDashboardData);

        renderDashboard();

        await waitFor(() => {
            expect(screen.getByText(/alerts by severity/i)).toBeInTheDocument();
        });
    });

    it('should handle API errors gracefully', async () => {
        apiService.getDashboardData = jest.fn().mockRejectedValue(
            new Error('Failed to fetch dashboard data')
        );

        renderDashboard();

        await waitFor(() => {
            expect(screen.getByText(/error/i)).toBeInTheDocument();
        });
    });

    it('should refresh data when refresh button is clicked', async () => {
        apiService.getDashboardData = jest.fn().mockResolvedValue(mockDashboardData);

        renderDashboard();

        await waitFor(() => {
            expect(screen.getByText('150')).toBeInTheDocument();
        });

        const refreshButton = screen.getByRole('button', { name: /refresh/i });
        fireEvent.click(refreshButton);

        await waitFor(() => {
            expect(apiService.getDashboardData).toHaveBeenCalledTimes(2);
        });
    });

    it('should navigate to devices page when clicking device stats', async () => {
        apiService.getDashboardData = jest.fn().mockResolvedValue(mockDashboardData);

        renderDashboard();

        await waitFor(() => {
            const deviceCard = screen.getByText(/total devices/i).closest('div');
            if (deviceCard) {
                fireEvent.click(deviceCard);
            }
        });

        // Navigation would be tested with react-router mock
    });

    it('should show percentage of offline devices', async () => {
        apiService.getDashboardData = jest.fn().mockResolvedValue(mockDashboardData);

        renderDashboard();

        await waitFor(() => {
            // 8 offline out of 150 total = 5.3%
            expect(screen.getByText(/5\.3%/)).toBeInTheDocument();
        });
    });

    it('should display last updated timestamp', async () => {
        apiService.getDashboardData = jest.fn().mockResolvedValue(mockDashboardData);

        renderDashboard();

        await waitFor(() => {
            expect(screen.getByText(/last updated/i)).toBeInTheDocument();
        });
    });

    it('should auto-refresh data every 30 seconds', async () => {
        jest.useFakeTimers();
        apiService.getDashboardData = jest.fn().mockResolvedValue(mockDashboardData);

        renderDashboard();

        await waitFor(() => {
            expect(apiService.getDashboardData).toHaveBeenCalledTimes(1);
        });

        // Fast-forward 30 seconds
        jest.advanceTimersByTime(30000);

        await waitFor(() => {
            expect(apiService.getDashboardData).toHaveBeenCalledTimes(2);
        });

        jest.useRealTimers();
    });
});
