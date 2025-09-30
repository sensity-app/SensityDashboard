# Installation Scripts Review & Updates Needed

## Analysis Date: 2025-09-30

## Summary

Both `install-ubuntu.sh` and `update-system.sh` are generally well-structured and functional, but need updates to reflect recent improvements to the platform, particularly the **MQTT support** added in this session.

---

## ✅ What's Good

### install-ubuntu.sh
- Comprehensive installation process
- Good error handling and user interaction
- Support for both development and production modes
- Proper database permissions setup
- SSL certificate automation
- Firewall configuration
- PM2 process management
- Cleanup functionality for failed installations

### update-system.sh
- Clean update process
- Backup creation before update
- Git pull and dependency updates
- Database reset utilities
- Test admin user creation

---

## ⚠️ What's Missing / Needs Update

### 1. **MQTT Support (NEW FEATURE)**

**Priority:** MEDIUM

Neither script mentions or configures MQTT, which was just added as a major feature.

**Needed Changes:**

#### install-ubuntu.sh:

Add MQTT broker installation option:

```bash
# Function to install MQTT broker (optional)
install_mqtt_broker() {
    print_status "Installing MQTT broker (Mosquitto)..."

    # Add mosquitto repository
    apt-add-repository -y ppa:mosquitto-dev/mosquitto-ppa
    apt-get update

    # Install mosquitto
    apt-get install -y mosquitto mosquitto-clients

    # Configure mosquitto
    cat > /etc/mosquitto/mosquitto.conf << EOF
# Mosquitto configuration for ESP8266 Platform
listener 1883
allow_anonymous false
password_file /etc/mosquitto/passwd

# Logging
log_dest file /var/log/mosquitto/mosquitto.log
log_type error
log_type warning
log_type notice
log_type information

# Security
max_connections -1
EOF

    # Create password file (can be updated later)
    mosquitto_passwd -c -b /etc/mosquitto/passwd esp8266 changeme

    # Start and enable mosquitto
    systemctl restart mosquitto
    systemctl enable mosquitto

    print_success "Mosquitto MQTT broker installed"
    print_warning "Default MQTT credentials: esp8266 / changeme"
    print_status "To add/update MQTT users: sudo mosquitto_passwd /etc/mosquitto/passwd <username>"
}
```

Update `.env` file creation to include MQTT variables:

```bash
# Add to create_env_files() function after line 596:

# MQTT Configuration (Optional)
MQTT_ENABLED=true
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=esp8266
MQTT_PASSWORD=changeme
MQTT_TOPIC_PREFIX=iot
MQTT_DEFAULT_QOS=1
```

Update firewall to allow MQTT port:

```bash
# Add to setup_firewall() function:
if [[ "$MQTT_ENABLED" == "true" ]]; then
    ufw allow 1883/tcp comment 'MQTT broker'
    print_status "MQTT port 1883 opened in firewall"
fi
```

#### update-system.sh:

Add check for MQTT package in dependencies:

```bash
# In update_system() after npm install:
print_status "Checking for MQTT broker..."
if systemctl is-active --quiet mosquitto; then
    print_status "Mosquitto MQTT broker is running"
else
    print_warning "MQTT broker not installed. Install with: sudo apt install mosquitto"
fi
```

---

### 2. **Environment Variable Updates**

**Priority:** MEDIUM

The `.env.example` file was updated with MQTT variables, but the installation script doesn't include them.

**Current .env creation is missing:**
```env
# MQTT Configuration (from .env.example)
MQTT_ENABLED=true
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_TOPIC_PREFIX=iot
MQTT_DEFAULT_QOS=1
```

**Fix:** Update `create_env_files()` function in install-ubuntu.sh

---

### 3. **Package Dependencies**

**Priority:** LOW

The `mqtt` npm package was added to backend dependencies. Installation script should handle this, but good to verify.

**Check:**
- ✅ Script runs `npm install --production` which will pick up new dependencies
- ✅ No code changes needed, but good to test

---

### 4. **Documentation References**

**Priority:** LOW

Installation scripts reference old documentation that doesn't mention:
- MQTT setup
- Error handling improvements
- OTA firmware customization

**Fix:** Update `INSTALLATION_INFO.md` template in install-ubuntu.sh to mention new features:

```markdown
## New Features in v2.1.0
- **MQTT Protocol Support**: Devices can now use MQTT for communication
- **Enhanced OTA**: Device-specific firmware customization
- **Improved Error Handling**: Better user experience and debugging
- **Centralized Logging**: Comprehensive error tracking

## MQTT Configuration (Optional)
If you want to use MQTT protocol:
1. Install Mosquitto: `sudo apt install mosquitto mosquitto-clients`
2. Configure MQTT in backend/.env (MQTT_ENABLED=true)
3. Update protocol settings for devices via web UI
4. See MQTT_SETUP.md for detailed instructions
```

---

### 5. **Version Number**

**Priority:** LOW

Scripts reference version 2.1.0 but the platform might need version bump.

**Current:**
```bash
REACT_APP_VERSION=2.1.0  # In frontend .env
```

**Recommendation:** Update to 2.2.0 to reflect new features:
- 2.1.0 → 2.2.0 (MQTT support, OTA enhancements, error handling)

---

### 6. **Missing Services Check**

**Priority:** LOW

Update script doesn't check if all required services are running.

**Add to update-system.sh:**

```bash
check_services() {
    print_status "Checking system services..."

    local failed=0

    # Check PostgreSQL
    if ! systemctl is-active --quiet postgresql; then
        print_error "PostgreSQL is not running"
        failed=1
    else
        print_success "PostgreSQL: running"
    fi

    # Check Redis
    if ! systemctl is-active --quiet redis-server; then
        print_warning "Redis is not running (optional but recommended)"
    else
        print_success "Redis: running"
    fi

    # Check Nginx
    if ! systemctl is-active --quiet nginx; then
        print_error "Nginx is not running"
        failed=1
    else
        print_success "Nginx: running"
    fi

    # Check PM2
    if ! sudo -u "$APP_USER" pm2 list 2>/dev/null | grep -q "online"; then
        print_warning "PM2 application may not be running"
    else
        print_success "PM2 application: online"
    fi

    # Check MQTT (optional)
    if systemctl is-enabled --quiet mosquitto 2>/dev/null; then
        if ! systemctl is-active --quiet mosquitto; then
            print_warning "Mosquitto MQTT broker is installed but not running"
        else
            print_success "Mosquitto MQTT: running"
        fi
    fi

    if [[ $failed -eq 1 ]]; then
        print_error "Some critical services are not running!"
        return 1
    fi

    print_success "All critical services are running"
}
```

---

## 📋 Recommended Changes Summary

### High Priority:
None - scripts are functional

### Medium Priority:
1. **Add MQTT broker installation** to install-ubuntu.sh
2. **Update .env file generation** to include MQTT variables
3. **Update firewall configuration** to open MQTT port if enabled
4. **Add MQTT mention** to INSTALLATION_INFO.md template

### Low Priority:
5. Update version number to 2.2.0
6. Add service health check to update-system.sh
7. Update documentation references

---

## 🔧 Proposed Script Updates

### For install-ubuntu.sh:

Add after `install_redis()` function (around line 388):

```bash
# Function to install MQTT broker (optional)
install_mqtt_broker() {
    print_status "MQTT Protocol Support"
    echo
    echo "MQTT is an optional protocol for device communication."
    echo "It's recommended for battery-powered devices and low-bandwidth networks."
    echo

    if [[ ! -t 0 ]]; then
        # Non-interactive mode
        if [[ "$INSTALL_MQTT" == "true" ]]; then
            print_status "Installing MQTT broker (non-interactive mode)..."
        else
            print_status "Skipping MQTT broker installation"
            return 0
        fi
    else
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

    # Create basic configuration
    cat > /etc/mosquitto/conf.d/esp8266-platform.conf << 'EOF'
# ESP8266 Platform MQTT Configuration
listener 1883 0.0.0.0
allow_anonymous false
password_file /etc/mosquitto/passwd

# Logging
log_dest file /var/log/mosquitto/mosquitto.log
log_type error
log_type warning
log_type notice

# Limits
max_connections -1
max_queued_messages 1000
EOF

    # Create password file
    print_status "Creating MQTT user 'iot' with password 'iot123'..."
    touch /etc/mosquitto/passwd
    mosquitto_passwd -b /etc/mosquitto/passwd iot iot123

    # Create log directory
    mkdir -p /var/log/mosquitto
    chown mosquitto:mosquitto /var/log/mosquitto

    # Start and enable mosquitto
    systemctl restart mosquitto
    systemctl enable mosquitto

    MQTT_ENABLED="true"
    MQTT_BROKER_URL="mqtt://localhost:1883"
    MQTT_USERNAME="iot"
    MQTT_PASSWORD="iot123"

    print_success "Mosquitto MQTT broker installed and running"
    print_warning "Default MQTT credentials: iot / iot123"
    print_status "Change password with: sudo mosquitto_passwd /etc/mosquitto/passwd iot"
}
```

Update `create_env_files()` function to add MQTT configuration after line 595:

```bash
# MQTT Configuration (Optional)
MQTT_ENABLED=${MQTT_ENABLED:-false}
MQTT_BROKER_URL=${MQTT_BROKER_URL:-mqtt://localhost:1883}
MQTT_USERNAME=${MQTT_USERNAME:-}
MQTT_PASSWORD=${MQTT_PASSWORD:-}
MQTT_TOPIC_PREFIX=iot
MQTT_DEFAULT_QOS=1
```

Update `setup_firewall()` to include MQTT port:

```bash
# After line 926, add:
if [[ "$MQTT_ENABLED" == "true" ]]; then
    ufw allow 1883/tcp comment 'MQTT'
    print_status "MQTT port (1883) opened in firewall"
fi
```

Update main() function to call install_mqtt_broker() after install_redis():

```bash
# Around line 1273, after install_redis, add:
install_mqtt_broker
```

---

### For update-system.sh:

Add service check function and call it before update:

```bash
# Add before update_system() function:

check_services() {
    print_status "Checking system services..."

    services=("postgresql" "redis-server" "nginx")
    failed=0

    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service"; then
            print_success "$service: running"
        else
            print_error "$service: NOT running"
            failed=1
        fi
    done

    # Check optional MQTT
    if systemctl is-enabled --quiet mosquitto 2>/dev/null; then
        if systemctl is-active --quiet mosquitto; then
            print_success "mosquitto (MQTT): running"
        else
            print_warning "mosquitto (MQTT): installed but not running"
        fi
    fi

    # Check PM2
    if sudo -u "$APP_USER" pm2 list 2>/dev/null | grep -q "online"; then
        print_success "Application: online"
    else
        print_warning "Application: may not be running correctly"
    fi

    if [[ $failed -eq 1 ]]; then
        print_error "Some critical services are down. Fix them before updating."
        return 1
    fi

    return 0
}

# Update update_system() to check services first:
update_system() {
    print_status "🔄 Updating ESP8266 IoT Platform..."

    # Check services health
    if ! check_services; then
        print_error "Cannot proceed with update while services are down"
        exit 1
    fi

    # ... rest of function
}
```

---

## ✅ Testing Checklist

After making changes:

- [ ] Test fresh installation on clean Ubuntu server
- [ ] Test with MQTT enabled
- [ ] Test with MQTT disabled
- [ ] Test development mode installation
- [ ] Test production mode installation
- [ ] Test update script on existing installation
- [ ] Verify all services start correctly
- [ ] Verify MQTT broker works (if enabled)
- [ ] Check firewall rules
- [ ] Verify .env files have correct variables

---

## 📝 Conclusion

The scripts are **functionally complete** for the current features, but should be updated to:

1. **Support MQTT broker installation** (optional)
2. **Include MQTT environment variables**
3. **Add service health checks**
4. **Update documentation references**

These changes are **not critical** for existing functionality but will provide a better out-of-box experience for users wanting to use the new MQTT features.

**Recommendation:** Update scripts when you have time, but they work fine as-is for HTTP-only installations.
