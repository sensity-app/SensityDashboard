#!/bin/bash

# Sensity Platform - Manual Backend Start Script
# Use this if the backend didn't start automatically after installation

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Configuration - adjust these if needed
APP_DIR="/opt/sensity-platform"
APP_USER="sensityapp"
INSTANCE_NAME="default"

if [[ "$INSTANCE_NAME" == "default" ]]; then
    PM2_APP_NAME="sensity-platform"
else
    PM2_APP_NAME="sensity-platform-${INSTANCE_NAME}"
fi

echo "🔧 Sensity Platform - Manual Backend Start"
echo "=========================================="

# Check if we're running as root
if [[ $EUID -eq 0 ]]; then
    print_error "Do not run this script as root. Run as a regular user with sudo access."
    exit 1
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    print_error "PM2 is not installed. Please run the installation script first."
    exit 1
fi

# Check if application directory exists
if [[ ! -d "$APP_DIR" ]]; then
    print_error "Application directory not found: $APP_DIR"
    exit 1
fi

# Check if ecosystem config exists
if [[ ! -f "$APP_DIR/ecosystem.config.js" ]]; then
    print_error "PM2 ecosystem config not found: $APP_DIR/ecosystem.config.js"
    exit 1
fi

cd "$APP_DIR"

print_status "Checking current PM2 status..."
sudo -u "$APP_USER" pm2 status

print_status "Starting backend with PM2..."
if sudo -u "$APP_USER" pm2 start ecosystem.config.js; then
    print_success "PM2 start command succeeded"
    
    # Wait a moment
    sleep 3
    
    # Check if process is running
    if sudo -u "$APP_USER" pm2 list | grep -q "$PM2_APP_NAME"; then
        print_success "Backend process is running in PM2"
        
        # Save PM2 configuration
        sudo -u "$APP_USER" pm2 save
        print_success "PM2 configuration saved"
        
        # Check if backend is listening
        BACKEND_PORT=$(grep -oP 'PORT:\s*\K\d+' "$APP_DIR/ecosystem.config.js" | head -1)
        if [[ -n "$BACKEND_PORT" ]]; then
            print_status "Checking if backend is listening on port $BACKEND_PORT..."
            if nc -z localhost "$BACKEND_PORT" 2>/dev/null; then
                print_success "✅ Backend is listening on port $BACKEND_PORT"
                print_success "🎉 Backend started successfully!"
                echo
                print_status "You can now access your platform at:"
                if [[ -f "/etc/nginx/sites-enabled/sensity-platform" ]]; then
                    SERVER_IP=$(hostname -I | awk '{print $1}')
                    echo "  http://$SERVER_IP"
                else
                    echo "  http://localhost:$BACKEND_PORT"
                fi
            else
                print_warning "Backend process started but not yet listening on port $BACKEND_PORT"
                print_status "Check logs with: sudo -u $APP_USER pm2 logs $PM2_APP_NAME"
            fi
        fi
    else
        print_error "PM2 process did not start successfully"
        print_status "Check logs:"
        sudo -u "$APP_USER" pm2 logs --lines 20
    fi
else
    print_error "Failed to start PM2 process"
    print_status "Check PM2 status:"
    sudo -u "$APP_USER" pm2 status
fi

echo
print_status "Useful commands:"
echo "  Check status: sudo -u $APP_USER pm2 status"
echo "  View logs: sudo -u $APP_USER pm2 logs $PM2_APP_NAME"
echo "  Restart: sudo -u $APP_USER pm2 restart $PM2_APP_NAME"
echo "  Stop: sudo -u $APP_USER pm2 stop $PM2_APP_NAME"