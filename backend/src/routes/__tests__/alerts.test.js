const request = require('supertest');
const express = require('express');
const alertsRouter = require('../../routes/alerts');
const db = require('../../models/database');

// Mock dependencies
jest.mock('../../models/database');
jest.mock('../../middleware/auth', () => ({
    authenticateToken: (req, res, next) => {
        req.user = { userId: 1, email: 'test@example.com', role: 'user' };
        next();
    }
}));

// Create test app
const app = express();
app.use(express.json());
app.use('/api/alerts', alertsRouter);

describe('Alert Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/alerts', () => {
        it('should return list of alerts', async () => {
            const mockAlerts = [
                {
                    id: 1,
                    device_id: 1,
                    device_name: 'Temperature Sensor',
                    sensor_name: 'temperature',
                    alert_type: 'threshold_exceeded',
                    severity: 'high',
                    message: 'Temperature above threshold',
                    acknowledged: false,
                    created_at: new Date()
                },
                {
                    id: 2,
                    device_id: 2,
                    device_name: 'Humidity Sensor',
                    sensor_name: 'humidity',
                    alert_type: 'threshold_below',
                    severity: 'medium',
                    message: 'Humidity below threshold',
                    acknowledged: true,
                    created_at: new Date()
                }
            ];

            db.query.mockResolvedValue({ rows: mockAlerts });

            const response = await request(app)
                .get('/api/alerts')
                .expect(200);

            expect(response.body.alerts).toBeDefined();
            expect(Array.isArray(response.body.alerts)).toBe(true);
            expect(response.body.alerts).toHaveLength(2);
        });

        it('should filter alerts by severity', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await request(app)
                .get('/api/alerts?severity=high')
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });

        it('should filter alerts by acknowledged status', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await request(app)
                .get('/api/alerts?acknowledged=false')
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });

        it('should filter alerts by device', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await request(app)
                .get('/api/alerts?device_id=1')
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });

        it('should support pagination', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await request(app)
                .get('/api/alerts?page=1&limit=20')
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });

        it('should support date range filtering', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const startDate = '2024-01-01';
            const endDate = '2024-01-31';

            await request(app)
                .get(`/api/alerts?start_date=${startDate}&end_date=${endDate}`)
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });
    });

    describe('GET /api/alerts/:id', () => {
        it('should return alert details by id', async () => {
            const mockAlert = {
                id: 1,
                device_id: 1,
                device_name: 'Temperature Sensor',
                sensor_name: 'temperature',
                alert_type: 'threshold_exceeded',
                severity: 'high',
                message: 'Temperature above threshold',
                value: 28.5,
                threshold: 25,
                acknowledged: false,
                created_at: new Date()
            };

            db.query.mockResolvedValue({ rows: [mockAlert] });

            const response = await request(app)
                .get('/api/alerts/1')
                .expect(200);

            expect(response.body.alert).toBeDefined();
            expect(response.body.alert.id).toBe(1);
        });

        it('should return 404 for non-existent alert', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const response = await request(app)
                .get('/api/alerts/999')
                .expect(404);

            expect(response.body.error).toContain('not found');
        });
    });

    describe('POST /api/alerts/:id/acknowledge', () => {
        it('should acknowledge alert successfully', async () => {
            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    acknowledged: true,
                    acknowledged_at: new Date(),
                    acknowledged_by: 1
                }]
            });

            const response = await request(app)
                .post('/api/alerts/1/acknowledge')
                .send({ note: 'Investigating the issue' })
                .expect(200);

            expect(response.body.alert).toBeDefined();
            expect(response.body.alert.acknowledged).toBe(true);
        });

        it('should return 404 for non-existent alert', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const response = await request(app)
                .post('/api/alerts/999/acknowledge')
                .expect(404);

            expect(response.body.error).toContain('not found');
        });

        it('should allow acknowledging already acknowledged alert', async () => {
            db.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    acknowledged: true
                }]
            });

            const response = await request(app)
                .post('/api/alerts/1/acknowledge')
                .expect(200);

            expect(response.body.alert.acknowledged).toBe(true);
        });
    });

    describe('POST /api/alerts/bulk-acknowledge', () => {
        it('should acknowledge multiple alerts', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const response = await request(app)
                .post('/api/alerts/bulk-acknowledge')
                .send({ alert_ids: [1, 2, 3] })
                .expect(200);

            expect(response.body.message).toContain('acknowledged');
            expect(response.body.count).toBe(3);
        });

        it('should validate alert_ids array', async () => {
            const response = await request(app)
                .post('/api/alerts/bulk-acknowledge')
                .send({ alert_ids: 'not-an-array' })
                .expect(400);

            expect(response.body.errors).toBeDefined();
        });

        it('should reject empty alert_ids array', async () => {
            const response = await request(app)
                .post('/api/alerts/bulk-acknowledge')
                .send({ alert_ids: [] })
                .expect(400);

            expect(response.body.error).toContain('at least one');
        });
    });

    describe('DELETE /api/alerts/:id', () => {
        it('should delete alert successfully', async () => {
            db.query.mockResolvedValue({ rows: [{ id: 1 }] });

            const response = await request(app)
                .delete('/api/alerts/1')
                .expect(200);

            expect(response.body.message).toContain('deleted');
        });

        it('should return 404 for non-existent alert', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const response = await request(app)
                .delete('/api/alerts/999')
                .expect(404);

            expect(response.body.error).toContain('not found');
        });
    });

    describe('GET /api/alerts/statistics', () => {
        it('should return alert statistics', async () => {
            const mockStats = {
                total: 100,
                acknowledged: 60,
                unacknowledged: 40,
                by_severity: {
                    high: 20,
                    medium: 50,
                    low: 30
                },
                by_type: {
                    threshold_exceeded: 45,
                    threshold_below: 30,
                    device_offline: 15,
                    connection_lost: 10
                }
            };

            db.query
                .mockResolvedValueOnce({ rows: [{ total: 100, acknowledged: 60, unacknowledged: 40 }] })
                .mockResolvedValueOnce({
                    rows: [
                        { severity: 'high', count: 20 },
                        { severity: 'medium', count: 50 },
                        { severity: 'low', count: 30 }
                    ]
                })
                .mockResolvedValueOnce({
                    rows: [
                        { alert_type: 'threshold_exceeded', count: 45 },
                        { alert_type: 'threshold_below', count: 30 },
                        { alert_type: 'device_offline', count: 15 },
                        { alert_type: 'connection_lost', count: 10 }
                    ]
                });

            const response = await request(app)
                .get('/api/alerts/statistics')
                .expect(200);

            expect(response.body.statistics).toBeDefined();
        });

        it('should support time range for statistics', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await request(app)
                .get('/api/alerts/statistics?days=30')
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });
    });

    describe('GET /api/alerts/recent', () => {
        it('should return recent alerts', async () => {
            const mockAlerts = Array(5).fill(null).map((_, i) => ({
                id: i + 1,
                message: `Alert ${i + 1}`,
                severity: 'high',
                created_at: new Date()
            }));

            db.query.mockResolvedValue({ rows: mockAlerts });

            const response = await request(app)
                .get('/api/alerts/recent?limit=5')
                .expect(200);

            expect(response.body.alerts).toHaveLength(5);
        });

        it('should respect limit parameter', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await request(app)
                .get('/api/alerts/recent?limit=10')
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });
    });

    describe('Alert Notification Settings', () => {
        describe('GET /api/alerts/notification-settings', () => {
            it('should return user notification settings', async () => {
                const mockSettings = {
                    email_enabled: true,
                    sms_enabled: false,
                    telegram_enabled: true,
                    whatsapp_enabled: false,
                    min_severity: 'medium'
                };

                db.query.mockResolvedValue({ rows: [mockSettings] });

                const response = await request(app)
                    .get('/api/alerts/notification-settings')
                    .expect(200);

                expect(response.body.settings).toBeDefined();
            });
        });

        describe('PUT /api/alerts/notification-settings', () => {
            it('should update notification settings', async () => {
                const newSettings = {
                    email_enabled: true,
                    sms_enabled: true,
                    min_severity: 'high'
                };

                db.query.mockResolvedValue({ rows: [newSettings] });

                const response = await request(app)
                    .put('/api/alerts/notification-settings')
                    .send(newSettings)
                    .expect(200);

                expect(response.body.settings).toBeDefined();
            });

            it('should validate severity level', async () => {
                const response = await request(app)
                    .put('/api/alerts/notification-settings')
                    .send({ min_severity: 'invalid' })
                    .expect(400);

                expect(response.body.errors).toBeDefined();
            });
        });
    });
});
