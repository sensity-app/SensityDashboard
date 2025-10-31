const request = require('supertest');
const express = require('express');
const devicesRouter = require('../../routes/devices');
const db = require('../../models/database');

// Mock dependencies
jest.mock('../../models/database');
jest.mock('../../services/otaService');
jest.mock('../../middleware/auth', () => ({
    authenticateToken: (req, res, next) => {
        req.user = { userId: 1, email: 'test@example.com', role: 'user' };
        next();
    },
    authenticateDevice: (req, res, next) => {
        req.device = { device_id: 'TEST-001' };
        next();
    },
    requireAdmin: (req, res, next) => {
        if (req.user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ error: 'Admin access required' });
        }
    }
}));
jest.mock('../../middleware/licenseMiddleware', () => ({
    requireFeature: () => (req, res, next) => next()
}));

// Create test app
const app = express();
app.use(express.json());
app.use('/api/devices', devicesRouter);

describe('Device Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/devices', () => {
        it('should return list of devices', async () => {
            const mockDevices = [
                {
                    id: 1,
                    device_id: 'ESP-001',
                    name: 'Temperature Sensor',
                    status: 'online',
                    location_name: 'Office'
                },
                {
                    id: 2,
                    device_id: 'ESP-002',
                    name: 'Humidity Sensor',
                    status: 'offline',
                    location_name: 'Warehouse'
                }
            ];

            db.query.mockResolvedValue({ rows: mockDevices });

            const response = await request(app)
                .get('/api/devices')
                .expect(200);

            expect(response.body.devices).toBeDefined();
            expect(Array.isArray(response.body.devices)).toBe(true);
        });

        it('should filter devices by location', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await request(app)
                .get('/api/devices?location_id=1')
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });

        it('should filter devices by status', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await request(app)
                .get('/api/devices?status=online')
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });

        it('should support pagination', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await request(app)
                .get('/api/devices?page=1&limit=10')
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });

        it('should support search functionality', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await request(app)
                .get('/api/devices?search=temperature')
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });
    });

    describe('GET /api/devices/:id', () => {
        it('should return device details by id', async () => {
            const mockDevice = {
                id: 1,
                device_id: 'ESP-001',
                name: 'Temperature Sensor',
                status: 'online',
                ip_address: '192.168.1.100',
                location_name: 'Office'
            };

            db.query.mockResolvedValue({ rows: [mockDevice] });

            const response = await request(app)
                .get('/api/devices/1')
                .expect(200);

            expect(response.body.device).toBeDefined();
            expect(response.body.device.device_id).toBe('ESP-001');
        });

        it('should return 404 for non-existent device', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const response = await request(app)
                .get('/api/devices/999')
                .expect(404);

            expect(response.body.error).toContain('not found');
        });

        it('should validate id parameter', async () => {
            const response = await request(app)
                .get('/api/devices/invalid-id')
                .expect(400);

            expect(response.body.errors).toBeDefined();
        });
    });

    describe('POST /api/devices', () => {
        const validDevice = {
            device_id: 'ESP-TEST-001',
            name: 'Test Device',
            location_id: 1,
            device_type: 'ESP8266'
        };

        it('should create a new device', async () => {
            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    ...validDevice,
                    status: 'offline',
                    created_at: new Date()
                }]
            });

            const response = await request(app)
                .post('/api/devices')
                .send(validDevice)
                .expect(201);

            expect(response.body.device).toBeDefined();
            expect(response.body.device.device_id).toBe('ESP-TEST-001');
        });

        it('should reject duplicate device_id', async () => {
            db.query.mockRejectedValue({
                code: '23505', // PostgreSQL unique violation
                constraint: 'devices_device_id_key'
            });

            const response = await request(app)
                .post('/api/devices')
                .send(validDevice)
                .expect(409);

            expect(response.body.error).toContain('already exists');
        });

        it('should validate required fields', async () => {
            const response = await request(app)
                .post('/api/devices')
                .send({ name: 'Test Device' })
                .expect(400);

            expect(response.body.errors).toBeDefined();
        });

        it('should validate device_id format', async () => {
            const response = await request(app)
                .post('/api/devices')
                .send({ ...validDevice, device_id: 'invalid space' })
                .expect(400);

            expect(response.body.errors).toBeDefined();
        });
    });

    describe('PUT /api/devices/:id', () => {
        it('should update device successfully', async () => {
            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    device_id: 'ESP-001',
                    name: 'Updated Name',
                    status: 'online'
                }]
            });

            const response = await request(app)
                .put('/api/devices/1')
                .send({ name: 'Updated Name' })
                .expect(200);

            expect(response.body.device).toBeDefined();
            expect(response.body.device.name).toBe('Updated Name');
        });

        it('should return 404 for non-existent device', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const response = await request(app)
                .put('/api/devices/999')
                .send({ name: 'Updated' })
                .expect(404);

            expect(response.body.error).toContain('not found');
        });

        it('should not allow updating device_id', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const response = await request(app)
                .put('/api/devices/1')
                .send({ device_id: 'NEW-ID' })
                .expect(400);

            expect(response.body.error).toContain('cannot be changed');
        });
    });

    describe('DELETE /api/devices/:id', () => {
        it('should delete device successfully', async () => {
            db.query.mockResolvedValue({ rows: [{ id: 1 }] });

            const response = await request(app)
                .delete('/api/devices/1')
                .expect(200);

            expect(response.body.message).toContain('deleted');
        });

        it('should return 404 for non-existent device', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const response = await request(app)
                .delete('/api/devices/999')
                .expect(404);

            expect(response.body.error).toContain('not found');
        });
    });

    describe('GET /api/devices/:id/sensors', () => {
        it('should return device sensors', async () => {
            const mockSensors = [
                {
                    id: 1,
                    sensor_name: 'temperature',
                    unit: '°C',
                    threshold_min: 18,
                    threshold_max: 25
                },
                {
                    id: 2,
                    sensor_name: 'humidity',
                    unit: '%',
                    threshold_min: 30,
                    threshold_max: 70
                }
            ];

            db.query.mockResolvedValue({ rows: mockSensors });

            const response = await request(app)
                .get('/api/devices/1/sensors')
                .expect(200);

            expect(response.body.sensors).toBeDefined();
            expect(response.body.sensors).toHaveLength(2);
        });

        it('should return empty array for device with no sensors', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const response = await request(app)
                .get('/api/devices/1/sensors')
                .expect(200);

            expect(response.body.sensors).toEqual([]);
        });
    });

    describe('POST /api/devices/:id/sensors', () => {
        const validSensor = {
            sensor_name: 'temperature',
            unit: '°C',
            threshold_min: 18,
            threshold_max: 25,
            calibration_offset: 0
        };

        it('should create a new sensor', async () => {
            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    device_id: 1,
                    ...validSensor
                }]
            });

            const response = await request(app)
                .post('/api/devices/1/sensors')
                .send(validSensor)
                .expect(201);

            expect(response.body.sensor).toBeDefined();
            expect(response.body.sensor.sensor_name).toBe('temperature');
        });

        it('should validate required fields', async () => {
            const response = await request(app)
                .post('/api/devices/1/sensors')
                .send({ unit: '°C' })
                .expect(400);

            expect(response.body.errors).toBeDefined();
        });

        it('should validate threshold values', async () => {
            const response = await request(app)
                .post('/api/devices/1/sensors')
                .send({
                    ...validSensor,
                    threshold_min: 30,
                    threshold_max: 20
                })
                .expect(400);

            expect(response.body.error).toContain('threshold');
        });
    });

    describe('GET /api/devices/:id/sensors/:sensorId/recommended-thresholds', () => {
        it('should return recommended thresholds based on historical data', async () => {
            const mockTelemetry = Array(100).fill(null).map((_, i) => ({
                processed_value: 20 + (Math.random() * 5)
            }));

            db.query.mockResolvedValue({ rows: mockTelemetry });

            const response = await request(app)
                .get('/api/devices/1/sensors/1/recommended-thresholds')
                .expect(200);

            expect(response.body.recommended_min).toBeDefined();
            expect(response.body.recommended_max).toBeDefined();
            expect(response.body.stats).toBeDefined();
        });

        it('should handle no historical data', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const response = await request(app)
                .get('/api/devices/1/sensors/1/recommended-thresholds')
                .expect(200);

            expect(response.body.recommended_min).toBeNull();
            expect(response.body.recommended_max).toBeNull();
            expect(response.body.note).toContain('No historical data');
        });

        it('should support custom time range', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await request(app)
                .get('/api/devices/1/sensors/1/recommended-thresholds?days=30')
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });
    });

    describe('POST /api/devices/:id/ota', () => {
        it('should trigger OTA update', async () => {
            const otaService = require('../../services/otaService');
            otaService.triggerOTA = jest.fn().mockResolvedValue({ success: true });

            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    device_id: 'ESP-001',
                    status: 'online'
                }]
            });

            const response = await request(app)
                .post('/api/devices/1/ota')
                .send({ firmware_version: '1.2.0' })
                .expect(200);

            expect(response.body.message).toContain('triggered');
            expect(otaService.triggerOTA).toHaveBeenCalled();
        });

        it('should reject OTA for offline devices', async () => {
            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    device_id: 'ESP-001',
                    status: 'offline'
                }]
            });

            const response = await request(app)
                .post('/api/devices/1/ota')
                .send({ firmware_version: '1.2.0' })
                .expect(400);

            expect(response.body.error).toContain('offline');
        });
    });

    describe('Device Status Updates', () => {
        describe('POST /api/devices/heartbeat', () => {
            it('should update device status on heartbeat', async () => {
                db.query.mockResolvedValue({ rows: [{ id: 1 }] });

                const response = await request(app)
                    .post('/api/devices/heartbeat')
                    .send({
                        device_id: 'ESP-001',
                        ip_address: '192.168.1.100',
                        firmware_version: '1.0.0'
                    })
                    .expect(200);

                expect(response.body.success).toBe(true);
            });

            it('should validate required fields', async () => {
                const response = await request(app)
                    .post('/api/devices/heartbeat')
                    .send({ device_id: 'ESP-001' })
                    .expect(400);

                expect(response.body.errors).toBeDefined();
            });
        });
    });
});
