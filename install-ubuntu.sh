#!/bin/bash

###############################################################################
# ESP8266 IoT Platform - Ubuntu Server Installation Script
#
# This script will install and configure the complete ESP8266 IoT monitoring
# platform on a fresh Ubuntu server (18.04, 20.04, or 22.04).
#
# Features installed:
# - Node.js backend API with WebSocket support
# - React frontend with firmware builder
# - PostgreSQL database
# - Redis cache (optional)
# - Nginx reverse proxy with SSL
# - PM2 process manager
# - UFW firewall configuration
# - Automatic SSL certificates via Let's Encrypt
#
# Usage: curl -sSL https://raw.githubusercontent.com/sensity-app/SensityDashboard/main/install-ubuntu.sh | sudo bash
# Or: wget -qO- https://raw.githubusercontent.com/sensity-app/SensityDashboard/main/install-ubuntu.sh | sudo bash
#
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration variables
DOMAIN=""
EMAIL=""
DB_PASSWORD=""
JWT_SECRET=""
DEVELOPMENT_MODE=""
MQTT_USERNAME=""
MQTT_PASSWORD=""
APP_USER="esp8266app"
APP_DIR="/opt/esp8266-platform"
NODE_VERSION="18"

# Function to print colored output
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

print_header() {
    echo -e "${PURPLE}
╔══════════════════════════════════════════════════════════════╗
║                ESP8266 IoT Platform Installer               ║
║                                                              ║
║  This script will install the complete IoT monitoring       ║
║  platform with firmware builder on your Ubuntu server      ║
╚══════════════════════════════════════════════════════════════╝${NC}
"
}

# Function to check if port is available
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 1
    fi
    return 0
}

# Function to validate DNS configuration
validate_dns() {
    local domain=$1
    print_status "Validating DNS configuration for $domain..."

    # Get server's public IP
    local server_ip=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null)
    if [[ -z "$server_ip" ]]; then
        print_warning "Could not determine server's public IP address"
        return 0
    fi

    # Resolve domain
    local domain_ip=$(dig +short $domain | tail -n1 2>/dev/null)
    if [[ -z "$domain_ip" ]]; then
        print_error "Could not resolve domain $domain"
        print_error "Please ensure DNS records are configured before continuing"
        return 1
    fi

    # Compare IPs
    if [[ "$server_ip" != "$domain_ip" ]]; then
        print_warning "DNS mismatch: $domain points to $domain_ip, but server IP is $server_ip"
        print_warning "SSL certificate acquisition may fail if DNS is not properly configured"
        return 1
    fi

    print_success "DNS configuration valid"
    return 0
}

# Function to check system requirements
check_requirements() {
    print_status "Checking system requirements..."

    check_root
    detect_ubuntu

    # Check available disk space (at least 2GB)
    AVAILABLE_SPACE=$(df / | awk 'NR==2{printf "%.0f", $4/1024/1024}')
    if [[ $AVAILABLE_SPACE -lt 2 ]]; then
        print_error "At least 2GB of free disk space is required"
        exit 1
    fi

    # Check available memory (at least 1GB)
    AVAILABLE_MEM=$(free -m | awk 'NR==2{printf "%.0f", $7}')
    if [[ $AVAILABLE_MEM -lt 1024 ]]; then
        print_warning "Low available memory (${AVAILABLE_MEM}MB). Installation may be slow."
    fi

    print_success "System requirements check passed"
}

# Function to run pre-installation validation checks
validate_installation() {
    print_status "Running pre-installation validation checks..."

    local validation_failed=0

    # Check for running apt/dpkg processes
    print_status "Checking for running package manager processes..."
    if pgrep -x apt-get >/dev/null || pgrep -x dpkg >/dev/null || pgrep -x apt >/dev/null; then
        print_error "Package manager (apt/dpkg) is currently running"
        print_error "Please wait for other package operations to complete or run:"
        print_error "  sudo killall apt apt-get dpkg"
        validation_failed=1
    else
        print_success "No conflicting package manager processes found"
    fi

    # Check if required ports are available
    print_status "Checking required ports availability..."
    local required_ports=(80 443 3000 5432 6379 1883)
    local ports_in_use=()
    local conflicting_ports=()

    for port in "${required_ports[@]}"; do
        if ! check_port $port; then
            ports_in_use+=($port)

            # Identify which service is using the port
            local service_name=""
            case $port in
                5432)
                    # PostgreSQL - OK if it's already installed from previous installation
                    if systemctl is-active --quiet postgresql; then
                        service_name="PostgreSQL (existing installation)"
                    else
                        conflicting_ports+=($port)
                        service_name="Unknown process"
                    fi
                    ;;
                6379)
                    # Redis - OK if it's already installed from previous installation
                    if systemctl is-active --quiet redis-server || systemctl is-active --quiet redis; then
                        service_name="Redis (existing installation)"
                    else
                        conflicting_ports+=($port)
                        service_name="Unknown process"
                    fi
                    ;;
                1883)
                    # Mosquitto - OK if it's already installed from previous installation
                    if systemctl is-active --quiet mosquitto; then
                        service_name="Mosquitto (existing installation)"
                    else
                        conflicting_ports+=($port)
                        service_name="Unknown process"
                    fi
                    ;;
                80|443)
                    # Nginx - OK if it's already installed from previous installation
                    if systemctl is-active --quiet nginx; then
                        service_name="Nginx (existing installation)"
                    else
                        conflicting_ports+=($port)
                        service_name="Unknown process"
                    fi
                    ;;
                3000)
                    # Application port - check if PM2 is running it
                    if pgrep -f "pm2.*esp8266" >/dev/null 2>&1; then
                        service_name="PM2 (existing installation)"
                    else
                        conflicting_ports+=($port)
                        service_name="Unknown process"
                    fi
                    ;;
                *)
                    conflicting_ports+=($port)
                    service_name="Unknown process"
                    ;;
            esac

            if [[ -n "$service_name" ]]; then
                if [[ " ${conflicting_ports[@]} " =~ " ${port} " ]]; then
                    print_error "Port $port is in use by: $service_name"
                else
                    print_warning "Port $port is in use by: $service_name"
                fi
            fi
        fi
    done

    if [[ ${#conflicting_ports[@]} -eq 0 ]]; then
        if [[ ${#ports_in_use[@]} -eq 0 ]]; then
            print_success "All required ports are available"
        else
            print_success "All port conflicts are from existing installation components"
        fi
    else
        print_error "The following ports have conflicts: ${conflicting_ports[*]}"
        print_error "Please free these ports before continuing"
        validation_failed=1
    fi

    # Check network connectivity
    print_status "Checking network connectivity..."
    if ! ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        print_error "No network connectivity"
        validation_failed=1
    else
        print_success "Network connectivity OK"
    fi

    # Check if DNS tools are available
    print_status "Checking for required tools..."
    local required_tools=("curl" "dig" "lsof")
    for tool in "${required_tools[@]}"; do
        if ! command -v $tool &> /dev/null; then
            print_warning "$tool not found, installing..."
            apt-get update -qq && apt-get install -y -qq $tool
        fi
    done
    print_success "Required tools available"

    if [[ $validation_failed -eq 1 ]]; then
        print_error "Pre-installation validation failed"
        print_error "Please resolve the above issues before continuing"
        exit 1
    fi

    print_success "Pre-installation validation passed"
}

# Function to get user input for configuration
get_user_input() {
    print_status "Configuration setup..."

    # Check if environment variables are set and valid
    if check_env_vars; then
        print_status "Configuration completed"
        return 0
    fi

    # If no valid environment variables, gather input interactively
    gather_input

    print_status "Configuration completed"
}

# Function to check for existing installation
check_existing_installation() {
    detect_existing_installation
}

# Function to check if script is run as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Function to detect Ubuntu version
detect_ubuntu() {
    if ! command -v lsb_release &> /dev/null; then
        print_error "This script is designed for Ubuntu. lsb_release not found."
        exit 1
    fi

    UBUNTU_VERSION=$(lsb_release -rs)
    print_status "Detected Ubuntu $UBUNTU_VERSION"

    if [[ ! "$UBUNTU_VERSION" =~ ^(18\.04|20\.04|22\.04|24\.04)$ ]]; then
        print_warning "This script has been tested on Ubuntu 18.04, 20.04, 22.04, and 24.04"
        print_warning "Your version ($UBUNTU_VERSION) may work but is not officially supported"

        # Only prompt if running interactively
        if [[ -t 0 ]]; then
            read -p "Continue anyway? (y/N): " -n 1 -r < /dev/tty
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
        else
            print_warning "Running non-interactively, continuing with unsupported Ubuntu version..."
        fi
    fi
}

# Function to check for environment variables
check_env_vars() {
    # Check for development mode
    if [[ "${DEVELOPMENT_MODE}" == "true" ]]; then
        print_status "Using development mode - no DNS or SSL required"

        # Only DB_PASSWORD is required in development mode
        if [[ -z "$DB_PASSWORD" ]]; then
            return 1  # Let gather_input handle this
        fi

        # Check password length
        if [[ ${#DB_PASSWORD} -lt 8 ]]; then
            return 1  # Let gather_input handle this
        fi

        # Set MQTT defaults if not provided
        if [[ -z "$MQTT_USERNAME" ]]; then
            MQTT_USERNAME="iot"
        fi
        if [[ -z "$MQTT_PASSWORD" ]]; then
            MQTT_PASSWORD=$(openssl rand -base64 16 | tr -d '\n')
        fi

        # Generate JWT secret
        JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
        print_success "Development mode configuration validated successfully"
        return 0
    fi

    # Check if all required environment variables are set for production mode
    if [[ -n "$DOMAIN" && -n "$EMAIL" && -n "$DB_PASSWORD" ]]; then
        print_status "Using environment variables for production configuration"

        # Validate domain format
        if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
            return 1  # Let gather_input handle this
        fi

        # Validate email format
        if [[ ! "$EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
            return 1  # Let gather_input handle this
        fi

        # Check password length
        if [[ ${#DB_PASSWORD} -lt 8 ]]; then
            return 1  # Let gather_input handle this
        fi

        # Set MQTT defaults if not provided
        if [[ -z "$MQTT_USERNAME" ]]; then
            MQTT_USERNAME="iot"
        fi
        if [[ -z "$MQTT_PASSWORD" ]]; then
            MQTT_PASSWORD=$(openssl rand -base64 16 | tr -d '\n')
        fi

        # Generate JWT secret
        JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
        print_success "Production configuration validated successfully"
        return 0
    fi
    return 1
}

# Function to gather user input
gather_input() {
    echo
    print_status "Configuration Setup"

    # First check if environment variables are provided
    if check_env_vars; then
        return 0
    fi

    # Check if running interactively (connected to a terminal)
    if [[ ! -t 0 ]]; then
        print_error "This script requires interactive input but is being run in a non-interactive environment."
        echo
        print_status "To run this script interactively, save it first and run it directly:"
        echo "  wget https://raw.githubusercontent.com/sensity-app/SensityDashboard/main/install-ubuntu.sh"
        echo "  chmod +x install-ubuntu.sh"
        echo "  sudo ./install-ubuntu.sh"
        echo
        print_status "Or set environment variables and run non-interactively:"
        echo
        echo "  For production (with SSL):"
        echo "  export DOMAIN=your-domain.com"
        echo "  export EMAIL=your-email@example.com"
        echo "  export DB_PASSWORD=your-secure-password"
        echo "  export MQTT_USERNAME=your-mqtt-user    # Optional, defaults to 'iot'"
        echo "  export MQTT_PASSWORD=your-mqtt-pass    # Optional, auto-generated if not set"
        echo "  curl -sSL https://raw.githubusercontent.com/sensity-app/SensityDashboard/main/install-ubuntu.sh | sudo -E bash"
        echo
        echo "  For development (no SSL, IP access only):"
        echo "  export DEVELOPMENT_MODE=true"
        echo "  export DB_PASSWORD=your-secure-password"
        echo "  export MQTT_USERNAME=your-mqtt-user    # Optional, defaults to 'iot'"
        echo "  export MQTT_PASSWORD=your-mqtt-pass    # Optional, auto-generated if not set"
        echo "  curl -sSL https://raw.githubusercontent.com/sensity-app/SensityDashboard/main/install-ubuntu.sh | sudo -E bash"
        echo
        exit 1
    fi

    echo "Please choose your installation type:"
    echo
    echo "1) Production (with domain name and SSL certificates)"
    echo "2) Development (no SSL, access via IP address only)"
    echo

    while [[ -z "$DEVELOPMENT_MODE" ]]; do
        read -p "Select installation type (1 or 2): " INSTALL_TYPE < /dev/tty
        case $INSTALL_TYPE in
            1)
                DEVELOPMENT_MODE="false"
                print_status "Selected: Production installation with SSL"
                ;;
            2)
                DEVELOPMENT_MODE="true"
                print_status "Selected: Development installation without SSL"
                ;;
            *)
                print_error "Please enter 1 or 2"
                ;;
        esac
    done

    echo

    if [[ "$DEVELOPMENT_MODE" == "false" ]]; then
        # Domain name
        while [[ -z "$DOMAIN" ]]; do
            read -p "Enter your domain name (e.g., iot.example.com): " DOMAIN < /dev/tty
            if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
                print_error "Invalid domain name format"
                DOMAIN=""
            fi
        done

        # Email for SSL certificates
        while [[ -z "$EMAIL" ]]; do
            read -p "Enter your email for SSL certificates: " EMAIL < /dev/tty
            if [[ ! "$EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
                print_error "Invalid email format"
                EMAIL=""
            fi
        done
    else
        print_status "Development mode: Skipping domain and email configuration"
        DOMAIN="localhost"
        EMAIL="dev@localhost"
    fi

    # Database password
    while [[ -z "$DB_PASSWORD" ]]; do
        read -s -p "Enter database password (will be created): " DB_PASSWORD < /dev/tty
        echo
        if [[ ${#DB_PASSWORD} -lt 8 ]]; then
            print_error "Password must be at least 8 characters long"
            DB_PASSWORD=""
        fi
    done

    echo

    # MQTT credentials
    print_status "MQTT Broker Configuration"
    echo

    # MQTT username
    read -p "Enter MQTT username [default: iot]: " MQTT_USERNAME < /dev/tty
    if [[ -z "$MQTT_USERNAME" ]]; then
        MQTT_USERNAME="iot"
    fi

    # MQTT password
    while [[ -z "$MQTT_PASSWORD" ]]; do
        read -s -p "Enter MQTT password (or press Enter for auto-generated): " MQTT_PASSWORD_INPUT < /dev/tty
        echo

        if [[ -z "$MQTT_PASSWORD_INPUT" ]]; then
            # Auto-generate secure password
            MQTT_PASSWORD=$(openssl rand -base64 16 | tr -d '\n')
            print_success "Auto-generated MQTT password: $MQTT_PASSWORD"
        else
            if [[ ${#MQTT_PASSWORD_INPUT} -lt 8 ]]; then
                print_error "Password must be at least 8 characters long"
            else
                MQTT_PASSWORD="$MQTT_PASSWORD_INPUT"
            fi
        fi
    done

    # Generate JWT secret
    JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')

    echo
    print_success "Configuration collected successfully"
}

# Function to update system
update_system() {
    print_status "Updating system packages..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get upgrade -y
    apt-get install -y curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release
    print_success "System updated"
}

# Function to install Node.js
install_nodejs() {
    print_status "Installing Node.js $NODE_VERSION..."

    # Remove any existing Node.js installations
    apt-get remove -y nodejs npm || true

    # Install Node.js from NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    apt-get install -y nodejs

    # Verify installation
    NODE_VER=$(node --version)
    NPM_VER=$(npm --version)
    print_success "Node.js $NODE_VER and npm $NPM_VER installed"
}

# Function to install PostgreSQL
install_postgresql() {
    print_status "Installing PostgreSQL..."

    apt-get install -y postgresql postgresql-contrib

    # Start and enable PostgreSQL
    systemctl start postgresql
    systemctl enable postgresql

    # Clean up any existing database components to prevent conflicts
    print_status "Cleaning up any existing database components..."
    # Terminate any active connections to the database
    sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'esp8266_platform' AND pid <> pg_backend_pid();" 2>/dev/null || true
    # Drop database first (must come before user due to ownership)
    sudo -u postgres dropdb esp8266_platform 2>/dev/null || true
    # Drop user
    sudo -u postgres dropuser esp8266app 2>/dev/null || true

    # Create database and user
    print_status "Creating database user..."
    if ! sudo -u postgres psql -t -c '\du' 2>/dev/null | cut -d \| -f 1 | grep -qw esp8266app; then
        sudo -u postgres psql -c "CREATE USER esp8266app WITH PASSWORD '$DB_PASSWORD';"
        print_success "Database user created"
    else
        print_status "Database user already exists, updating password..."
        sudo -u postgres psql -c "ALTER USER esp8266app PASSWORD '$DB_PASSWORD';"
    fi

    print_status "Creating database..."
    if ! sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw esp8266_platform; then
        sudo -u postgres psql -c "CREATE DATABASE esp8266_platform OWNER esp8266app;"
        print_success "Database created"
    else
        print_status "Database already exists, ensuring correct ownership..."
        sudo -u postgres psql -c "ALTER DATABASE esp8266_platform OWNER TO esp8266app;"
    fi

    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE esp8266_platform TO esp8266app;"

    print_success "PostgreSQL installed and configured"
}

# Function to install Redis
install_redis() {
    print_status "Installing Redis..."

    apt-get install -y redis-server

    # Configure Redis
    sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf
    sed -i 's/# maxmemory <bytes>/maxmemory 256mb/' /etc/redis/redis.conf
    sed -i 's/# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf

    # Start and enable Redis
    systemctl restart redis-server
    systemctl enable redis-server

    print_success "Redis installed and configured"
}

# Function to install MQTT broker (optional)
install_mqtt_broker() {
    print_status "MQTT Protocol Support"
    echo
    echo "MQTT is an optional lightweight messaging protocol for device communication."
    echo "Benefits:"
    echo "  • Lower bandwidth usage (~95% less than HTTP)"
    echo "  • Better for battery-powered devices"
    echo "  • Real-time bidirectional communication"
    echo "  • Works well behind NAT/firewalls"
    echo
    echo "You can skip this and devices will use HTTP instead."
    echo

    # Check if running interactively
    if [[ ! -t 0 ]]; then
        # Non-interactive mode - check environment variable
        if [[ "$INSTALL_MQTT" == "true" ]]; then
            print_status "Installing MQTT broker (configured via INSTALL_MQTT=true)..."
        else
            print_status "Skipping MQTT broker installation (set INSTALL_MQTT=true to enable)"
            MQTT_ENABLED="false"
            return 0
        fi
    else
        # Interactive mode - ask user
        read -p "Install Mosquitto MQTT broker? (y/N): " -n 1 -r < /dev/tty
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_status "Skipping MQTT broker installation"
            MQTT_ENABLED="false"
            return 0
        fi
    fi

    print_status "Installing Mosquitto MQTT broker..."

    # Install mosquitto
    apt-get install -y mosquitto mosquitto-clients

    # Stop mosquitto service temporarily for configuration
    systemctl stop mosquitto 2>/dev/null || true

    # Create MQTT configuration directory
    mkdir -p /etc/mosquitto/conf.d

    # Create ESP8266 platform configuration
    cat > /etc/mosquitto/conf.d/esp8266-platform.conf << 'EOF'
# ESP8266 Platform MQTT Configuration
listener 1883 0.0.0.0
protocol mqtt

# Authentication
allow_anonymous false
password_file /etc/mosquitto/passwd

# Logging
log_dest file /var/log/mosquitto/mosquitto.log
log_type error
log_type warning
log_type notice

# Connection limits
max_connections -1
max_queued_messages 1000

# Persistence
persistence true
persistence_location /var/lib/mosquitto/

# Message size limit (allow larger payloads for sensor data)
message_size_limit 10240
EOF

    # Create password file with custom or default credentials
    if [[ -z "$MQTT_USERNAME" ]]; then
        MQTT_USERNAME="iot"
    fi

    if [[ -z "$MQTT_PASSWORD" ]]; then
        MQTT_PASSWORD=$(openssl rand -base64 16 | tr -d '\n')
        print_success "Auto-generated MQTT password: $MQTT_PASSWORD"
    fi

    print_status "Creating MQTT user '$MQTT_USERNAME'..."

    # Create password file with secure permissions from the start
    touch /etc/mosquitto/passwd
    chmod 600 /etc/mosquitto/passwd
    chown root:root /etc/mosquitto/passwd

    # Add user credentials
    mosquitto_passwd -b /etc/mosquitto/passwd "$MQTT_USERNAME" "$MQTT_PASSWORD"

    # Ensure password file has correct ownership
    chown root:root /etc/mosquitto/passwd
    chmod 600 /etc/mosquitto/passwd

    # Create and set permissions for log directory
    mkdir -p /var/log/mosquitto
    chown mosquitto:mosquitto /var/log/mosquitto
    chmod 755 /var/log/mosquitto

    # Ensure persistence directory exists with proper permissions
    mkdir -p /var/lib/mosquitto
    chown mosquitto:mosquitto /var/lib/mosquitto
    chmod 755 /var/lib/mosquitto

    # Set proper ownership on configuration (but not passwd file)
    chown mosquitto:mosquitto /etc/mosquitto/*.conf 2>/dev/null || true
    chown mosquitto:mosquitto /etc/mosquitto/conf.d/*.conf 2>/dev/null || true

    # Enable and start mosquitto service
    systemctl enable mosquitto
    systemctl restart mosquitto

    # Wait a moment for service to start
    sleep 2

    # Verify mosquitto is running
    if systemctl is-active --quiet mosquitto; then
        MQTT_ENABLED="true"
        MQTT_BROKER_URL="mqtt://localhost:1883"

        print_success "Mosquitto MQTT broker installed and running"
        print_success "MQTT credentials: $MQTT_USERNAME / $MQTT_PASSWORD"
        print_status "To add more users: sudo mosquitto_passwd /etc/mosquitto/passwd <username>"
        print_status "To change password: sudo mosquitto_passwd -b /etc/mosquitto/passwd $MQTT_USERNAME <new_password>"
    else
        print_error "Mosquitto failed to start. Check logs: journalctl -u mosquitto"
        MQTT_ENABLED="false"
        return 1
    fi
}

# Function to create application user
create_app_user() {
    print_status "Creating application user..."

    if ! id "$APP_USER" &>/dev/null; then
        useradd -r -m -s /bin/bash "$APP_USER"
        usermod -aG sudo "$APP_USER"
        print_success "User $APP_USER created"
    else
        print_status "User $APP_USER already exists"
    fi
}

# Function to clone and setup application
setup_application() {
    print_status "Setting up application..."

    # Create application directory
    mkdir -p "$APP_DIR"
    chown "$APP_USER:$APP_USER" "$APP_DIR"

    # Clone repository from GitHub
    print_status "Cloning ESP Management Platform from GitHub..."

    if [[ -d "$APP_DIR/.git" ]]; then
        print_status "Repository already exists, pulling latest changes..."
        cd "$APP_DIR"
        sudo -u "$APP_USER" git pull origin main
    else
        sudo -u "$APP_USER" git clone https://github.com/sensity-app/SensityDashboard.git "$APP_DIR"
        cd "$APP_DIR"
    fi

    print_success "Application cloned from GitHub"

    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
    print_success "Application directory prepared"
}

# Function to install application dependencies
install_app_dependencies() {
    print_status "Installing application dependencies..."

    # Install backend dependencies
    if [[ -f "$APP_DIR/backend/package.json" ]]; then
        cd "$APP_DIR/backend"
        if [[ -f "package-lock.json" ]]; then
            sudo -u "$APP_USER" npm ci --production
        else
            print_warning "package-lock.json not found, using npm install"
            sudo -u "$APP_USER" npm install --production
        fi
        print_success "Backend dependencies installed"
    else
        print_warning "Backend package.json not found - skipping backend dependencies"
    fi

    # Install frontend dependencies (but don't build yet)
    if [[ -f "$APP_DIR/frontend/package.json" ]]; then
        cd "$APP_DIR/frontend"
        if [[ -f "package-lock.json" ]]; then
            # Try npm ci first, fall back to npm install if there are sync issues
            if ! sudo -u "$APP_USER" npm ci 2>/dev/null; then
                print_warning "package-lock.json out of sync, regenerating with npm install"
                sudo -u "$APP_USER" npm install
            fi
        else
            print_warning "package-lock.json not found, using npm install"
            sudo -u "$APP_USER" npm install
        fi
        print_success "Frontend dependencies installed"
    else
        print_warning "Frontend package.json not found - skipping frontend dependencies"
    fi
}

# Function to build frontend after environment files are created
build_frontend() {
    print_status "Building frontend with environment variables..."

    if [[ -f "$APP_DIR/frontend/package.json" ]]; then
        cd "$APP_DIR/frontend"
        sudo -u "$APP_USER" npm run build
        print_success "Frontend built successfully"
    else
        print_warning "Frontend package.json not found - skipping frontend build"
    fi
}

# Function to setup database schema
setup_database() {
    print_status "Setting up database schema..."

    if [[ -f "$APP_DIR/database/schema.sql" ]]; then
        sudo -u postgres psql -d esp8266_platform -f "$APP_DIR/database/schema.sql"
        print_success "Database schema created"
    else
        print_warning "Database schema file not found - you'll need to run migrations manually"
    fi

    # Fix database permissions after schema creation
    fix_database_permissions

    # Run database migrations
    run_database_migrations
}

# Function to run database migrations
run_database_migrations() {
    print_status "Running database migrations..."

    cd "$APP_DIR/backend"

    # Run Telegram support migration
    if [[ -f "migrations/add_telegram_support.js" ]]; then
        print_status "Running Telegram support migration..."
        sudo -u $APP_USER NODE_ENV=production node migrations/add_telegram_support.js
        if [[ $? -eq 0 ]]; then
            print_success "Telegram support migration completed"
        else
            print_warning "Telegram support migration failed - you may need to run it manually"
        fi
    fi

    # Run auto-calibration migration
    if [[ -f "migrations/add_auto_calibration.js" ]]; then
        print_status "Running auto-calibration migration..."
        sudo -u $APP_USER NODE_ENV=production node migrations/add_auto_calibration.js
        if [[ $? -eq 0 ]]; then
            print_success "Auto-calibration migration completed"
        else
            print_warning "Auto-calibration migration failed - you may need to run it manually"
        fi
    fi

    # Run any other migrations in the migrations directory
    for migration_file in migrations/*.js; do
        if [[ -f "$migration_file" ]] && [[ "$migration_file" != *"add_telegram_support.js"* ]] && [[ "$migration_file" != *"add_auto_calibration.js"* ]]; then
            migration_name=$(basename "$migration_file")
            print_status "Running migration: $migration_name..."
            sudo -u $APP_USER NODE_ENV=production node "$migration_file"
            if [[ $? -eq 0 ]]; then
                print_success "Migration $migration_name completed"
            else
                print_warning "Migration $migration_name failed - you may need to run it manually"
            fi
        fi
    done

    cd - > /dev/null
    print_success "Database migrations completed"
}

# Function to fix database permissions
fix_database_permissions() {
    print_status "Configuring database permissions..."

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

    print_success "Database permissions configured"
}

# Function to create environment files
create_env_files() {
    print_status "Creating environment configuration..."

    # Note: PM2 ecosystem.config.js now contains all environment variables
    # The .env file is created as a backup but PM2 uses the ecosystem config

    # Backend environment (backup - PM2 uses ecosystem.config.js)
    cat > "$APP_DIR/backend/.env" << EOF
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=esp8266_platform
DB_USER=esp8266app
DB_PASSWORD=$DB_PASSWORD

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Configuration
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

# Server Configuration
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://$DOMAIN

# Email Configuration (configure with your SMTP settings)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="ESP8266 Platform <your-email@gmail.com>"

# Twilio Configuration (optional, for SMS alerts)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Telegram Configuration (optional, for Telegram alerts)
# Get your bot token from @BotFather on Telegram
TELEGRAM_BOT_TOKEN=

# File Upload Configuration
MAX_FILE_SIZE=50mb
UPLOAD_PATH=/tmp/uploads

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/esp8266-platform/app.log

# SSL/TLS
USE_HTTPS=true
SSL_CERT_PATH=/etc/letsencrypt/live/$DOMAIN/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/$DOMAIN/privkey.pem

# MQTT Configuration (Optional)
MQTT_ENABLED=${MQTT_ENABLED:-false}
MQTT_BROKER_URL=${MQTT_BROKER_URL:-mqtt://localhost:1883}
MQTT_USERNAME=${MQTT_USERNAME:-}
MQTT_PASSWORD=${MQTT_PASSWORD:-}
MQTT_TOPIC_PREFIX=iot
MQTT_DEFAULT_QOS=1
EOF

    # Frontend environment
    if [[ "$DEVELOPMENT_MODE" == "true" ]]; then
        SERVER_IP=$(hostname -I | awk '{print $1}')
        cat > "$APP_DIR/frontend/.env" << EOF
REACT_APP_API_URL=http://$SERVER_IP/api
REACT_APP_WS_URL=ws://$SERVER_IP
REACT_APP_ENVIRONMENT=development
REACT_APP_VERSION=2.1.0
EOF
        cat > "$APP_DIR/frontend/.env.production" << EOF
REACT_APP_API_URL=http://$SERVER_IP/api
REACT_APP_WS_URL=ws://$SERVER_IP
REACT_APP_ENVIRONMENT=production
REACT_APP_VERSION=2.1.0
EOF
    else
        cat > "$APP_DIR/frontend/.env.production" << EOF
REACT_APP_API_URL=https://$DOMAIN/api
REACT_APP_WS_URL=wss://$DOMAIN
REACT_APP_ENVIRONMENT=production
REACT_APP_VERSION=2.1.0
EOF
    fi

    chown "$APP_USER:$APP_USER" "$APP_DIR/backend/.env"
    chown "$APP_USER:$APP_USER" "$APP_DIR/frontend/.env.production"
    if [[ "$DEVELOPMENT_MODE" == "true" ]]; then
        chown "$APP_USER:$APP_USER" "$APP_DIR/frontend/.env"
    fi
    chmod 600 "$APP_DIR/backend/.env"

    print_success "Environment files created"
}

# Function to install PM2
install_pm2() {
    print_status "Installing PM2 process manager..."

    npm install -g pm2

    # Create PM2 ecosystem file with environment variables
    cat > "$APP_DIR/ecosystem.config.js" << EOF
module.exports = {
  apps: [{
    name: 'esp8266-platform',
    script: 'backend/server.js',
    cwd: '$APP_DIR',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      // Database Configuration
      DB_HOST: 'localhost',
      DB_PORT: 5432,
      DB_NAME: 'esp8266_platform',
      DB_USER: 'esp8266app',
      DB_PASSWORD: '$DB_PASSWORD',
      // Redis Configuration
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      REDIS_PASSWORD: '',
      // JWT Configuration
      JWT_SECRET: '$JWT_SECRET',
      JWT_EXPIRES_IN: '7d',
      // Telegram Configuration (optional)
      TELEGRAM_BOT_TOKEN: '',
      // Additional Configuration
      FRONTEND_URL: '$([ "$DEVELOPMENT_MODE" == "true" ] && echo "http://localhost" || echo "https://$DOMAIN")',
      MAX_FILE_SIZE: '50mb',
      LOG_LEVEL: 'info'
    },
    error_file: '/var/log/esp8266-platform/pm2-error.log',
    out_file: '/var/log/esp8266-platform/pm2-out.log',
    log_file: '/var/log/esp8266-platform/pm2-combined.log',
    time: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '1G'
  }]
};
EOF

    chown "$APP_USER:$APP_USER" "$APP_DIR/ecosystem.config.js"

    # Create log directory
    mkdir -p /var/log/esp8266-platform
    chown "$APP_USER:$APP_USER" /var/log/esp8266-platform

    # Setup PM2 startup script (run as root to configure systemd)
    sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" --silent

    print_success "PM2 installed and configured"
}

# Function to install and configure Nginx
install_nginx() {
    print_status "Installing and configuring Nginx..."

    apt-get install -y nginx

    if [[ "$DEVELOPMENT_MODE" == "true" ]]; then
        # Development configuration (HTTP only, no SSL)
        cat > "/etc/nginx/sites-available/esp8266-platform" << EOF
# Development HTTP server (no SSL)
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    # Allow access from any IP
    server_name _;

    # Root directory for static files
    root $APP_DIR/frontend/build;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # API routes
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Static files
    location / {
        try_files \$uri \$uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public";
    }

    # Firmware files (if serving them statically)
    location /firmware/ {
        alias $APP_DIR/firmware/;
        expires 1h;
        add_header Cache-Control "public";
    }

    # Disable access to sensitive files
    location ~ /\. {
        deny all;
    }

    location ~ \.(env|log|md)$ {
        deny all;
    }
}
EOF

        # Enable site
        ln -sf "/etc/nginx/sites-available/esp8266-platform" "/etc/nginx/sites-enabled/"
        print_status "Development mode: HTTP-only configuration created"

    else
        # Production configuration - Start with HTTP only for certbot
        print_status "Production mode: Creating temporary HTTP configuration for certificate acquisition..."
        cat > "/etc/nginx/sites-available/$DOMAIN" << EOF
# Temporary HTTP server for certificate acquisition
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    # Root directory for static files
    root $APP_DIR/frontend/build;
    index index.html;

    # Allow certbot to validate domain
    location ^~ /.well-known/acme-challenge/ {
        default_type "text/plain";
        root /var/www/html;
    }

    # API routes
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Static files
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

        # Enable site
        ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/"
        print_status "Temporary HTTP configuration created"
    fi

    rm -f /etc/nginx/sites-enabled/default

    # Test Nginx configuration
    if ! nginx -t; then
        print_error "Nginx configuration test failed"
        exit 1
    fi

    # Restart Nginx to apply changes
    systemctl restart nginx
    systemctl enable nginx

    print_success "Nginx configured and restarted with HTTP"
}

# Function to upgrade nginx to HTTPS after SSL certificate is obtained
upgrade_nginx_to_https() {
    print_status "Upgrading Nginx configuration to HTTPS..."

    # Check if we have a certificate for www subdomain
    local server_names="$DOMAIN"
    if [[ -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
        # Check certificate for www domain
        if openssl x509 -in "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" -text -noout | grep -q "DNS:www.$DOMAIN"; then
            server_names="$DOMAIN www.$DOMAIN"
            print_status "Certificate includes www subdomain"
        else
            server_names="$DOMAIN"
            print_status "Certificate is for main domain only"
        fi
    fi

    cat > "/etc/nginx/sites-available/$DOMAIN" << EOF
# HTTP redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name $server_names;

    # Allow certbot renewals
    location ^~ /.well-known/acme-challenge/ {
        default_type "text/plain";
        root /var/www/html;
    }

    # Redirect everything else to HTTPS
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $server_names;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Modern configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    # Root directory for static files
    root $APP_DIR/frontend/build;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # API routes
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Static files
    location / {
        try_files \$uri \$uri/ /index.html;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Firmware files (if serving them statically)
    location /firmware/ {
        alias $APP_DIR/firmware/;
        expires 1h;
        add_header Cache-Control "public";
    }

    # Disable access to sensitive files
    location ~ /\. {
        deny all;
    }

    location ~ \.(env|log|md)$ {
        deny all;
    }
}
EOF

    # Test Nginx configuration
    if ! nginx -t; then
        print_error "Nginx HTTPS configuration test failed"
        exit 1
    fi

    # Reload Nginx to apply HTTPS configuration
    systemctl reload nginx

    print_success "Nginx upgraded to HTTPS successfully"
}

# Function to install Certbot and get SSL certificates
setup_ssl() {
    if [[ "$DEVELOPMENT_MODE" == "true" ]]; then
        print_status "Development mode: Skipping SSL certificate setup"
        return 0
    fi

    print_status "Installing Certbot and obtaining SSL certificates..."

    apt-get install -y certbot python3-certbot-nginx

    # Get SSL certificate using webroot (Nginx is already running with HTTP)
    print_status "Requesting SSL certificate for $DOMAIN..."

    # Create webroot directory for certbot
    mkdir -p /var/www/html/.well-known/acme-challenge

    # Check if www subdomain exists
    print_status "Checking if www.$DOMAIN is configured..."
    local www_domain_exists=false
    if dig +short "www.$DOMAIN" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' >/dev/null 2>&1; then
        www_domain_exists=true
        print_status "www.$DOMAIN has DNS record, including in certificate"
    else
        print_status "www.$DOMAIN has no DNS record, requesting certificate for $DOMAIN only"
    fi

    # Use webroot method since nginx is already serving HTTP
    if [[ "$www_domain_exists" == "true" ]]; then
        certbot_cmd="certbot certonly --webroot -w /var/www/html -d \"$DOMAIN\" -d \"www.$DOMAIN\" --email \"$EMAIL\" --agree-tos --non-interactive"
    else
        certbot_cmd="certbot certonly --webroot -w /var/www/html -d \"$DOMAIN\" --email \"$EMAIL\" --agree-tos --non-interactive"
    fi

    if eval $certbot_cmd; then
        print_success "SSL certificate obtained successfully"
    else
        print_error "Failed to obtain SSL certificate"
        print_status "Please check that:"
        print_status "1. DNS records for $DOMAIN point to this server"
        if [[ "$www_domain_exists" == "true" ]]; then
            print_status "2. DNS records for www.$DOMAIN point to this server"
            print_status "3. Port 80 is open and accessible from the internet"
            print_status "4. No firewall is blocking the connection"
        else
            print_status "2. Port 80 is open and accessible from the internet"
            print_status "3. No firewall is blocking the connection"
        fi
        exit 1
    fi

    # Setup automatic renewal
    cat > /etc/cron.d/certbot-renew << EOF
0 12 * * * /usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
EOF

    print_success "SSL certificates obtained and auto-renewal configured"

    # Now upgrade nginx configuration to use HTTPS
    upgrade_nginx_to_https
}

# Function to configure firewall
setup_firewall() {
    print_status "Configuring UFW firewall..."

    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh

    if [[ "$DEVELOPMENT_MODE" == "true" ]]; then
        ufw allow 'Nginx HTTP'
        print_status "Development mode: HTTP access allowed"
    else
        ufw allow 'Nginx Full'
        print_status "Production mode: HTTPS access configured"
    fi

    # Open MQTT port if MQTT is enabled
    if [[ "$MQTT_ENABLED" == "true" ]]; then
        ufw allow 1883/tcp comment 'MQTT'
        print_status "MQTT port 1883 opened in firewall"
    fi

    ufw --force enable

    print_success "Firewall configured"
}

# Function to start services
start_services() {
    print_status "Starting all services..."

    # Nginx is already started and enabled in install_nginx function

    # Start application with PM2
    cd "$APP_DIR"
    sudo -u "$APP_USER" pm2 start ecosystem.config.js

    # Save PM2 configuration for auto-startup
    sudo -u "$APP_USER" pm2 save

    print_success "All services started and configured for auto-startup"
}

# Function to create initial setup completion file
create_setup_completion() {
    print_status "Finalizing installation..."

    if [[ "$DEVELOPMENT_MODE" == "true" ]]; then
        SERVER_IP=$(hostname -I | awk '{print $1}')
        ACCESS_URL="http://$SERVER_IP"
        WEB_SERVER_INFO="Nginx (HTTP only, development mode)"
    else
        ACCESS_URL="https://$DOMAIN"
        WEB_SERVER_INFO="Nginx with SSL/TLS"
    fi

    cat > "$APP_DIR/INSTALLATION_INFO.md" << EOF
# ESP8266 IoT Platform - Installation Complete

## Server Information
- **Access URL**: $ACCESS_URL
- **Installation Mode**: $([ "$DEVELOPMENT_MODE" == "true" ] && echo "Development (HTTP)" || echo "Production (HTTPS)")
- **Installation Date**: $(date)
- **Application Directory**: $APP_DIR
- **Application User**: $APP_USER

## Service Status
- **Backend**: PM2 managed Node.js application on port 3000
- **Frontend**: Static files served by Nginx
- **Database**: PostgreSQL on localhost:5432
- **Cache**: Redis on localhost:6379
- **Web Server**: $WEB_SERVER_INFO

## Important Files
- **Backend Config**: $APP_DIR/backend/.env
- **Frontend Config**: $APP_DIR/frontend/.env.production
- **PM2 Config**: $APP_DIR/ecosystem.config.js
- **Nginx Config**: /etc/nginx/sites-available/$DOMAIN
- **SSL Certificates**: /etc/letsencrypt/live/$DOMAIN/

## Next Steps
1. **Copy your application files** to $APP_DIR (if not done already)
2. **Configure email/SMS settings** in $APP_DIR/backend/.env
3. **Access your platform** at https://$DOMAIN
4. **Register the first admin user** via the web interface
5. **Test the firmware builder** functionality

## Management Commands
\`\`\`bash
# View application logs
sudo -u $APP_USER pm2 logs

# Restart application
sudo -u $APP_USER pm2 restart esp8266-platform

# Check service status
systemctl status nginx
systemctl status postgresql
systemctl status redis-server

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
\`\`\`

## Database Access
\`\`\`bash
# Connect to database
sudo -u postgres psql -d esp8266_platform

# Backup database
sudo -u postgres pg_dump esp8266_platform > backup.sql

# Restore database
sudo -u postgres psql -d esp8266_platform < backup.sql
\`\`\`

## Troubleshooting
- **Check application logs**: sudo -u $APP_USER pm2 logs
- **Check Nginx**: sudo nginx -t && sudo systemctl status nginx
- **Check database**: sudo -u postgres psql -c "SELECT version();"
- **Check Redis**: redis-cli ping

## Security Notes
- Database password is stored in $APP_DIR/backend/.env
- JWT secret is randomly generated
- SSL certificates auto-renew via cron
- UFW firewall is active (SSH + HTTP/HTTPS only)

For support, check the logs and refer to the project documentation:
- GitHub Repository: https://github.com/sensity-app/SensityDashboard
- Issues: https://github.com/sensity-app/SensityDashboard/issues
- Documentation: https://github.com/sensity-app/SensityDashboard/blob/main/README.md
EOF

    chown "$APP_USER:$APP_USER" "$APP_DIR/INSTALLATION_INFO.md"

    print_success "Installation information saved to $APP_DIR/INSTALLATION_INFO.md"
}

# Function to display completion message
show_completion_message() {
    print_header

    if [[ "$DEVELOPMENT_MODE" == "true" ]]; then
        SERVER_IP=$(hostname -I | awk '{print $1}')
        ACCESS_URL="http://$SERVER_IP"
        MODE_TEXT="Development Mode (HTTP Only)"
        SECURITY_TEXT="Basic security - HTTP only, suitable for development"
    else
        ACCESS_URL="https://$DOMAIN"
        MODE_TEXT="Production Mode (HTTPS)"
        SECURITY_TEXT="SSL/TLS certificates are active and auto-renewing"
    fi

    echo -e "${GREEN}
╔══════════════════════════════════════════════════════════════╗
║                   🎉 INSTALLATION COMPLETE! 🎉               ║
╚══════════════════════════════════════════════════════════════╝${NC}

${CYAN}Your ESP8266 IoT Platform is now installed and running!${NC}
${CYAN}Installation Mode: ${MODE_TEXT}${NC}

${YELLOW}📍 Access your platform:${NC}
   🌐 Web Interface: ${BLUE}${ACCESS_URL}${NC}
   📊 Admin Dashboard: ${BLUE}${ACCESS_URL}/dashboard${NC}
   🔧 Firmware Builder: ${BLUE}${ACCESS_URL}/firmware-builder${NC}

${YELLOW}🔑 Next Steps:${NC}
   1. Visit ${BLUE}${ACCESS_URL}${NC} to register your first admin user
   2. Configure email/SMS settings for alerts (optional)
   3. Start creating and managing your ESP8266 devices
   4. Use the firmware builder to generate custom firmware

${YELLOW}📋 Important Information:${NC}
   • Installation details: ${BLUE}$APP_DIR/INSTALLATION_INFO.md${NC}
   • Application logs: ${BLUE}sudo -u $APP_USER pm2 logs${NC}
   • Configuration files in: ${BLUE}$APP_DIR/backend/.env${NC}

${YELLOW}🛡️ Security:${NC}
   • ${SECURITY_TEXT}
   • Firewall is configured (SSH + HTTP/HTTPS only)
   • Database is password protected

${GREEN}Happy monitoring with your ESP8266 devices! 🚀${NC}
"
}

# Main installation function

# Function to clean up failed installation
cleanup_failed_installation() {
    print_status "Cleaning up failed installation..."

    # Stop services
    systemctl stop nginx 2>/dev/null || true
    systemctl stop postgresql 2>/dev/null || true
    systemctl stop redis-server 2>/dev/null || true

    # Stop PM2 processes
    if sudo -u "$APP_USER" pm2 list 2>/dev/null | grep -q "esp8266"; then
        sudo -u "$APP_USER" pm2 delete all 2>/dev/null || true
        sudo -u "$APP_USER" pm2 kill 2>/dev/null || true
    fi

    # Remove application directory
    if [[ -d "$APP_DIR" ]]; then
        print_status "Removing application directory..."
        rm -rf "$APP_DIR"
    fi

    # Remove application user
    if id "$APP_USER" &>/dev/null; then
        print_status "Removing application user..."
        userdel -r "$APP_USER" 2>/dev/null || true
    fi

    # Remove database and user (database must be dropped before user due to ownership)
    if sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw esp8266_platform; then
        print_status "Removing database (esp8266_platform)..."
        # Terminate any active connections to the database
        sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'esp8266_platform' AND pid <> pg_backend_pid();" 2>/dev/null || true
        # Drop the database
        sudo -u postgres dropdb esp8266_platform 2>/dev/null || true
        print_status "Database removed"
    fi

    if sudo -u postgres psql -t -c '\du' 2>/dev/null | cut -d \| -f 1 | grep -qw esp8266app; then
        print_status "Removing database user (esp8266app)..."
        sudo -u postgres dropuser esp8266app 2>/dev/null || true
        print_status "Database user removed"
    fi

    # Remove nginx configuration
    rm -f "/etc/nginx/sites-enabled/$DOMAIN" 2>/dev/null || true
    rm -f "/etc/nginx/sites-available/$DOMAIN" 2>/dev/null || true
    rm -f "/etc/nginx/sites-enabled/esp8266-platform" 2>/dev/null || true
    rm -f "/etc/nginx/sites-available/esp8266-platform" 2>/dev/null || true

    # Remove SSL certificates (only in production mode)
    if [[ "$DEVELOPMENT_MODE" != "true" && -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
        print_status "Removing SSL certificates..."
        certbot delete --cert-name "$DOMAIN" --non-interactive 2>/dev/null || true
    fi

    # Remove cron jobs
    rm -f /etc/cron.d/certbot-renew 2>/dev/null || true

    # Reset firewall
    ufw --force reset >/dev/null 2>&1 || true

    print_success "Cleanup completed"
}

# Function to detect existing installation
detect_existing_installation() {
    local found_components=()

    # Check for existing application directory
    if [[ -d "$APP_DIR" ]]; then
        found_components+=("Application directory ($APP_DIR)")
    fi

    # Check for existing user
    if id "$APP_USER" &>/dev/null; then
        found_components+=("Application user ($APP_USER)")
    fi

    # Check for database
    if sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw esp8266_platform; then
        found_components+=("Database (esp8266_platform)")
    fi

    # Check for database user
    if sudo -u postgres psql -t -c '\du' 2>/dev/null | cut -d \| -f 1 | grep -qw esp8266app; then
        found_components+=("Database user (esp8266app)")
    fi

    # Check for nginx config
    if [[ -f "/etc/nginx/sites-available/$DOMAIN" ]] || [[ -f "/etc/nginx/sites-available/esp8266-platform" ]]; then
        found_components+=("Nginx configuration")
    fi

    # Check for PM2 processes
    if sudo -u "$APP_USER" pm2 list 2>/dev/null | grep -q "esp8266" 2>/dev/null; then
        found_components+=("PM2 processes")
    fi

    if [[ ${#found_components[@]} -gt 0 ]]; then
        print_warning "Found existing installation components:"
        for component in "${found_components[@]}"; do
            echo "  • $component"
        done
        echo

        # Handle non-interactive mode
        if [[ ! -t 0 ]]; then
            print_warning "Running in non-interactive mode. Auto-cleaning existing installation..."
            cleanup_failed_installation
            print_success "Cleanup completed. Continuing with fresh installation..."
        else
            echo "Options:"
            echo "1) Clean up and reinstall (removes all existing data)"
            echo "2) Continue installation (may cause conflicts)"
            echo "3) Exit (manual cleanup required)"
            echo

            while true; do
                read -p "Choose an option (1-3): " choice < /dev/tty
                case $choice in
                    1)
                        cleanup_failed_installation
                        print_success "Cleanup completed. Continuing with fresh installation..."
                        break
                        ;;
                    2)
                        print_warning "Continuing with existing components (may cause issues)..."
                        break
                        ;;
                    3)
                        print_status "Installation cancelled. Manual cleanup required:"
                        echo
                        echo "To clean up manually, run these commands:"
                        echo "  sudo systemctl stop nginx postgresql redis-server"
                        echo "  sudo -u $APP_USER pm2 delete all && sudo -u $APP_USER pm2 kill"
                        echo "  sudo rm -rf $APP_DIR"
                        echo "  sudo userdel -r $APP_USER"
                        echo "  sudo -u postgres dropdb esp8266_platform"
                        echo "  sudo -u postgres dropuser esp8266app"
                        echo "  sudo rm -f /etc/nginx/sites-*/*esp8266* /etc/nginx/sites-*/*$DOMAIN*"
                        echo
                        exit 0
                        ;;
                    *)
                        print_error "Please enter 1, 2, or 3"
                        ;;
                esac
            done
        fi
    fi
}

# Main installation function
main() {
    print_header
    check_requirements

    # Get configuration
    get_user_input

    # Check for existing installation FIRST (before validation)
    # This allows port checks to skip already-installed services
    check_existing_installation

    # Run pre-installation validation
    validate_installation

    # Validate DNS in production mode
    if [[ "$DEVELOPMENT_MODE" != "true" ]]; then
        if ! validate_dns "$DOMAIN"; then
            print_warning "DNS validation failed. SSL certificate acquisition may fail."
            if [[ -t 0 ]]; then
                read -p "Continue anyway? (y/N): " -n 1 -r < /dev/tty
                echo
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    exit 1
                fi
            else
                print_error "Non-interactive mode: cannot continue with DNS issues"
                exit 1
            fi
        fi
    fi

    print_status "Starting installation process..."

    # Installation steps
    update_system
    install_nodejs
    install_postgresql
    install_redis
    install_mqtt_broker  # New: Optional MQTT broker installation
    create_app_user
    setup_application
    install_app_dependencies
    create_env_files     # Must be before setup_database so migrations can connect
    setup_database
    build_frontend
    install_pm2
    install_nginx

    if [[ "$DEVELOPMENT_MODE" != "true" ]]; then
        setup_ssl
    fi

    setup_firewall
    start_services
    create_setup_completion

    # Final success message
    echo
    print_success "🎉 ESP8266 IoT Platform installation completed successfully!"
    echo

    if [[ "$DEVELOPMENT_MODE" == "true" ]]; then
        SERVER_IP=$(hostname -I | awk '{print $1}')
        echo -e "${GREEN}✓ Access your platform at: ${CYAN}http://$SERVER_IP${NC}"
        echo -e "${YELLOW}⚠ Development mode: HTTP only (no SSL)${NC}"
    else
        echo -e "${GREEN}✓ Access your platform at: ${CYAN}https://$DOMAIN${NC}"
        echo -e "${GREEN}✓ SSL certificates configured and auto-renewing${NC}"
    fi

    # Display MQTT credentials if enabled
    if [[ "$MQTT_ENABLED" == "true" ]]; then
        echo
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${YELLOW}📡 MQTT Broker Credentials (SAVE THESE!)${NC}"
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "  Username: ${GREEN}$MQTT_USERNAME${NC}"
        echo -e "  Password: ${GREEN}$MQTT_PASSWORD${NC}"
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    fi

    echo
    echo -e "${BLUE}📋 Installation details saved to: $APP_DIR/INSTALLATION_INFO.md${NC}"
    echo -e "${BLUE}📊 Check service status: ${CYAN}sudo -u esp8266app pm2 status${NC}"
    echo -e "${BLUE}📝 View logs: ${CYAN}sudo -u esp8266app pm2 logs${NC}"
    echo
    echo -e "${PURPLE}🚀 Your IoT platform is ready! Register the first admin user via the web interface.${NC}"
    echo
}

# Handle script termination
trap 'print_error "Installation interrupted. Run the installer again to clean up or continue."; exit 1' INT TERM

# Run main installation
main "$@"