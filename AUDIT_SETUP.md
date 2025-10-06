# 📋 Audit Logging System - Setup Instructions

This guide explains how to integrate the comprehensive audit logging system into your ESP8266 IoT Management Platform.

## 🎯 What's Included

The audit logging system provides:
- ✅ Complete user action tracking
- ✅ Session management and monitoring
- ✅ Failed login attempt tracking
- ✅ Data export auditing
- ✅ Configuration change tracking
- ✅ Device command auditing
- ✅ Comprehensive filtering and reporting

## 📦 Installation Steps

### Step 1: Run Database Migration

```bash
cd /opt/esp8266-platform

# Run the migration
psql -U esp8266app -d esp8266_platform -f database/migrations/002_add_audit_logs.sql

# Verify tables were created
psql -U esp8266app -d esp8266_platform -c "\dt audit*"
psql -U esp8266app -d esp8266_platform -c "\dt session_audit"
psql -U esp8266app -d esp8266_platform -c "\dt failed_login_attempts"
psql -U esp8266app -d esp8266_platform -c "\dt data_export_audit"
psql -U esp8266app -d esp8266_platform -c "\dt config_change_audit"
psql -U esp8266app -d esp8266_platform -c "\dt device_command_audit"
```

### Step 2: Integrate Audit Middleware

Edit `backend/server.js` to add the audit middleware:

```javascript
// Add near the top with other imports
const { auditLogger } = require('./src/middleware/auditMiddleware');

// Add after existing middleware (around line 80, after rate limiter)
// Audit logging for all API requests (except GET by default)
app.use('/api/', auditLogger({
    skipPaths: ['/health', '/api/auth/setup-check'],
    logGetRequests: false // Set to true if you want to log GET requests too
}));
```

### Step 3: Add Audit Routes

Edit `backend/server.js` to register the audit log routes:

```javascript
// Add with other route imports (around line 32)
const auditLogRoutes = require('./src/routes/auditLogs');

// Add with other route registrations (around line 110)
app.use('/api/audit-logs', auditLogRoutes);
```

### Step 4: Update Authentication Routes

Modify `backend/src/routes/auth.js` to log authentication events:

```javascript
// Add import at top
const auditService = require('../services/auditService');

// In the login route (after successful login, around line 120)
// Add this after token generation:
await auditService.logLogin(user, req, true);
await auditService.startSession(user, req, token);

// In the login route (on failure, in catch block or after password check)
// Add this on login failure:
await auditService.logLogin({ email }, req, false, 'Invalid credentials');

// In the logout route (if you have one)
await auditService.logLogout(req.user, req, 'manual');
await auditService.endSession(token, 'manual');
```

### Step 5: Add Audit Logging to Critical Actions

#### User Management (backend/src/routes/users.js)

```javascript
const auditService = require('../services/auditService');

// After creating a user
await auditService.logFromRequest(req, 'user.create', 'user', {
    resourceType: 'user',
    resourceId: newUser.id,
    resourceName: newUser.email,
    metadata: { role: newUser.role }
});

// After updating a user
await auditService.logFromRequest(req, 'user.update', 'user', {
    resourceType: 'user',
    resourceId: userId,
    changes: { after: req.body }
});

// After deleting a user
await auditService.logFromRequest(req, 'user.delete', 'user', {
    resourceType: 'user',
    resourceId: userId
});
```

#### Settings Updates (backend/src/routes/settings.js)

```javascript
const auditService = require('../services/auditService');

// When settings are updated
const oldSettings = await getCurrentSettings(); // Fetch old settings first

// After updating settings
await auditService.logConfigChange(
    req.user,
    req,
    'smtp', // or 'system', 'security', etc.
    'smtp_host',
    oldSettings.smtp_host,
    req.body.smtp_host,
    'SMTP configuration update'
);
```

#### Device Commands (backend/src/routes/firmware.js)

```javascript
const auditService = require('../services/auditService');

// When triggering OTA update
const commandId = await auditService.logDeviceCommand(
    req.user.userId,
    deviceId,
    'ota_update',
    { version: req.body.version, firmware_url: req.body.firmware_url },
    req.ip
);

// Later, when device responds
await auditService.updateDeviceCommand(commandId, 'completed', { success: true });
```

### Step 6: Add Data Export Auditing

In `backend/src/routes/telemetry.js` (or wherever you handle CSV exports):

```javascript
const auditService = require('../services/auditService');

// Before sending the CSV file
await auditService.logDataExport(req.user, req, {
    exportType: 'csv',
    resourceType: 'telemetry',
    deviceIds: [deviceId],
    dateRangeStart: startDate,
    dateRangeEnd: endDate,
    filters: { sensor_type: sensorType },
    recordsCount: telemetryData.length,
    fileSizeBytes: csvBuffer.length,
    fileName: `telemetry_${deviceId}_${Date.now()}.csv`
});
```

### Step 7: Restart Application

```bash
# Using PM2
pm2 restart esp8266-backend

# Or if running directly
npm run dev
```

## 🧪 Testing

### Test Authentication Logging

```bash
# Login (should create audit log)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'

# View audit logs
curl -X GET http://localhost:3001/api/audit-logs \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Failed Login Tracking

```bash
# Try wrong password
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"wrongpassword"}'

# View failed attempts
curl -X GET http://localhost:3001/api/audit-logs/failed-logins \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Device Action Logging

```bash
# Update a device
curl -X PUT http://localhost:3001/api/devices/DEVICE_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Name"}'

# View audit logs
curl -X GET "http://localhost:3001/api/audit-logs?action_category=device" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📊 Viewing Audit Logs

### API Endpoints

All audit log endpoints require authentication and most require admin role.

#### Get Audit Logs
```http
GET /api/audit-logs?action_category=device&limit=50&offset=0
```

**Query Parameters:**
- `user_id` - Filter by user
- `device_id` - Filter by device
- `action_type` - Exact action type (e.g., 'user.login')
- `action_category` - Category: authentication, device, sensor, alert, system, user
- `action_result` - Result: success, failure, error
- `start_date` - ISO date string
- `end_date` - ISO date string
- `search` - Search term (searches user email, resource name, action type)
- `limit` - Results per page (default: 100, max: 1000)
- `offset` - Pagination offset

#### Get Audit Statistics
```http
GET /api/audit-logs/stats?start_date=2025-10-01&end_date=2025-10-07
```

Returns:
- Action counts by category
- Top 10 most active users
- Total actions, success/failure counts
- Unique user and device counts

#### Get Session History
```http
GET /api/audit-logs/session-history?user_id=123&limit=50
```

Non-admin users can only view their own sessions.

#### Get Failed Login Attempts
```http
GET /api/audit-logs/failed-logins?limit=100
```

Admin only. Shows all failed login attempts with stats.

#### Get Data Export History
```http
GET /api/audit-logs/data-exports?user_id=123
```

Track who exported what data and when.

#### Get Configuration Changes
```http
GET /api/audit-logs/config-changes?category=smtp
```

Admin only. Track all system configuration changes.

#### Get Device Commands
```http
GET /api/audit-logs/device-commands?device_id=ESP-12345&status=completed
```

Track commands sent to devices (OTA, config updates, etc).

## 🔧 Configuration

### Automatic Cleanup

The migration creates a function `cleanup_old_audit_logs()` that removes old audit logs based on retention policies:

- Audit logs: 1 year
- Session audit: 6 months
- Failed login attempts: 3 months
- Data exports: 1 year
- Config changes: 2 years
- Device commands: 6 months

**Manual cleanup:**
```sql
SELECT cleanup_old_audit_logs();
```

**Automated cleanup with cron job (add to crontab):**
```bash
# Run cleanup every Sunday at 2 AM
0 2 * * 0 psql -U esp8266app -d esp8266_platform -c "SELECT cleanup_old_audit_logs();"
```

### Adjusting Retention Periods

Edit the function in the database:

```sql
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs() RETURNS void AS $$
BEGIN
    -- Change retention periods as needed
    DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '2 years'; -- Changed from 1 year
    DELETE FROM session_audit WHERE created_at < NOW() - INTERVAL '1 year'; -- Changed from 6 months
    -- etc.
END;
$$ LANGUAGE plpgsql;
```

### Account Lockout Settings

Failed login attempt lockout is currently set to 5 attempts within 1 hour.

To change this, edit `backend/src/services/auditService.js`:

```javascript
// Line ~140 in logFailedLogin function
const accountLocked = consecutiveFailures >= 10; // Changed from 5

// And update the time window in the query
AND attempted_at > NOW() - INTERVAL '2 hours' // Changed from 1 hour
```

## 🎨 Frontend Integration

See `frontend/src/pages/AuditLogs.jsx` for the complete audit log viewer component.

To add to your navigation:

```javascript
// In App.jsx or your router configuration
import AuditLogs from './pages/AuditLogs';

// Add route (admin only)
{user.role === 'admin' && (
    <Route path="/audit-logs" element={<AuditLogs />} />
)}

// Add to navigation menu
{user.role === 'admin' && (
    <NavLink to="/audit-logs">
        <Shield className="w-5 h-5" />
        Audit Logs
    </NavLink>
)}
```

## 🔒 Security Considerations

1. **Sensitive Data**: The system automatically masks sensitive values (passwords, secrets, API keys) in config changes
2. **IP Logging**: All actions log IP addresses for forensic analysis
3. **Tamper Protection**: Audit logs are append-only (no UPDATE capability in routes)
4. **Access Control**: Only admins can view most audit logs
5. **Retention**: Old logs are automatically cleaned up to manage database size

## 📈 Compliance

The audit logging system helps with compliance requirements:

- **GDPR**: Track who accessed what data and when
- **HIPAA**: Complete audit trail of all system access
- **SOC 2**: User activity monitoring and session tracking
- **ISO 27001**: Security event logging

## 🐛 Troubleshooting

### Audit logs not appearing

1. Check middleware is registered: `grep "auditLogger" backend/server.js`
2. Check database tables exist: `\dt audit*` in psql
3. Check logs for errors: `pm2 logs esp8266-backend | grep -i audit`
4. Verify audit service is imported: `grep "auditService" backend/src/routes/*.js`

### Performance impact

The audit system is designed to be non-blocking:
- All audit logging is fire-and-forget (no await in middleware)
- Failed audit logs don't fail the request
- Indexes are created for fast queries
- Automatic cleanup prevents database bloat

To monitor performance:
```sql
-- Check table sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename LIKE 'audit%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check query performance
EXPLAIN ANALYZE SELECT * FROM audit_logs WHERE user_id = 1 ORDER BY created_at DESC LIMIT 100;
```

## 📝 Best Practices

1. **Log Important Actions Only**: Don't log every GET request (high volume, low value)
2. **Include Context**: Always log user ID, IP, and timestamp
3. **Monitor Failed Logins**: Set up alerts for unusual patterns
4. **Regular Reviews**: Review audit logs regularly for suspicious activity
5. **Backup Audit Logs**: Include in your backup strategy
6. **Document Custom Actions**: Add comments when logging custom events

## 🚀 Next Steps

1. Run the database migration
2. Integrate middleware and routes
3. Add logging to critical actions
4. Test thoroughly
5. Deploy to production
6. Set up automated cleanup
7. Create dashboards/reports
8. Train team on audit log access

---

**Questions?** Check the main documentation or open an issue on GitHub.
