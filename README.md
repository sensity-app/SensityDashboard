# 🚀 ESP8266 IoT Management Platform

A comprehensive web-based platform for managing ESP8266 IoT devices with **drag-and-drop firmware builder**, real-time monitoring, and advanced analytics.

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
- **Temporary Admin Setup** - Auto-creates first admin user, then locks setup
- **Password Reset System** - Email-based password recovery with secure tokens
- **User Invitation System** - Admin can invite users with specific roles
- **Multi-Role Support** - Admin, Operator, and Viewer access levels

### 📊 **Real-Time Monitoring & Analytics**
- **Live Dashboard** with WebSocket updates and interactive charts
- **Multi-Sensor Support** - Temperature, humidity, motion, distance, light, gas, vibration, magnetic, sound
- **Device Health Monitoring** - Memory usage, WiFi signal, battery level, CPU temperature
- **Historical Data Visualization** - Time-range based charts and trend analysis
- **Anomaly Detection** - AI-powered anomaly detection with predictive analytics
- **CSV Export** - Complete data export functionality

### 🚨 **Advanced Alert System**
- **Multi-Channel Notifications** - Email (SMTP), SMS (Twilio), and WebSocket alerts
- **Customizable Alert Rules** - Per-sensor threshold configuration with multiple conditions
- **Alert Escalation** - Multi-level escalation system with delays and severity levels
- **Silent Mode Scheduling** - Time-based quiet hours with granular controls
- **Offline Device Detection** - Automated detection with configurable timeouts
- **Comprehensive Event Logging** - Full alert history and statistics

### 🔧 **Advanced Device Management**
- **Complete Device Lifecycle** - CRUD operations with grouping and tagging system
- **Over-the-Air (OTA) Updates** - Remote firmware updates with progress tracking
- **Remote Configuration** - WiFi setup, device naming, and sensor calibration
- **Dynamic Threshold Adjustment** - Server-controlled threshold updates
- **Location Management** - Geographic organization of devices
- **Device Analytics** - Performance insights and health metrics

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
- ✅ Install all dependencies (Node.js, PostgreSQL, Redis, Nginx)
- ✅ Configure SSL certificates with Let's Encrypt *(Production mode only)*
- ✅ Set up firewall and security
- ✅ Deploy the application with PM2
- ✅ Make it accessible (via IP in development, domain in production)

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

### 2. **Build Your First Firmware**
- Navigate to **Firmware Builder** (`/firmware-builder`)
- Select a template (e.g., "Kitchen Monitor")
- Enter your WiFi credentials
- Click **"Flash to Device"** for direct flashing OR **"Download Firmware"**

### 3. **Deploy ESP8266 Device**
- Connect ESP8266 to your computer via USB
- Flash the generated firmware
- Device automatically connects and starts sending data

### 4. **Monitor & Manage**
- View real-time data in the **Dashboard**
- Set up alerts in **Alert Rules**
- Manage devices in **Device Management**
- Analyze trends in **Analytics**

## 🏗️ Architecture

### Backend (Node.js + Express)
- **RESTful API** with JWT authentication
- **WebSocket Server** for real-time updates
- **PostgreSQL Database** for persistent storage
- **Redis Cache** for session management
- **Firmware Builder API** with JSZip packaging

### Frontend (React + Tailwind CSS)
- **Single Page Application** with React Router
- **Real-time Dashboard** with WebSocket integration
- **Responsive Design** with Tailwind CSS
- **Interactive Charts** with Recharts
- **Web Flashing Interface** with WebSerial API

### Firmware (Arduino/ESP8266)
- **Multi-sensor Support** with configurable pins
- **WiFi Auto-connection** with credentials
- **JSON API Communication** with the platform
- **OTA Update Capability** for remote updates
- **Configurable Thresholds** and sampling rates

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

### Automatic Updates

The platform includes an easy-to-use update system that pulls the latest changes from GitHub:

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
The update script automatically:
- ✅ **Backs up** your current installation
- ✅ **Stops services** safely (PM2, Nginx)
- ✅ **Fetches latest code** from GitHub
- ✅ **Updates dependencies** (npm packages)
- ✅ **Rebuilds frontend** with latest changes
- ✅ **Restarts services** and verifies functionality
- ✅ **Preserves your data** (database, configuration)

### Update Commands

```bash
# Standard system update
sudo ./update-system.sh

# Reset database for first user (development only)
sudo ./update-system.sh reset-first-user

# Show help and available options
./update-system.sh --help
```

### Manual Update Process

If you prefer manual updates:

```bash
# 1. Stop services
sudo -u esp8266app pm2 stop all

# 2. Backup current installation
sudo cp -r /opt/esp8266-platform /opt/esp8266-platform.backup.$(date +%Y%m%d-%H%M%S)

# 3. Update from Git
cd /opt/esp8266-platform
sudo -u esp8266app git pull origin main

# 4. Update dependencies
cd backend && sudo -u esp8266app npm install --production
cd ../frontend && sudo -u esp8266app npm install && sudo -u esp8266app npm run build

# 5. Restart services
sudo -u esp8266app pm2 restart all
```

### Development Mode - First User Reset

If you need to reset the system to allow first-user registration again (useful in development):

```bash
sudo ./update-system.sh reset-first-user
```

This removes all users from the database, allowing the **Initial Setup** page to appear again.

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

### Version Management

Check your current version:
```bash
cd /opt/esp8266-platform
git log --oneline -1  # Latest commit
git tag --list         # Available tags
```

Update to a specific version:
```bash
cd /opt/esp8266-platform
sudo -u esp8266app git checkout v2.1.0  # Replace with desired version
sudo ./update-system.sh
```

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
curl -s http://localhost:3000/api/health || echo "Backend not responding"
curl -s http://your-domain.com/ || echo "Frontend not accessible"
```

**Performance monitoring:**
```bash
# Monitor PM2 processes
sudo -u esp8266app pm2 monit

# Database performance
sudo -u postgres psql -d esp8266_platform -c "SELECT * FROM pg_stat_activity;"

# Server resources
top
htop
```

### Troubleshooting Updates

**Common issues and solutions:**

1. **Update fails due to local changes:**
   ```bash
   cd /opt/esp8266-platform
   sudo -u esp8266app git stash  # Save local changes
   sudo ./update-system.sh
   sudo -u esp8266app git stash pop  # Restore local changes if needed
   ```

2. **Services won't start after update:**
   ```bash
   sudo -u esp8266app pm2 logs  # Check error logs
   sudo systemctl restart nginx
   sudo systemctl status postgresql
   ```

3. **Database migration needed:**
   ```bash
   # Check if new migrations exist
   ls /opt/esp8266-platform/database/migrations/
   # Run migrations if needed
   sudo -u esp8266app npm run migrate
   ```

4. **Frontend build issues:**
   ```bash
   cd /opt/esp8266-platform/frontend
   sudo -u esp8266app rm -rf node_modules package-lock.json
   sudo -u esp8266app npm install
   sudo -u esp8266app npm run build
   ```

### Rollback Process

If an update causes issues, you can rollback:

```bash
# 1. Stop current services
sudo -u esp8266app pm2 stop all

# 2. Restore from backup
sudo rm -rf /opt/esp8266-platform
sudo tar -xzf /path/to/esp8266-backup-YYYYMMDD.tar.gz -C /

# 3. Restore database if needed
sudo -u postgres psql -d esp8266_platform < esp8266-database-YYYYMMDD.sql

# 4. Restart services
sudo -u esp8266app pm2 restart all
```

## 🔧 Supported Sensors

| Sensor Type | Part Number | Pin(s) | Description |
|-------------|-------------|--------|-------------|
| **Temperature/Humidity** | DHT22/DHT11 | D4 | Climate monitoring |
| **Motion Detection** | PIR HC-SR501 | D2 | Movement sensing |
| **Distance Measurement** | HC-SR04 | D5, D6 | Ultrasonic ranging |
| **Light Level** | LDR/Photodiode | A0 | Ambient light sensing |
| **Sound Level** | Microphone | A0 | Noise monitoring |
| **Gas Detection** | MQ-2/MQ-135 | A0 | Air quality/gas leaks |
| **Door/Window** | Reed Switch | D3 | Open/close detection |
| **Vibration** | SW-420 | D7 | Impact/movement sensing |

> **Note**: Only one analog sensor (A0) can be used per device. The firmware builder automatically detects conflicts.

## 🔒 Security Features

- ✅ **HTTPS/SSL** with automatic Let's Encrypt certificates
- ✅ **JWT Authentication** with secure session management
- ✅ **Input Validation** and SQL injection protection
- ✅ **Rate Limiting** on API endpoints
- ✅ **CORS Configuration** for secure cross-origin requests
- ✅ **Firewall Rules** (UFW) with minimal open ports
- ✅ **Password Hashing** with bcrypt

## 📊 Performance

### Scalability
- **Concurrent Users**: 100+ simultaneous firmware builds
- **Device Capacity**: 1000+ ESP8266 devices per instance
- **Data Throughput**: 10,000+ sensor readings per minute
- **Database**: PostgreSQL with automatic archiving

### Optimization Features
- **PM2 Clustering** for Node.js load balancing
- **Redis Caching** for session and frequently accessed data
- **Database Indexing** for fast queries
- **Gzip Compression** for API responses
- **CDN-Ready** static asset delivery

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
psql -d esp8266_platform -f database/schema.sql
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

### Version 2.2 (Next Release)
- [ ] **Mobile App** (React Native) for device management
- [ ] **Advanced Analytics** with machine learning predictions
- [ ] **Multi-tenant Support** for service providers
- [ ] **Backup/Restore** functionality

### Version 2.3 (Future)
- [ ] **Edge Computing** with local processing nodes
- [ ] **Custom Sensor Support** with plugin system
- [ ] **Data Export** to InfluxDB and Grafana
- [ ] **Kubernetes Deployment** templates

## 📞 Support

### Getting Help
- 📚 **Documentation**: Check the docs in this repository
- 🐛 **Bug Reports**: [Create an issue](https://github.com/martinkadlcek/ESP-Management-Platform/issues)
- 💡 **Feature Requests**: [Suggest improvements](https://github.com/martinkadlcek/ESP-Management-Platform/issues)
- 💬 **Discussions**: Use GitHub Discussions for questions

### Troubleshooting
1. **Check logs**: `sudo -u esp8266app pm2 logs`
2. **Update system**: `sudo ./update-system.sh` (fixes most issues)
3. **Reset first user**: `sudo ./update-system.sh reset-first-user` (if login issues)
4. **Check services**: `sudo systemctl status nginx postgresql redis-server`
5. **Review documentation**: See [DEPLOYMENT.md](DEPLOYMENT.md)
6. **Community support**: GitHub Issues and Discussions

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
# Download and run the cleanup script
wget https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/cleanup-installation.sh
chmod +x cleanup-installation.sh
sudo ./cleanup-installation.sh
```

**Quick Manual Commands:**
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