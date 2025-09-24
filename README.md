# ESP8266 Sensor Platform - Enhanced Version

A comprehensive IoT platform for monitoring ESP8266-based sensor devices with real-time data visualization, alerting, and over-the-air (OTA) firmware updates.

## Project Structure

```
├── database/           # Database schema and migrations
├── firmware/          # ESP8266 Arduino firmware
├── backend/           # Node.js REST API and WebSocket server
└── frontend/          # React.js dashboard application
```

## Features

- **Real-time Monitoring**: WebSocket-based live sensor data streaming
- **Multi-sensor Support**: Temperature, humidity, motion, light, distance sensors
- **Advanced Alerting**: Rule-based alerts with escalation and multiple notification channels
- **OTA Updates**: Remote firmware update capability
- **Historical Data**: Data aggregation and visualization with interactive charts
- **User Management**: Role-based access control
- **Device Management**: Configuration and status monitoring
- **Responsive UI**: Modern React dashboard with Tailwind CSS

## Quick Start

### Prerequisites

- Node.js 16+ and npm
- PostgreSQL 12+
- Redis (optional, for caching)
- Arduino IDE (for firmware development)

### Database Setup

1. Create PostgreSQL database:
```sql
CREATE DATABASE esp8266_platform;
```

2. Run schema setup:
```bash
cd database
psql -U postgres -d esp8266_platform -f schema.sql
```

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your database and service credentials
```

4. Start the server:
```bash
npm run dev
```

The backend will be available at `http://localhost:3000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your backend URL
```

4. Start the development server:
```bash
npm start
```

The frontend will be available at `http://localhost:5173`

### Firmware Setup

1. Open `firmware/esp8266_sensor_platform.ino` in Arduino IDE

2. Install required libraries:
   - ESP8266WiFi
   - ESP8266HTTPClient
   - ArduinoJson
   - DHT sensor library
   - Ultrasonic sensor library

3. Configure device settings in the firmware:
   - WiFi credentials
   - Server URL
   - Device ID

4. Upload to your ESP8266 device

## Configuration

### Backend Environment Variables

Key configuration options in `backend/.env`:

- `DB_*`: Database connection settings
- `JWT_SECRET`: Secret for JWT token generation
- `SMTP_*`: Email configuration for alerts
- `TWILIO_*`: SMS configuration for alerts
- `REDIS_*`: Redis cache configuration

### Frontend Environment Variables

Key configuration options in `frontend/.env`:

- `REACT_APP_API_URL`: Backend API endpoint
- `REACT_APP_WS_URL`: WebSocket server endpoint

### Firmware Configuration

Configure these settings in the ESP8266 firmware:

- WiFi network credentials
- Server API endpoint
- Device identification
- Sensor pin assignments

## API Documentation

### Authentication Endpoints
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Token refresh

### Device Endpoints
- `GET /api/devices` - List all devices
- `GET /api/devices/:id` - Get device details
- `POST /api/devices/:id/heartbeat` - Device heartbeat
- `POST /api/devices/:id/telemetry` - Submit sensor data
- `POST /api/devices/:id/alarm` - Trigger alert

### Telemetry Endpoints
- `GET /api/telemetry/:deviceId` - Get historical data
- `GET /api/telemetry/:deviceId/latest` - Get latest readings

### Alert Endpoints
- `GET /api/alerts` - List alerts
- `POST /api/alerts/:id/acknowledge` - Acknowledge alert
- `POST /api/alerts/:id/resolve` - Resolve alert

### OTA Endpoints
- `POST /api/firmware/upload` - Upload firmware
- `POST /api/devices/:id/ota` - Trigger OTA update

## WebSocket Events

### Client to Server
- `subscribe` - Subscribe to device/location updates
- `device:update_config` - Update device configuration
- `alert:acknowledge` - Acknowledge alert
- `alert:resolve` - Resolve alert

### Server to Client
- `device:data` - Real-time device data
- `device:status` - Device status updates
- `alert:new` - New alert notification
- `alert:updated` - Alert status changes

## Architecture

### Backend Architecture
- **Express.js** REST API server
- **Socket.io** for real-time WebSocket communication
- **PostgreSQL** for persistent data storage
- **Redis** for caching and session management
- **Node-cron** for scheduled tasks (alerts, cleanup)

### Frontend Architecture
- **React.js** with functional components and hooks
- **Tailwind CSS** for styling
- **Recharts** for data visualization
- **Socket.io Client** for real-time updates

### Firmware Architecture
- **ESP8266** microcontroller platform
- **ArduinoJson** for API communication
- **Multi-sensor support** with configurable pins
- **OTA update capability**

## Development

### Adding New Sensor Types

1. Update database schema in `database/schema.sql`
2. Add sensor handling in ESP8266 firmware
3. Update telemetry processing in backend services
4. Add UI components for new sensor type

### Extending Alert Rules

1. Modify `sensor_rules` table schema
2. Update `alertEscalationService.js` processing logic
3. Add frontend configuration interface

## Production Deployment

### Backend Deployment

1. Set `NODE_ENV=production`
2. Configure production database and Redis
3. Set up HTTPS with SSL certificates
4. Configure email/SMS services for alerts
5. Set up log rotation and monitoring

### Frontend Deployment

1. Build for production: `npm run build`
2. Deploy static files to web server (nginx/Apache)
3. Configure proper API endpoints in environment

### Database Migration

Run database migrations in production:
```bash
npm run migrate
```

## Troubleshooting

### Common Issues

1. **Device Offline**: Check WiFi configuration and server connectivity
2. **WebSocket Connection Failed**: Verify CORS settings and authentication
3. **Database Connection Error**: Check database credentials and network access
4. **OTA Update Failed**: Ensure firmware URL is accessible and file size limits

### Logs

- Backend logs: `backend/logs/`
- Database queries: Enable `LOG_QUERIES=true` in environment
- WebSocket events: Available in browser developer tools

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For questions or issues, please create an issue in the GitHub repository.