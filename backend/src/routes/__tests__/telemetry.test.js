const request = require('supertest');
const express = require('express');
const telemetryRouter = require('../../routes/telemetry');
const db = require('../../models/database');

// Mock dependencies
jest.mock('../../models/database');
jest.mock('../../middleware/auth', () => ({
    authenticateToken: (req, res, next) => {
        req.user = { userId: 1, email: 'test@example.com', role: 'user' };
        next();
    },
    authenticateDevice: (req, res, next) => {
        req.device = { device_id: 'TEST-001' };
        next();
    }
}));

// Create test app
const app = express();
app.use(express.json());
app.use('/api/telemetry', telemetryRouter);

describe('Telemetry Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/telemetry/ingest', () => {
        it('should ingest telemetry data successfully', async () => {
            const telemetryData = {
                device_id: 'ESP-001',
                readings: [
                    {
                        sensor_name: 'temperature',
                        value: 23.5,
                        unit: '°C'
                    },
                    {
                        sensor_name: 'humidity',
                        value: 65,
                        unit: '%'
                    }
                ],
                timestamp: new Date().toISOString()
            };

            db.query.mockResolvedValue({ rows: [{ id: 1 }] });

            const response = await request(app)
                .post('/api/telemetry/ingest')
                .send(telemetryData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('ingested');
        });

        it('should validate required fields', async () => {
            const response = await request(app)
                .post('/api/telemetry/ingest')
                .send({ device_id: 'ESP-001' })
                .expect(400);

            expect(response.body.errors).toBeDefined();
        });

        it('should validate readings array', async () => {
            const response = await request(app)
                .post('/api/telemetry/ingest')
                .send({
                    device_id: 'ESP-001',
                    readings: 'not-an-array'
                })
                .expect(400);

            expect(response.body.errors).toBeDefined();
        });

        it('should handle bulk telemetry data', async () => {
            const bulkData = {
                device_id: 'ESP-001',
                readings: Array(10).fill(null).map((_, i) => ({
                    sensor_name: 'temperature',
                    value: 20 + i,
                    unit: '°C',
                    timestamp: new Date(Date.now() - i * 60000).toISOString()
                }))
            };

            db.query.mockResolvedValue({ rows: [] });

            const response = await request(app)
                .post('/api/telemetry/ingest')
                .send(bulkData)
                .expect(200);

            expect(response.body.success).toBe(true);
        });
    });

    describe('GET /api/telemetry/devices/:deviceId', () => {
        it('should return telemetry data for device', async () => {
            const mockTelemetry = Array(10).fill(null).map((_, i) => ({
                id: i + 1,
                device_id: 1,
                sensor_name: 'temperature',
                raw_value: 23.5,
                processed_value: 23.5,
                unit: '°C',
                timestamp: new Date(Date.now() - i * 3600000)
            }));

            db.query.mockResolvedValue({ rows: mockTelemetry });

            const response = await request(app)
                .get('/api/telemetry/devices/1')
                .expect(200);

            expect(response.body.telemetry).toBeDefined();
            expect(Array.isArray(response.body.telemetry)).toBe(true);
        });

        it('should filter by sensor name', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await request(app)
                .get('/api/telemetry/devices/1?sensor=temperature')
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });

        it('should support time range filtering', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const startTime = new Date(Date.now() - 86400000).toISOString();
            const endTime = new Date().toISOString();

            await request(app)
                .get(`/api/telemetry/devices/1?start_time=${startTime}&end_time=${endTime}`)
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });

        it('should support pagination', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await request(app)
                .get('/api/telemetry/devices/1?page=1&limit=100')
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });

        it('should support aggregation', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await request(app)
                .get('/api/telemetry/devices/1?aggregate=hourly')
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });
    });

    describe('GET /api/telemetry/devices/:deviceId/sensors/:sensorId', () => {
        it('should return sensor-specific telemetry', async () => {
            const mockData = Array(20).fill(null).map((_, i) => ({
                id: i + 1,
                value: 20 + Math.random() * 10,
                timestamp: new Date(Date.now() - i * 1800000)
            }));

            db.query.mockResolvedValue({ rows: mockData });

            const response = await request(app)
                .get('/api/telemetry/devices/1/sensors/1')
                .expect(200);

            expect(response.body.telemetry).toBeDefined();
            expect(Array.isArray(response.body.telemetry)).toBe(true);
        });

        it('should return 404 for non-existent sensor', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const response = await request(app)
                .get('/api/telemetry/devices/1/sensors/999')
                .expect(404);

            expect(response.body.error).toContain('not found');
        });
    });

    describe('GET /api/telemetry/devices/:deviceId/latest', () => {
        it('should return latest readings for all sensors', async () => {
            const mockLatest = [
                {
                    sensor_name: 'temperature',
                    value: 23.5,
                    unit: '°C',
                    timestamp: new Date()
                },
                {
                    sensor_name: 'humidity',
                    value: 65,
                    unit: '%',
                    timestamp: new Date()
                }
            ];

            db.query.mockResolvedValue({ rows: mockLatest });

            const response = await request(app)
                .get('/api/telemetry/devices/1/latest')
                .expect(200);

            expect(response.body.readings).toBeDefined();
            expect(response.body.readings).toHaveLength(2);
        });

        it('should return empty array for device with no telemetry', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const response = await request(app)
                .get('/api/telemetry/devices/1/latest')
                .expect(200);

            expect(response.body.readings).toEqual([]);
        });
    });

    describe('GET /api/telemetry/devices/:deviceId/statistics', () => {
        it('should return telemetry statistics', async () => {
            const mockStats = [
                {
                    sensor_name: 'temperature',
                    min_value: 18.5,
                    max_value: 28.3,
                    avg_value: 23.4,
                    count: 1000
                },
                {
                    sensor_name: 'humidity',
                    min_value: 45,
                    max_value: 85,
                    avg_value: 65,
                    count: 1000
                }
            ];

            db.query.mockResolvedValue({ rows: mockStats });

            const response = await request(app)
                .get('/api/telemetry/devices/1/statistics')
                .expect(200);

            expect(response.body.statistics).toBeDefined();
            expect(Array.isArray(response.body.statistics)).toBe(true);
        });

        it('should support time range for statistics', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await request(app)
                .get('/api/telemetry/devices/1/statistics?days=7')
                .expect(200);

            expect(db.query).toHaveBeenCalled();
        });
    });

    describe('GET /api/telemetry/export', () => {
        it('should export telemetry data as CSV', async () => {
            const mockData = [
                {
                    device_id: 'ESP-001',
                    sensor_name: 'temperature',
                    value: 23.5,
                    timestamp: new Date()
                }
            ];

            db.query.mockResolvedValue({ rows: mockData });

            const response = await request(app)
                .get('/api/telemetry/export?device_id=1&format=csv')
                .expect(200);

            expect(response.headers['content-type']).toContain('csv');
        });

        it('should export telemetry data as JSON', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const response = await request(app)
                .get('/api/telemetry/export?device_id=1&format=json')
                .expect(200);

            expect(response.headers['content-type']).toContain('json');
        });

        it('should validate required parameters', async () => {
            const response = await request(app)
                .get('/api/telemetry/export')
                .expect(400);

            expect(response.body.error).toBeDefined();
        });
    });

    describe('DELETE /api/telemetry/devices/:deviceId', () => {
        it('should delete telemetry data', async () => {
            db.query.mockResolvedValue({ rowCount: 100 });

            const response = await request(app)
                .delete('/api/telemetry/devices/1')
                .expect(200);

            expect(response.body.message).toContain('deleted');
            expect(response.body.count).toBe(100);
        });

        it('should support time range for deletion', async () => {
            db.query.mockResolvedValue({ rowCount: 50 });

            const beforeDate = new Date(Date.now() - 86400000).toISOString();

            const response = await request(app)
                .delete(`/api/telemetry/devices/1?before_date=${beforeDate}`)
                .expect(200);

            expect(response.body.count).toBe(50);
        });
    });

    describe('Telemetry Aggregation', () => {
        describe('GET /api/telemetry/aggregate/hourly', () => {
            it('should return hourly aggregated data', async () => {
                const mockAggregated = Array(24).fill(null).map((_, i) => ({
                    hour: new Date(Date.now() - i * 3600000),
                    avg_value: 23 + Math.random() * 5,
                    min_value: 20,
                    max_value: 28,
                    count: 60
                }));

                db.query.mockResolvedValue({ rows: mockAggregated });

                const response = await request(app)
                    .get('/api/telemetry/aggregate/hourly?device_id=1&sensor=temperature')
                    .expect(200);

                expect(response.body.data).toBeDefined();
            });
        });

        describe('GET /api/telemetry/aggregate/daily', () => {
            it('should return daily aggregated data', async () => {
                db.query.mockResolvedValue({ rows: [] });

                const response = await request(app)
                    .get('/api/telemetry/aggregate/daily?device_id=1&sensor=temperature')
                    .expect(200);

                expect(response.body.data).toBeDefined();
            });
        });
    });

    describe('Real-time Telemetry', () => {
        describe('GET /api/telemetry/stream/:deviceId', () => {
            it('should establish telemetry stream connection', async () => {
                const response = await request(app)
                    .get('/api/telemetry/stream/1')
                    .expect(200);

                // SSE connection tests would require more complex setup
                expect(response).toBeDefined();
            });
        });
    });
});
