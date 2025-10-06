# 📝 Changelog

All notable changes to the ESP8266 IoT Management Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Mobile application (React Native)
- Advanced analytics with machine learning predictions
- Sensor rules editor in web interface
- Data export to InfluxDB and Grafana
- Backup/restore UI

---

## [2.2.0] - 2025-10-07

### Added
- **Comprehensive Documentation Suite**
  - Complete API documentation with all endpoints
  - Hardware guide with wiring diagrams and specifications
  - Deployment guide with automated installation options
  - Contributing guidelines for developers
- Sensor management UI for editing configuration from web interface
- OTA trigger system for automatic firmware updates on configuration changes
- Platform update manager with Git integration
- Full Czech translation support (i18next)
- Dashboard redesign with clearer separation from device management
- Enhanced error handling throughout the application
- Web-based firmware builder with template selection
- WebSerial API support for direct USB flashing
- Drag-and-drop firmware generation
- First-user registration flow with automatic lockdown
- Password reset system with email-based recovery
- User invitation system for admins
- Multi-role support (Admin, Operator, Viewer)

### Changed
- Improved device detail page UI/UX
- Updated dropdown menu components for better accessibility
- Enhanced serial monitor functionality
- Optimized firmware builder interface
- Rebranded application interface
- Updated permissions system for better security
- Improved installation scripts with better error handling

### Fixed
- SSL certificate issues in installation script
- Device management bugs
- Dropdown menu rendering issues
- WebSocket connection stability
- Authentication token handling
- Firmware version tracking

---

## [2.1.0] - 2025-10-03

### Added
- **Web-Based Firmware Builder**
  - 6 pre-configured device templates
  - Point-and-click sensor configuration
  - Conflict detection for pin assignments
  - Generated firmware packages with documentation
  - Wiring guide generation
- **Arduino IDE Integration**
  - Direct firmware download
  - Complete setup instructions
- **Initial Setup Flow**
  - First-time admin user creation
  - Automatic database initialization
  - Secure setup lockdown after first user

### Changed
- Updated installation script for Ubuntu compatibility
- Improved database initialization process
- Enhanced logging for debugging
- Better error pages with actionable feedback

### Fixed
- Installation script permission issues
- Database schema initialization bugs
- Frontend build configuration
- Authentication flow edge cases

---

## [2.0.0] - 2025-10-02

### Added
- **Enterprise Authentication System**
  - JWT-based authentication
  - Role-based access control (RBAC)
  - User management interface
  - Email-based password reset
  - Session management with Redis
- **Advanced Alert System**
  - Multi-channel notifications (Email, SMS, in-app)
  - Customizable alert rules per sensor
  - Alert escalation with multiple severity levels
  - Silent mode scheduling
  - Offline device detection
  - Comprehensive event logging
- **Real-Time Features**
  - WebSocket server for live updates
  - Real-time device monitoring
  - Live sensor data visualization
  - Device health tracking
- **Device & Sensor Management**
  - Complete CRUD operations for devices
  - Dynamic sensor configuration
  - Over-the-Air (OTA) firmware updates
  - Protocol settings (HTTP/MQTT)
  - Remote configuration capabilities
  - Location management
  - Device grouping and tagging
- **Data & Analytics**
  - Historical data visualization
  - Time-range based charts
  - CSV export functionality
  - Sensor calibration (offset/multiplier)
  - Device performance insights

### Changed
- Complete UI redesign with Tailwind CSS
- Migrated to React 18
- Database schema improvements for scalability
- API restructuring for better organization
- Enhanced security with Helmet.js and rate limiting

### Security
- Added HTTPS/SSL support with Let's Encrypt
- Input validation with express-validator
- SQL injection protection
- Password hashing with bcrypt (12 rounds)
- Security event logging
- Device authentication via API keys
- CORS configuration

---

## [1.5.0] - 2025-09-15

### Added
- Multi-sensor support (temperature, humidity, motion, distance, light, gas, vibration, magnetic, sound)
- MQTT broker integration
- Redis caching for performance
- PM2 clustering for Node.js load balancing
- Database indexing on critical queries
- Gzip compression for API responses

### Changed
- Improved database query performance
- Optimized React Query select functions
- Reduced animation durations for better UX

---

## [1.0.0] - 2025-08-01

### Added
- Initial release
- Basic ESP8266 device registration
- Temperature and humidity monitoring (DHT22)
- Simple web dashboard
- PostgreSQL database integration
- Basic REST API
- Device listing and detail views
- Manual device configuration

### Changed
- N/A (Initial release)

### Deprecated
- N/A

### Removed
- N/A

### Fixed
- N/A

### Security
- Basic authentication system
- Environment variable configuration

---

## Version History

### Version Numbering Scheme

We use Semantic Versioning (MAJOR.MINOR.PATCH):
- **MAJOR**: Breaking changes, major feature additions
- **MINOR**: New features, backward-compatible
- **PATCH**: Bug fixes, minor improvements

### Release Schedule

- **Major releases**: Every 6-12 months
- **Minor releases**: Every 1-3 months
- **Patch releases**: As needed for critical bugs

---

## Migration Guides

### Migrating from 2.1.x to 2.2.x

**Database Changes:**
- No schema changes required
- Existing data is fully compatible

**Configuration Changes:**
- Add `FRONTEND_URL` to backend `.env` file
- Update frontend `.env` with new API endpoint format

**Steps:**
1. Stop application: `pm2 stop all`
2. Pull latest code: `git pull origin main`
3. Update dependencies: `npm install` (in both backend and frontend)
4. Rebuild frontend: `cd frontend && npm run build`
5. Restart application: `pm2 restart all`

### Migrating from 2.0.x to 2.1.x

**Database Changes:**
- New tables: `firmware_templates`, `firmware_builds`
- Run migration: `node backend/migrations/migrate.js`

**Configuration Changes:**
- Add firmware builder settings to backend `.env`

**Steps:**
1. Backup database: `pg_dump esp8266_platform > backup.sql`
2. Stop application
3. Pull latest code
4. Run migrations
5. Update dependencies
6. Restart application

### Migrating from 1.x to 2.0.x

**Breaking Changes:**
- Complete authentication system overhaul
- Database schema changes
- API endpoint restructuring

**Recommended Approach:**
1. **Fresh Installation**: Deploy 2.0.x to new server
2. **Data Migration**: Export data from 1.x, import to 2.0.x
3. **Device Re-registration**: Update device firmware to use new API

---

## Contribution

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this changelog.

---

## Links

- [Repository](https://github.com/sensity-app/SensityDashboard)
- [Documentation](docs/)
- [Issue Tracker](https://github.com/sensity-app/SensityDashboard/issues)
- [Releases](https://github.com/sensity-app/SensityDashboard/releases)

---

**Legend:**
- 🎉 **Added**: New features
- 🔄 **Changed**: Changes in existing functionality
- 🗑️ **Deprecated**: Soon-to-be removed features
- ❌ **Removed**: Removed features
- 🐛 **Fixed**: Bug fixes
- 🔒 **Security**: Security improvements
