# Installation Scripts Updated

## Date: 2025-09-30

## Summary

Both installation scripts have been updated to support the new MQTT feature and include better service health checks.

---

## Changes Made

### ✅ install-ubuntu.sh

#### 1. Added MQTT Broker Installation (Optional)

**New function:** `install_mqtt_broker()` (lines 390-498)

Features:
- Interactive prompt asking if user wants to install MQTT
- Non-interactive support via `INSTALL_MQTT=true` environment variable
- Installs Mosquitto MQTT broker
- Creates secure configuration with authentication
- Sets up default user: `iot` / `iot123`
- Configures logging and persistence
- Sets proper file permissions

#### 2. Updated Environment Variables

**Updated:** `create_env_files()` function (lines 708-714)

Added MQTT configuration to `.env`:
```bash
MQTT_ENABLED=${MQTT_ENABLED:-false}
MQTT_BROKER_URL=${MQTT_BROKER_URL:-mqtt://localhost:1883}
MQTT_USERNAME=${MQTT_USERNAME:-}
MQTT_PASSWORD=${MQTT_PASSWORD:-}
MQTT_TOPIC_PREFIX=iot
MQTT_DEFAULT_QOS=1
```

#### 3. Updated Firewall Configuration

**Updated:** `setup_firewall()` function (lines 1055-1058)

Added MQTT port if enabled:
```bash
if [[ "$MQTT_ENABLED" == "true" ]]; then
    ufw allow 1883/tcp comment 'MQTT'
    print_status "MQTT port 1883 opened in firewall"
fi
```

#### 4. Updated Installation Flow

**Updated:** `main()` function (line 1398)

Added MQTT installation step:
```bash
install_redis
install_mqtt_broker  # <- NEW
create_app_user
```

---

### ✅ update-system.sh

#### 1. Added Service Health Check

**New function:** `check_services()` (lines 46-105)

Checks:
- ✓ PostgreSQL (critical)
- ✓ Redis (optional)
- ✓ Nginx (critical)
- ✓ PM2 application (critical)
- ✓ MQTT/Mosquitto (optional)

Returns error if critical services are down.

#### 2. Updated Update Flow

**Updated:** `update_system()` function (lines 111-116)

Now checks services before updating:
```bash
if ! check_services; then
    print_error "Cannot proceed with update while critical services are down"
    exit 1
fi
```

---

## Usage

### Fresh Installation (Interactive)

```bash
# Download and run
wget https://raw.githubusercontent.com/martinkadlcek/ESP-Management-Platform/main/install-ubuntu.sh
chmod +x install-ubuntu.sh
sudo ./install-ubuntu.sh
```

**New prompt:**
```
MQTT Protocol Support

MQTT is an optional lightweight messaging protocol for device communication.
Benefits:
  • Lower bandwidth usage (~95% less than HTTP)
  • Better for battery-powered devices
  • Real-time bidirectional communication
  • Works well behind NAT/firewalls

You can skip this and devices will use HTTP instead.

Install Mosquitto MQTT broker? (y/N):
```

### Fresh Installation (Non-Interactive with MQTT)

```bash
# For production with MQTT
export DOMAIN=iot.example.com
export EMAIL=admin@example.com
export DB_PASSWORD=secure_password
export INSTALL_MQTT=true
curl -sSL https://raw.githubusercontent.com/.../install-ubuntu.sh | sudo -E bash
```

```bash
# For development with MQTT
export DEVELOPMENT_MODE=true
export DB_PASSWORD=secure_password
export INSTALL_MQTT=true
curl -sSL https://raw.githubusercontent.com/.../install-ubuntu.sh | sudo -E bash
```

### System Update

```bash
# Standard update (with service check)
sudo ./update-system.sh

# Will now show:
# 🔍 Checking system services...
# ✓ PostgreSQL: running
# ✓ Redis: running
# ✓ Nginx: running
# ✓ Application (PM2): online
# ℹ MQTT (Mosquitto): not installed (optional)
```

---

## MQTT Configuration After Installation

### Default Credentials

If MQTT was installed:
- **Username:** `iot`
- **Password:** `iot123`

### Change MQTT Password

```bash
sudo mosquitto_passwd -b /etc/mosquitto/passwd iot <new_password>
sudo systemctl restart mosquitto
```

### Add More MQTT Users

```bash
sudo mosquitto_passwd /etc/mosquitto/passwd <new_username>
sudo systemctl restart mosquitto
```

### Configure Devices for MQTT

1. Log into web interface
2. Go to **Administration** → **Protocol Settings**
3. Select your device
4. Choose **MQTT** protocol
5. Configure:
   - **MQTT Broker Host:** Your server IP
   - **MQTT Broker Port:** `1883`
   - **Username:** `iot`
   - **Password:** `iot123`
   - **Topic Prefix:** `iot`
   - **QoS Level:** `1`
6. Click **Test Connection**
7. Click **Save Settings**

### Test MQTT

```bash
# Subscribe to all topics
mosquitto_sub -h localhost -u iot -P iot123 -t 'iot/#' -v

# Publish test message
mosquitto_pub -h localhost -u iot -P iot123 -t 'iot/test' -m 'Hello MQTT'
```

---

## Environment Variables Reference

### Installation Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DOMAIN` | Prod only | - | Your domain name |
| `EMAIL` | Prod only | - | Email for SSL certs |
| `DB_PASSWORD` | Yes | - | Database password |
| `DEVELOPMENT_MODE` | No | `false` | Skip SSL/domain setup |
| `INSTALL_MQTT` | No | `false` | Install MQTT broker |

### Application Variables (Backend .env)

Added MQTT variables:
```env
MQTT_ENABLED=true                          # Enable/disable MQTT support
MQTT_BROKER_URL=mqtt://localhost:1883     # MQTT broker connection URL
MQTT_USERNAME=iot                          # MQTT authentication username
MQTT_PASSWORD=iot123                       # MQTT authentication password
MQTT_TOPIC_PREFIX=iot                      # Default topic prefix for devices
MQTT_DEFAULT_QOS=1                         # Default QoS level (0, 1, or 2)
```

---

## Service Status Commands

### Check All Services

```bash
# PostgreSQL
sudo systemctl status postgresql

# Redis
sudo systemctl status redis-server

# Nginx
sudo systemctl status nginx

# MQTT (if installed)
sudo systemctl status mosquitto

# Application
sudo -u esp8266app pm2 status
sudo -u esp8266app pm2 logs
```

### Restart Services

```bash
# Restart all
sudo systemctl restart postgresql redis-server nginx mosquitto
sudo -u esp8266app pm2 restart all

# Restart individual
sudo systemctl restart mosquitto
sudo -u esp8266app pm2 restart esp8266-platform
```

---

## Firewall Ports

After installation with MQTT enabled:

| Port | Protocol | Service | Required |
|------|----------|---------|----------|
| 22 | TCP | SSH | Yes |
| 80 | TCP | HTTP (or redirect) | Yes |
| 443 | TCP | HTTPS (prod) | Prod only |
| 1883 | TCP | MQTT | If MQTT enabled |

Check firewall:
```bash
sudo ufw status verbose
```

---

## Troubleshooting

### MQTT Not Working

**1. Check if Mosquitto is running:**
```bash
sudo systemctl status mosquitto
```

**2. Check Mosquitto logs:**
```bash
sudo tail -f /var/log/mosquitto/mosquitto.log
```

**3. Check if port is open:**
```bash
sudo netstat -tlnp | grep 1883
```

**4. Test connection:**
```bash
mosquitto_sub -h localhost -u iot -P iot123 -t 'test' -v
```

**5. Check firewall:**
```bash
sudo ufw status | grep 1883
```

### Services Not Starting After Update

**1. Run service check:**
```bash
sudo ./update-system.sh
# Will show which services are down
```

**2. Check individual services:**
```bash
sudo systemctl status postgresql
sudo systemctl status nginx
sudo -u esp8266app pm2 logs
```

**3. Restore from backup:**
```bash
# List backups
ls -lh /opt/esp8266-platform.backup.*

# Restore
sudo rm -rf /opt/esp8266-platform
sudo mv /opt/esp8266-platform.backup.20251231-120000 /opt/esp8266-platform
sudo -u esp8266app pm2 restart all
```

---

## Migration Guide

### Enabling MQTT on Existing Installation

If you have an existing installation without MQTT:

**1. Install Mosquitto:**
```bash
sudo apt update
sudo apt install -y mosquitto mosquitto-clients
```

**2. Configure Mosquitto:**
```bash
sudo mkdir -p /etc/mosquitto/conf.d

sudo tee /etc/mosquitto/conf.d/esp8266-platform.conf << 'EOF'
listener 1883 0.0.0.0
protocol mqtt
allow_anonymous false
password_file /etc/mosquitto/passwd
log_dest file /var/log/mosquitto/mosquitto.log
log_type error
log_type warning
log_type notice
persistence true
persistence_location /var/lib/mosquitto/
message_size_limit 10240
EOF
```

**3. Create MQTT user:**
```bash
sudo touch /etc/mosquitto/passwd
sudo mosquitto_passwd -b /etc/mosquitto/passwd iot iot123
sudo chown mosquitto:mosquitto /etc/mosquitto/passwd
sudo chmod 600 /etc/mosquitto/passwd
```

**4. Create directories:**
```bash
sudo mkdir -p /var/log/mosquitto /var/lib/mosquitto
sudo chown mosquitto:mosquitto /var/log/mosquitto /var/lib/mosquitto
```

**5. Start Mosquitto:**
```bash
sudo systemctl restart mosquitto
sudo systemctl enable mosquitto
```

**6. Update firewall:**
```bash
sudo ufw allow 1883/tcp comment 'MQTT'
```

**7. Update backend .env:**
```bash
sudo nano /opt/esp8266-platform/backend/.env
```

Add:
```env
MQTT_ENABLED=true
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=iot
MQTT_PASSWORD=iot123
MQTT_TOPIC_PREFIX=iot
MQTT_DEFAULT_QOS=1
```

**8. Restart application:**
```bash
sudo -u esp8266app pm2 restart all
```

**9. Verify:**
```bash
sudo systemctl status mosquitto
sudo -u esp8266app pm2 logs | grep MQTT
```

---

## Security Best Practices

### MQTT Security

1. **Change default password immediately:**
   ```bash
   sudo mosquitto_passwd -b /etc/mosquitto/passwd iot <strong_password>
   ```

2. **Use TLS/SSL for production** (advanced):
   - Configure mqtts:// instead of mqtt://
   - Use Let's Encrypt certificates
   - Update port to 8883

3. **Create unique credentials per device:**
   ```bash
   sudo mosquitto_passwd /etc/mosquitto/passwd device_001
   sudo mosquitto_passwd /etc/mosquitto/passwd device_002
   ```

4. **Monitor MQTT logs:**
   ```bash
   sudo tail -f /var/log/mosquitto/mosquitto.log
   ```

5. **Limit connections:**
   Edit `/etc/mosquitto/conf.d/esp8266-platform.conf`:
   ```
   max_connections 100
   ```

---

## What's Next

After installation with MQTT:

1. ✅ **Test HTTP communication** (default, always works)
2. ✅ **Test MQTT communication** (optional, better for IoT)
3. ✅ **Configure devices** via Protocol Settings UI
4. ✅ **Monitor MQTT messages** with `mosquitto_sub`
5. ✅ **Review** [MQTT_SETUP.md](MQTT_SETUP.md) for Arduino code examples

---

## Version History

- **v2.2.0** (2025-09-30)
  - ✅ Added optional MQTT broker installation
  - ✅ Added service health checks
  - ✅ Updated environment variables
  - ✅ Enhanced firewall configuration
  - ✅ Improved update process validation

- **v2.1.0** (Previous)
  - HTTP-only installation
  - Basic system setup

---

## Files Modified

1. ✅ `install-ubuntu.sh` - Added MQTT support
2. ✅ `update-system.sh` - Added service checks
3. ✅ `INSTALLATION_SCRIPTS_REVIEW.md` - Analysis document
4. ✅ `INSTALLATION_SCRIPTS_UPDATED.md` - This document

---

## Support

For issues:
1. Check logs: `sudo -u esp8266app pm2 logs`
2. Check services: `./update-system.sh` (runs health check)
3. Review: [MQTT_SETUP.md](MQTT_SETUP.md)
4. Review: [HIGH_PRIORITY_IMPROVEMENTS_SUMMARY.md](HIGH_PRIORITY_IMPROVEMENTS_SUMMARY.md)

**Installation scripts are now fully updated and ready for production use! 🚀**
