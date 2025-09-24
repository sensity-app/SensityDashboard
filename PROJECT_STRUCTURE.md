# 📁 ESP8266 IoT Management Platform - Project Structure

## 🗂️ Directory Overview

```
ESP-Management-Platform/
├── 📚 README.md                     # Main project documentation
├── 🚀 DEPLOYMENT.md                 # Complete deployment guide
├── 🔧 FIRMWARE_BUILDER_README.md    # Firmware builder documentation
├── ⚡ install-ubuntu.sh             # One-click Ubuntu installer
├── 🎯 quick-start.sh               # Interactive deployment menu
├── ✅ verify-installation.sh        # Installation verification
├── 🐳 docker-compose.yml           # Docker deployment
├── 📋 .gitignore                   # Git ignore rules
├── 📋 .gitattributes               # Git attributes
│
├── 🖥️  backend/                     # Node.js API Server
│   ├── 📦 package.json             # Dependencies & scripts
│   ├── ⚙️  .env.example            # Environment template
│   ├── 🚀 server.js                # Main server entry point
│   ├── 🐳 Dockerfile               # Docker container config
│   ├── 📁 src/
│   │   ├── 🔧 middleware/          # Auth, validation, etc.
│   │   ├── 📊 models/              # Database models
│   │   ├── 🛤️  routes/             # API endpoints
│   │   │   ├── 🔐 auth.js          # Authentication
│   │   │   ├── 📱 devices.js       # Device management
│   │   │   ├── 🚨 alerts.js        # Alert system
│   │   │   ├── 📊 telemetry.js     # Sensor data
│   │   │   ├── 🏗️  firmwareBuilder.js # Firmware generator
│   │   │   └── 📋 firmwareTemplates.js # Device templates
│   │   ├── 🔧 services/            # Business logic
│   │   └── 🛠️  utils/              # Helper functions
│   └── 🗄️  migrations/            # Database migrations
│
├── 🎨 frontend/                    # React Web Application
│   ├── 📦 package.json            # Dependencies & scripts
│   ├── ⚙️  .env.example           # Environment template
│   ├── 🐳 Dockerfile              # Docker container config
│   ├── 🔗 public/                 # Static assets
│   └── 📁 src/
│       ├── 🧩 components/         # Reusable UI components
│       │   └── 🔧 WebFlasher.jsx  # Web-based ESP8266 flashing
│       ├── 📄 pages/              # Application pages
│       │   ├── 🏠 Dashboard.jsx   # Main dashboard
│       │   ├── 📱 DeviceManagement.jsx # Device control
│       │   └── ⚡ FirmwareBuilder.jsx # Firmware generator
│       └── 🔧 services/           # API communication
│
├── 💾 database/                   # Database Schema
│   └── 🗄️  schema.sql            # PostgreSQL table definitions
│
└── 🔌 firmware/                  # ESP8266 Arduino Code
    ├── 📟 esp8266_sensor_platform.ino # Main firmware
    ├── ⚙️  device_config.h        # Configuration header
    └── 📁 examples/               # Pre-built templates
        ├── 📋 README.md           # Usage instructions
        ├── 🍳 kitchen_monitor.h   # Kitchen monitoring
        ├── 🛡️  security_node.h    # Security system
        ├── 🌿 environmental_monitor.h # Climate control
        └── 🏡 greenhouse_monitor.h # Plant monitoring
```

## 🎯 Key Components

### 🖥️ Backend (Node.js + Express)
**Purpose**: RESTful API server with WebSocket support
- **Authentication**: JWT-based user management
- **Device API**: ESP8266 device registration and telemetry
- **Firmware Builder**: Dynamic Arduino code generation
- **Real-time**: WebSocket for live dashboard updates

### 🎨 Frontend (React + Tailwind)
**Purpose**: Web-based user interface
- **Dashboard**: Real-time device monitoring
- **Firmware Builder**: Visual ESP8266 configuration
- **Web Flashing**: Direct USB programming via WebSerial
- **Device Management**: Bulk operations and analytics

### 🔌 Firmware (Arduino/ESP8266)
**Purpose**: IoT device code with multi-sensor support
- **Auto-configuration**: Pre-filled WiFi and server settings
- **Multi-sensor**: Temperature, motion, distance, light, gas, etc.
- **OTA Updates**: Remote firmware updates
- **JSON API**: Structured data transmission

### 💾 Database (PostgreSQL)
**Purpose**: Persistent data storage
- **Users & Authentication**: Role-based access control
- **Devices**: Registration, configuration, status
- **Telemetry**: Time-series sensor data
- **Alerts**: Rules, notifications, history

## 🚀 Deployment Files

### ⚡ install-ubuntu.sh
**One-click Ubuntu server deployment**
- Installs all dependencies (Node.js, PostgreSQL, Redis, Nginx)
- Configures SSL certificates with Let's Encrypt
- Sets up firewall and security
- Deploys application with PM2 process management

### 🎯 quick-start.sh
**Interactive deployment menu**
- Ubuntu install, Docker deployment, or manual setup
- Installation verification tools
- Documentation browser

### ✅ verify-installation.sh
**Installation health check**
- Verifies all components are working
- Tests API endpoints and database connectivity
- Validates SSL certificates and security

### 🐳 docker-compose.yml
**Container deployment**
- Multi-service Docker setup
- PostgreSQL, Redis, Node.js, and Nginx
- Development and production configurations

## 📚 Documentation Files

### 📚 README.md
**Main project documentation**
- Feature overview and screenshots
- Quick start instructions
- API documentation links
- Use cases and examples

### 🚀 DEPLOYMENT.md
**Comprehensive deployment guide**
- Manual installation steps
- Configuration examples
- Troubleshooting guide
- Production optimizations

### 🔧 FIRMWARE_BUILDER_README.md
**Firmware builder documentation**
- Template system explanation
- Web flashing instructions
- Sensor configuration guide
- Hardware compatibility

## 🎨 Template System

The firmware builder includes 6 pre-configured templates:

### 🍳 Kitchen Monitor
- **Sensors**: DHT22, PIR, LDR, Gas sensor
- **Use Case**: Food safety, energy efficiency
- **Features**: Temperature alerts, motion detection

### 🛡️ Security Node
- **Sensors**: PIR, HC-SR04, Reed switch, Vibration
- **Use Case**: Perimeter security, intrusion detection
- **Features**: Multi-sensor alerts, tamper detection

### 🌿 Environmental Monitor
- **Sensors**: DHT22, LDR, Air quality
- **Use Case**: Climate control, HVAC optimization
- **Features**: Comfort monitoring, trend analysis

### 🏡 Greenhouse Monitor
- **Sensors**: DHT22, Distance sensor, Reed switch
- **Use Case**: Plant care, irrigation management
- **Features**: Growth optimization, water level alerts

### 🌡️ Simple Temperature Monitor
- **Sensors**: DHT22 only
- **Use Case**: Learning IoT, basic monitoring
- **Features**: Beginner-friendly, minimal setup

### 🔨 Workshop Monitor
- **Sensors**: Sound level, Vibration, Air quality
- **Use Case**: Safety monitoring, noise compliance
- **Features**: Equipment monitoring, safety alerts

## 🔧 Essential Files Only

**This project structure contains only essential files:**
- ✅ **Core application code** (backend, frontend, firmware)
- ✅ **Deployment automation** (install scripts, Docker)
- ✅ **Complete documentation** (setup, usage, API)
- ✅ **Configuration templates** (.env examples)
- ✅ **Database schema** (PostgreSQL tables)

**Removed unnecessary files:**
- ❌ Temporary documentation drafts
- ❌ Duplicate deployment guides
- ❌ Development status files
- ❌ Backup and temporary files

## 🎯 Getting Started

1. **Clone repository**: `git clone https://github.com/martinkadlcek/ESP-Management-Platform.git`
2. **Choose deployment**: Ubuntu script, Docker, or manual
3. **Access platform**: Web interface at your domain
4. **Build firmware**: Use the visual firmware builder
5. **Deploy devices**: Flash ESP8266 and start monitoring

**Everything you need is included - no external dependencies or setup required!** 🚀