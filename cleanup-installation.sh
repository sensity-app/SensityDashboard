#!/bin/bash

###############################################################################
# ESP8266 IoT Platform - Installation Cleanup Script
#
# This script removes all components of a failed or existing installation
# Repository: https://github.com/martinkadlcek/ESP-Management-Platform
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
APP_USER="esp8266app"
APP_DIR="/opt/esp8266-platform"

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
    echo -e "${BLUE}
╔══════════════════════════════════════════════════════════════╗
║         ESP8266 IoT Platform - Installation Cleanup         ║
║                                                              ║
║  This script will remove all components of the platform     ║
╚══════════════════════════════════════════════════════════════╝${NC}
"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

cleanup_installation() {
    print_status "Starting cleanup process..."

    # Stop services
    print_status "Stopping services..."
    systemctl stop nginx 2>/dev/null || true
    systemctl stop postgresql 2>/dev/null || true
    systemctl stop redis-server 2>/dev/null || true

    # Stop and remove PM2 processes
    if id "$APP_USER" &>/dev/null; then
        print_status "Stopping PM2 processes..."
        sudo -u "$APP_USER" pm2 delete all 2>/dev/null || true
        sudo -u "$APP_USER" pm2 kill 2>/dev/null || true
    fi

    # Remove application directory
    if [[ -d "$APP_DIR" ]]; then
        print_status "Removing application directory ($APP_DIR)..."
        rm -rf "$APP_DIR"
        print_success "Application directory removed"
    fi

    # Remove application user
    if id "$APP_USER" &>/dev/null; then
        print_status "Removing application user ($APP_USER)..."
        userdel -r "$APP_USER" 2>/dev/null || true
        print_success "Application user removed"
    fi

    # Remove database and user (database must be dropped before user due to ownership)
    if command -v psql >/dev/null 2>&1; then
        if sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw esp8266_platform; then
            print_status "Removing database (esp8266_platform)..."
            # Terminate any active connections to the database
            sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'esp8266_platform' AND pid <> pg_backend_pid();" 2>/dev/null || true
            # Drop the database
            sudo -u postgres dropdb esp8266_platform 2>/dev/null || true
            print_success "Database removed"
        fi

        if sudo -u postgres psql -t -c '\du' 2>/dev/null | cut -d \| -f 1 | grep -qw esp8266app; then
            print_status "Removing database user (esp8266app)..."
            sudo -u postgres dropuser esp8266app 2>/dev/null || true
            print_success "Database user removed"
        fi
    fi

    # Remove nginx configurations
    print_status "Removing nginx configurations..."
    rm -f /etc/nginx/sites-enabled/esp8266-platform 2>/dev/null || true
    rm -f /etc/nginx/sites-available/esp8266-platform 2>/dev/null || true

    # Remove any domain-specific configs
    find /etc/nginx/sites-available/ -name "*esp8266*" -delete 2>/dev/null || true
    find /etc/nginx/sites-enabled/ -name "*esp8266*" -delete 2>/dev/null || true

    print_success "Nginx configurations removed"

    # Remove SSL certificates (ask for domain if certificates exist)
    if command -v certbot >/dev/null 2>&1 && [[ -d /etc/letsencrypt/live ]]; then
        for domain_dir in /etc/letsencrypt/live/*/; do
            if [[ -d "$domain_dir" ]]; then
                domain=$(basename "$domain_dir")
                if [[ "$domain" != "*" ]]; then
                    print_status "Found SSL certificate for domain: $domain"
                    read -p "Remove SSL certificate for $domain? (y/N): " -n 1 -r
                    echo
                    if [[ $REPLY =~ ^[Yy]$ ]]; then
                        certbot delete --cert-name "$domain" --non-interactive 2>/dev/null || true
                        print_success "SSL certificate for $domain removed"
                    fi
                fi
            fi
        done
    fi

    # Remove cron jobs
    print_status "Removing cron jobs..."
    rm -f /etc/cron.d/certbot-renew 2>/dev/null || true
    print_success "Cron jobs removed"

    # Reset firewall (optional)
    echo
    read -p "Reset firewall to default settings? This will remove ALL firewall rules! (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Resetting firewall..."
        ufw --force reset >/dev/null 2>&1 || true
        print_success "Firewall reset"
    else
        print_status "Firewall left unchanged"
    fi

    # Restart nginx if it's installed
    if command -v nginx >/dev/null 2>&1; then
        print_status "Restarting nginx..."
        nginx -t && systemctl restart nginx || print_warning "Nginx configuration may need manual attention"
    fi

    print_success "Cleanup completed successfully!"
    echo
    print_status "The system is now ready for a fresh installation."
    print_status "You can run the installer again: wget https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/install-ubuntu.sh"
}

show_components() {
    print_status "Checking for existing installation components..."
    echo

    local found=false

    # Check application directory
    if [[ -d "$APP_DIR" ]]; then
        echo "  ✓ Application directory: $APP_DIR"
        found=true
    fi

    # Check user
    if id "$APP_USER" &>/dev/null; then
        echo "  ✓ Application user: $APP_USER"
        found=true
    fi

    # Check database
    if command -v psql >/dev/null 2>&1 && sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw esp8266_platform; then
        echo "  ✓ Database: esp8266_platform"
        found=true
    fi

    # Check nginx configs
    if [[ -f "/etc/nginx/sites-available/esp8266-platform" ]] || ls /etc/nginx/sites-available/*esp8266* >/dev/null 2>&1; then
        echo "  ✓ Nginx configuration files"
        found=true
    fi

    # Check PM2 processes
    if id "$APP_USER" &>/dev/null && sudo -u "$APP_USER" pm2 list 2>/dev/null | grep -q "esp8266"; then
        echo "  ✓ PM2 processes running"
        found=true
    fi

    # Check SSL certificates
    if [[ -d /etc/letsencrypt/live ]] && ls /etc/letsencrypt/live/ >/dev/null 2>&1; then
        echo "  ✓ SSL certificates found"
        found=true
    fi

    if [[ "$found" == "false" ]]; then
        print_success "No installation components found."
        echo
        exit 0
    fi

    echo
}

main() {
    print_header
    check_root

    show_components

    echo "This will remove ALL components of the ESP8266 IoT Platform installation."
    print_warning "This action cannot be undone!"
    echo
    read -p "Continue with cleanup? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cleanup_installation
    else
        print_status "Cleanup cancelled."
        exit 0
    fi
}

# Handle script termination
trap 'print_error "Cleanup interrupted."; exit 1' INT TERM

main "$@"