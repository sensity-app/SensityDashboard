import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DeviceCard from '../../components/DeviceCard';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, fallback) => fallback || key
    })
}));

const mockDevice = {
    id: 1,
    device_id: 'ESP-001',
    name: 'Temperature Sensor',
    status: 'online',
    location_name: 'Office',
    device_type: 'ESP8266',
    ip_address: '192.168.1.100',
    firmware_version: '1.2.0',
    last_seen: new Date().toISOString(),
    sensors: [
        {
            id: 1,
            sensor_name: 'temperature',
            latest_value: 23.5,
            unit: '°C'
        },
        {
            id: 2,
            sensor_name: 'humidity',
            latest_value: 65,
            unit: '%'
        }
    ]
};

describe('DeviceCard Component', () => {
    it('should render device name', () => {
        render(<DeviceCard device={mockDevice} />);

        expect(screen.getByText('Temperature Sensor')).toBeInTheDocument();
    });

    it('should display online status with green indicator', () => {
        render(<DeviceCard device={mockDevice} />);

        const statusIndicator = screen.getByText(/online/i);
        expect(statusIndicator).toBeInTheDocument();
        expect(statusIndicator).toHaveClass('status-online');
    });

    it('should display offline status with red indicator', () => {
        const offlineDevice = { ...mockDevice, status: 'offline' };
        render(<DeviceCard device={offlineDevice} />);

        const statusIndicator = screen.getByText(/offline/i);
        expect(statusIndicator).toBeInTheDocument();
        expect(statusIndicator).toHaveClass('status-offline');
    });

    it('should show device location', () => {
        render(<DeviceCard device={mockDevice} />);

        expect(screen.getByText('Office')).toBeInTheDocument();
    });

    it('should display device ID', () => {
        render(<DeviceCard device={mockDevice} />);

        expect(screen.getByText('ESP-001')).toBeInTheDocument();
    });

    it('should show sensor readings', () => {
        render(<DeviceCard device={mockDevice} />);

        expect(screen.getByText(/23\.5/)).toBeInTheDocument();
        expect(screen.getByText(/65/)).toBeInTheDocument();
        expect(screen.getByText(/°C/)).toBeInTheDocument();
        expect(screen.getByText(/%/)).toBeInTheDocument();
    });

    it('should call onClick when card is clicked', () => {
        const handleClick = jest.fn();
        render(<DeviceCard device={mockDevice} onClick={handleClick} />);

        const card = screen.getByTestId('device-card');
        fireEvent.click(card);

        expect(handleClick).toHaveBeenCalledWith(mockDevice);
    });

    it('should display firmware version', () => {
        render(<DeviceCard device={mockDevice} />);

        expect(screen.getByText(/1\.2\.0/)).toBeInTheDocument();
    });

    it('should show last seen timestamp', () => {
        render(<DeviceCard device={mockDevice} />);

        expect(screen.getByText(/last seen/i)).toBeInTheDocument();
    });

    it('should display device type', () => {
        render(<DeviceCard device={mockDevice} />);

        expect(screen.getByText('ESP8266')).toBeInTheDocument();
    });

    it('should show action buttons when provided', () => {
        const onEdit = jest.fn();
        const onDelete = jest.fn();

        render(
            <DeviceCard
                device={mockDevice}
                onEdit={onEdit}
                onDelete={onDelete}
            />
        );

        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('should call onEdit when edit button is clicked', () => {
        const onEdit = jest.fn();
        render(<DeviceCard device={mockDevice} onEdit={onEdit} />);

        const editButton = screen.getByRole('button', { name: /edit/i });
        fireEvent.click(editButton);

        expect(onEdit).toHaveBeenCalledWith(mockDevice);
    });

    it('should call onDelete when delete button is clicked', () => {
        const onDelete = jest.fn();
        render(<DeviceCard device={mockDevice} onDelete={onDelete} />);

        const deleteButton = screen.getByRole('button', { name: /delete/i });
        fireEvent.click(deleteButton);

        expect(onDelete).toHaveBeenCalledWith(mockDevice);
    });

    it('should show warning icon for offline devices', () => {
        const offlineDevice = { ...mockDevice, status: 'offline' };
        render(<DeviceCard device={offlineDevice} />);

        expect(screen.getByTestId('warning-icon')).toBeInTheDocument();
    });

    it('should display alert count badge', () => {
        const deviceWithAlerts = { ...mockDevice, active_alerts: 3 };
        render(<DeviceCard device={deviceWithAlerts} />);

        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should show no data message when sensors are empty', () => {
        const deviceNoSensors = { ...mockDevice, sensors: [] };
        render(<DeviceCard device={deviceNoSensors} />);

        expect(screen.getByText(/no sensor data/i)).toBeInTheDocument();
    });

    it('should apply compact style when compact prop is true', () => {
        render(<DeviceCard device={mockDevice} compact />);

        const card = screen.getByTestId('device-card');
        expect(card).toHaveClass('compact');
    });

    it('should highlight card when selected', () => {
        render(<DeviceCard device={mockDevice} selected />);

        const card = screen.getByTestId('device-card');
        expect(card).toHaveClass('selected');
    });

    it('should disable card interactions when disabled', () => {
        const handleClick = jest.fn();
        render(<DeviceCard device={mockDevice} onClick={handleClick} disabled />);

        const card = screen.getByTestId('device-card');
        fireEvent.click(card);

        expect(handleClick).not.toHaveBeenCalled();
        expect(card).toHaveClass('disabled');
    });

    it('should show loading skeleton when loading prop is true', () => {
        render(<DeviceCard loading />);

        expect(screen.getByTestId('skeleton-loader')).toBeInTheDocument();
    });

    it('should display IP address', () => {
        render(<DeviceCard device={mockDevice} showIpAddress />);

        expect(screen.getByText('192.168.1.100')).toBeInTheDocument();
    });

    it('should format large sensor values', () => {
        const deviceLargeValue = {
            ...mockDevice,
            sensors: [{
                id: 1,
                sensor_name: 'distance',
                latest_value: 1234567.89,
                unit: 'mm'
            }]
        };

        render(<DeviceCard device={deviceLargeValue} />);

        // Should format to readable number
        expect(screen.getByText(/1,234,567\.89/)).toBeInTheDocument();
    });

    it('should show OTA update indicator', () => {
        const deviceUpdating = { ...mockDevice, ota_in_progress: true };
        render(<DeviceCard device={deviceUpdating} />);

        expect(screen.getByText(/updating/i)).toBeInTheDocument();
    });

    it('should display signal strength indicator', () => {
        const deviceWithRSSI = { ...mockDevice, rssi: -65 };
        render(<DeviceCard device={deviceWithRSSI} />);

        expect(screen.getByTestId('signal-strength')).toBeInTheDocument();
    });
});
