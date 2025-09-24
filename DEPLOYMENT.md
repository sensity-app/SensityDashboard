# ESP8266 IoT Platform - Deployment Guide

## 🚀 Quick Deployment Options

### Option 1: Ubuntu Server One-Click Install (Recommended)

For a fresh Ubuntu server (18.04, 20.04, 22.04, or 24.04), run:

```bash
curl -sSL https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/install-ubuntu.sh | sudo bash
```

This script will:
- Install all dependencies (Node.js, PostgreSQL, Redis, Nginx)
- Configure SSL certificates with Let's Encrypt
- Set up firewall and security
- Deploy the application with PM2 process management
- Configure automatic backups and monitoring

### Option 2: Docker Deployment

For containerized deployment:

```bash
# Clone the repository
git clone https://github.com/martinkadlcek/ESP-Management-Platform.git
cd ESP-Management-Platform

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Deploy with Docker Compose
docker-compose up -d
```

### Option 3: Manual Installation

See detailed manual installation steps below.

---

## 📋 System Requirements

### Minimum Requirements
- **OS**: Ubuntu 18.04+ / CentOS 7+ / Debian 10+
- **CPU**: 2 cores
- **RAM**: 2GB
- **Storage**: 20GB SSD
- **Network**: 1 Gbps connection

### Recommended for Production
- **OS**: Ubuntu 22.04 LTS
- **CPU**: 4 cores
- **RAM**: 4GB
- **Storage**: 50GB SSD
- **Network**: 1 Gbps connection
- **SSL Certificate**: Let's Encrypt or commercial

---

## 🔧 Manual Installation

### Prerequisites

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl wget git unzip build-essential
```

### 1. Install Node.js 18

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Install PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database
sudo -u postgres psql << EOF
CREATE USER esp8266app WITH PASSWORD 'your_password_here';
CREATE DATABASE esp8266_platform OWNER esp8266app;
GRANT ALL PRIVILEGES ON DATABASE esp8266_platform TO esp8266app;
EOF
```

### 3. Install Redis

```bash
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

### 4. Install Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

### 5. Deploy Application

```bash
# Create application directory
sudo mkdir -p /opt/esp8266-platform
sudo chown $USER:$USER /opt/esp8266-platform

# Clone repository
git clone https://github.com/martinkadlcek/ESP-Management-Platform.git /opt/esp8266-platform
cd /opt/esp8266-platform

# Install backend dependencies
cd backend
npm ci --production
cd ..

# Build frontend
cd frontend
npm ci
npm run build
cd ..

# Setup database schema
sudo -u postgres psql -d esp8266_platform -f database/schema.sql
```

### 6. Configure Environment

```bash
# Backend configuration
cp backend/.env.example backend/.env
nano backend/.env
```

**Backend Environment Variables:**
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=esp8266_platform
DB_USER=esp8266app
DB_PASSWORD=your_password_here

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# Server
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-domain.com

# Email (configure your SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### 7. Configure Nginx

```bash
sudo tee /etc/nginx/sites-available/esp8266-platform << 'EOF'
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    root /opt/esp8266-platform/frontend/build;
    index index.html;

    # API routes
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Static files
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/esp8266-platform /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
```

### 8. SSL Certificate with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

### 9. Process Management with PM2

```bash
# Install PM2
sudo npm install -g pm2

# Create ecosystem file
tee /opt/esp8266-platform/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'esp8266-platform',
    script: 'backend/server.js',
    cwd: '/opt/esp8266-platform',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
EOF

# Start application
cd /opt/esp8266-platform
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 10. Configure Firewall

```bash
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

---

## 🌐 DNS Configuration

Point your domain to your server:

```
A Record: your-domain.com → YOUR_SERVER_IP
A Record: www.your-domain.com → YOUR_SERVER_IP
```

---

## 🔑 Initial Setup

1. **Access your platform**: Visit `https://your-domain.com`
2. **Initial Setup**: You'll be redirected to the setup page automatically
3. **Create Admin User**:
   - Full Name: Your Name
   - Email: admin@your-domain.com
   - Password: Strong password (8+ characters)
4. **Configuration**: The system will create the initial database structure

---

## 📊 Accessing Features

After initial setup, you can access:

- **🏠 Dashboard**: `https://your-domain.com/`
- **🔧 Device Management**: `https://your-domain.com/devices`
- **📊 Analytics**: `https://your-domain.com/analytics`
- **🔧 Firmware Builder**: `https://your-domain.com/firmware-builder`
- **👥 User Management**: `https://your-domain.com/users` (admin only)

---

## 🛠 Management Commands

### Application Management

```bash
# View logs
pm2 logs esp8266-platform

# Restart application
pm2 restart esp8266-platform

# Stop application
pm2 stop esp8266-platform

# Monitor resources
pm2 monit
```

### Database Management

```bash
# Connect to database
sudo -u postgres psql -d esp8266_platform

# Backup database
sudo -u postgres pg_dump esp8266_platform > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore database
sudo -u postgres psql -d esp8266_platform < backup_file.sql

# View database size
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('esp8266_platform'));"
```

### System Monitoring

```bash
# Check service status
sudo systemctl status nginx postgresql redis-server

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Check disk usage
df -h

# Check memory usage
free -h

# Check system load
htop
```

---

## 🔒 Security Configuration

### SSL/TLS Hardening

Add to your Nginx configuration:

```nginx
# Security headers
add_header X-Frame-Options DENY;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";

# Hide Nginx version
server_tokens off;
```

### Database Security

```bash
# Secure PostgreSQL
sudo -u postgres psql << EOF
ALTER SYSTEM SET ssl = on;
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
SELECT pg_reload_conf();
EOF
```

### Firewall Rules

```bash
# Restrict SSH (optional)
sudo ufw limit ssh

# Allow specific IPs only (optional)
sudo ufw allow from YOUR_OFFICE_IP to any port 22
```

---

## 📈 Performance Optimization

### Node.js Optimization

```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
```

### PostgreSQL Tuning

```bash
sudo nano /etc/postgresql/*/main/postgresql.conf

# Add these settings
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB
```

### Redis Optimization

```bash
sudo nano /etc/redis/redis.conf

# Optimize for IoT workload
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

---

## 🔄 Backup Strategy

### Automated Backups

```bash
# Create backup script
sudo tee /opt/esp8266-platform/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/esp8266-platform"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Database backup
sudo -u postgres pg_dump esp8266_platform | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Application backup
tar -czf $BACKUP_DIR/app_$DATE.tar.gz -C /opt esp8266-platform

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

# Make executable
sudo chmod +x /opt/esp8266-platform/backup.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/esp8266-platform/backup.sh >> /var/log/backup.log 2>&1") | crontab -
```

---

## 🚨 Troubleshooting

### Common Issues

**1. Application won't start**
```bash
# Check logs
pm2 logs esp8266-platform

# Check environment variables
cat /opt/esp8266-platform/backend/.env

# Test database connection
sudo -u postgres psql -d esp8266_platform -c "SELECT version();"
```

**2. SSL certificate issues**
```bash
# Renew certificates manually
sudo certbot renew

# Check certificate status
sudo certbot certificates

# Test SSL configuration
sudo nginx -t
```

**3. High memory usage**
```bash
# Check memory usage by process
ps aux --sort=-%mem | head -10

# Restart services
sudo systemctl restart nginx
pm2 restart esp8266-platform
sudo systemctl restart postgresql
```

**4. Database connection errors**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connections
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### Performance Issues

```bash
# Check server load
uptime

# Monitor real-time performance
htop

# Check disk I/O
iotop

# Network monitoring
iftop
```

---

## 📞 Support

For issues and support:

1. **Check logs** first: `pm2 logs esp8266-platform`
2. **Review this guide** for common solutions
3. **GitHub Issues**: https://github.com/martinkadlcek/ESP-Management-Platform/issues
4. **Documentation**: https://github.com/martinkadlcek/ESP-Management-Platform/blob/main/README.md

---

## 🔄 Updates

To update the platform:

```bash
cd /opt/esp8266-platform

# Backup current version
./backup.sh

# Pull updates
git pull origin main

# Update dependencies
cd backend && npm ci --production && cd ..
cd frontend && npm ci && npm run build && cd ..

# Run migrations (if any)
sudo -u postgres psql -d esp8266_platform -f database/migrations/latest.sql

# Restart application
pm2 restart esp8266-platform
```

---

## ✅ Post-Installation Checklist

- [ ] Domain DNS is configured and pointing to server
- [ ] SSL certificates are installed and auto-renewing
- [ ] Admin user is created and can log in
- [ ] All services are running (nginx, postgresql, redis, pm2)
- [ ] Firewall is configured and active
- [ ] Backups are configured and tested
- [ ] Email/SMS notifications are configured (optional)
- [ ] Firmware builder is accessible and working
- [ ] First test device is created and receiving data

---

**🎉 Your ESP8266 IoT Platform is ready for production!**

Access your platform at: `https://your-domain.com`