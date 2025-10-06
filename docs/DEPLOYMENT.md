# 🚀 Deployment Guide

Complete deployment guide for the ESP8266 IoT Management Platform with automated installation, manual setup, Docker, and cloud deployment options.

## 📋 Table of Contents

- [System Requirements](#system-requirements)
- [Quick Start](#quick-start-automated-installation)
- [Manual Installation](#manual-installation)
- [Docker Deployment](#docker-deployment)
- [Cloud Deployment](#cloud-deployment)
- [Configuration](#configuration)
- [SSL/HTTPS Setup](#ssl-https-setup)
- [Database Setup](#database-setup)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Backup & Restore](#backup--restore)
- [Troubleshooting](#troubleshooting)

---

## 💻 System Requirements

### Minimum Requirements
```
Operating System: Ubuntu 18.04+ / Debian 10+ / CentOS 7+
CPU: 2 cores (2GHz+)
RAM: 2GB
Storage: 20GB SSD
Network: 10 Mbps internet connection
```

### Recommended for Production
```
Operating System: Ubuntu 22.04 LTS
CPU: 4 cores (2.5GHz+)
RAM: 4GB+
Storage: 50GB+ SSD
Network: 100 Mbps internet connection
Domain: Your own domain name
SSL: Let's Encrypt or commercial certificate
```

### Software Requirements
```
Node.js: 18.x or higher
PostgreSQL: 12.x or higher
Redis: 6.x or higher
Nginx: 1.18+ (for production)
PM2: Latest version
Git: 2.x or higher
```

---

## ⚡ Quick Start (Automated Installation)

### Option 1: Interactive Installation (Recommended)

**Download and run the installer:**
```bash
# Download the installer
wget https://raw.githubusercontent.com/sensity-app/SensityDashboard/main/install-ubuntu.sh

# Make it executable
chmod +x install-ubuntu.sh

# Run the interactive installer
sudo ./install-ubuntu.sh
```

The installer will prompt you for:
- Deployment mode (Development or Production)
- Domain name (Production only)
- Email for SSL certificates (Production only)
- Database password

### Option 2: Development Mode (One-Command)

**Quick development setup without domain:**
```bash
export DEVELOPMENT_MODE=true
export DB_PASSWORD=your-secure-password
curl -sSL https://raw.githubusercontent.com/sensity-app/SensityDashboard/main/install-ubuntu.sh | sudo -E bash
```

**Access your platform:**
- URL: `http://YOUR_SERVER_IP` (e.g., http://192.168.1.100)
- No domain required
- No SSL/HTTPS (HTTP only)
- Perfect for testing and development

### Option 3: Production Mode (One-Command)

**Full production setup with HTTPS:**
```bash
export DOMAIN=your-domain.com
export EMAIL=your-email@example.com
export DB_PASSWORD=your-secure-password
curl -sSL https://raw.githubusercontent.com/sensity-app/SensityDashboard/main/install-ubuntu.sh | sudo -E bash
```

**Access your platform:**
- URL: `https://your-domain.com`
- Automatic SSL with Let's Encrypt
- Firewall configured
- Production-ready

### What the Installer Does

✅ **System Preparation:**
- Updates system packages
- Installs required dependencies
- Configures firewall (UFW)

✅ **Database Setup:**
- Installs PostgreSQL
- Creates database and user
- Runs schema initialization
- Sets up database backups

✅ **Application Deployment:**
- Clones repository to `/opt/esp8266-platform`
- Installs Node.js dependencies
- Builds frontend application
- Configures environment variables

✅ **Service Configuration:**
- Installs and configures Nginx (reverse proxy)
- Sets up PM2 for process management
- Configures SSL certificates (production)
- Enables services on boot

✅ **Security Hardening:**
- Configures firewall rules
- Sets up dedicated system user
- Restricts file permissions
- Enables automatic security updates

---

## 🔧 Manual Installation

Use this method if you need more control or the automated installer doesn't work for your environment.

### Step 1: System Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl git build-essential nginx postgresql redis-server ufw

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2
```

### Step 2: Database Setup

```bash
# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql <<EOF
CREATE DATABASE esp8266_platform;
CREATE USER esp8266app WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE esp8266_platform TO esp8266app;
\c esp8266_platform
GRANT ALL ON SCHEMA public TO esp8266app;
EOF
```

### Step 3: Create Application User

```bash
# Create dedicated system user
sudo useradd -r -m -s /bin/bash esp8266app

# Create application directory
sudo mkdir -p /opt/esp8266-platform
sudo chown esp8266app:esp8266app /opt/esp8266-platform
```

### Step 4: Clone and Setup Application

```bash
# Switch to application user
sudo -u esp8266app bash

# Clone repository
cd /opt
git clone https://github.com/sensity-app/SensityDashboard.git esp8266-platform
cd esp8266-platform

# Install backend dependencies
cd backend
npm install
cd ..

# Install frontend dependencies and build
cd frontend
npm install
npm run build
cd ..
```

### Step 5: Configure Environment Variables

```bash
# Create backend .env file
sudo -u esp8266app nano /opt/esp8266-platform/backend/.env
```

**Backend `.env` contents:**
```env
# Server
NODE_ENV=production
PORT=3001

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=esp8266_platform
DB_USER=esp8266app
DB_PASSWORD=your-secure-password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=your-redis-password (if using auth)

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your-very-secure-random-jwt-secret-key-here

# MQTT (optional)
MQTT_BROKER_URL=mqtt://localhost:1883
# MQTT_USERNAME=
# MQTT_PASSWORD=

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Twilio (optional - for SMS alerts)
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# TWILIO_PHONE_NUMBER=

# Frontend URL
FRONTEND_URL=https://your-domain.com

# System
LOG_LEVEL=info
```

**Frontend `.env` contents:**
```bash
sudo -u esp8266app nano /opt/esp8266-platform/frontend/.env
```

```env
REACT_APP_API_URL=https://your-domain.com/api
REACT_APP_WS_URL=wss://your-domain.com
```

### Step 6: Initialize Database

```bash
# Run database schema
sudo -u esp8266app bash
cd /opt/esp8266-platform/backend
PGPASSWORD='your-secure-password' psql -h localhost -U esp8266app -d esp8266_platform -f ../database/schema.sql

# Run migrations
node migrations/migrate.js
```

### Step 7: Start Application with PM2

```bash
# Start backend
sudo -u esp8266app pm2 start /opt/esp8266-platform/backend/server.js --name esp8266-backend

# Save PM2 configuration
sudo -u esp8266app pm2 save

# Setup PM2 startup script
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u esp8266app --hp /home/esp8266app
```

### Step 8: Configure Nginx

**Development Mode (HTTP):**
```bash
sudo nano /etc/nginx/sites-available/esp8266-platform
```

```nginx
server {
    listen 80;
    server_name _;

    # Frontend
    location / {
        root /opt/esp8266-platform/frontend/build;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

**Production Mode (HTTPS) - See [SSL/HTTPS Setup](#ssl-https-setup)**

**Enable site:**
```bash
sudo ln -s /etc/nginx/sites-available/esp8266-platform /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 9: Configure Firewall

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw --force enable
```

### Step 10: Verify Installation

```bash
# Check services
sudo systemctl status nginx
sudo systemctl status postgresql
sudo systemctl status redis-server
sudo -u esp8266app pm2 status

# Check logs
sudo -u esp8266app pm2 logs esp8266-backend --lines 50

# Test API
curl http://localhost:3001/health
```

---

## 🐳 Docker Deployment

### Prerequisites
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install -y docker-compose
```

### Using Docker Compose

**1. Clone repository:**
```bash
git clone https://github.com/sensity-app/SensityDashboard.git
cd SensityDashboard
```

**2. Create environment files:**
```bash
# Copy example files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Edit with your values
nano backend/.env
nano frontend/.env
```

**3. Start services:**
```bash
# Start all services in background
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

**4. Initialize database:**
```bash
# Run schema
docker-compose exec postgres psql -U esp8266app -d esp8266_platform -f /docker-entrypoint-initdb.d/schema.sql

# Run migrations
docker-compose exec backend node migrations/migrate.js
```

**5. Access application:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### Docker Compose Services

**docker-compose.yml** includes:
```yaml
services:
  postgres:      # Database
  redis:         # Cache & sessions
  backend:       # Node.js API
  frontend:      # React app
  nginx:         # Reverse proxy (optional)
```

### Useful Docker Commands

```bash
# Stop all services
docker-compose down

# Rebuild after code changes
docker-compose up -d --build

# View logs for specific service
docker-compose logs -f backend

# Execute command in container
docker-compose exec backend npm install

# Database backup
docker-compose exec postgres pg_dump -U esp8266app esp8266_platform > backup.sql

# Database restore
docker-compose exec -T postgres psql -U esp8266app -d esp8266_platform < backup.sql
```

---

## ☁️ Cloud Deployment

### AWS EC2

**1. Launch EC2 Instance:**
- AMI: Ubuntu 22.04 LTS
- Instance Type: t3.medium (2 vCPU, 4GB RAM)
- Storage: 30GB GP3
- Security Group: Allow ports 22, 80, 443

**2. Connect and deploy:**
```bash
ssh -i your-key.pem ubuntu@your-ec2-ip

# Run automated installer
export DOMAIN=your-domain.com
export EMAIL=your-email@example.com
export DB_PASSWORD=your-secure-password
curl -sSL https://raw.githubusercontent.com/sensity-app/SensityDashboard/main/install-ubuntu.sh | sudo -E bash
```

**3. Point domain to EC2:**
- Get Elastic IP from AWS console
- Update DNS A record to point to Elastic IP

### DigitalOcean Droplet

**1. Create Droplet:**
- Image: Ubuntu 22.04 LTS
- Plan: Basic ($12/month - 2 vCPU, 2GB RAM)
- Add SSH key

**2. Deploy:**
```bash
ssh root@your-droplet-ip

# Run installer
curl -sSL https://raw.githubusercontent.com/sensity-app/SensityDashboard/main/install-ubuntu.sh | sudo bash
```

### Google Cloud Platform (GCP)

**1. Create Compute Engine Instance:**
```bash
gcloud compute instances create esp8266-platform \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --machine-type=e2-medium \
  --boot-disk-size=30GB
```

**2. Configure firewall:**
```bash
gcloud compute firewall-rules create allow-http-https \
  --allow tcp:80,tcp:443 \
  --source-ranges 0.0.0.0/0
```

**3. Connect and deploy:**
```bash
gcloud compute ssh esp8266-platform
# Run installer...
```

### Azure Virtual Machine

**1. Create VM:**
- Size: Standard B2s (2 vCPU, 4GB RAM)
- Image: Ubuntu 22.04 LTS
- Allow ports: 22, 80, 443

**2. Deploy using automated installer**

---

## 🔐 SSL/HTTPS Setup

### Let's Encrypt (Free, Automated)

**Prerequisites:**
- Domain name pointing to your server
- Ports 80 and 443 open

**1. Install Certbot:**
```bash
sudo apt install -y certbot python3-certbot-nginx
```

**2. Obtain certificate:**
```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

**3. Verify auto-renewal:**
```bash
sudo certbot renew --dry-run
```

**Certbot automatically:**
- Updates Nginx configuration
- Obtains SSL certificate
- Configures HTTPS redirect
- Sets up auto-renewal (cron job)

### Manual SSL Certificate

**1. Create Nginx SSL configuration:**
```bash
sudo nano /etc/nginx/sites-available/esp8266-platform-ssl
```

```nginx
# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL certificates
    ssl_certificate /etc/ssl/certs/your-cert.crt;
    ssl_certificate_key /etc/ssl/private/your-key.key;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Frontend
    location / {
        root /opt/esp8266-platform/frontend/build;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**2. Enable and test:**
```bash
sudo ln -s /etc/nginx/sites-available/esp8266-platform-ssl /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 💾 Database Setup

### PostgreSQL Configuration

**Performance tuning for production:**
```bash
sudo nano /etc/postgresql/14/main/postgresql.conf
```

```conf
# Memory (adjust based on available RAM)
shared_buffers = 256MB              # 25% of RAM
effective_cache_size = 1GB           # 50-75% of RAM
maintenance_work_mem = 64MB
work_mem = 4MB

# Connection pooling
max_connections = 100

# Logging
log_statement = 'mod'                # Log modifications
log_duration = on
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d '
```

**Restart PostgreSQL:**
```bash
sudo systemctl restart postgresql
```

### Database Backups

**Automated daily backup script:**
```bash
sudo nano /opt/esp8266-platform/backup-db.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/opt/esp8266-platform/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="esp8266_platform"
DB_USER="esp8266app"
DB_PASS="your-password"

mkdir -p $BACKUP_DIR

# Create backup
PGPASSWORD=$DB_PASS pg_dump -U $DB_USER -h localhost $DB_NAME | gzip > $BACKUP_DIR/backup_$TIMESTAMP.sql.gz

# Keep only last 7 backups
ls -t $BACKUP_DIR/backup_*.sql.gz | tail -n +8 | xargs rm -f

echo "Backup completed: backup_$TIMESTAMP.sql.gz"
```

**Make executable and schedule:**
```bash
sudo chmod +x /opt/esp8266-platform/backup-db.sh
sudo crontab -e
```

Add line:
```cron
0 2 * * * /opt/esp8266-platform/backup-db.sh >> /var/log/esp8266-backup.log 2>&1
```

### Database Restore

```bash
# Stop application
sudo -u esp8266app pm2 stop all

# Restore from backup
gunzip -c /opt/esp8266-platform/backups/backup_YYYYMMDD_HHMMSS.sql.gz | PGPASSWORD='your-password' psql -U esp8266app -h localhost esp8266_platform

# Restart application
sudo -u esp8266app pm2 restart all
```

---

## 📊 Monitoring & Maintenance

### PM2 Monitoring

```bash
# View status
sudo -u esp8266app pm2 status

# View logs
sudo -u esp8266app pm2 logs esp8266-backend --lines 100

# Monitor resources
sudo -u esp8266app pm2 monit

# Restart application
sudo -u esp8266app pm2 restart esp8266-backend

# View detailed info
sudo -u esp8266app pm2 show esp8266-backend
```

### System Monitoring

**Check service status:**
```bash
sudo systemctl status nginx postgresql redis-server
```

**Check disk space:**
```bash
df -h
```

**Check memory usage:**
```bash
free -h
```

**Check system logs:**
```bash
# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log

# System logs
sudo journalctl -u nginx -n 50
```

### Performance Optimization

**Enable Nginx gzip compression:**
```nginx
# Add to /etc/nginx/nginx.conf
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
gzip_min_length 1000;
```

**PostgreSQL query optimization:**
```sql
-- Check slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Analyze table statistics
ANALYZE devices;
ANALYZE telemetry;
```

---

## 🔄 Backup & Restore

### Full System Backup

```bash
#!/bin/bash
# /opt/esp8266-platform/full-backup.sh

BACKUP_DIR="/opt/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="esp8266-full-backup-$TIMESTAMP"

mkdir -p $BACKUP_DIR

# Stop services
sudo -u esp8266app pm2 stop all

# Backup database
PGPASSWORD='your-password' pg_dump -U esp8266app esp8266_platform | gzip > $BACKUP_DIR/$BACKUP_NAME-db.sql.gz

# Backup application files
tar -czf $BACKUP_DIR/$BACKUP_NAME-app.tar.gz \
  /opt/esp8266-platform \
  --exclude=/opt/esp8266-platform/node_modules \
  --exclude=/opt/esp8266-platform/backend/node_modules \
  --exclude=/opt/esp8266-platform/frontend/node_modules

# Backup Nginx configuration
tar -czf $BACKUP_DIR/$BACKUP_NAME-nginx.tar.gz /etc/nginx/sites-available/esp8266-platform

# Restart services
sudo -u esp8266app pm2 restart all

echo "Full backup completed: $BACKUP_NAME"
```

### Restore from Backup

```bash
# Stop services
sudo -u esp8266app pm2 stop all

# Restore database
gunzip -c /opt/backups/esp8266-full-backup-YYYYMMDD_HHMMSS-db.sql.gz | \
  PGPASSWORD='your-password' psql -U esp8266app esp8266_platform

# Restore application files
tar -xzf /opt/backups/esp8266-full-backup-YYYYMMDD_HHMMSS-app.tar.gz -C /

# Restore Nginx config
tar -xzf /opt/backups/esp8266-full-backup-YYYYMMDD_HHMMSS-nginx.tar.gz -C /

# Restart services
sudo systemctl restart nginx
sudo -u esp8266app pm2 restart all
```

---

## 🔧 Troubleshooting

### Application Won't Start

**Check PM2 logs:**
```bash
sudo -u esp8266app pm2 logs esp8266-backend --lines 50
```

**Common issues:**
- Database connection failed → Check PostgreSQL is running, credentials correct
- Port already in use → Check if another service is using port 3001
- Module not found → Run `npm install` in backend directory

### Database Connection Issues

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
PGPASSWORD='your-password' psql -U esp8266app -h localhost -d esp8266_platform -c "SELECT version();"

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

### Nginx 502 Bad Gateway

```bash
# Check backend is running
sudo -u esp8266app pm2 status

# Check backend logs
sudo -u esp8266app pm2 logs

# Test backend directly
curl http://localhost:3001/health

# Check Nginx error log
sudo tail -f /var/log/nginx/error.log
```

### SSL Certificate Issues

```bash
# Test certificate
sudo certbot certificates

# Renew manually
sudo certbot renew --force-renewal

# Check Nginx SSL configuration
sudo nginx -t
```

### High Memory Usage

```bash
# Check PM2 memory usage
sudo -u esp8266app pm2 monit

# Restart application to clear memory
sudo -u esp8266app pm2 restart esp8266-backend

# Check for memory leaks in logs
sudo -u esp8266app pm2 logs --lines 200 | grep -i "memory\|heap"
```

### Devices Not Connecting

**Check firewall:**
```bash
sudo ufw status
# Ensure ports 80, 443 are open
```

**Check API is accessible:**
```bash
curl https://your-domain.com/api/auth/setup-check
```

**Check WebSocket:**
```bash
# Install wscat
npm install -g wscat

# Test WebSocket connection
wscat -c wss://your-domain.com/socket.io/?transport=websocket
```

---

## 📝 Post-Installation Checklist

- [ ] Application accessible via domain/IP
- [ ] SSL certificate working (production)
- [ ] Database connection successful
- [ ] Redis connection successful
- [ ] Can create first admin user
- [ ] Can register test device
- [ ] WebSocket real-time updates working
- [ ] Email notifications configured (if using)
- [ ] Automatic backups scheduled
- [ ] PM2 startup script enabled
- [ ] Firewall rules configured
- [ ] Monitoring set up

---

## 📚 Additional Resources

- [Nginx Documentation](https://nginx.org/en/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)

---

**Last Updated**: October 2025
**Tested On**: Ubuntu 22.04 LTS, Debian 11, Ubuntu 20.04 LTS

For questions or issues, please open an issue on GitHub.
