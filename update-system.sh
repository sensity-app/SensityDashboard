#!/bin/bash

###############################################################################
# ESP8266 IoT Platform - System Update Script
#
# This script updates the system from the latest GitHub version
###############################################################################

set -e

# Configuration
APP_USER="esp8266app"
APP_DIR="/opt/esp8266-platform"
REPO_URL="https://github.com/martinkadlcek/ESP-Management-Platform.git"

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

check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

update_system() {
    print_status "🔄 Updating ESP8266 IoT Platform..."

    # Stop PM2 processes
    print_status "Stopping services..."
    sudo -u "$APP_USER" pm2 stop all 2>/dev/null || true

    # Backup current version
    print_status "Creating backup..."
    cp -r "$APP_DIR" "$APP_DIR.backup.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true

    # Update from Git
    print_status "Fetching latest version from GitHub..."
    cd "$APP_DIR"
    sudo -u "$APP_USER" git fetch origin
    sudo -u "$APP_USER" git reset --hard origin/main

    # Update dependencies
    print_status "Updating backend dependencies..."
    cd "$APP_DIR/backend"
    sudo -u "$APP_USER" npm install --production

    print_status "Updating and building frontend..."
    cd "$APP_DIR/frontend"
    sudo -u "$APP_USER" npm install
    sudo -u "$APP_USER" npm run build

    # Restart services
    print_status "Restarting services..."
    sudo -u "$APP_USER" pm2 restart all
    sudo -u "$APP_USER" pm2 save

    print_success "✅ System updated successfully!"
    echo
    print_status "📊 Check status: sudo -u $APP_USER pm2 status"
    print_status "📝 View logs: sudo -u $APP_USER pm2 logs"
}

reset_first_user() {
    print_status "🔄 Resetting database for first user setup..."
    print_warning "This will remove ALL users and allow first-user registration again!"

    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Clear users table only
        sudo -u postgres psql -d esp8266_platform -c "DELETE FROM users;" 2>/dev/null || true
        print_success "✅ Database reset completed - you can now register the first admin user"
    else
        print_status "Reset cancelled"
    fi
}

# Main script logic
main() {
    check_root

    if [[ "$1" == "reset-first-user" ]]; then
        reset_first_user
    elif [[ "$1" == "update" ]] || [[ "$1" == "" ]]; then
        update_system
    else
        echo "ESP8266 IoT Platform Update Script"
        echo
        echo "Usage:"
        echo "  sudo $0                    # Update system from GitHub"
        echo "  sudo $0 update             # Update system from GitHub"
        echo "  sudo $0 reset-first-user   # Reset database to allow first user registration"
        echo
    fi
}

main "$@"