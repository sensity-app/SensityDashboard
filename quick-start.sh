#!/bin/bash

###############################################################################
# ESP8266 IoT Management Platform - Quick Start Script
#
# This script provides easy deployment options for the ESP8266 platform
# Repository: https://github.com/martinkadlcek/ESP-Management-Platform
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}
╔═══════════════════════════════════════════════════════════════╗
║           ESP8266 IoT Management Platform - Quick Start      ║
║                                                               ║
║  Repository: github.com/martinkadlcek/ESP-Management-Platform║
╚═══════════════════════════════════════════════════════════════╝${NC}"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

show_menu() {
    clear
    print_header
    echo
    echo -e "${YELLOW}Choose your deployment option:${NC}"
    echo
    echo "1) 🚀 Ubuntu Server One-Click Install (Recommended)"
    echo "   - Installs everything automatically"
    echo "   - Sets up SSL certificates"
    echo "   - Configures firewall and security"
    echo "   - Ready for production use"
    echo
    echo "2) 🐳 Docker Deployment"
    echo "   - Uses Docker Compose"
    echo "   - Easy local development"
    echo "   - Isolated containers"
    echo
    echo "3) 📥 Download for Manual Installation"
    echo "   - Clone repository"
    echo "   - Follow manual setup guide"
    echo "   - Full control over installation"
    echo
    echo "4) ✅ Verify Existing Installation"
    echo "   - Check if platform is working"
    echo "   - Validate configuration"
    echo "   - Test all components"
    echo
    echo "5) 📚 View Documentation"
    echo "   - Open deployment guide"
    echo "   - Show supported sensors"
    echo "   - Display help information"
    echo
    echo "0) Exit"
    echo
    read -p "Enter your choice (0-5): " choice
}

ubuntu_install() {
    clear
    print_header
    echo
    print_info "Ubuntu Server One-Click Installation"
    echo
    print_warning "This will install the complete ESP8266 platform on your Ubuntu server."
    print_warning "You need sudo privileges and the following information:"
    echo "  • Domain name (e.g., iot.example.com)"
    echo "  • Email address for SSL certificates"
    echo "  • Database password"
    echo
    read -p "Continue? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Starting Ubuntu installation..."
        curl -sSL https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/install-ubuntu.sh | sudo bash
    else
        print_info "Installation cancelled"
    fi
}

docker_install() {
    clear
    print_header
    echo
    print_info "Docker Deployment"
    echo

    # Check if Docker is installed
    if ! command -v docker >/dev/null 2>&1; then
        print_error "Docker is not installed. Please install Docker first:"
        echo "  Ubuntu: curl -fsSL https://get.docker.com | sh"
        echo "  Other: https://docs.docker.com/get-docker/"
        return
    fi

    if ! command -v docker-compose >/dev/null 2>&1; then
        print_error "Docker Compose is not installed. Please install Docker Compose first:"
        echo "  https://docs.docker.com/compose/install/"
        return
    fi

    print_success "Docker and Docker Compose found"

    # Clone repository if not exists
    if [[ ! -d "ESP-Management-Platform" ]]; then
        print_info "Cloning repository..."
        git clone https://github.com/martinkadlcek/ESP-Management-Platform.git
        cd ESP-Management-Platform
    else
        print_info "Repository already exists, updating..."
        cd ESP-Management-Platform
        git pull origin main
    fi

    # Create .env file if not exists
    if [[ ! -f ".env" ]]; then
        print_info "Creating environment configuration..."
        cat > .env << 'EOF'
DB_PASSWORD=secure_password_123
JWT_SECRET=your_jwt_secret_key_here
DOMAIN=http://localhost:3000
WS_URL=ws://localhost:3000
EOF
        print_warning "Please edit .env file with your configuration"
    fi

    print_info "Starting services with Docker Compose..."
    docker-compose up -d

    print_success "Docker deployment completed!"
    echo
    echo "Access your platform at: http://localhost:3000"
    echo "To view logs: docker-compose logs -f"
    echo "To stop: docker-compose down"
}

manual_install() {
    clear
    print_header
    echo
    print_info "Manual Installation Setup"
    echo

    # Check if git is installed
    if ! command -v git >/dev/null 2>&1; then
        print_error "Git is not installed. Please install git first."
        return
    fi

    # Clone repository
    if [[ ! -d "ESP-Management-Platform" ]]; then
        print_info "Cloning repository..."
        git clone https://github.com/martinkadlcek/ESP-Management-Platform.git
        cd ESP-Management-Platform
    else
        print_info "Repository already exists, updating..."
        cd ESP-Management-Platform
        git pull origin main
    fi

    print_success "Repository ready for manual installation"
    echo
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "1. Read DEPLOYMENT.md for detailed instructions"
    echo "2. Install system dependencies (Node.js, PostgreSQL, Redis)"
    echo "3. Configure environment variables"
    echo "4. Build and start the application"
    echo
    echo -e "${BLUE}Quick commands:${NC}"
    echo "  cat DEPLOYMENT.md | less    # Read deployment guide"
    echo "  cd backend && npm install   # Install backend deps"
    echo "  cd frontend && npm install  # Install frontend deps"
}

verify_installation() {
    clear
    print_header
    echo
    print_info "Installation Verification"
    echo

    if [[ ! -f "verify-installation.sh" ]]; then
        if [[ -f "ESP-Management-Platform/verify-installation.sh" ]]; then
            cd ESP-Management-Platform
        else
            print_info "Downloading verification script..."
            curl -sSL https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/verify-installation.sh -o verify-installation.sh
            chmod +x verify-installation.sh
        fi
    fi

    read -p "Enter your domain (or localhost for local testing): " domain
    if [[ -z "$domain" ]]; then
        domain="localhost"
    fi

    print_info "Running verification for: $domain"
    ./verify-installation.sh "$domain"
}

view_documentation() {
    clear
    print_header
    echo
    print_info "Documentation and Resources"
    echo
    echo -e "${YELLOW}📚 Available Documentation:${NC}"
    echo
    echo "• Main Repository:"
    echo "  https://github.com/martinkadlcek/ESP-Management-Platform"
    echo
    echo "• Deployment Guide (DEPLOYMENT.md):"
    echo "  https://github.com/martinkadlcek/ESP-Management-Platform/blob/main/DEPLOYMENT.md"
    echo
    echo "• Firmware Builder Documentation:"
    echo "  https://github.com/martinkadlcek/ESP-Management-Platform/blob/main/FIRMWARE_BUILDER_README.md"
    echo
    echo "• Issue Tracker:"
    echo "  https://github.com/martinkadlcek/ESP-Management-Platform/issues"
    echo
    echo -e "${YELLOW}🔧 Supported Sensors:${NC}"
    echo "• DHT22 (Temperature/Humidity) - Pin D4"
    echo "• PIR Motion Sensor - Pin D2"
    echo "• HC-SR04 Distance - Pins D5/D6"
    echo "• Light Sensor (LDR) - Pin A0"
    echo "• Sound Level Sensor - Pin A0"
    echo "• Gas Sensor (MQ-2/135) - Pin A0"
    echo "• Reed Switch (Door/Window) - Pin D3"
    echo "• Vibration Sensor - Pin D7"
    echo
    echo -e "${YELLOW}🎯 Device Templates:${NC}"
    echo "• Kitchen Monitor (Temp, Humidity, Motion, Light)"
    echo "• Security Node (Motion, Distance, Door, Vibration)"
    echo "• Environmental Monitor (Climate, Air Quality)"
    echo "• Greenhouse Monitor (Plant Care, Irrigation)"
    echo "• Simple Temperature Monitor (Beginner-friendly)"
    echo "• Workshop Monitor (Noise, Vibration, Safety)"
    echo
    print_info "Press any key to return to main menu..."
    read -n 1
}

# Main loop
while true; do
    show_menu

    case $choice in
        1)
            ubuntu_install
            ;;
        2)
            docker_install
            ;;
        3)
            manual_install
            ;;
        4)
            verify_installation
            ;;
        5)
            view_documentation
            ;;
        0)
            echo
            print_success "Thank you for using ESP8266 IoT Management Platform!"
            print_info "Repository: https://github.com/martinkadlcek/ESP-Management-Platform"
            print_info "Star the repo if you find it useful! ⭐"
            exit 0
            ;;
        *)
            print_error "Invalid option. Please choose 0-5."
            sleep 2
            ;;
    esac

    if [[ $choice != 5 ]]; then
        echo
        print_info "Press any key to return to main menu..."
        read -n 1
    fi
done