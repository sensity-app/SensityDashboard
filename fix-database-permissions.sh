#!/bin/bash

###############################################################################
# ESP8266 IoT Platform - Database Permissions Fix
#
# This script fixes common database permission issues
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DB_USER="esp8266app"
DB_NAME="esp8266_platform"
DB_PASSWORD=""

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

get_db_password() {
    if [[ -f "/opt/esp8266-platform/backend/.env" ]]; then
        DB_PASSWORD=$(grep "^DB_PASSWORD=" /opt/esp8266-platform/backend/.env | cut -d'=' -f2)
        if [[ -n "$DB_PASSWORD" ]]; then
            print_status "Found database password in .env file"
        else
            print_error "Could not find DB_PASSWORD in .env file"
            exit 1
        fi
    else
        print_error ".env file not found at /opt/esp8266-platform/backend/.env"
        exit 1
    fi
}

fix_database_permissions() {
    print_status "🔧 Fixing database permissions..."

    # Check if database exists
    if ! sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        print_error "Database $DB_NAME does not exist"
        return 1
    fi

    # Check if user exists
    if ! sudo -u postgres psql -t -c '\du' | cut -d \| -f 1 | grep -qw "$DB_USER"; then
        print_error "Database user $DB_USER does not exist"
        return 1
    fi

    # Fix database ownership and permissions
    print_status "Setting database ownership..."
    sudo -u postgres psql << EOF
-- Make esp8266app the owner of the database
ALTER DATABASE $DB_NAME OWNER TO $DB_USER;

-- Connect to the database and fix table permissions
\c $DB_NAME

-- Grant all privileges on schema
GRANT ALL PRIVILEGES ON SCHEMA public TO $DB_USER;

-- Grant all privileges on all existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;

-- Grant all privileges on all sequences (for auto-increment)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO $DB_USER;

-- Make sure the user owns all existing tables
DO \$\$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' OWNER TO $DB_USER';
    END LOOP;
END \$\$;

-- Make sure the user owns all existing sequences
DO \$\$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
    LOOP
        EXECUTE 'ALTER SEQUENCE ' || quote_ident(r.sequencename) || ' OWNER TO $DB_USER';
    END LOOP;
END \$\$;
EOF

    print_success "Database permissions fixed"
}

test_database_connection() {
    print_status "Testing database connection..."

    if PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &>/dev/null; then
        print_success "Database connection successful"
    else
        print_error "Database connection failed"
        return 1
    fi
}

test_user_table_access() {
    print_status "Testing users table access..."

    if PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT COUNT(*) FROM users;" &>/dev/null; then
        local user_count=$(PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM users;" | tr -d ' ')
        print_success "Users table access successful (found $user_count users)"
        return 0
    else
        print_error "Cannot access users table"
        return 1
    fi
}

restart_backend() {
    print_status "Restarting backend services..."
    if sudo -u esp8266app pm2 restart all &>/dev/null; then
        print_success "Backend restarted"
        sleep 3  # Give it time to start
    else
        print_warning "Could not restart PM2 processes"
    fi
}

test_api_endpoint() {
    print_status "Testing API endpoint..."

    sleep 2  # Give backend time to start
    local response=$(curl -s http://localhost:3000/api/auth/setup-check 2>/dev/null || echo "error")

    if [[ "$response" == *"needsSetup"* ]]; then
        print_success "API endpoint working correctly"
        echo "Response: $response"
        return 0
    else
        print_error "API endpoint still not working"
        echo "Response: $response"
        return 1
    fi
}

main() {
    print_status "🔧 ESP8266 Database Permissions Fix"
    echo

    check_root
    get_db_password

    print_status "Database: $DB_NAME"
    print_status "User: $DB_USER"
    echo

    fix_database_permissions
    test_database_connection

    if test_user_table_access; then
        restart_backend
        if test_api_endpoint; then
            print_success "✅ Database permissions fixed successfully!"
            echo
            print_status "You should now be able to see the Initial Setup page at:"
            print_status "http://$(hostname -I | awk '{print $1}')"
        else
            print_warning "Database is fixed but API still has issues. Check PM2 logs:"
            print_status "sudo -u esp8266app pm2 logs"
        fi
    else
        print_error "❌ Database permissions fix failed"
        exit 1
    fi
}

main "$@"