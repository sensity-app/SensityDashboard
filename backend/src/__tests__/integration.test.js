/**
 * Integration Tests for Critical User Flows
 * These tests verify end-to-end functionality across multiple components
 */

const request = require('supertest');
const app = require('../../server');
const db = require('../../models/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

jest.mock('../../models/database');

describe('Integration Tests - User Authentication Flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should complete full registration and login flow', async () => {
        // Step 1: Check setup status
        db.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });

        const setupCheck = await request(app)
            .get('/api/auth/setup-check')
            .expect(200);

        expect(setupCheck.body.needsSetup).toBe(true);

        // Step 2: Create initial admin user
        const hashedPassword = await bcrypt.hash('Admin123!', 12);
        db.query
            .mockResolvedValueOnce({ rows: [{ count: '0' }] })
            .mockResolvedValueOnce({
                rows: [{
                    id: 1,
                    email: 'admin@example.com',
                    role: 'admin',
                    full_name: 'Admin User',
                    preferred_language: 'en',
                    created_at: new Date()
                }]
            });

        const setupResponse = await request(app)
            .post('/api/auth/initial-setup')
            .send({
                email: 'admin@example.com',
                password: 'Admin123!',
                fullName: 'Admin User'
            })
            .expect(201);

        expect(setupResponse.body).toHaveProperty('token');
        const adminToken = setupResponse.body.token;

        // Step 3: Use admin token to create a new user
        db.query.mockResolvedValueOnce({
            rows: [{
                id: 2,
                email: 'user@example.com',
                role: 'user',
                full_name: 'Regular User'
            }]
        });

        await request(app)
            .post('/api/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                email: 'user@example.com',
                fullName: 'Regular User',
                role: 'user'
            })
            .expect(201);

        // Step 4: New user logs in
        const userHashedPassword = await bcrypt.hash('User123!', 12);
        db.query.mockResolvedValueOnce({
            rows: [{
                id: 2,
                email: 'user@example.com',
                password_hash: userHashedPassword,
                role: 'user',
                full_name: 'Regular User'
            }]
        });

        const loginResponse = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'user@example.com',
                password: 'User123!'
            })
            .expect(200);

        expect(loginResponse.body).toHaveProperty('token');
        expect(loginResponse.body.user.email).toBe('user@example.com');
    });
});

describe('Integration Tests - Device Management Flow', () => {
    let authToken;

    beforeEach(() => {
        jest.clearAllMocks();
        authToken = jwt.sign(
            { userId: 1, email: 'test@example.com', role: 'user' },
            process.env.JWT_SECRET
        );
    });

    it('should complete device registration and telemetry flow', async () => {
        // Step 1: Create a new device
        db.query.mockResolvedValueOnce({
            rows: [{
                id: 1,
                device_id: 'ESP-TEST-001',
                name: 'Test Sensor',
                status: 'offline',
                created_at: new Date()
            }]
        });

        const deviceResponse = await request(app)
            .post('/api/devices')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                device_id: 'ESP-TEST-001',
                name: 'Test Sensor',
                device_type: 'ESP8266'
            })
            .expect(201);

        const deviceId = deviceResponse.body.device.id;

        // Step 2: Add sensors to the device
        db.query.mockResolvedValueOnce({
            rows: [{
                id: 1,
                device_id: deviceId,
                sensor_name: 'temperature',
                unit: '°C'
            }]
        });

        await request(app)
            .post(`/api/devices/${deviceId}/sensors`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                sensor_name: 'temperature',
                unit: '°C',
                threshold_min: 18,
                threshold_max: 25
            })
            .expect(201);

        // Step 3: Device sends telemetry data
        db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

        await request(app)
            .post('/api/telemetry/ingest')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                device_id: 'ESP-TEST-001',
                readings: [{
                    sensor_name: 'temperature',
                    value: 30,
                    unit: '°C'
                }]
            })
            .expect(200);

        // Step 4: Retrieve telemetry data
        db.query.mockResolvedValueOnce({
            rows: [{
                id: 1,
                device_id: deviceId,
                sensor_name: 'temperature',
                processed_value: 30,
                timestamp: new Date()
            }]
        });

        const telemetryResponse = await request(app)
            .get(`/api/telemetry/devices/${deviceId}`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(telemetryResponse.body.telemetry).toBeDefined();
    });
});

describe('Integration Tests - Alert Workflow', () => {
    let authToken;

    beforeEach(() => {
        jest.clearAllMocks();
        authToken = jwt.sign(
            { userId: 1, email: 'test@example.com', role: 'user' },
            process.env.JWT_SECRET
        );
    });

    it('should handle threshold exceeded alert workflow', async () => {
        // Step 1: Ingest telemetry that exceeds threshold
        db.query
            .mockResolvedValueOnce({ rows: [{ id: 1, threshold_max: 25 }] }) // Get sensor config
            .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert telemetry
            .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Create alert

        await request(app)
            .post('/api/telemetry/ingest')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                device_id: 'ESP-001',
                readings: [{
                    sensor_name: 'temperature',
                    value: 30, // Exceeds threshold
                    unit: '°C'
                }]
            })
            .expect(200);

        // Step 2: Get alerts
        db.query.mockResolvedValueOnce({
            rows: [{
                id: 1,
                device_name: 'Test Device',
                sensor_name: 'temperature',
                severity: 'high',
                message: 'Temperature above threshold',
                acknowledged: false
            }]
        });

        const alertsResponse = await request(app)
            .get('/api/alerts')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(alertsResponse.body.alerts).toHaveLength(1);
        const alertId = alertsResponse.body.alerts[0].id;

        // Step 3: Acknowledge alert
        db.query.mockResolvedValueOnce({
            rows: [{
                id: alertId,
                acknowledged: true,
                acknowledged_by: 1
            }]
        });

        await request(app)
            .post(`/api/alerts/${alertId}/acknowledge`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({ note: 'Issue resolved' })
            .expect(200);

        // Step 4: Verify alert is acknowledged
        db.query.mockResolvedValueOnce({
            rows: [{
                id: alertId,
                acknowledged: true
            }]
        });

        const verifyResponse = await request(app)
            .get(`/api/alerts/${alertId}`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(verifyResponse.body.alert.acknowledged).toBe(true);
    });
});

describe('Integration Tests - OTA Update Flow', () => {
    let authToken;

    beforeEach(() => {
        jest.clearAllMocks();
        authToken = jwt.sign(
            { userId: 1, email: 'admin@example.com', role: 'admin' },
            process.env.JWT_SECRET
        );
    });

    it('should complete OTA update workflow', async () => {
        // Step 1: Upload firmware
        db.query.mockResolvedValueOnce({
            rows: [{ id: 1 }]
        });

        // Note: File upload would require multipart/form-data
        // This is a simplified version

        // Step 2: Schedule OTA update
        db.query
            .mockResolvedValueOnce({ rows: [{ id: 1, status: 'online' }] }) // Get device
            .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Create OTA job

        await request(app)
            .post('/api/devices/1/ota')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                firmware_version: '1.2.0'
            })
            .expect(200);

        // Step 3: Monitor OTA progress
        db.query.mockResolvedValueOnce({
            rows: [{
                id: 1,
                device_id: 'ESP-001',
                status: 'in_progress',
                progress: 50
            }]
        });

        const progressResponse = await request(app)
            .get('/api/ota/status/ESP-001')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(progressResponse.body.status).toBe('in_progress');
        expect(progressResponse.body.progress).toBe(50);
    });
});

describe('Integration Tests - Multi-user Collaboration', () => {
    let adminToken, userToken;

    beforeEach(() => {
        jest.clearAllMocks();
        adminToken = jwt.sign(
            { userId: 1, email: 'admin@example.com', role: 'admin' },
            process.env.JWT_SECRET
        );
        userToken = jwt.sign(
            { userId: 2, email: 'user@example.com', role: 'user' },
            process.env.JWT_SECRET
        );
    });

    it('should handle role-based access control', async () => {
        // Admin can create devices
        db.query.mockResolvedValueOnce({
            rows: [{ id: 1, device_id: 'ESP-001' }]
        });

        await request(app)
            .post('/api/devices')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                device_id: 'ESP-001',
                name: 'Admin Device'
            })
            .expect(201);

        // Regular user can view devices
        db.query.mockResolvedValueOnce({
            rows: [{ id: 1, device_id: 'ESP-001' }]
        });

        await request(app)
            .get('/api/devices')
            .set('Authorization', `Bearer ${userToken}`)
            .expect(200);

        // Regular user cannot delete devices (admin only)
        await request(app)
            .delete('/api/devices/1')
            .set('Authorization', `Bearer ${userToken}`)
            .expect(403);

        // Admin can delete devices
        db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

        await request(app)
            .delete('/api/devices/1')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
    });
});
