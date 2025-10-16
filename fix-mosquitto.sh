#!/bin/bash

###############################################################################
# Fix Mosquitto MQTT Broker - Permission Issue
#
# This script fixes the common Mosquitto startup issue where the password
# file has incorrect permissions.
###############################################################################

set -e

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

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    print_error "This script must be run as root (use sudo)"
    exit 1
fi

print_status "Fixing Mosquitto MQTT broker..."

# Stop mosquitto
print_status "Stopping Mosquitto service..."
systemctl stop mosquitto 2>/dev/null || true

# Check if password file exists
if [[ ! -f /etc/mosquitto/passwd ]]; then
    print_error "Password file /etc/mosquitto/passwd not found"
    print_status "Creating password file with default user 'iot'..."
    
    # Create password file
    touch /etc/mosquitto/passwd
    
    # Generate password
    MQTT_PASSWORD=$(openssl rand -base64 16 | tr -d '\n')
    
    # Add user
    mosquitto_passwd -b /etc/mosquitto/passwd "iot" "$MQTT_PASSWORD"
    
    print_success "Created MQTT user: iot / $MQTT_PASSWORD"
    echo
    print_warning "IMPORTANT: Save these credentials!"
    echo "Username: iot"
    echo "Password: $MQTT_PASSWORD"
    echo
fi

# Fix password file permissions
print_status "Setting correct permissions on password file..."
chown mosquitto:mosquitto /etc/mosquitto/passwd
chmod 640 /etc/mosquitto/passwd

# Check log directory
if [[ ! -d /var/log/mosquitto ]]; then
    print_status "Creating log directory..."
    mkdir -p /var/log/mosquitto
fi
chown mosquitto:mosquitto /var/log/mosquitto
chmod 755 /var/log/mosquitto

# Check persistence directory
if [[ ! -d /var/lib/mosquitto ]]; then
    print_status "Creating persistence directory..."
    mkdir -p /var/lib/mosquitto
fi
chown mosquitto:mosquitto /var/lib/mosquitto
chmod 755 /var/lib/mosquitto

# Fix configuration file ownership
print_status "Setting correct ownership on configuration files..."
chown mosquitto:mosquitto /etc/mosquitto/*.conf 2>/dev/null || true
chown mosquitto:mosquitto /etc/mosquitto/conf.d/*.conf 2>/dev/null || true

# Test configuration
print_status "Testing Mosquitto configuration..."
if mosquitto -c /etc/mosquitto/mosquitto.conf -t 2>&1 | grep -qi "error"; then
    print_error "Configuration test found errors:"
    mosquitto -c /etc/mosquitto/mosquitto.conf -t
    exit 1
else
    print_success "Configuration test passed"
fi

# Start mosquitto
print_status "Starting Mosquitto service..."
systemctl enable mosquitto
systemctl start mosquitto

# Wait for service to start
sleep 2

# Check status
if systemctl is-active --quiet mosquitto; then
    print_success "Mosquitto MQTT broker is now running!"
    echo
    print_status "Service status:"
    systemctl status mosquitto --no-pager -l
    echo
    print_status "To test MQTT connection:"
    echo "mosquitto_sub -h localhost -p 1883 -u iot -P <password> -t 'test/#' -v"
else
    print_error "Mosquitto failed to start"
    echo
    print_status "Checking logs..."
    journalctl -xeu mosquitto.service -n 30 --no-pager
    echo
    print_status "File permissions:"
    ls -la /etc/mosquitto/passwd
    ls -la /var/log/mosquitto/
    ls -la /var/lib/mosquitto/
    exit 1
fi

print_success "Mosquitto fix completed!"
