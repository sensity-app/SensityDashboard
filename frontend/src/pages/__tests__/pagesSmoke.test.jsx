import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import AlertsPage from '../AlertsEnhanced';
import AuditLogPage from '../AuditLog';
import Dashboard from '../Dashboard';
import DeviceDetail from '../DeviceDetail';
import DeviceManagement from '../DeviceManagement';
import FirmwareBuilder from '../FirmwareBuilder';
import ForgotPassword from '../ForgotPassword';
import InitialSetup from '../InitialSetup';
import LicenseManagement from '../LicenseManagement';
import Login from '../Login';
import NotificationTemplates from '../NotificationTemplates';
import RateLimitManagement from '../RateLimitManagement';
import Register from '../Register';
import ResetPassword from '../ResetPassword';
import SensorRulesPage from '../SensorRules';
import SerialMonitor from '../SerialMonitor';
import Settings from '../Settings';
import UserManagement from '../UserManagement';
import WifiManagement from '../WifiManagement';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, fallback, options) => {
            if (typeof fallback === 'string') {
                return fallback;
            }
            if (options && typeof options.defaultValue === 'string') {
                return options.defaultValue;
            }
            return typeof key === 'string' ? key : '';
        },
        i18n: {
            language: 'en',
            changeLanguage: jest.fn()
        }
    }),
    Trans: ({ children }) => (typeof children === 'function' ? children({}) : children)
}));

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        success: jest.fn(),
        error: jest.fn(),
        loading: jest.fn(),
        dismiss: jest.fn(),
        promise: jest.fn()
    }
}));

jest.mock('../../services/websocket', () => ({
    websocketService: {
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
    }
}));

jest.mock('../../components/HistoricalChart', () => () => <div data-testid="historical-chart" />);
jest.mock('../../components/SensorRuleEditor', () => () => <div data-testid="sensor-rule-editor" />);
jest.mock('../../components/OTAManager', () => () => <div data-testid="ota-manager" />);
jest.mock('../../components/SensorManagerModal', () => ({ isOpen }) =>
    isOpen ? <div data-testid="sensor-manager-modal" /> : null
);
jest.mock('../../components/LicenseManagerPanel', () => () => <div>License Manager Panel</div>);
jest.mock('../../components/ProtocolSettingsManager', () => () => <div>Protocol Settings Manager</div>);
jest.mock('../../components/WebFlasher', () => () => <div data-testid="web-flasher" />);

jest.mock('../../services/api', () => {
    const defaultDevice = {
        id: 'device-1',
        name: 'Test Device',
        status: 'online',
        last_heartbeat: new Date().toISOString(),
        firmware_version: '1.0.0',
        target_firmware_version: '1.0.0',
        wifi_signal_strength: -60,
        location_name: 'Main Site',
        uptime_seconds: 3600,
        total_runtime_seconds: 7200
    };

    const baseApi = {};
    const apiService = new Proxy(baseApi, {
        get(target, prop) {
            if (!target[prop]) {
                target[prop] = jest.fn(() => Promise.resolve({}));
            }
            return target[prop];
        }
    });

    apiService.getDevices.mockResolvedValue({
        devices: [
            {
                ...defaultDevice,
                wifi_ssid: 'Office',
                wifi_password: 'secret'
            }
        ]
    });
    apiService.getDevice.mockResolvedValue({ device: defaultDevice });
    apiService.getDeviceSensors.mockResolvedValue({
        sensors: [
            { id: 'sensor-1', pin: 'A0', name: 'Temperature', sensor_type: 'temperature', enabled: true }
        ]
    });
    apiService.getDeviceStats.mockResolvedValue({ stats: { sensors: [] } });
    apiService.getDeviceAlerts.mockResolvedValue({ alerts: [] });
    apiService.getLatestTelemetry.mockResolvedValue({ telemetry: [] });
    apiService.getRecentAlerts.mockResolvedValue({ alerts: [] });
    apiService.acknowledgeAlert.mockResolvedValue({});
    apiService.resolveAlert.mockResolvedValue({});
    apiService.getAlerts.mockResolvedValue([]);
    apiService.getLocations.mockResolvedValue({ locations: [{ id: 'loc-1', name: 'Main Site' }] });
    apiService.getDeviceGroups.mockResolvedValue({ groups: [] });
    apiService.getDeviceTags.mockResolvedValue({ tags: [] });
    apiService.getSensorTypes.mockResolvedValue({ sensor_types: [] });
    apiService.getAllSensorRules.mockResolvedValue([]);
    apiService.getThresholdSuggestions.mockResolvedValue({ suggested_min: 10, suggested_max: 90 });
    apiService.updateSensorRule.mockResolvedValue({});
    apiService.createOrUpdateSensorRule.mockResolvedValue({});
    apiService.deleteSensorRule.mockResolvedValue({});
    apiService.getNotificationTemplates.mockResolvedValue({ templates: [] });
    apiService.getTemplateVariables.mockResolvedValue({ variables: {} });
    apiService.createNotificationTemplate.mockResolvedValue({});
    apiService.updateNotificationTemplate.mockResolvedValue({});
    apiService.deleteNotificationTemplate.mockResolvedValue({});
    apiService.testNotificationTemplate.mockResolvedValue({});
    apiService.getUsers.mockResolvedValue({ users: [] });
    apiService.deleteUser.mockResolvedValue({});
    apiService.getInvitations.mockResolvedValue({ invitations: [] });
    apiService.cancelInvitation.mockResolvedValue({});
    apiService.getUserLocations.mockResolvedValue({ locations: [] });
    apiService.inviteUser.mockResolvedValue({});
    apiService.updateUser.mockResolvedValue({});
    apiService.updateUserLocations.mockResolvedValue({});
    apiService.initialSetup.mockResolvedValue({ user: { id: 'user-1' }, token: 'token' });
    apiService.verifyInvitation.mockResolvedValue({
        email: 'invitee@sensity.app',
        fullName: 'Invitee User',
        role: 'admin',
        expiresAt: new Date().toISOString()
    });
    apiService.register.mockResolvedValue({});
    apiService.getAuditLogs.mockResolvedValue({
        logs: [
            {
                id: 1,
                action_type: 'login',
                user_email: 'admin@sensity.app',
                created_at: new Date().toISOString()
            }
        ]
    });
    apiService.forgotPassword.mockResolvedValue({});
    apiService.resetPassword.mockResolvedValue({});
    apiService.getRateLimitStats.mockResolvedValue({
        stats: {
            totalBlockedUsers: 0,
            activeRateLimitedUsers: 0,
            totalRateLimitKeys: 0
        }
    });
    apiService.getRateLimitConfig.mockResolvedValue({
        limits: {
            admin: { points: 100, duration: 60, blockDuration: 300 }
        },
        endpointLimits: {
            '/api/devices': { points: 200, duration: 60, blockDuration: 600 }
        }
    });
    apiService.getBlockedUsers.mockResolvedValue({ blocked: [] });
    apiService.resetRateLimit.mockResolvedValue({});
    apiService.updateRoleLimitConfig.mockResolvedValue({});
    apiService.updateEndpointLimitConfig.mockResolvedValue({});
    apiService.getSettings.mockResolvedValue({
        system: { siteName: 'Sensity', adminEmail: 'admin@sensity.app' },
        branding: { companyName: 'Sensity', primaryColor: '#2563eb' }
    });
    apiService.login.mockResolvedValue({ user: { id: 'user-1' }, token: 'token' });
    apiService.updateSettings.mockResolvedValue({});
    apiService.uploadLogo.mockResolvedValue({});
    apiService.removeLogo.mockResolvedValue({});
    apiService.validateEnvironmentVariables.mockResolvedValue({ valid: true, errors: [], warnings: [] });
    apiService.updateEnvironmentVariables.mockResolvedValue({});
    apiService.getSystemVersion.mockResolvedValue({ version: '1.0.0' });
    apiService.getUpdateStatus.mockResolvedValue({ status: 'idle' });
    apiService.getUpdateProgress.mockResolvedValue({ progress: 0 });
    apiService.updatePlatform.mockResolvedValue({});
    apiService.getSystemInfo.mockResolvedValue({ os: 'Linux', nodeVersion: '18.x' });
    apiService.getSystemHealth.mockResolvedValue({ status: 'healthy' });
    apiService.getEnvironmentVariables.mockResolvedValue({ variables: {} });
    apiService.createLocation.mockResolvedValue({ location: { id: 'loc-2', name: 'New Location' } });
    apiService.createDevice.mockResolvedValue({ device: defaultDevice });
    apiService.deleteDevice.mockResolvedValue({});
    apiService.createSensor.mockResolvedValue({});
    apiService.updateSensor.mockResolvedValue({});
    apiService.updateDevice.mockResolvedValue({});
    apiService.triggerOTA.mockResolvedValue({});
    apiService.otaRebuild.mockResolvedValue({});
    apiService.updateDeviceConfig.mockResolvedValue({});

    return { apiService };
});

const renderWithProviders = (ui, { route = '/' } = {}) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false
            }
        }
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </QueryClientProvider>
    );
};

beforeAll(() => {
    global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
            success: true,
            sensors: {},
            pin_mapping: {},
            available_pins: { digital: [], analog: [] }
        }),
        blob: async () => new Blob()
    }));

    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation((query) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: jest.fn(),
            removeListener: jest.fn(),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            dispatchEvent: jest.fn()
        }))
    });

    Object.defineProperty(window.navigator, 'serial', {
        configurable: true,
        value: {
            requestPort: jest.fn()
        }
    });

    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();
    window.URL.createObjectURL = jest.fn(() => 'blob:mock');
    window.URL.revokeObjectURL = jest.fn();
});

afterEach(() => {
    jest.clearAllMocks();
});

describe('Page smoke tests', () => {
    it('renders Alerts page', async () => {
        renderWithProviders(<AlertsPage />);
        await screen.findByText('Alerts');
    });

    it('renders Audit Log page', async () => {
        renderWithProviders(<AuditLogPage />);
        await screen.findByText('Audit Log');
    });

    it('renders Dashboard page', async () => {
        renderWithProviders(<Dashboard />);
        await screen.findByText('Dashboard');
    });

    it('renders Device Detail page', async () => {
        renderWithProviders(
            <Routes>
                <Route path="/devices/:id" element={<DeviceDetail />} />
            </Routes>,
            { route: '/devices/device-1' }
        );
        await screen.findByText('Test Device');
    });

    it('renders Device Management page', async () => {
        renderWithProviders(<DeviceManagement />);
        await screen.findByText('Devices');
    });

    it('renders Firmware Builder page', async () => {
        renderWithProviders(<FirmwareBuilder />);
        await screen.findByText('Device Provisioning & Firmware Builder');
    });

    it('renders Forgot Password page', async () => {
        renderWithProviders(<ForgotPassword />);
        await screen.findByText('forgotPassword.form.title');
    });

    it('renders Initial Setup page', async () => {
        renderWithProviders(<InitialSetup onSetupComplete={jest.fn()} />);
        await screen.findByText('Welcome to IoT Monitoring');
    });

    it('renders License Management page', async () => {
        renderWithProviders(<LicenseManagement />);
        await screen.findByText('License Manager Panel');
    });

    it('renders Login page', async () => {
        renderWithProviders(<Login onLogin={jest.fn()} />);
        await screen.findByText('Welcome back');
    });

    it('renders Notification Templates page', async () => {
        renderWithProviders(<NotificationTemplates />);
        await screen.findByText('Notification Templates');
    });

    it('renders Rate Limit Management page', async () => {
        renderWithProviders(<RateLimitManagement />);
        await screen.findByText('rateLimit.title');
    });

    it('renders Register page', async () => {
        renderWithProviders(
            <Routes>
                <Route path="/register" element={<Register />} />
            </Routes>,
            { route: '/register?token=test-token' }
        );
        await screen.findByText('Create your account');
    });

    it('renders Reset Password page', async () => {
        renderWithProviders(
            <Routes>
                <Route path="/reset-password" element={<ResetPassword />} />
            </Routes>,
            { route: '/reset-password?token=reset-token' }
        );
        await screen.findByText('resetPassword.form.title');
    });

    it('renders Sensor Rules page', async () => {
        renderWithProviders(<SensorRulesPage />);
        await screen.findByText('Sensor Rules');
    });

    it('renders Serial Monitor page', async () => {
        renderWithProviders(<SerialMonitor />);
        await screen.findByText('serialMonitor.title');
    });

    it('renders Settings page', async () => {
        renderWithProviders(
            <Routes>
                <Route path="/settings" element={<Settings />} />
            </Routes>,
            { route: '/settings' }
        );
        await screen.findByText('System Settings');
    });

    it('renders User Management page', async () => {
        renderWithProviders(<UserManagement />);
        await screen.findByText('User Management');
    });

    it('renders WiFi Management page', async () => {
        renderWithProviders(<WifiManagement />);
        await screen.findByText('WiFi Management');
    });
});

