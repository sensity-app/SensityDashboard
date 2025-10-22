#!/bin/bash

echo "=========================================="
echo "  SENSITY PLATFORM DIAGNOSTICS"
echo "=========================================="
echo

# Check database
echo "1. Checking database sensor types..."
COUNT=$(sudo -u postgres psql -d sensity_dev -t -c "SELECT COUNT(*) FROM sensor_types;" | tr -d ' ')
echo "   Sensor types in DB: $COUNT"
echo

# Check if migration 008 ran
echo "2. Checking migration history..."
MIGRATION_008=$(sudo -u postgres psql -d sensity_dev -t -c "SELECT COUNT(*) FROM migrations WHERE migration_name = '008_ensure_sensor_types.sql';" | tr -d ' ')
if [ "$MIGRATION_008" -eq "1" ]; then
    echo "   ✓ Migration 008 recorded"
else
    echo "   ✗ Migration 008 NOT recorded"
fi
echo

# Check backend version
echo "3. Checking backend process..."
pm2 describe sensity-backend-dev | grep -E "version|status|uptime"
echo

# Check frontend build date
echo "4. Checking frontend build..."
if [ -f "/opt/sensity-platform-dev/frontend/build/index.html" ]; then
    FRONTEND_DATE=$(stat -c %y /opt/sensity-platform-dev/frontend/build/index.html 2>/dev/null || stat -f %Sm /opt/sensity-platform-dev/frontend/build/index.html)
    echo "   Frontend build date: $FRONTEND_DATE"
else
    echo "   ✗ Frontend build not found!"
fi
echo

# Check backend logs for sensor-types endpoint
echo "5. Checking recent API calls..."
pm2 logs sensity-backend-dev --lines 20 --nostream | grep -i "sensor" || echo "   No sensor-related logs found"
echo

echo "=========================================="
echo "  DIAGNOSTICS COMPLETE"
echo "=========================================="
