#!/bin/bash

###############################################################################
# PM2 Fix Script
# Run this script if the backend is not starting after installation
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
APP_USER=${APP_USER:-sensityapp}
APP_DIR=${APP_DIR:-/opt/sensity-platform}
INSTANCE_NAME=${INSTANCE_NAME:-default}

# Determine PM2 app name
if [[ "$INSTANCE_NAME" == "default" ]]; then
    PM2_APP_NAME="sensity-platform"
else
    PM2_APP_NAME="sensity-platform-${INSTANCE_NAME}"
fi

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              Sensity Platform PM2 Fix Script                 ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}" 
   exit 1
fi

# Check if user exists
if ! id "$APP_USER" &>/dev/null; then
    echo -e "${RED}User $APP_USER does not exist${NC}"
    exit 1
fi

# Check if application directory exists
if [[ ! -d "$APP_DIR" ]]; then
    echo -e "${RED}Application directory $APP_DIR does not exist${NC}"
    exit 1
fi

echo -e "${BLUE}[1/8]${NC} Checking ecosystem configuration..."
if [[ ! -f "$APP_DIR/ecosystem.config.js" ]]; then
    echo -e "${RED}Ecosystem config not found: $APP_DIR/ecosystem.config.js${NC}"
    exit 1
fi

echo -e "${BLUE}[2/8]${NC} Validating ecosystem syntax..."
if ! sudo -u "$APP_USER" node -c "$APP_DIR/ecosystem.config.js" 2>&1; then
    echo -e "${RED}Ecosystem config has syntax errors${NC}"
    echo "File contents:"
    cat "$APP_DIR/ecosystem.config.js"
    exit 1
fi
echo -e "${GREEN}✓${NC} Ecosystem configuration is valid"

echo -e "${BLUE}[3/8]${NC} Stopping existing PM2 processes..."
sudo -u "$APP_USER" pm2 stop all 2>/dev/null || true
sudo -u "$APP_USER" pm2 delete all 2>/dev/null || true
echo -e "${GREEN}✓${NC} PM2 processes stopped"

echo -e "${BLUE}[4/8]${NC} Killing PM2 daemon..."
sudo -u "$APP_USER" pm2 kill 2>/dev/null || true
sleep 2
echo -e "${GREEN}✓${NC} PM2 daemon stopped"

echo -e "${BLUE}[5/8]${NC} Starting PM2 with ecosystem config..."
cd "$APP_DIR"
if ! sudo -u "$APP_USER" pm2 start ecosystem.config.js; then
    echo -e "${RED}Failed to start PM2${NC}"
    echo "Checking logs..."
    sudo -u "$APP_USER" pm2 logs --lines 20 --nostream
    exit 1
fi
echo -e "${GREEN}✓${NC} PM2 started successfully"

echo -e "${BLUE}[6/8]${NC} Waiting for backend to initialize..."
sleep 5

echo -e "${BLUE}[7/8]${NC} Checking PM2 status..."
sudo -u "$APP_USER" pm2 status

echo -e "${BLUE}[8/8]${NC} Saving PM2 configuration..."
sudo -u "$APP_USER" pm2 save
echo -e "${GREEN}✓${NC} PM2 configuration saved"

# Check if backend is listening
BACKEND_PORT=$(grep "PORT:" "$APP_DIR/ecosystem.config.js" | grep -oP '\d+' | head -1 || echo "3000")
echo ""
echo -e "${BLUE}Checking if backend is listening on port $BACKEND_PORT...${NC}"
sleep 3

if nc -z localhost "$BACKEND_PORT" 2>/dev/null; then
    echo -e "${GREEN}✓ Backend is listening on port $BACKEND_PORT${NC}"
else
    echo -e "${YELLOW}⚠ Backend is not yet listening on port $BACKEND_PORT${NC}"
    echo "Checking PM2 logs:"
    sudo -u "$APP_USER" pm2 logs --lines 30 --nostream
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    PM2 Fix Complete                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Useful commands:"
echo -e "  Check status:  ${BLUE}sudo -u $APP_USER pm2 status${NC}"
echo -e "  View logs:     ${BLUE}sudo -u $APP_USER pm2 logs${NC}"
echo -e "  Restart:       ${BLUE}sudo -u $APP_USER pm2 restart $PM2_APP_NAME${NC}"
echo ""
