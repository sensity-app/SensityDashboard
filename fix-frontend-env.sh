#!/bin/bash

###############################################################################
# Frontend Environment Fix Script
# This script fixes the frontend environment variables for existing installations
###############################################################################

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

APP_DIR="/opt/esp8266-platform"
APP_USER="esp8266app"

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo "This script must be run as root (use sudo)"
    exit 1
fi

# Check if application directory exists
if [[ ! -d "$APP_DIR" ]]; then
    echo "Application directory $APP_DIR not found. Please check your installation."
    exit 1
fi

print_status "Detecting server IP..."
SERVER_IP=$(hostname -I | awk '{print $1}')
print_status "Server IP detected: $SERVER_IP"

print_status "Creating frontend environment file..."

# Create the .env file for development
cat > "$APP_DIR/frontend/.env" << EOF
# Backend API Configuration
REACT_APP_API_URL=http://$SERVER_IP/api
REACT_APP_WS_URL=ws://$SERVER_IP

# App Configuration
REACT_APP_NAME=ESP8266 Sensor Platform
REACT_APP_VERSION=2.1.0

# Chart Configuration
REACT_APP_DEFAULT_CHART_REFRESH_INTERVAL=5000
REACT_APP_MAX_CHART_POINTS=1000

# WebSocket Configuration
REACT_APP_WS_RECONNECT_INTERVAL=5000
REACT_APP_WS_MAX_RECONNECT_ATTEMPTS=5

# Development Configuration
GENERATE_SOURCEMAP=true
SKIP_PREFLIGHT_CHECK=true
EOF

# Create the .env.production file
cat > "$APP_DIR/frontend/.env.production" << EOF
REACT_APP_API_URL=http://$SERVER_IP/api
REACT_APP_WS_URL=ws://$SERVER_IP
REACT_APP_ENVIRONMENT=production
REACT_APP_VERSION=2.1.0
EOF

# Set proper ownership
chown "$APP_USER:$APP_USER" "$APP_DIR/frontend/.env"
chown "$APP_USER:$APP_USER" "$APP_DIR/frontend/.env.production"

print_success "Environment files created"

print_status "Rebuilding frontend with correct environment variables..."

# Rebuild the frontend
cd "$APP_DIR/frontend"
sudo -u "$APP_USER" npm run build

print_success "Frontend rebuilt successfully"

print_status "Restarting services..."

# Restart nginx to serve the new build
systemctl restart nginx

# Restart the backend application
sudo -u "$APP_USER" pm2 restart esp8266-platform || true

print_success "Services restarted"

echo
echo -e "${GREEN}✓ Fix completed successfully!${NC}"
echo -e "${BLUE}Your platform should now be accessible at: http://$SERVER_IP${NC}"
echo -e "${BLUE}The frontend will now connect to the correct backend API at: http://$SERVER_IP/api${NC}"
echo
echo "You should now see the registration form for the first user instead of the login page."