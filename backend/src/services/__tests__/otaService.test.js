const otaService = require('../../services/otaService');
const db = require('../../models/database');
const mqtt = require('mqtt');

// Mock dependencies
jest.mock('../../models/database');
jest.mock('mqtt');

describe('OTA Service', () => {
    let mockMqttClient;

    beforeEach(() => {
        jest.clearAllMocks();

        mockMqttClient = {
            publish: jest.fn((topic, message, callback) => callback && callback()),
            subscribe: jest.fn(),
            on: jest.fn(),
            end: jest.fn()
        };

        mqtt.connect.mockReturnValue(mockMqttClient);
    });

    describe('triggerOTA', () => {
        it('should trigger OTA update for online device', async () => {
            const deviceId = 'ESP-001';
            const firmwareVersion = '1.2.0';
            const firmwareUrl = 'https://example.com/firmware/1.2.0.bin';

            db.query
                .mockResolvedValueOnce({ // Get device
                    rows: [{
                        id: 1,
                        device_id: deviceId,
                        status: 'online'
                    }]
                })
                .mockResolvedValueOnce({ // Log OTA attempt
                    rows: [{ id: 1 }]
                });

            const result = await otaService.triggerOTA(deviceId, firmwareVersion, firmwareUrl);

            expect(result.success).toBe(true);
            expect(mockMqttClient.publish).toHaveBeenCalled();
        });

        it('should reject OTA for offline device', async () => {
            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    device_id: 'ESP-001',
                    status: 'offline'
                }]
            });

            await expect(
                otaService.triggerOTA('ESP-001', '1.2.0', 'https://example.com/firmware.bin')
            ).rejects.toThrow('Device is offline');
        });

        it('should reject OTA for non-existent device', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await expect(
                otaService.triggerOTA('UNKNOWN', '1.2.0', 'https://example.com/firmware.bin')
            ).rejects.toThrow('Device not found');
        });

        it('should validate firmware URL', async () => {
            await expect(
                otaService.triggerOTA('ESP-001', '1.2.0', 'invalid-url')
            ).rejects.toThrow('Invalid firmware URL');
        });

        it('should log OTA attempt in database', async () => {
            db.query
                .mockResolvedValueOnce({
                    rows: [{ id: 1, device_id: 'ESP-001', status: 'online' }]
                })
                .mockResolvedValueOnce({ rows: [{ id: 1 }] });

            await otaService.triggerOTA('ESP-001', '1.2.0', 'https://example.com/firmware.bin');

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO ota_updates'),
                expect.any(Array)
            );
        });
    });

    describe('getOTAStatus', () => {
        it('should return OTA update status', async () => {
            const mockStatus = {
                id: 1,
                device_id: 'ESP-001',
                firmware_version: '1.2.0',
                status: 'in_progress',
                started_at: new Date(),
                progress: 45
            };

            db.query.mockResolvedValue({ rows: [mockStatus] });

            const result = await otaService.getOTAStatus('ESP-001');

            expect(result).toBeDefined();
            expect(result.status).toBe('in_progress');
            expect(result.progress).toBe(45);
        });

        it('should return null for device with no OTA updates', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const result = await otaService.getOTAStatus('ESP-001');

            expect(result).toBeNull();
        });
    });

    describe('updateOTAProgress', () => {
        it('should update OTA progress', async () => {
            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    progress: 75,
                    status: 'in_progress'
                }]
            });

            const result = await otaService.updateOTAProgress('ESP-001', 75);

            expect(result.progress).toBe(75);
            expect(db.query).toHaveBeenCalled();
        });

        it('should validate progress value', async () => {
            await expect(
                otaService.updateOTAProgress('ESP-001', 150)
            ).rejects.toThrow('Progress must be between 0 and 100');
        });
    });

    describe('completeOTA', () => {
        it('should mark OTA as completed', async () => {
            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    status: 'completed',
                    completed_at: new Date()
                }]
            });

            const result = await otaService.completeOTA('ESP-001', true);

            expect(result.status).toBe('completed');
            expect(db.query).toHaveBeenCalled();
        });

        it('should mark OTA as failed', async () => {
            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    status: 'failed',
                    error_message: 'Verification failed'
                }]
            });

            const result = await otaService.completeOTA('ESP-001', false, 'Verification failed');

            expect(result.status).toBe('failed');
        });
    });

    describe('getOTAHistory', () => {
        it('should return OTA update history for device', async () => {
            const mockHistory = [
                {
                    id: 1,
                    firmware_version: '1.2.0',
                    status: 'completed',
                    started_at: new Date(),
                    completed_at: new Date()
                },
                {
                    id: 2,
                    firmware_version: '1.1.0',
                    status: 'completed',
                    started_at: new Date(),
                    completed_at: new Date()
                }
            ];

            db.query.mockResolvedValue({ rows: mockHistory });

            const result = await otaService.getOTAHistory('ESP-001');

            expect(result).toHaveLength(2);
            expect(result[0].firmware_version).toBe('1.2.0');
        });

        it('should support pagination', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await otaService.getOTAHistory('ESP-001', { page: 1, limit: 10 });

            expect(db.query).toHaveBeenCalled();
        });
    });

    describe('cancelOTA', () => {
        it('should cancel ongoing OTA update', async () => {
            db.query
                .mockResolvedValueOnce({
                    rows: [{
                        id: 1,
                        status: 'in_progress'
                    }]
                })
                .mockResolvedValueOnce({
                    rows: [{
                        id: 1,
                        status: 'cancelled'
                    }]
                });

            const result = await otaService.cancelOTA('ESP-001');

            expect(result.status).toBe('cancelled');
            expect(mockMqttClient.publish).toHaveBeenCalledWith(
                expect.stringContaining('cancel'),
                expect.any(String),
                expect.any(Function)
            );
        });

        it('should reject cancelling completed OTA', async () => {
            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    status: 'completed'
                }]
            });

            await expect(
                otaService.cancelOTA('ESP-001')
            ).rejects.toThrow('Cannot cancel completed OTA update');
        });
    });

    describe('MQTT Communication', () => {
        it('should publish OTA update message to correct MQTT topic', async () => {
            db.query
                .mockResolvedValueOnce({
                    rows: [{ id: 1, device_id: 'ESP-001', status: 'online' }]
                })
                .mockResolvedValueOnce({ rows: [{ id: 1 }] });

            await otaService.triggerOTA('ESP-001', '1.2.0', 'https://example.com/firmware.bin');

            expect(mockMqttClient.publish).toHaveBeenCalledWith(
                'devices/ESP-001/ota',
                expect.stringContaining('1.2.0'),
                expect.any(Function)
            );
        });

        it('should handle MQTT connection errors', async () => {
            mockMqttClient.publish.mockImplementation((topic, message, callback) => {
                callback(new Error('MQTT connection failed'));
            });

            db.query.mockResolvedValue({
                rows: [{ id: 1, device_id: 'ESP-001', status: 'online' }]
            });

            await expect(
                otaService.triggerOTA('ESP-001', '1.2.0', 'https://example.com/firmware.bin')
            ).rejects.toThrow('MQTT connection failed');
        });
    });
});
