#!/bin/bash

###############################################################################
# Sensity IoT Platform - Ubuntu Server Installation Script
#
# This script will install and configure the complete Sensity IoT monitoring
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
# - Arduino CLI for web-based ESP8266 firmware compilation
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
INSTALL_MQTT=""
INSTANCE_NAME="default"
BACKEND_PORT="3000"
APP_USER="sensityapp"
APP_DIR="/opt/sensity-platform"
DB_NAME="sensity_platform"
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
║                 SENSITY IOT PLATFORM INSTALLER              ║
╚══════════════════════════════════════════════════════════════╝${NC}"
}

# Function to display progress bar
show_progress() {
    local current=$1
    local total=$2
    local width=50
    local percentage=$((current * 100 / total))
    local completed=$((current * width / total))

    # Build progress bar
    local bar=""
    for ((i=0; i<completed; i++)); do
        bar="${bar}█"
    done
    for ((i=completed; i<width; i++)); do
        bar="${bar}░"
    done

    # Print progress bar
    echo -ne "\r${BLUE}[PROGRESS]${NC} ${bar} ${percentage}% (${current}/${total})"
}

# Function to print status with progress
print_status_progress() {
    local message=$1
    local current=$2
    local total=$3

    # Show progress bar first
    show_progress "$current" "$total"

    # Then show the message on a new line
    echo -e "\n${BLUE}[INFO]${NC} $message"
}

# Function to run database migrations
run_database_migrations() {
    local migration_script="$APP_DIR/scripts/run-migrations.sh"

    if [[ ! -x "$migration_script" ]]; then
        print_error "Migration runner not found at $migration_script"
        print_error "Ensure the application repository contains scripts/run-migrations.sh"
        exit 1
    fi

    # Run migrations quietly
    if APP_DIR="$APP_DIR" \
       APP_USER="$APP_USER" \
       DB_NAME="$DB_NAME" \
       "$migration_script" >/dev/null 2>&1; then
        print_success "Database migrations completed"
    else
        print_error "Database migrations failed"
        exit 1
    fi
}

# Function to validate installation requirements
validate_installation() {
    print_status "Running pre-installation validation..."

    local validation_failed=0

    # Check required ports
    print_status "Checking required ports..."
    local required_ports=(80 443 3000 1883 9001)
    local ports_in_use=()
    local conflicting_ports=()

    for port in "${required_ports[@]}"; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            ports_in_use+=($port)
            # Check if it's our own service
            local service_name=$(lsof -Pi :$port -sTCP:LISTEN | tail -n 1 | awk '{print $1}')
            if [[ "$service_name" != "nginx" && "$service_name" != "mosquitto" && "$service_name" != "node" ]]; then
                conflicting_ports+=($port)
                print_warning "Port $port is in use by: $service_name"
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

    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║              SENSITY PLATFORM INSTALLATION                  ║"
    echo "║         All Configuration Questions (No Interruptions)      ║"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo

    # Question 1: Check for existing installation
    print_status "Checking for existing Sensity installations..."
    EXISTING_INSTANCES=()
    if [[ -d "/opt/sensity-platform" ]]; then
        EXISTING_INSTANCES+=("default:/opt/sensity-platform:3000")
    fi
    # Check for numbered instances
    for dir in /opt/sensity-platform-*; do
        if [[ -d "$dir" ]]; then
            instance_name=$(basename "$dir" | sed 's/sensity-platform-//')
            # Try to detect port from PM2 or ecosystem config
            port=$(grep -r "PORT.*:" "$dir/ecosystem.config.js" 2>/dev/null | grep -oP '\d{4,5}' | head -1 || echo "unknown")
            EXISTING_INSTANCES+=("$instance_name:$dir:$port")
        fi
    done

    if [[ ${#EXISTING_INSTANCES[@]} -gt 0 ]]; then
        print_warning "Found existing Sensity installation(s):"
        for instance in "${EXISTING_INSTANCES[@]}"; do
            IFS=':' read -r name dir port <<< "$instance"
            echo "  • Instance: $name (Directory: $dir, Port: $port)"
        done
        echo
        echo "You can install multiple instances on this server."
        echo "Each instance needs a unique:"
        echo "  • Instance name"
        echo "  • Port number"
        echo "  • Database name"
        echo "  • Directory"
        echo
    fi

    # Question 2: Instance name (for multiple installations)
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_status "QUESTION 1/8: Instance Configuration"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    if [[ ${#EXISTING_INSTANCES[@]} -gt 0 ]]; then
        echo "For multiple installations, give each a unique name (e.g., 'production', 'staging', 'dev1')"
        echo "Leave empty for 'default' (will use /opt/sensity-platform, port 3000)"
    fi
    read -p "Instance name [default]: " INSTANCE_NAME_INPUT < /dev/tty
    if [[ -z "$INSTANCE_NAME_INPUT" ]]; then
        INSTANCE_NAME="default"
    else
        # Sanitize instance name
        INSTANCE_NAME=$(echo "$INSTANCE_NAME_INPUT" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]//g')
    fi

    # Set directory and database name based on instance
    if [[ "$INSTANCE_NAME" == "default" ]]; then
        APP_DIR="/opt/sensity-platform"
        DB_NAME="sensity_platform"
        APP_USER="sensityapp"
        BACKEND_PORT="3000"
    else
        APP_DIR="/opt/sensity-platform-${INSTANCE_NAME}"
        DB_NAME="sensity_${INSTANCE_NAME}"
        APP_USER="sensity_${INSTANCE_NAME}"
        BACKEND_PORT=""  # Will be set later
    fi

    print_success "Instance: $INSTANCE_NAME"
    print_status "  • Directory: $APP_DIR"
    print_status "  • Database: $DB_NAME"
    print_status "  • User: $APP_USER"
    echo

    # Question 3: Backend port (for multiple installations)
    if [[ "$INSTANCE_NAME" != "default" ]]; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        print_status "QUESTION 2/8: Backend Port"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "Choose a unique port for this instance's backend (default: 3000)"
        echo "Used ports: 3000 (if default exists)"
        while [[ -z "$BACKEND_PORT" ]]; do
            read -p "Backend port [3001]: " PORT_INPUT < /dev/tty
            if [[ -z "$PORT_INPUT" ]]; then
                BACKEND_PORT="3001"
            elif [[ "$PORT_INPUT" =~ ^[0-9]{4,5}$ ]] && [[ "$PORT_INPUT" -ge 3000 ]] && [[ "$PORT_INPUT" -le 65535 ]]; then
                BACKEND_PORT="$PORT_INPUT"
            else
                print_error "Port must be between 3000 and 65535"
            fi
        done
        print_success "Backend port: $BACKEND_PORT"
        echo
    fi

    # Question 4: Installation type
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_status "QUESTION 3/8: Installation Type"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "1) Production (with domain name and SSL certificates)"
    echo "2) Development (no SSL, access via IP address only)"
    echo

    while [[ -z "$DEVELOPMENT_MODE" ]]; do
        read -p "Select installation type (1 or 2): " INSTALL_TYPE < /dev/tty
        case $INSTALL_TYPE in
            1)
                DEVELOPMENT_MODE="false"
                print_success "Selected: Production installation with SSL"
                ;;
            2)
                DEVELOPMENT_MODE="true"
                print_success "Selected: Development installation without SSL"
                ;;
            *)
                print_error "Please enter 1 or 2"
                ;;
        esac
    done

    echo

    # Question 5: Domain and email (production only)
    if [[ "$DEVELOPMENT_MODE" == "false" ]]; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        print_status "QUESTION 4/8: Domain Configuration"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "Each production instance needs its own domain for SSL certificates."
        echo
        if [[ ${#EXISTING_INSTANCES[@]} -gt 0 ]]; then
            print_status "Multi-Production Setup Example:"
            echo "  • Client A: client-a.sensity.app (instance: client-a)"
            echo "  • Client B: client-b.sensity.app (instance: client-b)"
            echo "  • Staging:  staging.sensity.app  (instance: staging)"
            echo
        fi
        echo "Make sure DNS for this domain points to this server's IP before continuing!"
        while [[ -z "$DOMAIN" ]]; do
            read -p "Enter domain for instance '$INSTANCE_NAME' (e.g., iot.example.com): " DOMAIN < /dev/tty
            if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
                print_error "Invalid domain name format"
                DOMAIN=""
            fi
        done
        print_success "Domain: $DOMAIN"
        echo

        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        print_status "QUESTION 5/8: Email for SSL Certificates"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        while [[ -z "$EMAIL" ]]; do
            read -p "Enter your email for Let's Encrypt SSL: " EMAIL < /dev/tty
            if [[ ! "$EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
                print_error "Invalid email format"
                EMAIL=""
            fi
        done
        print_success "Email: $EMAIL"
        echo
    else
        print_status "Development mode: Skipping domain and email configuration"
        DOMAIN="localhost"
        EMAIL="dev@localhost"
    fi

    # Question 6: Database password
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_status "QUESTION 6/8: Database Password"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Press Enter for auto-generated secure password, or type your own (min 8 chars)"
    while [[ -z "$DB_PASSWORD" ]]; do
        read -s -p "Database password: " DB_PASSWORD_INPUT < /dev/tty
        echo

        if [[ -z "$DB_PASSWORD_INPUT" ]]; then
            # Auto-generate secure password
            DB_PASSWORD=$(openssl rand -base64 24 | tr -d '\n')
            print_success "Auto-generated database password: $DB_PASSWORD"
        else
            if [[ ${#DB_PASSWORD_INPUT} -lt 8 ]]; then
                print_error "Password must be at least 8 characters long"
            else
                DB_PASSWORD="$DB_PASSWORD_INPUT"
                print_success "Database password set"
            fi
        fi
    done
    echo

    # Question 7: MQTT installation
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_status "QUESTION 7/8: MQTT Broker"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "MQTT is optional. Benefits:"
    echo "  • 95% less bandwidth than HTTP"
    echo "  • Better for battery-powered devices"
    echo "  • Real-time bidirectional communication"
    echo
    echo "Devices can use HTTP if you skip MQTT."
    read -p "Install Mosquitto MQTT broker? (y/N): " -n 1 -r < /dev/tty
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        INSTALL_MQTT="true"
        print_success "MQTT will be installed"
        echo

        # Question 8: MQTT credentials
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        print_status "QUESTION 8/8: MQTT Credentials"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        read -p "MQTT username [iot]: " MQTT_USERNAME < /dev/tty
        if [[ -z "$MQTT_USERNAME" ]]; then
            MQTT_USERNAME="iot"
        fi
        print_success "MQTT username: $MQTT_USERNAME"

        while [[ -z "$MQTT_PASSWORD" ]]; do
            read -s -p "MQTT password (or press Enter for auto-generated): " MQTT_PASSWORD_INPUT < /dev/tty
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
                    print_success "MQTT password set"
                fi
            fi
        done
    else
        INSTALL_MQTT="false"
        print_status "MQTT broker will NOT be installed (devices will use HTTP)"
        MQTT_USERNAME="iot"
        MQTT_PASSWORD=""
    fi

    # Generate JWT secret
    JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')

    echo
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║           CONFIGURATION SUMMARY                             ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo
    print_status "Instance: $INSTANCE_NAME"
    print_status "  • Directory: $APP_DIR"
    print_status "  • Database: $DB_NAME"
    print_status "  • User: $APP_USER"
    print_status "  • Backend Port: $BACKEND_PORT"
    print_status "  • Mode: $([ "$DEVELOPMENT_MODE" == "true" ] && echo "Development (HTTP)" || echo "Production (HTTPS)")"
    if [[ "$DEVELOPMENT_MODE" == "false" ]]; then
        print_status "  • Domain: $DOMAIN"
        print_status "  • Email: $EMAIL"
    fi
    print_status "  • MQTT: $([ "$INSTALL_MQTT" == "true" ] && echo "Yes (user: $MQTT_USERNAME)" || echo "No")"
    echo
    print_warning "Installation will now run without interruption!"
    echo
    read -p "Press Enter to begin installation or Ctrl+C to cancel..." < /dev/tty
    echo
    print_success "Starting uninterrupted installation..."
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

# Function to install Arduino CLI for firmware compilation
install_arduino_cli() {
    print_status "Installing Arduino CLI for firmware compilation..."

    # Detect architecture
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)
            ARDUINO_ARCH="Linux_64bit"
            ;;
        aarch64|arm64)
            ARDUINO_ARCH="Linux_ARM64"
            ;;
        armv7l)
            ARDUINO_ARCH="Linux_ARMv7"
            ;;
        *)
            print_warning "Unsupported architecture: $ARCH"
            print_warning "Skipping Arduino CLI installation"
            return 0
            ;;
    esac

    # Download and install Arduino CLI
    ARDUINO_CLI_VERSION="1.3.1"
    ARDUINO_CLI_URL="https://github.com/arduino/arduino-cli/releases/download/v${ARDUINO_CLI_VERSION}/arduino-cli_${ARDUINO_CLI_VERSION}_${ARDUINO_ARCH}.tar.gz"

    print_status "Downloading Arduino CLI ${ARDUINO_CLI_VERSION} for ${ARDUINO_ARCH}..."
    wget -q "$ARDUINO_CLI_URL" -O /tmp/arduino-cli.tar.gz

    # Extract and install
    tar -xzf /tmp/arduino-cli.tar.gz -C /tmp/
    mv /tmp/arduino-cli /usr/local/bin/
    chmod +x /usr/local/bin/arduino-cli
    rm /tmp/arduino-cli.tar.gz

    # Verify installation
    if command -v arduino-cli &> /dev/null; then
        ARDUINO_VER=$(arduino-cli version 2>&1 | head -n1)
        print_success "Arduino CLI installed: $ARDUINO_VER"
    else
        print_error "Arduino CLI installation failed"
        return 1
    fi

    # Initialize Arduino CLI configuration
    print_status "Configuring Arduino CLI..."
    sudo -u "$APP_USER" arduino-cli config init --overwrite 2>/dev/null || arduino-cli config init --overwrite

    # Add ESP8266 board manager URL
    print_status "Adding ESP8266 board support..."
    sudo -u "$APP_USER" arduino-cli config add board_manager.additional_urls http://arduino.esp8266.com/stable/package_esp8266com_index.json
    sudo -u "$APP_USER" arduino-cli core update-index

    # Install ESP8266 core
    print_status "Installing ESP8266 core (this may take a few minutes)..."
    sudo -u "$APP_USER" arduino-cli core install esp8266:esp8266

    # Install required libraries
    print_status "Installing Arduino libraries..."
    sudo -u "$APP_USER" arduino-cli lib install "ArduinoJson"
    sudo -u "$APP_USER" arduino-cli lib install "DHT sensor library"
    sudo -u "$APP_USER" arduino-cli lib install "Adafruit Unified Sensor"
    sudo -u "$APP_USER" arduino-cli lib install "Ultrasonic"

    print_success "Arduino CLI configured with ESP8266 support and required libraries"
}

# Function to install PostgreSQL
install_postgresql() {
    print_status "Installing PostgreSQL..."

    apt-get install -y postgresql postgresql-contrib

    # Start and enable PostgreSQL
    systemctl start postgresql
    systemctl enable postgresql

    # Clean up any existing database components to prevent conflicts
    print_status "Cleaning up any existing database components for instance '${INSTANCE_NAME}'..."
    # Terminate any active connections to the database
    sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || true
    # Drop database first (must come before user due to ownership)
    sudo -u postgres dropdb ${DB_NAME} 2>/dev/null || true
    # Drop user
    sudo -u postgres dropuser ${APP_USER} 2>/dev/null || true

    # Create database and user
    print_status "Creating database user '${APP_USER}'..."
    if ! sudo -u postgres psql -t -c '\du' 2>/dev/null | cut -d \| -f 1 | grep -qw ${APP_USER}; then
        sudo -u postgres psql -c "CREATE USER ${APP_USER} WITH PASSWORD '$DB_PASSWORD';"
        print_success "Database user '${APP_USER}' created"
    else
        print_status "Database user '${APP_USER}' already exists, updating password..."
        sudo -u postgres psql -c "ALTER USER ${APP_USER} PASSWORD '$DB_PASSWORD';"
    fi

    print_status "Creating database '${DB_NAME}'..."
    if ! sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw ${DB_NAME}; then
        sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${APP_USER};"
        print_success "Database '${DB_NAME}' created"
    else
        print_status "Database '${DB_NAME}' already exists, ensuring correct ownership..."
        sudo -u postgres psql -c "ALTER DATABASE ${DB_NAME} OWNER TO ${APP_USER};"
    fi

    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${APP_USER};"

    print_success "PostgreSQL configured for instance '${INSTANCE_NAME}'"
    print_status "  • Database: ${DB_NAME}"
    print_status "  • User: ${APP_USER}"
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
    # Check pre-collected user preference (no prompts!)
    if [[ "$INSTALL_MQTT" != "true" ]]; then
        print_status "Skipping MQTT broker installation (user chose HTTP-only mode)"
        MQTT_ENABLED="false"
        return 0
    fi

    print_status "Installing Mosquitto MQTT broker..."

    # Install mosquitto
    apt-get install -y mosquitto mosquitto-clients

    # Stop mosquitto service temporarily for configuration
    systemctl stop mosquitto 2>/dev/null || true

    # Create MQTT configuration directory
    mkdir -p /etc/mosquitto/conf.d

    # Create Sensity platform configuration
    cat > /etc/mosquitto/conf.d/sensity-platform.conf << 'EOF'
# Sensity Platform MQTT Configuration
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
    chmod 640 /etc/mosquitto/passwd
    chown mosquitto:mosquitto /etc/mosquitto/passwd

    # Add user credentials
    mosquitto_passwd -b /etc/mosquitto/passwd "$MQTT_USERNAME" "$MQTT_PASSWORD"

    # Ensure password file has correct ownership and permissions
    # mosquitto user needs to READ the password file
    chown mosquitto:mosquitto /etc/mosquitto/passwd
    chmod 640 /etc/mosquitto/passwd

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

    # Test configuration before starting
    print_status "Testing Mosquitto configuration..."
    if ! mosquitto -c /etc/mosquitto/mosquitto.conf -t 2>&1 | grep -q "Error"; then
        print_success "Mosquitto configuration test passed"
    else
        print_warning "Mosquitto configuration test showed warnings (this may be normal)"
    fi

    # Enable and start mosquitto service
    systemctl enable mosquitto
    systemctl restart mosquitto

    # Wait a moment for service to start
    sleep 3

    # Verify mosquitto is running
    if systemctl is-active --quiet mosquitto; then
        MQTT_ENABLED="true"
        MQTT_BROKER_URL="mqtt://localhost:1883"

        print_success "Mosquitto MQTT broker installed and running"
        print_success "MQTT credentials: $MQTT_USERNAME / $MQTT_PASSWORD"
        print_status "To add more users: sudo mosquitto_passwd /etc/mosquitto/passwd <username>"
        print_status "To change password: sudo mosquitto_passwd -b /etc/mosquitto/passwd $MQTT_USERNAME <new_password>"
    else
        print_error "Mosquitto failed to start"
        print_error "Checking logs..."
        journalctl -xeu mosquitto.service -n 20 --no-pager
        print_error "Configuration file:"
        cat /etc/mosquitto/conf.d/sensity-platform.conf
        print_error "Password file permissions:"
        ls -la /etc/mosquitto/passwd
        print_status "You can skip MQTT and continue with HTTP-only device communication"
        print_status "To fix MQTT later, check: journalctl -u mosquitto"
        MQTT_ENABLED="false"
        
        # Don't fail the entire installation, just disable MQTT
        print_warning "Continuing installation without MQTT support"
        return 0
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
    # Create schema quietly
    if [[ -f "$APP_DIR/database/schema.sql" ]]; then
        if sudo -u postgres psql -d ${DB_NAME} -f "$APP_DIR/database/schema.sql" >/dev/null 2>&1; then
            print_success "Database schema created"
        else
            print_error "Database schema creation failed"
            exit 1
        fi
    else
        print_warning "Database schema file not found"
    fi

    # Fix database permissions quietly
    fix_database_permissions >/dev/null 2>&1 && print_success "Database permissions configured" || print_error "Database permissions failed"

    # Run database migrations (already quiet)
    run_database_migrations
    
    # Ensure no default users exist quietly
    ensure_no_default_users >/dev/null 2>&1 && print_success "User setup prepared" || print_error "User setup failed"
}

# Function to run database migrations
run_database_migrations() {
    print_status "Running database migrations..."

    # Temporarily disable errexit so we can handle errors manually
    local errexit_was_set=0
    if [[ $- == *e* ]]; then
        errexit_was_set=1
        set +e
    fi

    # Create migrations tracking table
    print_status "Creating migrations tracking table..."
    sudo -u postgres psql -d ${DB_NAME} << 'EOF'
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) UNIQUE NOT NULL,
    migration_type VARCHAR(10) NOT NULL, -- 'sql' or 'js'
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
EOF
    local tracking_exit=$?
    if [[ $tracking_exit -ne 0 ]]; then
        print_error "Failed to create migrations tracking table (exit code: $tracking_exit)"
    fi

    local migrations_run=0
    local migrations_failed=0
    local migrations_skipped=0

    # ============================================================
    # PART 1: Run SQL migrations from database/migrations/
    # ============================================================
    print_status "Checking SQL migrations in database/migrations/..."
    
    if [[ -d "$APP_DIR/database/migrations" ]]; then
        for sql_migration in "$APP_DIR/database/migrations"/*.sql; do
            if [[ -f "$sql_migration" ]]; then
                migration_name=$(basename "$sql_migration")
                
                # Check if already applied
                local already_applied=$(sudo -u postgres psql -d ${DB_NAME} -t -c \
                    "SELECT COUNT(*) FROM migrations WHERE migration_name = '$migration_name' AND migration_type = 'sql';" \
                    2>/dev/null | tr -d ' ')
                
                if [[ "$already_applied" == "0" ]]; then
                    print_status "Running SQL migration: $migration_name..."
                    
                    # Execute SQL migration (capture exit code, allow output)
                    sudo -u postgres psql -d ${DB_NAME} -f "$sql_migration"
                    local migration_exit_code=$?
                    
                    if [[ $migration_exit_code -eq 0 ]]; then
                        # Record migration
                        sudo -u postgres psql -d ${DB_NAME} -c \
                            "INSERT INTO migrations (migration_name, migration_type) VALUES ('$migration_name', 'sql');"
                        local record_exit=$?

                        if [[ $record_exit -eq 0 ]]; then
                            print_success "✓ SQL migration completed: $migration_name"
                            ((migrations_run++))
                        else
                            print_error "✗ SQL migration recorded but tracking insert failed: $migration_name (exit code: $record_exit)"
                            ((migrations_failed++))
                        fi
                    else
                        print_error "✗ SQL migration failed: $migration_name (exit code: $migration_exit_code)"
                        ((migrations_failed++))
                    fi
                else
                    print_status "⊙ SQL migration already applied: $migration_name"
                    ((migrations_skipped++))
                fi
            fi
        done
    else
        print_warning "SQL migrations directory not found: $APP_DIR/database/migrations"
    fi

    # ============================================================
    # PART 2: Run JavaScript migrations from backend/migrations/
    # ============================================================
    print_status "Checking JavaScript migrations in backend/migrations/..."
    
    cd "$APP_DIR/backend"

    if [[ -d "migrations" ]]; then
        for js_migration in migrations/*.js; do
            if [[ -f "$js_migration" ]]; then
                migration_name=$(basename "$js_migration")
                
                # Skip the migration runner itself
                if [[ "$migration_name" == "migrate.js" ]]; then
                    continue
                fi
                
                # Check if already applied
                local already_applied=$(sudo -u postgres psql -d ${DB_NAME} -t -c \
                    "SELECT COUNT(*) FROM migrations WHERE migration_name = '$migration_name' AND migration_type = 'js';" \
                    2>/dev/null | tr -d ' ')
                
                if [[ "$already_applied" == "0" ]]; then
                    print_status "Running JS migration: $migration_name..."
                    
                    # Execute JS migration (capture exit code, allow output)
                    sudo -u $APP_USER NODE_ENV=production node "$js_migration"
                    local migration_exit_code=$?
                    
                    if [[ $migration_exit_code -eq 0 ]]; then
                        # Record migration
                        sudo -u postgres psql -d ${DB_NAME} -c \
                            "INSERT INTO migrations (migration_name, migration_type) VALUES ('$migration_name', 'js');"
                        local record_exit=$?

                        if [[ $record_exit -eq 0 ]]; then
                            print_success "✓ JS migration completed: $migration_name"
                            ((migrations_run++))
                        else
                            print_error "✗ JS migration recorded but tracking insert failed: $migration_name (exit code: $record_exit)"
                            ((migrations_failed++))
                        fi
                    else
                        print_error "✗ JS migration failed: $migration_name (exit code: $migration_exit_code)"
                        ((migrations_failed++))
                    fi
                else
                    print_status "⊙ JS migration already applied: $migration_name"
                    ((migrations_skipped++))
                fi
            fi
        done
    else
        print_warning "JavaScript migrations directory not found: backend/migrations"
    fi

    cd - > /dev/null

    # ============================================================
    # Summary
    # ============================================================
    echo
    print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_status "Migration Summary:"
    print_success "  ✓ Executed:      $migrations_run"
    print_status  "  ⊙ Already done:  $migrations_skipped"
    if [[ $migrations_failed -gt 0 ]]; then
        print_error "  ✗ Failed:        $migrations_failed"
    fi
    print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    
    if [[ $migrations_failed -gt 0 ]]; then
        print_warning "Some migrations failed - check logs above for details"
        print_warning "You may need to run them manually later"
    else
        print_success "All database migrations completed successfully"
    fi

    # Restore errexit state
    if [[ $errexit_was_set -eq 1 ]]; then
        set -e
    fi
}

# Function to ensure no default users (security best practice)
ensure_no_default_users() {
    print_status "Ensuring no default users exist in database..."
    
    # Check if any users exist
    local user_count=$(sudo -u postgres psql -d ${DB_NAME} -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' ' || echo "0")
    
    if [[ "$user_count" -gt 0 ]]; then
        print_warning "Found $user_count user(s) in database - clearing for first-user setup..."
        
        # Delete all users to ensure clean first-user registration flow
        sudo -u postgres psql -d ${DB_NAME} -c "DELETE FROM users;" 2>/dev/null || true
        
        # Verify deletion
        local final_count=$(sudo -u postgres psql -d ${DB_NAME} -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' ' || echo "0")
        
        if [[ "$final_count" -eq 0 ]]; then
            print_success "Users table cleared - ready for first-user setup"
        else
            print_error "Failed to clear users table (still $final_count users)"
        fi
    else
        print_success "Users table is empty - ready for first-user setup"
    fi
    
    print_status "📝 IMPORTANT: No default users created for security"
    print_status "📝 After installation, visit your site to create first admin user"
}

# Function to fix database permissions
fix_database_permissions() {
    print_status "Configuring database permissions..."

    sudo -u postgres psql -d ${DB_NAME} << EOF
-- Grant all privileges on schema
GRANT ALL PRIVILEGES ON SCHEMA public TO ${APP_USER};

-- Grant all privileges on all existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${APP_USER};

-- Grant all privileges on all sequences (for auto-increment)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${APP_USER};

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO ${APP_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO ${APP_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO ${APP_USER};

-- Ensure ownership of all existing tables
DO \$\$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' OWNER TO ${APP_USER}';
    END LOOP;
END \$\$;

-- Ensure ownership of all existing sequences
DO \$\$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
    LOOP
        EXECUTE 'ALTER SEQUENCE ' || quote_ident(r.sequencename) || ' OWNER TO ${APP_USER}';
    END LOOP;
END \$\$;
EOF

    print_success "Database permissions configured"
}

# Function to create environment files
create_env_files() {
    print_status "Creating environment configuration..."

    # Note: PM2 ecosystem.config.js now contains all environment variables
    # The .env file is created as a backup but PM2 uses the ecosystem config

    # Determine log directory based on instance
    local LOG_DIR
    if [[ "$INSTANCE_NAME" == "default" ]]; then
        LOG_DIR="/var/log/sensity-platform"
    else
        LOG_DIR="/var/log/sensity-platform-${INSTANCE_NAME}"
    fi

    # Backend environment (backup - PM2 uses ecosystem.config.js)
    cat > "$APP_DIR/backend/.env" << EOF
# Instance Configuration
INSTANCE_NAME=${INSTANCE_NAME}

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${DB_NAME}
DB_USER=${APP_USER}
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
PORT=${BACKEND_PORT}
FRONTEND_URL=$([ "$DEVELOPMENT_MODE" == "true" ] && echo "http://localhost:${BACKEND_PORT}" || echo "https://$DOMAIN")

# Email Configuration (configure with your SMTP settings)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Sensity Platform <your-email@gmail.com>"

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
LOG_FILE=${LOG_DIR}/app.log

# SSL/TLS
USE_HTTPS=$([ "$DEVELOPMENT_MODE" == "true" ] && echo "false" || echo "true")
SSL_CERT_PATH=/etc/letsencrypt/live/$DOMAIN/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/$DOMAIN/privkey.pem

# MQTT Configuration
MQTT_ENABLED=${INSTALL_MQTT}
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=${MQTT_USERNAME}
MQTT_PASSWORD=${MQTT_PASSWORD}
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

    # Determine PM2 app name and log directory based on instance
    local PM2_APP_NAME
    local LOG_DIR
    
    if [[ "$INSTANCE_NAME" == "default" ]]; then
        PM2_APP_NAME="sensity-platform"
        LOG_DIR="/var/log/sensity-platform"
    else
        PM2_APP_NAME="sensity-platform-${INSTANCE_NAME}"
        LOG_DIR="/var/log/sensity-platform-${INSTANCE_NAME}"
    fi

    # Create PM2 ecosystem file with environment variables
    cat > "$APP_DIR/ecosystem.config.js" << EOF
module.exports = {
  apps: [{
    name: '${PM2_APP_NAME}',
    script: 'backend/server.js',
    cwd: '$APP_DIR',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: ${BACKEND_PORT},
      // Instance Configuration
      INSTANCE_NAME: '${INSTANCE_NAME}',
      // Database Configuration
      DB_HOST: 'localhost',
      DB_PORT: 5432,
      DB_NAME: '${DB_NAME}',
      DB_USER: '${APP_USER}',
      DB_PASSWORD: '$DB_PASSWORD',
      // Redis Configuration
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      REDIS_PASSWORD: '',
      // JWT Configuration
      JWT_SECRET: '$JWT_SECRET',
      JWT_EXPIRES_IN: '7d',
      // MQTT Configuration
      MQTT_ENABLED: '${INSTALL_MQTT}',
      MQTT_HOST: 'localhost',
      MQTT_PORT: 1883,
      MQTT_USERNAME: '${MQTT_USERNAME}',
      MQTT_PASSWORD: '${MQTT_PASSWORD}',
      // Telegram Configuration (optional)
      TELEGRAM_BOT_TOKEN: '',
      // Additional Configuration
      FRONTEND_URL: '$([ "$DEVELOPMENT_MODE" == "true" ] && echo "http://localhost:${BACKEND_PORT}" || echo "https://$DOMAIN")',
      MAX_FILE_SIZE: '50mb',
      LOG_LEVEL: 'info'
    },
    error_file: '${LOG_DIR}/pm2-error.log',
    out_file: '${LOG_DIR}/pm2-out.log',
    log_file: '${LOG_DIR}/pm2-combined.log',
    time: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '1G'
  }]
};
EOF

    chown "$APP_USER:$APP_USER" "$APP_DIR/ecosystem.config.js"

    # Create log directory (instance-specific)
    mkdir -p "${LOG_DIR}"
    chown "$APP_USER:$APP_USER" "${LOG_DIR}"

    # Setup PM2 startup script (run as root to configure systemd)
    sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" --silent

    print_success "PM2 installed and configured for instance '${INSTANCE_NAME}'"
    print_status "  • Process name: ${PM2_APP_NAME}"
    print_status "  • Logs: ${LOG_DIR}/"
    print_status "  • Port: ${BACKEND_PORT}"
}

# Function to install and configure Nginx
install_nginx() {
    print_status "Installing and configuring Nginx..."

    apt-get install -y nginx

    # Determine Nginx config file name based on instance
    local NGINX_CONFIG_NAME
    if [[ "$INSTANCE_NAME" == "default" ]]; then
        NGINX_CONFIG_NAME="sensity-platform"
    else
        NGINX_CONFIG_NAME="sensity-platform-${INSTANCE_NAME}"
    fi

    if [[ "$DEVELOPMENT_MODE" == "true" ]]; then
        # Get server IP for development mode
        local SERVER_IP=$(hostname -I | awk '{print $1}')
        
        # Check if this is the first (default) installation for default_server directive
        local IS_DEFAULT_SERVER=""
        if [[ "$INSTANCE_NAME" == "default" ]] && [[ ! -f "/etc/nginx/sites-enabled/sensity-platform" ]]; then
            IS_DEFAULT_SERVER=" default_server"
        fi
        
        # Development configuration (HTTP only, no SSL)
        cat > "/etc/nginx/sites-available/${NGINX_CONFIG_NAME}" << EOF
# Development HTTP server (no SSL) - Instance: ${INSTANCE_NAME}
# Access at: http://${SERVER_IP}:${BACKEND_PORT}
server {
    listen 80${IS_DEFAULT_SERVER};
    listen [::]:80${IS_DEFAULT_SERVER};

    # For development, we don't use domain name
    # Access directly via IP:PORT or use proxy_pass from another nginx
    server_name ${SERVER_IP} localhost;

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
        proxy_pass http://localhost:$BACKEND_PORT;
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
        proxy_pass http://localhost:$BACKEND_PORT;
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
        ln -sf "/etc/nginx/sites-available/${NGINX_CONFIG_NAME}" "/etc/nginx/sites-enabled/"
        print_status "Development mode: HTTP-only configuration created"
        print_status "  • Config: /etc/nginx/sites-available/${NGINX_CONFIG_NAME}"
        print_status "  • Access: http://${SERVER_IP}:${BACKEND_PORT} (via proxy)"

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
        proxy_pass http://localhost:$BACKEND_PORT;
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
        proxy_pass http://localhost:$BACKEND_PORT;
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
        print_status "Temporary HTTP configuration created for domain: $DOMAIN"
        print_status "  • Config: /etc/nginx/sites-available/$DOMAIN"
    fi

    # Remove default nginx site (only if it exists and only on first install)
    if [[ -f "/etc/nginx/sites-enabled/default" ]] && [[ "$INSTANCE_NAME" == "default" ]]; then
        rm -f /etc/nginx/sites-enabled/default
        print_status "Removed default Nginx site"
    fi

    # Test Nginx configuration
    if ! nginx -t; then
        print_error "Nginx configuration test failed"
        print_status "Checking Nginx error log..."
        tail -20 /var/log/nginx/error.log
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
        proxy_pass http://localhost:$BACKEND_PORT;
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
        proxy_pass http://localhost:$BACKEND_PORT;
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

    # Always allow port 80 (needed for Let's Encrypt HTTP-01 challenge)
    ufw allow 80/tcp comment 'HTTP'
    
    if [[ "$DEVELOPMENT_MODE" == "true" ]]; then
        print_status "Development mode: HTTP port 80 opened"
    else
        # Production mode needs both HTTP (for Let's Encrypt) and HTTPS
        ufw allow 443/tcp comment 'HTTPS'
        print_status "Production mode: HTTP (80) and HTTPS (443) ports opened"
    fi

    # Open MQTT port if MQTT is enabled
    if [[ "$MQTT_ENABLED" == "true" ]]; then
        ufw allow 1883/tcp comment 'MQTT'
        print_status "MQTT port 1883 opened in firewall"
    fi

    # Open backend port for this instance (useful for direct API access if needed)
    if [[ "$BACKEND_PORT" != "3000" ]]; then
        ufw allow ${BACKEND_PORT}/tcp comment "Backend API - ${INSTANCE_NAME}"
        print_status "Backend port ${BACKEND_PORT} opened for instance ${INSTANCE_NAME}"
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

    # Determine PM2 app name and log directory
    local PM2_APP_NAME
    local LOG_DIR
    if [[ "$INSTANCE_NAME" == "default" ]]; then
        PM2_APP_NAME="sensity-platform"
        LOG_DIR="/var/log/sensity-platform"
    else
        PM2_APP_NAME="sensity-platform-${INSTANCE_NAME}"
        LOG_DIR="/var/log/sensity-platform-${INSTANCE_NAME}"
    fi

    cat > "$APP_DIR/INSTALLATION_INFO.md" << EOF
# Sensity Platform - Installation Complete

## Instance Information
- **Instance Name**: ${INSTANCE_NAME}
- **Access URL**: $ACCESS_URL
- **Installation Mode**: $([ "$DEVELOPMENT_MODE" == "true" ] && echo "Development (HTTP)" || echo "Production (HTTPS)")
- **Installation Date**: $(date)
- **Application Directory**: $APP_DIR
- **Application User**: $APP_USER

## Service Status
- **Backend**: PM2 managed Node.js application on port ${BACKEND_PORT}
- **Frontend**: Static files served by Nginx
- **Database**: PostgreSQL (${DB_NAME} on localhost:5432)
- **Cache**: Redis on localhost:6379
- **MQTT**: $([ "$INSTALL_MQTT" == "true" ] && echo "Mosquitto broker on port 1883" || echo "Not installed")
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
sudo -u $APP_USER pm2 logs ${PM2_APP_NAME}

# Restart application
sudo -u $APP_USER pm2 restart ${PM2_APP_NAME}

# Check PM2 status
sudo -u $APP_USER pm2 status

# View instance-specific logs
tail -f ${LOG_DIR}/pm2-combined.log
tail -f ${LOG_DIR}/pm2-error.log

# Check service status
systemctl status nginx
systemctl status postgresql
systemctl status redis-server
$([ "$INSTALL_MQTT" == "true" ] && echo "systemctl status mosquitto")

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
\`\`\`

## Database Access
\`\`\`bash
# Connect to database
sudo -u $APP_USER psql -d ${DB_NAME}

# Backup database
sudo -u $APP_USER pg_dump ${DB_NAME} > backup-${INSTANCE_NAME}-\$(date +%Y%m%d).sql

# Restore database
sudo -u $APP_USER psql -d ${DB_NAME} < backup-${INSTANCE_NAME}-*.sql
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

${CYAN}Your Sensity IoT Platform is now installed and running!${NC}
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

${GREEN}Happy monitoring with your Sensity devices! 🚀${NC}
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
    if sudo -u "$APP_USER" pm2 list 2>/dev/null | grep -q "sensity"; then
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
    if sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
        print_status "Removing database (${DB_NAME})..."
        # Terminate any active connections to the database
        sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || true
        # Drop the database
        sudo -u postgres dropdb "${DB_NAME}" 2>/dev/null || true
        print_status "Database removed"
    fi

    if sudo -u postgres psql -t -c '\du' 2>/dev/null | cut -d \| -f 1 | grep -qw "${APP_USER}"; then
        print_status "Removing database user (${APP_USER})..."
        sudo -u postgres dropuser "${APP_USER}" 2>/dev/null || true
        print_status "Database user removed"
    fi

    # Remove nginx configuration
    rm -f "/etc/nginx/sites-enabled/$DOMAIN" 2>/dev/null || true
    rm -f "/etc/nginx/sites-available/$DOMAIN" 2>/dev/null || true
    # Also cleanup old esp8266-platform configs if they exist
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

    # Determine PM2 app name
    local PM2_APP_NAME
    if [[ "$INSTANCE_NAME" == "default" ]]; then
        PM2_APP_NAME="sensity-platform"
    else
        PM2_APP_NAME="sensity-platform-${INSTANCE_NAME}"
    fi

    # Check for existing application directory
    if [[ -d "$APP_DIR" ]]; then
        found_components+=("Application directory ($APP_DIR)")
    fi

    # Check for existing user
    if id "$APP_USER" &>/dev/null; then
        found_components+=("Application user ($APP_USER)")
    fi

    # Check for database
    if sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
        found_components+=("Database (${DB_NAME})")
    fi

    # Check for database user
    if sudo -u postgres psql -t -c '\du' 2>/dev/null | cut -d \| -f 1 | grep -qw "${APP_USER}"; then
        found_components+=("Database user (${APP_USER})")
    fi

    # Check for nginx config
    if [[ -f "/etc/nginx/sites-available/$DOMAIN" ]] || [[ -f "/etc/nginx/sites-available/sensity-platform" ]]; then
        found_components+=("Nginx configuration")
    fi

    # Check for PM2 processes
    if sudo -u "$APP_USER" pm2 list 2>/dev/null | grep -q "${PM2_APP_NAME}" 2>/dev/null; then
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
                        echo "  sudo -u postgres dropdb ${DB_NAME}"
                        echo "  sudo -u postgres dropuser ${APP_USER}"
                        echo "  sudo rm -f /etc/nginx/sites-*/*sensity* /etc/nginx/sites-*/*$DOMAIN*"
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
    check_root
    detect_ubuntu

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
    echo

    # Installation steps
    print_status_progress "📦 [1/16] Updating system packages..." 1 16
    update_system
    
    print_status_progress "📦 [2/16] Installing Node.js..." 2 16
    install_nodejs
    
    print_status_progress "📦 [3/16] Installing PostgreSQL..." 3 16
    install_postgresql
    
    print_status_progress "📦 [4/16] Installing Redis..." 4 16
    install_redis
    
    print_status_progress "📦 [5/16] Configuring MQTT broker..." 5 16
    install_mqtt_broker
    
    print_status_progress "📦 [6/16] Creating application user..." 6 16
    create_app_user
    
    print_status_progress "📦 [7/16] Installing Arduino CLI..." 7 16
    install_arduino_cli
    
    print_status_progress "📦 [8/16] Setting up application files..." 8 16
    setup_application
    
    print_status_progress "📦 [9/16] Installing dependencies..." 9 16
    install_app_dependencies
    
    print_status_progress "📦 [10/16] Creating environment files..." 10 16
    create_env_files
    
    print_status_progress "📦 [11/16] Setting up database (schema, migrations, permissions)..." 11 16
    setup_database
    
    print_status_progress "📦 [12/16] Building frontend..." 12 16
    build_frontend
    
    print_status_progress "📦 [13/16] Installing PM2 process manager..." 13 16
    install_pm2
    
    print_status_progress "📦 [14/16] Configuring Nginx..." 14 16
    install_nginx
    
    print_status_progress "📦 [15/16] Configuring firewall..." 15 16
    setup_firewall

    if [[ "$DEVELOPMENT_MODE" != "true" ]]; then
        print_status_progress "📦 [16/16] Setting up SSL certificates..." 16 16
        setup_ssl
    else
        print_status_progress "📦 [16/16] Skipping SSL (development mode)..." 16 16
    fi

    echo
    print_status "🚀 Starting services..."
    start_services
    
    print_status "📝 Creating installation info..."
    create_setup_completion

    # Show 100% completion
    show_progress 16 16
    echo -e "\n"

    # Determine PM2 app name and log directory for final message
    local PM2_APP_NAME
    local LOG_DIR
    if [[ "$INSTANCE_NAME" == "default" ]]; then
        PM2_APP_NAME="sensity-platform"
        LOG_DIR="/var/log/sensity-platform"
    else
        PM2_APP_NAME="sensity-platform-${INSTANCE_NAME}"
        LOG_DIR="/var/log/sensity-platform-${INSTANCE_NAME}"
    fi

    # Final success message
    echo
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║           INSTALLATION COMPLETED SUCCESSFULLY!               ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo
    print_success "🎉 Sensity Platform (instance: ${INSTANCE_NAME}) is ready!"
    echo

    # Instance information
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}📦 Instance Details${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  Instance:  ${GREEN}${INSTANCE_NAME}${NC}"
    echo -e "  Directory: ${GREEN}${APP_DIR}${NC}"
    echo -e "  User:      ${GREEN}${APP_USER}${NC}"
    echo -e "  Database:  ${GREEN}${DB_NAME}${NC}"
    echo -e "  Port:      ${GREEN}${BACKEND_PORT}${NC}"
    echo -e "  PM2 App:   ${GREEN}${PM2_APP_NAME}${NC}"
    echo -e "  Logs:      ${GREEN}${LOG_DIR}/${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo

    # Access information
    if [[ "$DEVELOPMENT_MODE" == "true" ]]; then
        SERVER_IP=$(hostname -I | awk '{print $1}')
        echo -e "${GREEN}✓ Access your platform at: ${CYAN}http://$SERVER_IP:${BACKEND_PORT}${NC}"
        echo -e "${YELLOW}⚠ Development mode: HTTP only (no SSL)${NC}"
    else
        echo -e "${GREEN}✓ Access your platform at: ${CYAN}https://$DOMAIN${NC}"
        echo -e "${GREEN}✓ SSL certificates configured and auto-renewing${NC}"
    fi

    # Display MQTT credentials if enabled
    if [[ "$INSTALL_MQTT" == "true" ]]; then
        echo
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${YELLOW}📡 MQTT Broker Credentials (SAVE THESE!)${NC}"
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "  Host:     ${GREEN}localhost:1883${NC}"
        echo -e "  Username: ${GREEN}$MQTT_USERNAME${NC}"
        echo -e "  Password: ${GREEN}$MQTT_PASSWORD${NC}"
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    fi

    echo
    echo -e "${BLUE}📋 Installation details: ${CYAN}$APP_DIR/INSTALLATION_INFO.md${NC}"
    echo
    echo -e "${BLUE}📊 Management Commands:${NC}"
    echo -e "  Check status:  ${CYAN}sudo -u $APP_USER pm2 status${NC}"
    echo -e "  View logs:     ${CYAN}sudo -u $APP_USER pm2 logs ${PM2_APP_NAME}${NC}"
    echo -e "  Restart:       ${CYAN}sudo -u $APP_USER pm2 restart ${PM2_APP_NAME}${NC}"
    echo -e "  Update system: ${CYAN}sudo ./update-system.sh ${INSTANCE_NAME}${NC}"
    echo
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}⚠️  FIRST-TIME SETUP REQUIRED${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    if [[ "$DEVELOPMENT_MODE" == "true" ]]; then
        echo -e "  ${GREEN}1.${NC} Visit: ${CYAN}http://$SERVER_IP:${BACKEND_PORT}${NC}"
    else
        echo -e "  ${GREEN}1.${NC} Visit: ${CYAN}https://$DOMAIN${NC}"
    fi
    echo -e "  ${GREEN}2.${NC} Create your first admin user"
    echo -e "  ${GREEN}3.${NC} Start configuring your IoT platform"
    echo
    echo -e "${YELLOW}📝 NOTE: No default users exist for security reasons${NC}"
    echo -e "${YELLOW}📝 The system will guide you through creating the admin account${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
    echo -e "${PURPLE}🚀 Installation complete! Visit your site to get started.${NC}"
    echo
}

# Handle script termination
trap 'print_error "Installation interrupted. Run the installer again to clean up or continue."; exit 1' INT TERM

# Run main installation
main "$@"