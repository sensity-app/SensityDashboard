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

### 📊 **Real-Time Monitoring**
- **Live Dashboard** with WebSocket updates
- **Multi-Sensor Support** - Temperature, humidity, motion, distance, light, gas, vibration
- **Interactive Charts** with historical data visualization
- **Device Health Monitoring** with uptime and connectivity status

### 🚨 **Advanced Alerting**
- **Rule-Based Alerts** with customizable thresholds
- **Multi-Channel Notifications** - Email, SMS, WebSocket
- **Alert Escalation** with severity levels and acknowledgments
- **Scheduled Reporting** with automated summaries

### 🔧 **Device Management**
- **Bulk Device Operations** with grouping and tagging
- **Over-the-Air (OTA) Updates** with rollback capability
- **Remote Configuration** without device access
- **Device Analytics** with performance insights

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
1. **Check logs**: `pm2 logs esp8266-platform`
2. **Verify installation**: `./verify-installation.sh your-domain.com`
3. **Review documentation**: See [DEPLOYMENT.md](DEPLOYMENT.md)
4. **Community support**: GitHub Issues and Discussions

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