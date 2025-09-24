#!/bin/bash

###############################################################################
# ESP8266 IoT Platform - Installation Verification Script
#
# This script verifies that all components are properly installed and accessible
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_check() {
    echo -e "${BLUE}[CHECK]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_header() {
    echo -e "${BLUE}
╔══════════════════════════════════════════════════════════════╗
║              ESP8266 Platform - Verification                ║
╚══════════════════════════════════════════════════════════════╝${NC}
"
}

# Configuration
DOMAIN=${1:-"localhost"}
PORT=${2:-"3000"}
USE_HTTPS=${3:-"false"}

if [[ "$USE_HTTPS" == "true" ]]; then
    PROTOCOL="https"
    BASE_URL="https://$DOMAIN"
else
    PROTOCOL="http"
    BASE_URL="http://$DOMAIN:$PORT"
fi

print_header
echo "Verifying installation for: $BASE_URL"
echo

# Check 1: System Dependencies
print_check "Checking system dependencies..."

if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node --version)
    print_success "Node.js is installed: $NODE_VERSION"
else
    print_error "Node.js is not installed"
    exit 1
fi

if command -v npm >/dev/null 2>&1; then
    NPM_VERSION=$(npm --version)
    print_success "npm is installed: $NPM_VERSION"
else
    print_error "npm is not installed"
    exit 1
fi

if command -v psql >/dev/null 2>&1; then
    print_success "PostgreSQL client is available"
else
    print_warning "PostgreSQL client not found (may be installed but not in PATH)"
fi

if command -v redis-cli >/dev/null 2>&1; then
    print_success "Redis client is available"
else
    print_warning "Redis client not found (may be installed but not in PATH)"
fi

if [[ "$USE_HTTPS" == "true" ]] && command -v nginx >/dev/null 2>&1; then
    print_success "Nginx is available"
else
    if [[ "$USE_HTTPS" == "true" ]]; then
        print_warning "Nginx not found (needed for HTTPS)"
    fi
fi

echo

# Check 2: File Structure
print_check "Checking project structure..."

if [[ -f "backend/server.js" ]]; then
    print_success "Backend server file found"
else
    print_error "Backend server file not found"
    exit 1
fi

if [[ -f "backend/package.json" ]]; then
    print_success "Backend package.json found"
else
    print_error "Backend package.json not found"
    exit 1
fi

if [[ -f "frontend/package.json" ]]; then
    print_success "Frontend package.json found"
else
    print_error "Frontend package.json not found"
    exit 1
fi

if [[ -f "firmware/esp8266_sensor_platform.ino" ]]; then
    print_success "ESP8266 firmware file found"
else
    print_error "ESP8266 firmware file not found"
    exit 1
fi

if [[ -f "firmware/device_config.h" ]]; then
    print_success "Device configuration header found"
else
    print_error "Device configuration header not found"
    exit 1
fi

echo

# Check 3: Database Connection
print_check "Checking database connection..."

if command -v psql >/dev/null 2>&1; then
    if sudo -u postgres psql -c "SELECT version();" >/dev/null 2>&1; then
        print_success "PostgreSQL is running and accessible"

        if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw esp8266_platform; then
            print_success "esp8266_platform database exists"
        else
            print_warning "esp8266_platform database not found"
        fi
    else
        print_error "Cannot connect to PostgreSQL"
    fi
else
    print_warning "Cannot check PostgreSQL (psql not available)"
fi

echo

# Check 4: Redis Connection
print_check "Checking Redis connection..."

if command -v redis-cli >/dev/null 2>&1; then
    if redis-cli ping >/dev/null 2>&1; then
        print_success "Redis is running and responding"
    else
        print_error "Cannot connect to Redis"
    fi
else
    print_warning "Cannot check Redis (redis-cli not available)"
fi

echo

# Check 5: Backend Dependencies
print_check "Checking backend dependencies..."

if [[ -d "backend/node_modules" ]]; then
    print_success "Backend node_modules directory exists"

    # Check specific required packages
    if [[ -d "backend/node_modules/express" ]]; then
        print_success "Express.js is installed"
    else
        print_error "Express.js not found"
    fi

    if [[ -d "backend/node_modules/pg" ]]; then
        print_success "PostgreSQL client is installed"
    else
        print_error "PostgreSQL client not found"
    fi

    if [[ -d "backend/node_modules/socket.io" ]]; then
        print_success "Socket.IO is installed"
    else
        print_error "Socket.IO not found"
    fi

    if [[ -d "backend/node_modules/jszip" ]]; then
        print_success "JSZip is installed (firmware builder)"
    else
        print_error "JSZip not found (needed for firmware builder)"
    fi
else
    print_error "Backend dependencies not installed. Run: cd backend && npm install"
    exit 1
fi

echo

# Check 6: Frontend Build
print_check "Checking frontend build..."

if [[ -d "frontend/build" ]]; then
    print_success "Frontend build directory exists"

    if [[ -f "frontend/build/index.html" ]]; then
        print_success "Frontend index.html found"
    else
        print_error "Frontend index.html not found"
    fi

    if [[ -d "frontend/build/static" ]]; then
        print_success "Frontend static assets found"
    else
        print_error "Frontend static assets not found"
    fi
else
    print_warning "Frontend not built. Run: cd frontend && npm run build"
fi

echo

# Check 7: Environment Configuration
print_check "Checking environment configuration..."

if [[ -f "backend/.env" ]]; then
    print_success "Backend .env file found"

    # Check if key variables are set
    if grep -q "DB_PASSWORD=" "backend/.env" && ! grep -q "DB_PASSWORD=$" "backend/.env"; then
        print_success "Database password is configured"
    else
        print_warning "Database password not set in .env"
    fi

    if grep -q "JWT_SECRET=" "backend/.env" && ! grep -q "JWT_SECRET=$" "backend/.env"; then
        print_success "JWT secret is configured"
    else
        print_warning "JWT secret not set in .env"
    fi
else
    print_warning "Backend .env file not found. Copy from .env.example"
fi

echo

# Check 8: Service Accessibility (if running)
print_check "Checking service accessibility..."

# Test if backend is running
if curl -s --max-time 5 "$BASE_URL/api/auth/setup-check" >/dev/null 2>&1; then
    print_success "Backend API is accessible"

    # Test specific endpoints
    SETUP_RESPONSE=$(curl -s --max-time 5 "$BASE_URL/api/auth/setup-check")
    if echo "$SETUP_RESPONSE" | grep -q "needsSetup"; then
        print_success "Setup check endpoint working"
    else
        print_warning "Setup check endpoint not responding correctly"
    fi

    # Test firmware builder endpoints
    if curl -s --max-time 5 "$BASE_URL/api/firmware-builder/sensor-options" >/dev/null 2>&1; then
        print_success "Firmware builder API is accessible"
    else
        print_error "Firmware builder API not accessible"
    fi

    # Test template endpoints
    if curl -s --max-time 5 "$BASE_URL/api/firmware-templates" >/dev/null 2>&1; then
        print_success "Firmware templates API is accessible"
    else
        print_error "Firmware templates API not accessible"
    fi

else
    print_warning "Backend API not accessible (may not be running)"
fi

# Test frontend accessibility
if curl -s --max-time 5 "$BASE_URL" >/dev/null 2>&1; then
    print_success "Frontend is accessible"
else
    print_warning "Frontend not accessible (may not be running or deployed)"
fi

echo

# Check 9: Port Usage
print_check "Checking port usage..."

if command -v netstat >/dev/null 2>&1; then
    if netstat -tlnp 2>/dev/null | grep -q ":3000"; then
        print_success "Port 3000 is in use (likely backend)"
    else
        print_warning "Port 3000 not in use (backend may not be running)"
    fi

    if netstat -tlnp 2>/dev/null | grep -q ":5432"; then
        print_success "Port 5432 is in use (PostgreSQL)"
    else
        print_warning "Port 5432 not in use (PostgreSQL may not be running)"
    fi

    if netstat -tlnp 2>/dev/null | grep -q ":6379"; then
        print_success "Port 6379 is in use (Redis)"
    else
        print_warning "Port 6379 not in use (Redis may not be running)"
    fi

    if [[ "$USE_HTTPS" == "true" ]]; then
        if netstat -tlnp 2>/dev/null | grep -q ":80\|:443"; then
            print_success "HTTP/HTTPS ports are in use (Nginx)"
        else
            print_warning "HTTP/HTTPS ports not in use (Nginx may not be running)"
        fi
    fi
else
    print_warning "Cannot check port usage (netstat not available)"
fi

echo

# Check 10: SSL Configuration (if HTTPS)
if [[ "$USE_HTTPS" == "true" ]]; then
    print_check "Checking SSL configuration..."

    if [[ -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
        print_success "SSL certificates found for $DOMAIN"

        if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]] && [[ -f "/etc/letsencrypt/live/$DOMAIN/privkey.pem" ]]; then
            print_success "SSL certificate files are present"

            # Check if certificate is not expired
            if openssl x509 -checkend 86400 -noout -in "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" >/dev/null 2>&1; then
                print_success "SSL certificate is valid"
            else
                print_warning "SSL certificate may be expired or expiring soon"
            fi
        else
            print_error "SSL certificate files not found"
        fi
    else
        print_warning "No SSL certificates found for $DOMAIN"
    fi
fi

echo

# Final Summary
print_check "Generating summary..."
echo

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗"
echo -e "║                    VERIFICATION SUMMARY                     ║"
echo -e "╚══════════════════════════════════════════════════════════════╝${NC}"

echo -e "📍 Platform URL: ${GREEN}$BASE_URL${NC}"
echo -e "🔧 Firmware Builder: ${GREEN}$BASE_URL/firmware-builder${NC}"
echo -e "📊 Dashboard: ${GREEN}$BASE_URL/dashboard${NC}"

echo
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. If backend is not running: cd backend && npm start"
echo "2. If you need to build frontend: cd frontend && npm run build"
echo "3. Access $BASE_URL to complete initial setup"
echo "4. Configure email/SMS settings in backend/.env (optional)"
echo "5. Test firmware builder functionality"
echo
echo -e "${YELLOW}Support Resources:${NC}"
echo "• GitHub: https://github.com/martinkadlcek/ESP-Management-Platform"
echo "• Issues: https://github.com/martinkadlcek/ESP-Management-Platform/issues"
echo "• Docs: https://github.com/martinkadlcek/ESP-Management-Platform/blob/main/README.md"

echo
echo -e "${GREEN}Verification completed!${NC}"

# Exit with error code if critical issues found
if [[ -f "backend/server.js" ]] && [[ -f "backend/package.json" ]] && [[ -d "backend/node_modules" ]]; then
    echo -e "${GREEN}✓ Installation appears to be complete${NC}"
    exit 0
else
    echo -e "${RED}✗ Critical components missing${NC}"
    exit 1
fi