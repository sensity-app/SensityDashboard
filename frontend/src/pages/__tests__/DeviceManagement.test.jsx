import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { MemoryRouter } from 'react-router-dom';
import DeviceManagement from '../DeviceManagement';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, fallback) => fallback || key,
    }),
}));

const mockQueries = {
    getDevices: jest.fn().mockResolvedValue({ devices: [] }),
    getLocations: jest.fn().mockResolvedValue({ locations: [] }),
    getDeviceGroups: jest.fn().mockResolvedValue({ groups: [] }),
    getDeviceTags: jest.fn().mockResolvedValue({ tags: [] }),
};

jest.mock('../../services/api', () => ({
    apiService: {
        getDevices: () => mockQueries.getDevices(),
        getLocations: () => mockQueries.getLocations(),
        getDeviceGroups: () => mockQueries.getDeviceGroups(),
        getDeviceTags: () => mockQueries.getDeviceTags(),
        deleteDevice: jest.fn(),
        createDevice: jest.fn(),
        updateDevice: jest.fn(),
        getDeviceSensors: jest.fn().mockResolvedValue({ sensors: [] }),
        createSensor: jest.fn(),
        updateSensor: jest.fn(),
        triggerOTA: jest.fn(),
    },
}));

describe('DeviceManagement', () => {
    it('renders without crashing', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
            },
        });

        const { findByText } = render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={['/devices']}>
                    <DeviceManagement />
                </MemoryRouter>
            </QueryClientProvider>
        );

        await waitFor(() => expect(mockQueries.getDevices).toHaveBeenCalled());
        await findByText('Manage Devices');
    });
});
