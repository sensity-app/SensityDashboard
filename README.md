# 🚀 ESP8266 IoT Management Platform

A comprehensive web-based platform for managing ESP8266 IoT devices with **drag-and-drop firmware builder**, real-time monitoring, sensor configuration, and advanced analytics.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18+-blue.svg)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-12+-blue.svg)](https://www.postgresql.org/)

## ✨ Key Features

### 🎯 **Web-Based Firmware Builder**
- **🌐 No Arduino IDE Required** - Build and flash firmware directly from your browser
- **🎨 Visual Template Selection** - 6 pre-configured device templates for common use cases
- **⚡ One-Click Web Flashing** - Direct USB flashing via WebSerial API
- **🔧 Custom Configuration** - Point-and-click sensor setup with conflict detection
- **📦 Complete Packages** - Generated firmware includes wiring guides and documentation

### 🔐 **Enterprise Authentication**
- **Secure User Management** - JWT-based authentication with role-based access
- **First-User Registration Flow** - Secure initial admin setup with automatic lockdown
- **Password Reset System** - Email-based password recovery with secure tokens
- **User Invitation System** - Admin can invite users with specific roles
- **Multi-Role Support** - Admin, Operator, and Viewer access levels

### 📊 **Real-Time Monitoring & Analytics**
- **Interactive Dashboard** - Overview with quick stats, recent activity, and quick actions
- **Live Device Monitoring** - WebSocket-powered real-time sensor updates
- **Multi-Sensor Support** - Temperature, humidity, motion, distance, light, gas, vibration, magnetic, sound
- **Device Health Tracking** - Memory usage, WiFi signal, battery level, CPU temperature
- **Historical Data Visualization** - Time-range based charts and trend analysis
- **Sensor Calibration** - Configurable offset and multiplier for accurate readings
- **CSV Export** - Complete data export functionality

### 🚨 **Advanced Alert System**
- **Multi-Channel Notifications** - Email (SMTP), SMS (Twilio), and in-app alerts
- **Customizable Alert Rules** - Per-sensor threshold configuration with multiple conditions
- **Alert Escalation** - Multi-level escalation system with delays and severity levels
- **Silent Mode Scheduling** - Time-based quiet hours with granular controls
- **Offline Device Detection** - Automated detection with configurable timeouts
- **Comprehensive Event Logging** - Full alert history and statistics

### 🔧 **Advanced Device & Sensor Management**
- **Complete Device Lifecycle** - CRUD operations with grouping, tagging, and location organization
- **Dynamic Sensor Configuration** - Edit sensor names, calibration, and thresholds in real-time
- **Over-the-Air (OTA) Updates** - Remote firmware updates with progress tracking
- **Automatic OTA Trigger** - Push sensor configuration changes to devices automatically
- **Protocol Settings** - Configure HTTP/MQTT communication per device
- **Remote Configuration** - WiFi setup, device naming, and sensor calibration
- **Location Management** - Geographic organization of devices
- **Device Analytics** - Performance insights and health metrics

### 🔄 **Platform Updates**
- **Web-Based Update Manager** - Check for and install updates from the settings page
- **Git Integration** - Compare local and remote commits, see available updates
- **One-Click Updates** - Update system with progress tracking
- **Automatic Backups** - Creates backups before updates (keeps 3 most recent)
- **Safe Rollback** - Easy restore from backups if needed

### 🌍 **Internationalization**
- **Multi-Language Support** - Full Czech and English translations
- **Seamless Language Switching** - Change language from any page
- **Consistent Translations** - All UI elements properly localized

## 🎯 Supported Device Templates

### 🍳 **Kitchen Monitor**
- **Sensors**: Temperature, humidity, motion, light, gas detection
- **Use Cases**: Food safety, energy efficiency, security
- **Pin Layout**: DHT22 (D4), PIR (D2), LDR (A0), Gas sensor option

### 🛡️ **Security Node**
- **Sensors**: Motion, distance, door/window, vibration detection
- **Use Cases**: Perimeter security, intrusion detection, tamper alerts
- **Pin Layout**: PIR (D2), HC-SR04 (D5/D6), Reed switch (D3), Vibration (D7)

### 🌿 **Environmental Monitor**
- **Sensors**: Temperature, humidity, light, air quality
- **Use Cases**: Climate control, comfort monitoring, HVAC optimization
- **Pin Layout**: DHT22 (D4), LDR (A0), Optional gas sensor

### 🏡 **Greenhouse Monitor**
- **Sensors**: Climate, light, water level, door monitoring
- **Use Cases**: Plant care, irrigation alerts, growth optimization
- **Pin Layout**: DHT22 (D4), Distance sensor (D5/D6), Reed switch (D3)

### 🌡️ **Simple Temperature Monitor**
- **Sensors**: Basic temperature and humidity
- **Use Cases**: Learning IoT, basic home monitoring
- **Pin Layout**: DHT22 (D4) only

### 🔨 **Workshop Monitor**
- **Sensors**: Sound level, vibration, air quality, motion
- **Use Cases**: Noise monitoring, equipment safety, occupancy
- **Pin Layout**: Sound (A0), Vibration (D7), PIR (D2)

## 🚀 Quick Start

### Option 1: One-Click Ubuntu Install (Recommended)

**Interactive Installation:**
```bash
wget https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/install-ubuntu.sh
chmod +x install-ubuntu.sh
sudo ./install-ubuntu.sh
```

**Development Mode (HTTP, no domain required):**
```bash
export DEVELOPMENT_MODE=true
export DB_PASSWORD=your-secure-password
curl -sSL https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/install-ubuntu.sh | sudo -E bash
```

**Production Mode (HTTPS with domain):**
```bash
export DOMAIN=your-domain.com
export EMAIL=your-email@example.com
export DB_PASSWORD=your-secure-password
curl -sSL https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/install-ubuntu.sh | sudo -E bash
```

This will:
- ✅ Install all dependencies (Node.js, PostgreSQL, Redis, Nginx, MQTT Broker)
- ✅ Configure SSL certificates with Let's Encrypt *(Production mode only)*
- ✅ Set up firewall and security
- ✅ Deploy the application with PM2
- ✅ Make it accessible (via IP in development, domain in production)
- ✅ Clean up old backups automatically (keeps 3 most recent)

**Development Mode Benefits:**
- 🚀 Quick setup without domain requirements
- 💻 Perfect for testing and development
- 🔗 Access via server IP address (e.g., `http://192.168.1.100`)
- 🔧 Easy transition to production mode later

### Option 2: Docker Deployment

```bash
git clone https://github.com/martinkadlcek/ESP-Management-Platform.git
cd ESP-Management-Platform
docker-compose up -d
```

### Option 3: Manual Installation

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed manual installation instructions.

## 🌐 Usage

### 1. **Initial Setup**
- Visit your domain (e.g., `https://your-domain.com`)
- Complete the first-time admin user setup
- The system automatically creates the database structure
- No default users are created - system remains secure until you register

### 2. **Build Your First Firmware**
- Navigate to **Firmware Builder** (`/firmware-builder`)
- Select a template (e.g., "Kitchen Monitor")
- Configure your sensors and thresholds
- Enter your WiFi credentials
- Click **"Flash to Device"** for direct flashing OR **"Download Firmware"**

### 3. **Deploy ESP8266 Device**
- Connect ESP8266 to your computer via USB
- Flash the generated firmware
- Device automatically connects and registers in the platform
- Sensors start sending data immediately

### 4. **Manage Sensors**
- Navigate to device detail page from **Dashboard** or **Device Management**
- Click the ⚙️ gear icon on any sensor card to edit configuration
- Adjust calibration offset and multiplier for accurate readings
- Enable/disable sensors as needed
- Check **"Trigger OTA Update"** to push changes to device automatically

### 5. **Monitor & Analyze**
- View real-time data in the **Dashboard** with quick stats and recent activity
- Monitor individual devices in **Device Detail** pages
- Set up alerts in **Settings → Alert Rules**
- Configure protocol settings (HTTP/MQTT) per device
- Check for platform updates in **Settings → Platform Update**

## 🏗️ Architecture

### Backend (Node.js + Express)
- **RESTful API** with JWT authentication and role-based access control
- **WebSocket Server** for real-time device updates
- **PostgreSQL Database** for persistent storage with full schema management
- **Redis Cache** for session management and performance
- **MQTT Broker Integration** for device communication
- **Firmware Builder API** with JSZip packaging and configuration generation
- **OTA Update System** with progress tracking
- **Telemetry Processor** for sensor data ingestion and rule evaluation

### Frontend (React + Tailwind CSS)
- **Single Page Application** with React Router v6
- **Real-time Dashboard** with WebSocket integration and live updates
- **Responsive Design** with Tailwind CSS utility-first framework
- **Interactive Charts** for historical data visualization
- **Web Flashing Interface** with WebSerial API
- **Multi-Language Support** with i18next (Czech + English)
- **Optimized Animations** for smooth user experience
- **React Query** for efficient data fetching and caching

### Firmware (Arduino/ESP8266)
- **Multi-sensor Support** with configurable pins
- **WiFi Auto-connection** with credentials from firmware builder
- **JSON API Communication** with the platform
- **MQTT Support** for lightweight communication
- **OTA Update Capability** for remote firmware updates
- **Configurable Thresholds** applied during sensor reads
- **Health Reporting** with memory, WiFi signal, and uptime metrics

## 📋 System Requirements

### Minimum Requirements
- **OS**: Ubuntu 18.04+ / CentOS 7+ / Debian 10+
- **CPU**: 2 cores
- **RAM**: 2GB
- **Storage**: 20GB SSD
- **Network**: Internet connection for SSL certificates

### Recommended for Production
- **OS**: Ubuntu 22.04 LTS
- **CPU**: 4 cores
- **RAM**: 4GB+
- **Storage**: 50GB+ SSD
- **Network**: 1 Gbps connection
- **SSL**: Let's Encrypt or commercial certificate

## 🔄 System Updates & Maintenance

### Web-Based Updates (Recommended)

The platform includes a built-in update manager accessible from the web interface:

1. Navigate to **Settings → Platform Update**
2. System automatically checks for newer commits on GitHub
3. Shows current commit, remote commit, and number of commits behind
4. Click **"Update Platform"** to start the update process
5. Monitor progress in real-time
6. System restarts automatically after successful update

### Command-Line Updates

**Download and run the update script:**
```bash
wget https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/update-system.sh
chmod +x update-system.sh
sudo ./update-system.sh
```

**Or use curl:**
```bash
curl -sSL https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/update-system.sh | sudo bash
```

### Update Process
The update system automatically:
- ✅ **Backs up** your current installation
- ✅ **Stops services** safely (PM2, Nginx)
- ✅ **Fetches latest code** from GitHub
- ✅ **Updates dependencies** (npm packages)
- ✅ **Runs database migrations** if needed
- ✅ **Rebuilds frontend** with latest changes
- ✅ **Restarts services** and verifies functionality
- ✅ **Preserves your data** (database, configuration, .env files)
- ✅ **Cleans old backups** (keeps 3 most recent)

### Monitoring & Health Checks

**Check system status:**
```bash
# PM2 processes
sudo -u esp8266app pm2 status
sudo -u esp8266app pm2 logs --lines 50

# Service status
sudo systemctl status nginx postgresql redis-server

# Disk space and system resources
df -h
free -h

# Check platform health
curl -s http://localhost:3001/api/system/info
```

**Performance monitoring:**
```bash
# Monitor PM2 processes
sudo -u esp8266app pm2 monit

# Database performance
sudo -u postgres psql -d esp8266_platform -c "SELECT * FROM pg_stat_activity;"
```

### Backup & Restore

**Create a backup:**
```bash
# Application files
sudo tar -czf esp8266-backup-$(date +%Y%m%d).tar.gz /opt/esp8266-platform

# Database backup
sudo -u postgres pg_dump esp8266_platform > esp8266-database-$(date +%Y%m%d).sql
```

**Restore from backup:**
```bash
# Restore application files
sudo tar -xzf esp8266-backup-YYYYMMDD.tar.gz -C /

# Restore database
sudo -u postgres psql -d esp8266_platform < esp8266-database-YYYYMMDD.sql
sudo -u esp8266app pm2 restart all
```

## 🔧 Supported Sensors

| Sensor Type | Part Number | Pin(s) | Description | Calibration Support |
|-------------|-------------|--------|-------------|-------------------|
| **Temperature/Humidity** | DHT22/DHT11 | D4 | Climate monitoring | ✅ Offset + Multiplier |
| **Motion Detection** | PIR HC-SR501 | D2 | Movement sensing | - |
| **Distance Measurement** | HC-SR04 | D5, D6 | Ultrasonic ranging | ✅ Offset + Multiplier |
| **Light Level** | LDR/Photodiode | A0 | Ambient light sensing | ✅ Offset + Multiplier |
| **Sound Level** | Microphone | A0 | Noise monitoring | ✅ Offset + Multiplier |
| **Gas Detection** | MQ-2/MQ-135 | A0 | Air quality/gas leaks | ✅ Offset + Multiplier |
| **Door/Window** | Reed Switch | D3 | Open/close detection | - |
| **Vibration** | SW-420 | D7 | Impact/movement sensing | - |

> **Note**: Only one analog sensor (A0) can be used per device. The firmware builder automatically detects conflicts.
>
> **Calibration**: Adjust sensor readings in real-time via the web interface. Changes can be pushed to devices via OTA updates.

## 🔒 Security Features

- ✅ **HTTPS/SSL** with automatic Let's Encrypt certificates
- ✅ **JWT Authentication** with secure session management
- ✅ **Role-Based Access Control** (Admin, Operator, Viewer)
- ✅ **Input Validation** and SQL injection protection via express-validator
- ✅ **Rate Limiting** on API endpoints to prevent abuse
- ✅ **CORS Configuration** for secure cross-origin requests
- ✅ **Firewall Rules** (UFW) with minimal open ports
- ✅ **Password Hashing** with bcrypt (10 rounds)
- ✅ **Security Event Logging** for audit trails
- ✅ **Device Authentication** via unique API keys

## 📊 Performance

### Scalability
- **Concurrent Users**: 100+ simultaneous sessions
- **Device Capacity**: 1000+ ESP8266 devices per instance
- **Data Throughput**: 10,000+ sensor readings per minute
- **Database**: PostgreSQL with indexes on critical queries
- **Real-time Updates**: WebSocket connections with Redis pub/sub

### Optimization Features
- **PM2 Clustering** for Node.js load balancing
- **Redis Caching** for session and frequently accessed data
- **Database Indexing** on devices, sensors, and telemetry tables
- **Query Optimization** with select functions in React Query
- **Gzip Compression** for API responses
- **Efficient Animations** with reduced durations for better UX

## 🛠️ Development

### Local Development Setup

```bash
# Clone repository
git clone https://github.com/martinkadlcek/ESP-Management-Platform.git
cd ESP-Management-Platform

# Backend setup
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
npm run dev

# Frontend setup (new terminal)
cd frontend
npm install
npm start

# Database setup
createdb esp8266_platform
npm run migrate  # Runs migrations from backend/migrations/
```

### Project Structure

```
ESP-Management-Platform/
├── backend/
│   ├── src/
│   │   ├── models/         # Database models and initialization
│   │   ├── routes/         # API endpoints (auth, devices, telemetry, etc.)
│   │   ├── middleware/     # Authentication and authorization
│   │   ├── services/       # Business logic (telemetry, OTA, alerts)
│   │   └── utils/          # Helpers and utilities
│   ├── migrations/         # Database migration scripts
│   └── server.js           # Express app entry point
├── frontend/
│   ├── src/
│   │   ├── pages/          # React page components
│   │   ├── components/     # Reusable React components
│   │   ├── services/       # API client and WebSocket
│   │   └── i18n/           # Translation files (cs, en)
│   └── public/             # Static assets
├── database/
│   └── schema.sql          # Initial database schema
└── install-ubuntu.sh       # Automated installation script
```

### Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

## 📖 Documentation

- **[Deployment Guide](DEPLOYMENT.md)** - Complete installation instructions
- **[Firmware Builder Guide](FIRMWARE_BUILDER_README.md)** - Detailed firmware builder documentation
- **[API Documentation](docs/API.md)** - REST API reference
- **[Hardware Guide](docs/HARDWARE.md)** - Sensor wiring and specifications

## 🎯 Use Cases

### Home Automation
- **Smart Home Monitoring** with temperature, motion, and door sensors
- **Energy Efficiency** tracking with occupancy and light sensors
- **Security Systems** with motion, vibration, and door sensors

### Agriculture & Gardening
- **Greenhouse Monitoring** with climate and soil sensors
- **Irrigation Management** with water level and moisture sensors
- **Growth Optimization** with light and environmental tracking

### Industrial & Workshop
- **Equipment Monitoring** with vibration and sound sensors
- **Safety Compliance** with air quality and noise monitoring
- **Predictive Maintenance** with sensor trend analysis

### Educational & Learning
- **IoT Education** with simple temperature monitoring
- **STEM Projects** with customizable sensor combinations
- **Rapid Prototyping** with web-based firmware generation

## 📈 Roadmap

### Version 2.2 (Current)
- [x] **Sensor Management UI** - Edit sensor configuration from web interface
- [x] **OTA Trigger System** - Automatic firmware updates on configuration changes
- [x] **Platform Update Manager** - Web-based system updates with Git integration
- [x] **Czech Translation** - Full localization support
- [x] **Dashboard Redesign** - Clearer separation from device management
- [x] **Enhanced Error Handling** - Better API response handling throughout

### Version 2.3 (Next Release)
- [ ] **Mobile App** (React Native) for device management
- [ ] **Advanced Analytics** with machine learning predictions
- [ ] **Sensor Rules Editor** - Web-based threshold and alert configuration
- [ ] **Data Export** to InfluxDB and Grafana
- [ ] **Backup/Restore** UI for easy data management

### Version 2.4 (Future)
- [ ] **Multi-tenant Support** for service providers
- [ ] **Edge Computing** with local processing nodes
- [ ] **Custom Sensor Support** with plugin system
- [ ] **Kubernetes Deployment** templates

## 📞 Support

### Getting Help
- 📚 **Documentation**: Check the docs in this repository
- 🐛 **Bug Reports**: [Create an issue](https://github.com/martinkadlcek/ESP-Management-Platform/issues)
- 💡 **Feature Requests**: [Suggest improvements](https://github.com/martinkadlcek/ESP-Management-Platform/issues)
- 💬 **Discussions**: Use GitHub Discussions for questions

### Troubleshooting

**Common Issues:**

1. **Sensors not showing in device detail**
   - Check browser console for "Sensors API response:" log
   - Verify sensors were configured during firmware build
   - Ensure device is online and sending data

2. **Device edit modal not opening**
   - Clear browser cache and reload
   - Check browser console for errors
   - Verify you have operator or admin role

3. **Platform update not working**
   - Ensure `update-system.sh` script exists in project root
   - Check that Git can fetch from remote repository
   - Review PM2 logs: `sudo -u esp8266app pm2 logs`

4. **Login issues after update**
   - JWT tokens may have changed - log out and log back in
   - Check backend logs for authentication errors
   - Verify database migrations ran successfully

**Diagnostic Commands:**
```bash
# Check all services
sudo systemctl status nginx postgresql redis-server
sudo -u esp8266app pm2 status

# View logs
sudo -u esp8266app pm2 logs --lines 100
sudo journalctl -u nginx -n 50

# Database check
sudo -u postgres psql -d esp8266_platform -c "SELECT COUNT(*) FROM users;"
sudo -u postgres psql -d esp8266_platform -c "SELECT COUNT(*) FROM devices;"
```

### Failed Installation Recovery

If your installation fails or you need to start over:

**Automatic Cleanup (Recommended):**
```bash
# The installer will detect existing components and offer cleanup
wget https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/install-ubuntu.sh
sudo ./install-ubuntu.sh
```

**Manual Cleanup:**
```bash
# Stop services
sudo systemctl stop nginx postgresql redis-server
sudo -u esp8266app pm2 delete all && sudo -u esp8266app pm2 kill

# Remove components
sudo rm -rf /opt/esp8266-platform
sudo userdel -r esp8266app
sudo -u postgres dropdb esp8266_platform
sudo -u postgres dropuser esp8266app

# Clean nginx config
sudo rm -f /etc/nginx/sites-*/esp8266-platform
sudo systemctl restart nginx
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **ESP8266 Community** for excellent hardware and libraries
- **Node.js and React** ecosystems for robust development tools
- **Open Source Contributors** who make projects like this possible
- **Arduino Community** for making IoT accessible to everyone

---

## 🎉 Ready to Get Started?

### Quick Deploy

**Interactive Installation:**
```bash
wget https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/install-ubuntu.sh
chmod +x install-ubuntu.sh
sudo ./install-ubuntu.sh
```

**Development Mode (HTTP only):**
```bash
export DEVELOPMENT_MODE=true DB_PASSWORD=your-password
curl -sSL https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/install-ubuntu.sh | sudo -E bash
```

**Production Mode (HTTPS):**
```bash
export DOMAIN=your-domain.com EMAIL=your-email@example.com DB_PASSWORD=your-password
curl -sSL https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/install-ubuntu.sh | sudo -E bash
```

### Or Explore First
- 🌟 **Star this repository** if you find it useful
- 🍴 **Fork it** to customize for your needs
- 📖 **Read the docs** in [DEPLOYMENT.md](DEPLOYMENT.md)
- 💬 **Ask questions** in GitHub Issues

**Build your IoT empire with drag-and-drop simplicity!** 🚀
