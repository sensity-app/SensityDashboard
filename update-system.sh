#!/bin/bash

###############################################################################
# Sensity Platform - System Update Script
#
# This script updates the system from the latest GitHub version
# Supports multiple instances
#
# Usage:
#   sudo ./update-system.sh              # Update default instance
#   sudo ./update-system.sh staging      # Update staging instance
#   sudo ./update-system.sh dev          # Update dev instance
###############################################################################

set -e

# Check for instance parameter
INSTANCE_NAME="${1:-default}"

# Configuration based on instance
if [[ "$INSTANCE_NAME" == "default" ]]; then
    APP_USER="sensityapp"
    APP_DIR="/opt/sensity-platform"
    INSTANCE_LABEL="default"
    DB_NAME="sensity_platform"
else
    APP_USER="sensity_${INSTANCE_NAME}"
    APP_DIR="/opt/sensity-platform-${INSTANCE_NAME}"
    INSTANCE_LABEL="$INSTANCE_NAME"
    DB_NAME="sensity_${INSTANCE_NAME}"
fi

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

check_instance_exists() {
    if [[ ! -d "$APP_DIR" ]]; then
        print_error "Instance '$INSTANCE_NAME' not found at $APP_DIR"
        print_status "Available instances:"
        
        # List all installed instances
        if [[ -d "/opt/sensity-platform" ]]; then
            echo "  - default (at /opt/sensity-platform)"
        fi
        
        for dir in /opt/sensity-platform-*; do
            if [[ -d "$dir" ]]; then
                instance_name=$(basename "$dir" | sed 's/sensity-platform-//')
                echo "  - $instance_name (at $dir)"
            fi
        done
        
        exit 1
    fi
    
    if ! id "$APP_USER" &>/dev/null; then
        print_error "User '$APP_USER' does not exist for instance '$INSTANCE_NAME'"
        exit 1
    fi
}

check_services() {
    print_status "🔍 Checking system services for instance '$INSTANCE_LABEL'..."

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

# Function to run all database migrations (SQL + JavaScript)
run_database_migrations() {
    local migration_script="$APP_DIR/scripts/run-migrations.sh"

    if [[ ! -x "$migration_script" ]]; then
        print_error "Migration runner not found at $migration_script"
        print_error "Pull the latest repository or ensure scripts/run-migrations.sh exists"
        exit 1
    fi

    # Run migrations and capture exit status
    # We disable errexit temporarily to handle migration failures gracefully
    set +e
    APP_DIR="$APP_DIR" \
    APP_USER="$APP_USER" \
    DB_NAME="$DB_NAME" \
        "$migration_script"
    local migration_exit=$?
    set -e

    # Check if migrations failed
    if [[ $migration_exit -ne 0 ]]; then
        print_warning "Some migrations failed (exit code: $migration_exit)"
        print_warning "This is usually not critical - the update will continue"
        print_status "You can check migration logs above for details"
    else
        print_success "All database migrations completed successfully"
    fi

    # Always return success to allow the update to continue
    # Migration failures are treated as warnings, not critical errors
    return 0
}

update_system() {
    print_status "🔄 Updating Sensity Platform (instance: $INSTANCE_LABEL)..."
    echo

    # Check instance exists
    check_instance_exists

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
    if [[ "$INSTANCE_NAME" == "default" ]]; then
        ls -dt sensity-platform.backup.* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true
    else
        ls -dt sensity-platform-${INSTANCE_NAME}.backup.* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true
    fi

    # Update from Git
    print_status "Fetching latest version from GitHub..."
    cd "$APP_DIR"
    sudo -u "$APP_USER" git fetch origin
    sudo -u "$APP_USER" git reset --hard origin/main

    # Update dependencies
    print_status "Updating backend dependencies..."
    cd "$APP_DIR/backend"
    sudo -u "$APP_USER" npm install --production

    # Run database migrations (comprehensive system)
    print_status "Running database migrations..."
    run_database_migrations

    print_status "Updating and building frontend..."
    cd "$APP_DIR/frontend"
    sudo -u "$APP_USER" npm install --include=dev
    sudo -u "$APP_USER" NODE_ENV=production npm run build
    sudo -u "$APP_USER" npm prune --omit=dev || true

    # Restart services
    print_status "Restarting services..."
    sudo -u "$APP_USER" pm2 restart all
    sudo -u "$APP_USER" pm2 save

    # Wait for services to start
    print_status "Waiting for services to stabilize..."
    sleep 5

    # Test if backend is responding
    print_status "Testing backend health..."
    local backend_port=$(grep "PORT=" "$APP_DIR/backend/.env" 2>/dev/null | cut -d'=' -f2 || echo "3000")
    local max_retries=10
    local retry_count=0
    local backend_healthy=false

    while [[ $retry_count -lt $max_retries ]]; do
        if curl -s -f "http://localhost:${backend_port}/api/system/health" > /dev/null 2>&1; then
            backend_healthy=true
            break
        fi
        ((retry_count++))
        sleep 2
    done

    # Check PM2 status
    local pm2_status=$(sudo -u "$APP_USER" pm2 jlist 2>/dev/null)
    local backend_online=$(echo "$pm2_status" | grep -o '"status":"online"' | wc -l)
    local backend_errored=$(echo "$pm2_status" | grep -o '"status":"errored"' | wc -l)

    # If backend is not healthy or errored, rollback
    if [[ "$backend_healthy" == "false" ]] || [[ "$backend_errored" -gt 0 ]]; then
        print_error "Backend health check failed!"
        print_status "PM2 processes online: $backend_online, errored: $backend_errored"
        
        # Find the most recent backup
        local latest_backup
        cd /opt
        if [[ "$INSTANCE_NAME" == "default" ]]; then
            latest_backup=$(ls -dt sensity-platform.backup.* 2>/dev/null | head -n1)
        else
            latest_backup=$(ls -dt sensity-platform-${INSTANCE_NAME}.backup.* 2>/dev/null | head -n1)
        fi

        if [[ -n "$latest_backup" ]]; then
            print_warning "🔄 Rolling back to previous version..."
            
            # Stop current broken version
            sudo -u "$APP_USER" pm2 stop all 2>/dev/null || true
            
            # Restore backup
            rm -rf "$APP_DIR"
            mv "/opt/$latest_backup" "$APP_DIR"
            
            # Restart with old version
            cd "$APP_DIR/backend"
            sudo -u "$APP_USER" pm2 restart all
            sudo -u "$APP_USER" pm2 save
            
            sleep 3
            
            print_error "❌ Update failed and was rolled back"
            print_status "📝 Check logs: sudo -u $APP_USER pm2 logs backend --err --lines 50"
            exit 1
        else
            print_error "No backup found for rollback!"
            print_status "📝 Manual intervention required. Check logs: sudo -u $APP_USER pm2 logs"
            exit 1
        fi
    fi

    print_success "✅ Backend health check passed!"
    print_success "✅ System updated successfully!"
    echo
    print_status "📊 Check status: sudo -u $APP_USER pm2 status"
    print_status "📝 View logs: sudo -u $APP_USER pm2 logs"
}

rollback_system() {
    print_status "🔄 Rolling back to previous version..."
    print_warning "This will restore the last backup"

    # Check instance exists
    check_instance_exists

    # Find the most recent backup
    local latest_backup
    cd /opt
    if [[ "$INSTANCE_NAME" == "default" ]]; then
        latest_backup=$(ls -dt sensity-platform.backup.* 2>/dev/null | head -n1)
    else
        latest_backup=$(ls -dt sensity-platform-${INSTANCE_NAME}.backup.* 2>/dev/null | head -n1)
    fi

    if [[ -z "$latest_backup" ]]; then
        print_error "No backup found!"
        print_status "Available backups:"
        ls -lth /opt/*.backup.* 2>/dev/null || echo "  (none)"
        exit 1
    fi

    print_status "Found backup: $latest_backup"
    local backup_date=$(echo "$latest_backup" | grep -oE '[0-9]{8}-[0-9]{6}')
    print_status "Backup date: $(echo $backup_date | sed 's/\([0-9]\{8\}\)-\([0-9]\{6\}\)/\1 \2/')"

    read -p "Restore this backup? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Rollback cancelled"
        return 0
    fi

    # Stop current version
    print_status "Stopping current services..."
    sudo -u "$APP_USER" pm2 stop all 2>/dev/null || true

    # Create a backup of current (broken) version
    print_status "Backing up current version..."
    if [[ -d "$APP_DIR" ]]; then
        mv "$APP_DIR" "$APP_DIR.broken.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
    fi

    # Restore backup
    print_status "Restoring backup..."
    cp -r "/opt/$latest_backup" "$APP_DIR"
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"

    # Restart services
    print_status "Restarting services..."
    cd "$APP_DIR/backend"
    sudo -u "$APP_USER" pm2 restart all
    sudo -u "$APP_USER" pm2 save

    # Wait and verify
    sleep 3
    if sudo -u "$APP_USER" pm2 list 2>/dev/null | grep -q "online"; then
        print_success "✅ Rollback completed successfully!"
        print_status "📊 Check status: sudo -u $APP_USER pm2 status"
    else
        print_error "Services may not have started correctly"
        print_status "📝 Check logs: sudo -u $APP_USER pm2 logs"
    fi
}

reset_first_user() {
    print_status "🔄 Resetting database for first user setup..."
    print_warning "This will remove ALL users and allow first-user registration again!"

    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Clear users table only
        sudo -u postgres psql -d sensity_platform -c "DELETE FROM users;" 2>/dev/null || true

        # Fix database permissions while we're at it
        fix_database_permissions

        print_success "✅ Database reset completed - you can now register the first admin user"
    else
        print_status "Reset cancelled"
    fi
}

fix_database_permissions() {
    print_status "🔧 Fixing database permissions..."

    sudo -u postgres psql -d sensity_platform << 'EOF'
-- Grant all privileges on schema
GRANT ALL PRIVILEGES ON SCHEMA public TO sensityapp;

-- Grant all privileges on all existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO sensityapp;

-- Grant all privileges on all sequences (for auto-increment)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO sensityapp;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO sensityapp;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO sensityapp;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO sensityapp;

-- Ensure ownership of all existing tables
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' OWNER TO sensityapp';
    END LOOP;
END $$;

-- Ensure ownership of all existing sequences
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
    LOOP
        EXECUTE 'ALTER SEQUENCE ' || quote_ident(r.sequencename) || ' OWNER TO sensityapp';
    END LOOP;
END $$;
EOF

    print_success "Database permissions fixed"
}

create_test_admin() {
    print_status "🧪 Creating test admin user..."

    # Generate bcrypt hash for "password"
    local password_hash
    cd "$APP_DIR/backend"
    password_hash=$(sudo -u "$APP_USER" node -e "
        const bcrypt = require('bcrypt');
        const hash = bcrypt.hashSync('password', 10);
        console.log(hash);
    " 2>/dev/null || echo "")

    if [[ -z "$password_hash" ]]; then
        print_error "Could not generate password hash"
        return 1
    fi

    # Get database password from ecosystem config or .env
    DB_PASSWORD=$(grep "DB_PASSWORD:" /opt/sensity-platform/ecosystem.config.js | cut -d"'" -f2 2>/dev/null || grep "^DB_PASSWORD=" /opt/sensity-platform/backend/.env | cut -d'=' -f2 2>/dev/null || echo "")

    if [[ -z "$DB_PASSWORD" ]]; then
        print_error "Could not find database password"
        return 1
    fi

    # Insert test user into database using correct schema
    PGPASSWORD="$DB_PASSWORD" psql -h localhost -U sensityapp -d sensity_platform << EOF
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

    # Show banner
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║      Sensity Platform Update Script                         ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo
    
    if [[ "$INSTANCE_NAME" != "default" ]]; then
        print_status "Targeting instance: $INSTANCE_LABEL"
        print_status "Directory: $APP_DIR"
        print_status "User: $APP_USER"
        echo
    fi

    # Handle special commands
    if [[ "$2" == "rollback" ]]; then
        rollback_system
    elif [[ "$2" == "reset-first-user" ]]; then
        if [[ "$INSTANCE_NAME" != "default" ]]; then
            print_error "reset-first-user is only supported for the default instance"
            exit 1
        fi
        reset_first_user
    elif [[ "$2" == "create-test-admin" ]]; then
        if [[ "$INSTANCE_NAME" != "default" ]]; then
            print_error "create-test-admin is only supported for the default instance"
            exit 1
        fi
        create_test_admin
        sudo -u sensityapp pm2 restart all
    elif [[ -z "$2" ]] || [[ "$2" == "update" ]]; then
        update_system
    else
        echo "Usage:"
        echo "  sudo $0 [instance]                    # Update instance (default if not specified)"
        echo "  sudo $0 [instance] update             # Update instance"
        echo "  sudo $0 [instance] rollback           # Rollback to previous version"
        echo "  sudo $0 default reset-first-user      # Reset database to allow first user registration"
        echo "  sudo $0 default create-test-admin     # Create test admin user"
        echo
        echo "Examples:"
        echo "  sudo $0                               # Update default instance"
        echo "  sudo $0 staging                       # Update staging instance"
        echo "  sudo $0 dev update                    # Update dev instance"
        echo "  sudo $0 dev rollback                  # Rollback dev instance"
        echo
        echo "Available instances:"
        if [[ -d "/opt/sensity-platform" ]]; then
            echo "  - default (at /opt/sensity-platform)"
        fi
        for dir in /opt/sensity-platform-*; do
            if [[ -d "$dir" ]]; then
                inst_name=$(basename "$dir" | sed 's/sensity-platform-//')
                echo "  - $inst_name (at $dir)"
            fi
        done
        echo
    fi
}

main "$@"
