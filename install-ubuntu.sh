#!/bin/bash

###############################################################################
# ESP8266 IoT Platform - Ubuntu Server Installation Script
#
# This script will install and configure the complete ESP8266 IoT monitoring
# platform on a fresh Ubuntu server (18.04, 20.04, or 22.04).
#
# Features installed:
# - Node.js backend API with WebSocket support
# - React frontend with firmware builder
# - PostgreSQL database
# - Redis cache (optional)
# - Nginx reverse proxy with SSL
# - PM2 process manager
# - UFW firewall configuration
# - Automatic SSL certificates via Let's Encrypt
#
# Usage: curl -sSL https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/install-ubuntu.sh | sudo bash
# Or: wget -qO- https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/install-ubuntu.sh | sudo bash
#
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration variables
DOMAIN=""
EMAIL=""
DB_PASSWORD=""
JWT_SECRET=""
APP_USER="esp8266app"
APP_DIR="/opt/esp8266-platform"
NODE_VERSION="18"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_header() {
    echo -e "${PURPLE}
╔══════════════════════════════════════════════════════════════╗
║                ESP8266 IoT Platform Installer               ║
║                                                              ║
║  This script will install the complete IoT monitoring       ║
║  platform with firmware builder on your Ubuntu server      ║
╚══════════════════════════════════════════════════════════════╝${NC}
"
}

# Function to check if script is run as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Function to detect Ubuntu version
detect_ubuntu() {
    if ! command -v lsb_release &> /dev/null; then
        print_error "This script is designed for Ubuntu. lsb_release not found."
        exit 1
    fi

    UBUNTU_VERSION=$(lsb_release -rs)
    print_status "Detected Ubuntu $UBUNTU_VERSION"

    if [[ ! "$UBUNTU_VERSION" =~ ^(18\.04|20\.04|22\.04|24\.04)$ ]]; then
        print_warning "This script has been tested on Ubuntu 18.04, 20.04, 22.04, and 24.04"
        print_warning "Your version ($UBUNTU_VERSION) may work but is not officially supported"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Function to gather user input
gather_input() {
    echo
    print_status "Configuration Setup"
    echo "Please provide the following information:"
    echo

    # Domain name
    while [[ -z "$DOMAIN" ]]; do
        read -p "Enter your domain name (e.g., iot.example.com): " DOMAIN
        if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
            print_error "Invalid domain name format"
            DOMAIN=""
        fi
    done

    # Email for SSL certificates
    while [[ -z "$EMAIL" ]]; do
        read -p "Enter your email for SSL certificates: " EMAIL
        if [[ ! "$EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
            print_error "Invalid email format"
            EMAIL=""
        fi
    done

    # Database password
    while [[ -z "$DB_PASSWORD" ]]; do
        read -s -p "Enter database password (will be created): " DB_PASSWORD
        echo
        if [[ ${#DB_PASSWORD} -lt 8 ]]; then
            print_error "Password must be at least 8 characters long"
            DB_PASSWORD=""
        fi
    done

    # Generate JWT secret
    JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')

    echo
    print_success "Configuration collected successfully"
}

# Function to update system
update_system() {
    print_status "Updating system packages..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get upgrade -y
    apt-get install -y curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release
    print_success "System updated"
}

# Function to install Node.js
install_nodejs() {
    print_status "Installing Node.js $NODE_VERSION..."

    # Remove any existing Node.js installations
    apt-get remove -y nodejs npm || true

    # Install Node.js from NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    apt-get install -y nodejs

    # Verify installation
    NODE_VER=$(node --version)
    NPM_VER=$(npm --version)
    print_success "Node.js $NODE_VER and npm $NPM_VER installed"
}

# Function to install PostgreSQL
install_postgresql() {
    print_status "Installing PostgreSQL..."

    apt-get install -y postgresql postgresql-contrib

    # Start and enable PostgreSQL
    systemctl start postgresql
    systemctl enable postgresql

    # Create database and user
    sudo -u postgres psql -c "CREATE USER esp8266app WITH PASSWORD '$DB_PASSWORD';"
    sudo -u postgres psql -c "CREATE DATABASE esp8266_platform OWNER esp8266app;"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE esp8266_platform TO esp8266app;"

    print_success "PostgreSQL installed and configured"
}

# Function to install Redis
install_redis() {
    print_status "Installing Redis..."

    apt-get install -y redis-server

    # Configure Redis
    sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf
    sed -i 's/# maxmemory <bytes>/maxmemory 256mb/' /etc/redis/redis.conf
    sed -i 's/# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf

    # Start and enable Redis
    systemctl restart redis-server
    systemctl enable redis-server

    print_success "Redis installed and configured"
}

# Function to create application user
create_app_user() {
    print_status "Creating application user..."

    if ! id "$APP_USER" &>/dev/null; then
        useradd -r -m -s /bin/bash "$APP_USER"
        usermod -aG sudo "$APP_USER"
        print_success "User $APP_USER created"
    else
        print_status "User $APP_USER already exists"
    fi
}

# Function to clone and setup application
setup_application() {
    print_status "Setting up application..."

    # Create application directory
    mkdir -p "$APP_DIR"
    chown "$APP_USER:$APP_USER" "$APP_DIR"

    # Clone repository from GitHub
    print_status "Cloning ESP Management Platform from GitHub..."

    if [[ -d "$APP_DIR/.git" ]]; then
        print_status "Repository already exists, pulling latest changes..."
        cd "$APP_DIR"
        sudo -u "$APP_USER" git pull origin main
    else
        sudo -u "$APP_USER" git clone https://github.com/martinkadlcek/ESP-Management-Platform.git "$APP_DIR"
        cd "$APP_DIR"
    fi

    print_success "Application cloned from GitHub"

    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
    print_success "Application directory prepared"
}

# Function to install application dependencies
install_app_dependencies() {
    print_status "Installing application dependencies..."

    # Install backend dependencies
    if [[ -f "$APP_DIR/backend/package.json" ]]; then
        cd "$APP_DIR/backend"
        sudo -u "$APP_USER" npm ci --production
        print_success "Backend dependencies installed"
    else
        print_warning "Backend package.json not found - skipping backend dependencies"
    fi

    # Install frontend dependencies and build
    if [[ -f "$APP_DIR/frontend/package.json" ]]; then
        cd "$APP_DIR/frontend"
        sudo -u "$APP_USER" npm ci
        sudo -u "$APP_USER" npm run build
        print_success "Frontend built successfully"
    else
        print_warning "Frontend package.json not found - skipping frontend build"
    fi
}

# Function to setup database schema
setup_database() {
    print_status "Setting up database schema..."

    if [[ -f "$APP_DIR/database/schema.sql" ]]; then
        sudo -u postgres psql -d esp8266_platform -f "$APP_DIR/database/schema.sql"
        print_success "Database schema created"
    else
        print_warning "Database schema file not found - you'll need to run migrations manually"
    fi
}

# Function to create environment files
create_env_files() {
    print_status "Creating environment configuration..."

    # Backend environment
    cat > "$APP_DIR/backend/.env" << EOF
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=esp8266_platform
DB_USER=esp8266app
DB_PASSWORD=$DB_PASSWORD

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Configuration
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

# Server Configuration
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://$DOMAIN

# Email Configuration (configure with your SMTP settings)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="ESP8266 Platform <your-email@gmail.com>"

# Twilio Configuration (optional, for SMS alerts)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# File Upload Configuration
MAX_FILE_SIZE=50mb
UPLOAD_PATH=/tmp/uploads

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/esp8266-platform/app.log

# SSL/TLS
USE_HTTPS=true
SSL_CERT_PATH=/etc/letsencrypt/live/$DOMAIN/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/$DOMAIN/privkey.pem
EOF

    # Frontend environment
    cat > "$APP_DIR/frontend/.env.production" << EOF
REACT_APP_API_URL=https://$DOMAIN
REACT_APP_WS_URL=wss://$DOMAIN
REACT_APP_ENVIRONMENT=production
REACT_APP_VERSION=2.1.0
EOF

    chown "$APP_USER:$APP_USER" "$APP_DIR/backend/.env"
    chown "$APP_USER:$APP_USER" "$APP_DIR/frontend/.env.production"
    chmod 600 "$APP_DIR/backend/.env"

    print_success "Environment files created"
}

# Function to install PM2
install_pm2() {
    print_status "Installing PM2 process manager..."

    npm install -g pm2

    # Create PM2 ecosystem file
    cat > "$APP_DIR/ecosystem.config.js" << EOF
module.exports = {
  apps: [{
    name: 'esp8266-platform',
    script: 'backend/server.js',
    cwd: '$APP_DIR',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/esp8266-platform/pm2-error.log',
    out_file: '/var/log/esp8266-platform/pm2-out.log',
    log_file: '/var/log/esp8266-platform/pm2-combined.log',
    time: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '1G'
  }]
};
EOF

    chown "$APP_USER:$APP_USER" "$APP_DIR/ecosystem.config.js"

    # Create log directory
    mkdir -p /var/log/esp8266-platform
    chown "$APP_USER:$APP_USER" /var/log/esp8266-platform

    # Setup PM2 startup script
    sudo -u "$APP_USER" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER"

    print_success "PM2 installed and configured"
}

# Function to install and configure Nginx
install_nginx() {
    print_status "Installing and configuring Nginx..."

    apt-get install -y nginx

    # Create Nginx configuration
    cat > "/etc/nginx/sites-available/$DOMAIN" << EOF
# HTTP redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Modern configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    # Root directory for static files
    root $APP_DIR/frontend/build;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # API routes
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Static files
    location / {
        try_files \$uri \$uri/ /index.html;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Firmware files (if serving them statically)
    location /firmware/ {
        alias $APP_DIR/firmware/;
        expires 1h;
        add_header Cache-Control "public";
    }

    # Disable access to sensitive files
    location ~ /\. {
        deny all;
    }

    location ~ \.(env|log|md)$ {
        deny all;
    }
}
EOF

    # Enable site
    ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/"
    rm -f /etc/nginx/sites-enabled/default

    # Test Nginx configuration
    nginx -t

    print_success "Nginx configured"
}

# Function to install Certbot and get SSL certificates
setup_ssl() {
    print_status "Installing Certbot and obtaining SSL certificates..."

    apt-get install -y certbot python3-certbot-nginx

    # Stop Nginx temporarily
    systemctl stop nginx

    # Get SSL certificate
    certbot certonly --standalone -d "$DOMAIN" -d "www.$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive

    # Setup automatic renewal
    cat > /etc/cron.d/certbot-renew << EOF
0 12 * * * /usr/bin/certbot renew --quiet
EOF

    print_success "SSL certificates obtained and auto-renewal configured"
}

# Function to configure firewall
setup_firewall() {
    print_status "Configuring UFW firewall..."

    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    ufw allow 'Nginx Full'
    ufw --force enable

    print_success "Firewall configured"
}

# Function to start services
start_services() {
    print_status "Starting all services..."

    # Start and enable services
    systemctl start nginx
    systemctl enable nginx

    # Start application with PM2
    cd "$APP_DIR"
    sudo -u "$APP_USER" pm2 start ecosystem.config.js
    sudo -u "$APP_USER" pm2 save

    print_success "All services started"
}

# Function to create initial setup completion file
create_setup_completion() {
    print_status "Finalizing installation..."

    cat > "$APP_DIR/INSTALLATION_INFO.md" << EOF
# ESP8266 IoT Platform - Installation Complete

## Server Information
- **Domain**: https://$DOMAIN
- **Installation Date**: $(date)
- **Application Directory**: $APP_DIR
- **Application User**: $APP_USER

## Service Status
- **Backend**: PM2 managed Node.js application on port 3000
- **Frontend**: Static files served by Nginx
- **Database**: PostgreSQL on localhost:5432
- **Cache**: Redis on localhost:6379
- **Web Server**: Nginx with SSL/TLS

## Important Files
- **Backend Config**: $APP_DIR/backend/.env
- **Frontend Config**: $APP_DIR/frontend/.env.production
- **PM2 Config**: $APP_DIR/ecosystem.config.js
- **Nginx Config**: /etc/nginx/sites-available/$DOMAIN
- **SSL Certificates**: /etc/letsencrypt/live/$DOMAIN/

## Next Steps
1. **Copy your application files** to $APP_DIR (if not done already)
2. **Configure email/SMS settings** in $APP_DIR/backend/.env
3. **Access your platform** at https://$DOMAIN
4. **Register the first admin user** via the web interface
5. **Test the firmware builder** functionality

## Management Commands
\`\`\`bash
# View application logs
sudo -u $APP_USER pm2 logs

# Restart application
sudo -u $APP_USER pm2 restart esp8266-platform

# Check service status
systemctl status nginx
systemctl status postgresql
systemctl status redis-server

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
\`\`\`

## Database Access
\`\`\`bash
# Connect to database
sudo -u postgres psql -d esp8266_platform

# Backup database
sudo -u postgres pg_dump esp8266_platform > backup.sql

# Restore database
sudo -u postgres psql -d esp8266_platform < backup.sql
\`\`\`

## Troubleshooting
- **Check application logs**: sudo -u $APP_USER pm2 logs
- **Check Nginx**: sudo nginx -t && sudo systemctl status nginx
- **Check database**: sudo -u postgres psql -c "SELECT version();"
- **Check Redis**: redis-cli ping

## Security Notes
- Database password is stored in $APP_DIR/backend/.env
- JWT secret is randomly generated
- SSL certificates auto-renew via cron
- UFW firewall is active (SSH + HTTP/HTTPS only)

For support, check the logs and refer to the project documentation:
- GitHub Repository: https://github.com/martinkadlcek/ESP-Management-Platform
- Issues: https://github.com/martinkadlcek/ESP-Management-Platform/issues
- Documentation: https://github.com/martinkadlcek/ESP-Management-Platform/blob/main/README.md
EOF

    chown "$APP_USER:$APP_USER" "$APP_DIR/INSTALLATION_INFO.md"

    print_success "Installation information saved to $APP_DIR/INSTALLATION_INFO.md"
}

# Function to display completion message
show_completion_message() {
    print_header

    echo -e "${GREEN}
╔══════════════════════════════════════════════════════════════╗
║                   🎉 INSTALLATION COMPLETE! 🎉               ║
╚══════════════════════════════════════════════════════════════╝${NC}

${CYAN}Your ESP8266 IoT Platform is now installed and running!${NC}

${YELLOW}📍 Access your platform:${NC}
   🌐 Web Interface: ${BLUE}https://$DOMAIN${NC}
   📊 Admin Dashboard: ${BLUE}https://$DOMAIN/dashboard${NC}
   🔧 Firmware Builder: ${BLUE}https://$DOMAIN/firmware-builder${NC}

${YELLOW}🔑 Next Steps:${NC}
   1. Visit ${BLUE}https://$DOMAIN${NC} to register your first admin user
   2. Configure email/SMS settings for alerts (optional)
   3. Start creating and managing your ESP8266 devices
   4. Use the firmware builder to generate custom firmware

${YELLOW}📋 Important Information:${NC}
   • Installation details: ${BLUE}$APP_DIR/INSTALLATION_INFO.md${NC}
   • Application logs: ${BLUE}sudo -u $APP_USER pm2 logs${NC}
   • Configuration files in: ${BLUE}$APP_DIR/backend/.env${NC}

${YELLOW}🛡️ Security:${NC}
   • SSL/TLS certificates are active and auto-renewing
   • Firewall is configured (SSH + HTTP/HTTPS only)
   • Database is password protected

${GREEN}Happy monitoring with your ESP8266 devices! 🚀${NC}
"
}

# Main installation function
main() {
    print_header

    # Pre-installation checks
    check_root
    detect_ubuntu
    gather_input

    print_status "Starting installation process..."

    # Installation steps
    update_system
    install_nodejs
    install_postgresql
    install_redis
    create_app_user
    setup_application
    install_app_dependencies
    setup_database
    create_env_files
    install_pm2
    install_nginx
    setup_ssl
    setup_firewall
    start_services
    create_setup_completion

    # Show completion message
    show_completion_message

    print_success "Installation completed successfully!"
    print_warning "Remember to copy your application files to $APP_DIR if you haven't done so already."
}

# Handle script termination
trap 'print_error "Installation interrupted. You may need to clean up manually."; exit 1' INT TERM

# Run main installation
main "$@"