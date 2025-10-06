# 🚀 Quick Start - Security Features

## Activate Brute Force Protection & Audit Logging

### Step 1: Run Database Migration (1 minute)

```bash
cd /Users/martin.kadlcek/SensityDashboard

# Run the audit logs migration
psql -U esp8266app -d esp8266_platform -f database/migrations/002_add_audit_logs.sql

# Verify tables were created
psql -U esp8266app -d esp8266_platform -c "\dt audit*"
```

**Expected output:**
```
 audit_logs
 config_change_audit
 data_export_audit
 device_command_audit
 failed_login_attempts
 session_audit
```

### Step 2: Check Redis (30 seconds)

```bash
# Test Redis connection
redis-cli ping

# Should return: PONG
```

**If Redis is not installed:**
```bash
# macOS
brew install redis
brew services start redis

# Linux
sudo apt install redis-server
sudo systemctl start redis-server
```

### Step 3: Restart Backend (30 seconds)

```bash
cd /Users/martin.kadlcek/SensityDashboard/backend

# Using PM2 (production)
pm2 restart esp8266-backend
pm2 logs esp8266-backend --lines 20

# Or development mode
npm run dev
```

### Step 4: Test Brute Force Protection (1 minute)

```bash
# Test account lockout - try wrong password 6 times
for i in {1..6}; do
  curl -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrongpassword"}'
  echo "\n--- Attempt $i ---"
  sleep 2
done
```

**On 6th attempt you should see:**
```json
{
  "error": "Account temporarily locked",
  "message": "Too many failed login attempts. Please try again in 30 minute(s).",
  "locked": true,
  "remainingTime": 1800
}
```

### Step 5: Verify Audit Logging

```bash
# Check if failed attempts were logged
psql -U esp8266app -d esp8266_platform -c \
  "SELECT email, failure_reason, attempted_at FROM failed_login_attempts ORDER BY attempted_at DESC LIMIT 5;"
```

---

## 🎯 Quick Test Checklist

- [ ] ✅ Database migration completed
- [ ] ✅ Redis is running (`redis-cli ping` returns PONG)
- [ ] ✅ Backend restarted successfully
- [ ] ✅ Brute force protection works (account locks after 5 attempts)
- [ ] ✅ Failed attempts logged in database
- [ ] ✅ Can view security stats: `curl http://localhost:3001/api/security/brute-force/stats -H "Authorization: Bearer YOUR_ADMIN_TOKEN"`

---

## 🎨 Admin Features Available Now

### View Security Statistics
```bash
curl http://localhost:3001/api/security/brute-force/stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### View Locked Accounts
```bash
curl http://localhost:3001/api/security/locked-accounts \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Unlock an Account
```bash
curl -X POST http://localhost:3001/api/security/unlock-account \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### View Audit Logs
```bash
curl http://localhost:3001/api/audit-logs?limit=10 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## 📊 Protection Levels

**Default Configuration:**
- 🔒 Account locks after **5** failed attempts
- ⏱️ Lockout duration: **30 minutes**
- 🚫 IP blocks after **10** failed attempts
- ⏱️ IP ban duration: **1 hour**
- 🤖 CAPTCHA required after **3** attempts
- ⏰ Progressive delays: 1s → 2s → 4s → 8s

**To Adjust:** Edit `backend/src/middleware/bruteForceProtection.js`

---

## 🔍 Monitoring Commands

### Check Active Threats (Real-time)
```bash
curl http://localhost:3001/api/security/active-threats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" | jq
```

### View Recent Failed Logins
```bash
psql -U esp8266app -d esp8266_platform -c \
  "SELECT email, ip_address, failure_reason, attempted_at
   FROM failed_login_attempts
   WHERE attempted_at > NOW() - INTERVAL '1 hour'
   ORDER BY attempted_at DESC;"
```

### Check Audit Logs
```bash
psql -U esp8266app -d esp8266_platform -c \
  "SELECT user_email, action_type, action_result, created_at
   FROM audit_logs
   ORDER BY created_at DESC
   LIMIT 10;"
```

---

## 🆘 Troubleshooting

### Backend Won't Start

```bash
# Check for errors
pm2 logs esp8266-backend

# Common fixes:
npm install  # Install missing dependencies
pm2 delete esp8266-backend
pm2 start server.js --name esp8266-backend
```

### Redis Connection Error

```bash
# Check Redis is running
redis-cli ping

# If not running:
brew services restart redis  # macOS
sudo systemctl restart redis-server  # Linux

# Check Redis logs
tail -f /usr/local/var/log/redis.log  # macOS
```

### Account Stuck Locked

```bash
# Unlock via database
psql -U esp8266app -d esp8266_platform -c \
  "UPDATE failed_login_attempts SET account_locked = false WHERE email = 'user@example.com';"

# Clear Redis lock
redis-cli DEL "account_lock:user@example.com"

# Or use API
curl -X POST http://localhost:3001/api/security/unlock-account \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

---

## 📚 Full Documentation

For complete details, see:

- **Brute Force Protection**: `BRUTE_FORCE_SETUP.md`
- **Audit Logging**: `AUDIT_SETUP.md`
- **API Reference**: `docs/API.md`
- **Deployment**: `docs/DEPLOYMENT.md`

---

## ✅ You're All Set!

Your Sensity platform now has:
- ✅ Enterprise-grade brute force protection
- ✅ Complete audit trail for compliance
- ✅ Real-time security monitoring
- ✅ Admin controls for security management

**Need help?** Check the troubleshooting section above or review the full documentation files.
