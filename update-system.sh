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
REPO_URL="https://github.com/sensity-app/SensityDashboard.git"

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

check_services() {
    print_status "🔍 Checking system services..."

    local failed=0

    # Check PostgreSQL
    if systemctl is-active --quiet postgresql; then
        print_success "PostgreSQL: ✓ running"
    else
        print_error "PostgreSQL: ✗ NOT running"
        failed=1
    fi

    # Check Redis
    if systemctl is-active --quiet redis-server; then
        print_success "Redis: ✓ running"
    else
        print_warning "Redis: ⚠ not running (optional but recommended)"
    fi

    # Check Nginx
    if systemctl is-active --quiet nginx; then
        print_success "Nginx: ✓ running"
    else
        print_error "Nginx: ✗ NOT running"
        failed=1
    fi

    # Check PM2
    if sudo -u "$APP_USER" pm2 list 2>/dev/null | grep -q "online"; then
        print_success "Application (PM2): ✓ online"
    else
        print_warning "Application (PM2): ⚠ may not be running correctly"
    fi

    # Check MQTT (optional)
    if systemctl is-enabled --quiet mosquitto 2>/dev/null; then
        if systemctl is-active --quiet mosquitto; then
            print_success "MQTT (Mosquitto): ✓ running"
        else
            print_warning "MQTT (Mosquitto): ⚠ installed but not running"
        fi
    else
        print_status "MQTT (Mosquitto): ℹ not installed (optional)"
    fi

    echo

    if [[ $failed -eq 1 ]]; then
        print_error "Some critical services are down!"
        print_status "Fix them before updating:"
        echo "  sudo systemctl start postgresql"
        echo "  sudo systemctl start nginx"
        echo "  sudo -u $APP_USER pm2 restart all"
        return 1
    fi

    print_success "All critical services are healthy"
    return 0
}

update_system() {
    print_status "🔄 Updating ESP8266 IoT Platform..."
    echo

    # Check services health before updating
    if ! check_services; then
        print_error "Cannot proceed with update while critical services are down"
        print_status "Please fix the services and try again"
        exit 1
    fi

    # Stop PM2 processes
    print_status "Stopping services..."
    sudo -u "$APP_USER" pm2 stop all 2>/dev/null || true

    # Backup current version
    print_status "Creating backup..."
    cp -r "$APP_DIR" "$APP_DIR.backup.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true

    # Clean up old backups (keep only the 3 most recent)
    print_status "Cleaning up old backups (keeping 3 most recent)..."
    cd /opt
    ls -dt esp8266-platform.backup.* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true

    # Update from Git
    print_status "Fetching latest version from GitHub..."
    cd "$APP_DIR"
    sudo -u "$APP_USER" git fetch origin
    sudo -u "$APP_USER" git reset --hard origin/main

    # Update dependencies
    print_status "Updating backend dependencies..."
    cd "$APP_DIR/backend"
    sudo -u "$APP_USER" npm install --production

    # Run database migrations
    print_status "Running database migrations..."
    cd "$APP_DIR/backend"
    sudo -u "$APP_USER" node migrations/migrate.js

    print_status "Updating and building frontend..."
    cd "$APP_DIR/frontend"
    sudo -u "$APP_USER" npm install --include=dev
    sudo -u "$APP_USER" NODE_ENV=production npm run build
    sudo -u "$APP_USER" npm prune --omit=dev || true

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

        # Fix database permissions while we're at it
        fix_database_permissions

        print_success "✅ Database reset completed - you can now register the first admin user"
    else
        print_status "Reset cancelled"
    fi
}

fix_database_permissions() {
    print_status "🔧 Fixing database permissions..."

    sudo -u postgres psql -d esp8266_platform << 'EOF'
-- Grant all privileges on schema
GRANT ALL PRIVILEGES ON SCHEMA public TO esp8266app;

-- Grant all privileges on all existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO esp8266app;

-- Grant all privileges on all sequences (for auto-increment)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO esp8266app;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO esp8266app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO esp8266app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO esp8266app;

-- Ensure ownership of all existing tables
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' OWNER TO esp8266app';
    END LOOP;
END $$;

-- Ensure ownership of all existing sequences
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
    LOOP
        EXECUTE 'ALTER SEQUENCE ' || quote_ident(r.sequencename) || ' OWNER TO esp8266app';
    END LOOP;
END $$;
EOF

    print_success "Database permissions fixed"
}

create_test_admin() {
    print_status "🧪 Creating test admin user..."

    # Generate bcrypt hash for "password"
    local password_hash
    cd /opt/esp8266-platform/backend
    password_hash=$(node -e "
        const bcrypt = require('bcrypt');
        const hash = bcrypt.hashSync('password', 10);
        console.log(hash);
    " 2>/dev/null || echo "")

    if [[ -z "$password_hash" ]]; then
        print_error "Could not generate password hash"
        return 1
    fi

    # Get database password from ecosystem config or .env
    DB_PASSWORD=$(grep "DB_PASSWORD:" /opt/esp8266-platform/ecosystem.config.js | cut -d"'" -f2 2>/dev/null || grep "^DB_PASSWORD=" /opt/esp8266-platform/backend/.env | cut -d'=' -f2 2>/dev/null || echo "")

    if [[ -z "$DB_PASSWORD" ]]; then
        print_error "Could not find database password"
        return 1
    fi

    # Insert test user into database using correct schema
    PGPASSWORD="$DB_PASSWORD" psql -h localhost -U esp8266app -d esp8266_platform << EOF
-- Remove existing test user if it exists
DELETE FROM users WHERE email = 'admin@changeme.com';

-- Insert new test admin user with correct schema
INSERT INTO users (
    email,
    password_hash,
    role,
    full_name,
    phone,
    notification_email,
    notification_sms,
    notification_push,
    created_at,
    updated_at
) VALUES (
    'admin@changeme.com',
    '$password_hash',
    'admin',
    'Test Administrator',
    NULL,
    true,
    false,
    true,
    NOW(),
    NOW()
);

-- Verify user was created
SELECT id, email, full_name, role FROM users WHERE email = 'admin@changeme.com';
EOF

    print_success "✅ Test admin user created!"
    print_status "📧 Email: admin@changeme.com"
    print_status "🔑 Password: password"
    print_warning "⚠️  Remember to change this password after logging in!"
}

# Main script logic
main() {
    check_root

    if [[ "$1" == "reset-first-user" ]]; then
        reset_first_user
    elif [[ "$1" == "create-test-admin" ]]; then
        create_test_admin
        sudo -u esp8266app pm2 restart all
    elif [[ "$1" == "update" ]] || [[ "$1" == "" ]]; then
        update_system
    else
        echo "ESP8266 IoT Platform Update Script"
        echo
        echo "Usage:"
        echo "  sudo $0                      # Update system from GitHub"
        echo "  sudo $0 update               # Update system from GitHub"
        echo "  sudo $0 reset-first-user     # Reset database to allow first user registration"
        echo "  sudo $0 create-test-admin    # Create test admin user (admin@changeme.com / password)"
        echo
    fi
}

main "$@"
