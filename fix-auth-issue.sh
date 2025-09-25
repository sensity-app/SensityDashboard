#!/bin/bash

###############################################################################
# Authentication Fix Script
# This script fixes the /api/auth/me endpoint bug and adds debugging
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

print_status "Fixing authentication bug in /api/auth/me endpoint..."

# Fix the bug in auth.js where req.user.userId should be req.user.id
cd "$APP_DIR/backend/src/routes"

# Create backup
cp auth.js auth.js.backup

# Fix the userId reference
sed -i 's/req\.user\.userId/req.user.id/g' auth.js

print_success "Authentication endpoint fixed"

print_status "Adding debugging to check JWT_SECRET..."

# Let's also add some debugging to the auth middleware to see what's happening
cat > "$APP_DIR/debug-auth.js" << 'EOF'
const jwt = require('jsonwebtoken');

console.log('JWT_SECRET available:', !!process.env.JWT_SECRET);
console.log('JWT_SECRET length:', process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 'undefined');

// Test token verification
const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTYzOTY4MjQwMCwiZXhwIjoxNjM5NzY4ODAwfQ.example';
try {
    const decoded = jwt.verify(testToken, process.env.JWT_SECRET);
    console.log('JWT verification would work');
} catch (error) {
    console.log('JWT verification error type:', error.name);
}
EOF

chown "$APP_USER:$APP_USER" "$APP_DIR/debug-auth.js"

print_status "Restarting backend to apply fixes..."

# Restart the backend
sudo -u "$APP_USER" pm2 restart esp8266-platform

print_success "Backend restarted"

print_status "Running auth debugging..."
cd "$APP_DIR"
sudo -u "$APP_USER" node debug-auth.js

echo
echo -e "${GREEN}✓ Authentication fix completed!${NC}"
echo -e "${BLUE}The /api/auth/me endpoint should now work correctly${NC}"
echo
echo "To test manually:"
echo "1. Log in again and get a fresh token"
echo "2. Test: curl -H \"Authorization: Bearer YOUR_TOKEN\" http://192.168.64.8/api/auth/me"
echo
echo "If you still have issues, check the PM2 logs:"
echo "sudo -u esp8266app pm2 logs"