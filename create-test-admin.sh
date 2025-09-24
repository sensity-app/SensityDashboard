#!/bin/bash

###############################################################################
# ESP8266 IoT Platform - Create Test Admin User
#
# Creates a test admin user: admin@changeme.com / password
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
TEST_EMAIL="admin@changeme.com"
TEST_PASSWORD="password"
TEST_FULL_NAME="Test Administrator"

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

create_test_admin() {
    print_status "Creating test admin user..."

    # Generate bcrypt hash for "password" (using Node.js)
    local password_hash
    password_hash=$(node -e "
        const bcrypt = require('bcrypt');
        const hash = bcrypt.hashSync('$TEST_PASSWORD', 10);
        console.log(hash);
    " 2>/dev/null || echo "")

    if [[ -z "$password_hash" ]]; then
        print_error "Failed to generate password hash. Trying alternative method..."
        # Alternative: use Python if Node.js/bcrypt fails
        password_hash=$(python3 -c "
import bcrypt
password = '$TEST_PASSWORD'.encode('utf-8')
hashed = bcrypt.hashpw(password, bcrypt.gensalt(rounds=10))
print(hashed.decode('utf-8'))
        " 2>/dev/null || echo "")
    fi

    if [[ -z "$password_hash" ]]; then
        print_error "Could not generate password hash. Please install bcrypt for Node.js or Python3"
        exit 1
    fi

    print_status "Password hash generated: ${password_hash:0:20}..."

    # Insert user into database
    PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d "$DB_NAME" << EOF
-- Remove existing test user if it exists
DELETE FROM users WHERE email = '$TEST_EMAIL';

-- Insert new test admin user
INSERT INTO users (
    email,
    full_name,
    password_hash,
    role,
    active,
    created_at,
    updated_at
) VALUES (
    '$TEST_EMAIL',
    '$TEST_FULL_NAME',
    '$password_hash',
    'admin',
    true,
    NOW(),
    NOW()
);

-- Verify user was created
SELECT id, email, full_name, role, active, created_at FROM users WHERE email = '$TEST_EMAIL';
EOF

    print_success "Test admin user created successfully!"
}

test_api_endpoints() {
    print_status "Testing API endpoints..."

    sleep 2  # Give backend time to process

    # Test setup-check (should now show hasUsers: true)
    local setup_response=$(curl -s http://localhost:3000/api/auth/setup-check 2>/dev/null || echo "error")
    print_status "Setup check response: $setup_response"

    # Test login
    local login_response=$(curl -s -X POST http://localhost:3000/api/auth/login \
        -H "Content-Type: application/json" \
        -d '{
            "email": "'$TEST_EMAIL'",
            "password": "'$TEST_PASSWORD'"
        }' 2>/dev/null || echo "error")

    if [[ "$login_response" == *"token"* ]]; then
        print_success "Login test successful!"
    else
        print_warning "Login test response: $login_response"
    fi
}

restart_backend() {
    print_status "Restarting backend services..."
    if sudo -u esp8266app pm2 restart all &>/dev/null; then
        print_success "Backend restarted"
        sleep 3
    else
        print_warning "Could not restart PM2 processes"
    fi
}

main() {
    print_status "🧪 Creating Test Admin User"
    echo

    check_root
    get_db_password

    print_status "Test User Details:"
    print_status "Email: $TEST_EMAIL"
    print_status "Password: $TEST_PASSWORD"
    print_status "Role: admin"
    echo

    create_test_admin
    restart_backend
    test_api_endpoints

    echo
    print_success "✅ Test admin user created successfully!"
    echo
    print_status "You can now log in with:"
    print_status "📧 Email: $TEST_EMAIL"
    print_status "🔑 Password: $TEST_PASSWORD"
    echo
    print_status "Access your platform at:"
    print_status "🌐 http://$(hostname -I | awk '{print $1}')"
    echo
    print_warning "⚠️  Remember to change this password after logging in!"
}

main "$@"