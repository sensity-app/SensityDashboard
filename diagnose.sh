#!/bin/bash

# Sensity Platform Diagnostic Script
# Run this on your server to diagnose backend connectivity issues

echo "🔍 Sensity Platform Diagnostic Tool"
echo "=================================="

# Check if services are running
echo
echo "📊 Service Status:"
echo "------------------"

# Check Nginx
if systemctl is-active --quiet nginx; then
    echo "✅ Nginx: Running"
else
    echo "❌ Nginx: Not running"
    systemctl status nginx --no-pager -l | head -10
fi

# Check PostgreSQL
if systemctl is-active --quiet postgresql; then
    echo "✅ PostgreSQL: Running"
else
    echo "❌ PostgreSQL: Not running"
    systemctl status postgresql --no-pager -l | head -10
fi

# Check Redis
if systemctl is-active --quiet redis-server; then
    echo "✅ Redis: Running"
else
    echo "❌ Redis: Not running"
    systemctl status redis-server --no-pager -l | head -10
fi

# Check PM2 processes
APP_USER=${APP_USER:-sensityapp}
if command -v pm2 &> /dev/null; then
    echo "Checking PM2 for user: $APP_USER"
    
    # Check as root first
    PM2_STATUS=$(pm2 jlist 2>/dev/null)
    if [[ $? -eq 0 ]] && [[ "$PM2_STATUS" != "[]" ]]; then
        echo "✅ PM2 (root): Running processes found"
        pm2 status
    else
        echo "❌ PM2 (root): No processes running"
    fi
    
    # Check as app user
    if id "$APP_USER" &>/dev/null; then
        echo "Checking PM2 for user $APP_USER:"
        PM2_USER_STATUS=$(sudo -u "$APP_USER" pm2 jlist 2>/dev/null)
        if [[ $? -eq 0 ]] && [[ "$PM2_USER_STATUS" != "[]" ]]; then
            echo "✅ PM2 ($APP_USER): Running processes found"
            sudo -u "$APP_USER" pm2 status
        else
            echo "❌ PM2 ($APP_USER): No processes running"
            sudo -u "$APP_USER" pm2 status
        fi
        
        # Check PM2 systemd service
        if systemctl is-active --quiet "pm2-$APP_USER.service" 2>/dev/null; then
            echo "✅ PM2 systemd service (pm2-$APP_USER): Active"
        else
            echo "❌ PM2 systemd service (pm2-$APP_USER): Not active"
            echo "Service status:"
            systemctl status "pm2-$APP_USER.service" --no-pager -l 2>&1 | head -15
        fi
    else
        echo "⚠️  User $APP_USER does not exist"
    fi
else
    echo "❌ PM2: Not installed"
fi

echo
echo "🔌 Network Connectivity:"
echo "-----------------------"

# Check if backend port is listening
BACKEND_PORT=${BACKEND_PORT:-3000}
if nc -z localhost "$BACKEND_PORT" 2>/dev/null; then
    echo "✅ Backend port $BACKEND_PORT: Listening"
else
    echo "❌ Backend port $BACKEND_PORT: Not listening"
fi

# Check Nginx configuration
echo
echo "🌐 Nginx Configuration:"
echo "----------------------"
if [[ -f /etc/nginx/sites-enabled/sensity-platform* ]]; then
    echo "✅ Nginx site configuration found"
    nginx -t 2>&1
else
    echo "❌ No Sensity Nginx configuration found"
    ls -la /etc/nginx/sites-enabled/
fi

# Test API endpoint
echo
echo "🔗 API Connectivity Test:"
echo "------------------------"
if nc -z localhost "$BACKEND_PORT" 2>/dev/null; then
    # Try to connect to the API
    API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$BACKEND_PORT/api/auth/setup-check 2>/dev/null || echo "000")
    if [[ "$API_RESPONSE" == "200" ]] || [[ "$API_RESPONSE" == "404" ]] || [[ "$API_RESPONSE" == "500" ]]; then
        echo "✅ Backend API responding (HTTP $API_RESPONSE)"
    else
        echo "❌ Backend API not responding (connection failed)"
    fi
else
    echo "❌ Cannot test API - backend not listening"
fi

# Check logs
echo
echo "📝 Recent Logs:"
echo "--------------"

# Check ecosystem config
APP_DIR=${APP_DIR:-/opt/sensity-platform}
echo "Ecosystem Configuration:"
if [[ -f "$APP_DIR/ecosystem.config.js" ]]; then
    echo "✅ Ecosystem file found: $APP_DIR/ecosystem.config.js"
    echo "Validating syntax..."
    if node -c "$APP_DIR/ecosystem.config.js" 2>&1; then
        echo "✅ Ecosystem file syntax is valid"
    else
        echo "❌ Ecosystem file has syntax errors"
    fi
else
    echo "❌ Ecosystem file not found at $APP_DIR/ecosystem.config.js"
fi

echo
if command -v pm2 &> /dev/null; then
    echo "PM2 Logs (last 10 lines):"
    pm2 logs --lines 10 2>/dev/null || echo "No PM2 logs available"
fi

echo
echo "Nginx Error Logs (last 10 lines):"
tail -10 /var/log/nginx/error.log 2>/dev/null || echo "No Nginx error logs available"

echo
echo "🔧 Quick Fixes:"
echo "---------------"
echo "1. Restart services: sudo systemctl restart nginx redis-server postgresql"
echo "2. Restart PM2 (as $APP_USER): sudo -u $APP_USER pm2 restart all"
echo "3. Start PM2 with config: sudo -u $APP_USER pm2 start $APP_DIR/ecosystem.config.js"
echo "4. Check PM2 logs: sudo -u $APP_USER pm2 logs"
echo "5. Check Nginx config: sudo nginx -t"
echo "6. Reload Nginx: sudo systemctl reload nginx"
echo "7. Restart PM2 systemd service: sudo systemctl restart pm2-$APP_USER"
echo "8. Check PM2 daemon: sudo -u $APP_USER pm2 ping"