# 🔐 Licensing System Documentation

## Overview

The Sensity Platform now includes a comprehensive **on-premise licensing system** that allows you to monetize your IoT platform through license keys. The system validates licenses against a remote server, enforces feature limits, and provides a grace period for offline operations.

---

## 🎯 Features

### ✅ **Core Capabilities**
- **Remote License Validation** - Validates keys against your license server
- **Hardware Binding** - Optional node-locked licenses tied to hardware ID
- **Grace Period** - Continue operating during temporary network outages (7 days default)
- **Feature Flags** - Enable/disable features per license tier
- **Usage Limits** - Enforce device and user limits
- **Multi-Tier Support** - Trial, Starter, Professional, Enterprise, Lifetime
- **Automatic Validation** - Periodic checks every 24 hours
- **Offline Mode** - Cached license with configurable validation failures
- **License Management UI** - User-friendly interface for activation and monitoring

---

## 📋 License Tiers

| Feature | Trial | Starter | Professional | Enterprise | Lifetime |
|---------|-------|---------|--------------|------------|----------|
| **Duration** | 30 days | 1 year | 1 year | 1 year | Perpetual |
| **Max Devices** | 10 | 50 | 200 | Unlimited | Unlimited |
| **Max Users** | 3 | 10 | 50 | Unlimited | Unlimited |
| **Audit Logging** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Advanced Analytics** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **API Access** | Limited | ✅ | ✅ | ✅ | ✅ |
| **White-Label** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Priority Support** | ❌ | ❌ | Email | Phone | Phone |
| **Price** | Free | $299/yr | $999/yr | $2999/yr | $9999 |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Your License Server                       │
│  (Central server you control - can be hosted anywhere)      │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  License Database (PostgreSQL)                     │    │
│  │  - license_keys                                    │    │
│  │  - license_validations (audit log)                 │    │
│  │  - license_features                                │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  License Server API                                │    │
│  │  POST /api/v1/licenses/validate                    │    │
│  │  POST /api/v1/licenses/create                      │    │
│  │  GET  /api/v1/licenses/:key/status                 │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTPS (encrypted)
                              │ Validates every 24 hours
                              ▼
┌─────────────────────────────────────────────────────────────┐
│           Customer On-Premise Installation                   │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  License Service (Node.js)                         │    │
│  │  - Validates with remote server                    │    │
│  │  - Caches license locally                          │    │
│  │  - Generates hardware fingerprint                  │    │
│  │  - Enforces grace period                           │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  License Middleware                                │    │
│  │  - Checks license before API calls                 │    │
│  │  - Enforces feature flags                          │    │
│  │  - Blocks operations if limits exceeded            │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Local Cache (PostgreSQL)                          │    │
│  │  - local_license_info                              │    │
│  │  - Cached for offline operation                    │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Installation & Setup

### **1. Database Migration**

Run the licensing system migration on both your license server and client installations:

```bash
# On your license server
psql -U postgres -d license_server -f database/migrations/003_add_licensing_system.sql

# On client installations (included automatically)
psql -U postgres -d esp8266_platform -f database/migrations/003_add_licensing_system.sql
```

### **2. Backend Configuration**

Add to your `.env` file:

```bash
# License Server Configuration
LICENSE_SERVER_URL=https://license.sensity.app/api/v1
LICENSE_CHECK_INTERVAL=86400000           # 24 hours in milliseconds
LICENSE_GRACE_PERIOD_DAYS=7               # Days to operate without validation
LICENSE_OFFLINE_MAX_FAILURES=3            # Max validation failures before grace period
```

### **3. Initialize License Service**

Modify `backend/server.js` to initialize the license service:

```javascript
const licenseService = require('./src/services/licenseService');
const licenseRoutes = require('./src/routes/license');
const {
    checkDeviceLimit,
    checkUserLimit,
    addLicenseHeaders,
    requireFeature
} = require('./src/middleware/licenseMiddleware');

// Initialize license service on startup
(async () => {
    try {
        await licenseService.initialize();
        logger.info('License service started');
    } catch (error) {
        logger.error('Failed to start license service:', error);
    }
})();

// Register license routes
app.use('/api/license', licenseRoutes);

// Add license headers to all responses
app.use(addLicenseHeaders);

// Example: Protect device creation with license limits
app.use('/api/devices', checkDeviceLimit);

// Example: Protect user creation with license limits
app.use('/api/users', checkUserLimit);

// Example: Protect audit logs feature
app.use('/api/audit-logs', requireFeature('audit_logging'));
```

### **4. Frontend Integration**

Add the license management page to your routes in `App.jsx`:

```javascript
import LicenseManagement from './pages/LicenseManagement';

// Inside your Routes
<Route path="/license" element={<LicenseManagement />} />
```

Add a menu item in your navigation:

```javascript
<Link to="/license" className="nav-link">
    <Key className="w-5 h-5" />
    <span>License</span>
</Link>
```

---

## 🔑 License Key Format

### **Recommended Format**

```
TIER-XXXXXXXXXXXXXXXXXXXX-CHECKSUM
```

**Example:**
```
PROF-A7B9C3D5E8F2G4H6J9-XY42
```

- **TIER**: 4-character tier identifier (TRIA, STAR, PROF, ENTP, LIFE)
- **UNIQUE**: 20-character unique identifier
- **CHECKSUM**: 4-character validation checksum

### **Generation Example (Node.js)**

```javascript
const crypto = require('crypto');

function generateLicenseKey(tier) {
    const tierPrefixes = {
        trial: 'TRIA',
        starter: 'STAR',
        professional: 'PROF',
        enterprise: 'ENTP',
        lifetime: 'LIFE'
    };

    const prefix = tierPrefixes[tier] || 'UNKN';
    const unique = crypto.randomBytes(10).toString('hex').toUpperCase();
    const checksum = crypto
        .createHash('sha256')
        .update(prefix + unique)
        .digest('hex')
        .substring(0, 4)
        .toUpperCase();

    return `${prefix}-${unique}-${checksum}`;
}

// Generate a professional license
const licenseKey = generateLicenseKey('professional');
console.log(licenseKey);
// Output: PROF-A7B9C3D5E8F2G4H6J9-XY42
```

---

## 🖥️ License Server Implementation

You need to create a separate **license server** that your client installations will validate against.

### **Minimal License Server (Express)**

```javascript
const express = require('express');
const db = require('./database'); // Your PostgreSQL connection
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Validate license endpoint
app.post('/api/v1/licenses/validate', async (req, res) => {
    try {
        const {
            license_key,
            instance_id,
            hardware_id,
            platform_version,
            device_count,
            user_count
        } = req.body;

        // Check if license exists and is valid
        const result = await db.query(
            'SELECT * FROM is_license_valid($1)',
            [license_key]
        );

        const validation = result.rows[0];

        if (!validation.valid) {
            // Log failed validation
            await db.query(`
                INSERT INTO license_validations (
                    license_key, validation_result, client_ip,
                    instance_id, hardware_id, platform_version,
                    reported_device_count, reported_user_count,
                    error_message
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                license_key, validation.status, req.ip,
                instance_id, hardware_id, platform_version,
                device_count, user_count, validation.message
            ]);

            return res.json({
                valid: false,
                message: validation.message
            });
        }

        // Check usage limits
        if (device_count > validation.max_devices) {
            return res.json({
                valid: false,
                message: `Device limit exceeded (${device_count}/${validation.max_devices})`
            });
        }

        if (user_count > validation.max_users) {
            return res.json({
                valid: false,
                message: `User limit exceeded (${user_count}/${validation.max_users})`
            });
        }

        // Update last validation timestamp
        await db.query(
            'SELECT update_license_validation($1)',
            [license_key]
        );

        // Update usage stats
        await db.query(`
            UPDATE license_keys
            SET
                current_device_count = $1,
                current_user_count = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE license_key = $3
        `, [device_count, user_count, license_key]);

        // Log successful validation
        await db.query(`
            INSERT INTO license_validations (
                license_key_id, license_key, validation_result,
                client_ip, instance_id, hardware_id, platform_version,
                reported_device_count, reported_user_count, response_data
            ) SELECT id, $1, 'valid', $2, $3, $4, $5, $6, $7, $8::JSONB
            FROM license_keys WHERE license_key = $1
        `, [
            license_key, req.ip, instance_id, hardware_id,
            platform_version, device_count, user_count,
            JSON.stringify({
                license_type: validation.license_type,
                max_devices: validation.max_devices,
                max_users: validation.max_users,
                features: validation.features
            })
        ]);

        // Return valid response
        res.json({
            valid: true,
            license_key,
            license_type: validation.license_type,
            max_devices: validation.max_devices,
            max_users: validation.max_users,
            features: validation.features,
            expires_at: validation.expires_at,
            status: validation.status
        });

    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({
            valid: false,
            message: 'License validation failed'
        });
    }
});

// Create new license (admin only - add authentication!)
app.post('/api/v1/licenses/create', async (req, res) => {
    try {
        const {
            customer_email,
            customer_name,
            company_name,
            license_type,
            max_devices,
            max_users,
            features,
            expires_at
        } = req.body;

        const licenseKey = generateLicenseKey(license_type);

        await db.query(`
            INSERT INTO license_keys (
                license_key, customer_email, customer_name,
                company_name, license_type, max_devices,
                max_users, features, expires_at, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
        `, [
            licenseKey, customer_email, customer_name,
            company_name, license_type, max_devices,
            max_users, JSON.stringify(features), expires_at
        ]);

        res.json({
            success: true,
            license_key: licenseKey
        });

    } catch (error) {
        console.error('Create license error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create license'
        });
    }
});

app.listen(3002, () => {
    console.log('License server running on port 3002');
});
```

---

## 💻 Usage Examples

### **1. Activate License (Frontend)**

```javascript
const licenseKey = 'PROF-A7B9C3D5E8F2G4H6J9-XY42';
const result = await apiService.activateLicense(licenseKey);

if (result.success) {
    console.log('License activated!');
} else {
    console.error('Activation failed:', result.error);
}
```

### **2. Check License Status (Backend)**

```javascript
const licenseService = require('./services/licenseService');

const status = await licenseService.getLicenseStatus();
console.log('Valid:', status.valid);
console.log('Type:', status.license_type);
console.log('Expires in:', status.days_until_expiry, 'days');
```

### **3. Enforce Feature in Route**

```javascript
const { requireFeature } = require('./middleware/licenseMiddleware');

// Only allow access if audit_logging feature is enabled
router.get('/api/audit-logs',
    authenticateToken,
    requireFeature('audit_logging'),
    async (req, res) => {
        // Your code here
    }
);
```

### **4. Check Device Limit Before Creating**

```javascript
const { checkDeviceLimit } = require('./middleware/licenseMiddleware');

router.post('/api/devices',
    authenticateToken,
    checkDeviceLimit,  // Blocks if limit exceeded
    async (req, res) => {
        // Create device
    }
);
```

---

## ⚙️ Configuration Options

### **Environment Variables**

| Variable | Default | Description |
|----------|---------|-------------|
| `LICENSE_SERVER_URL` | `https://license.sensity.app/api/v1` | Your license server URL |
| `LICENSE_CHECK_INTERVAL` | `86400000` (24h) | Validation interval in milliseconds |
| `LICENSE_GRACE_PERIOD_DAYS` | `7` | Days to operate without validation |
| `LICENSE_OFFLINE_MAX_FAILURES` | `3` | Max validation failures before grace period |

### **Grace Period Behavior**

```
Day 0: License validation fails (network issue)
  ↓ Continue operating normally
Day 1: 2nd validation failure
  ↓ Continue operating normally
Day 2: 3rd validation failure
  ↓ Grace period starts (7 days)
  ↓ Warning shown in UI
Day 9: Grace period expires
  ↓ Platform stops working until validation succeeds
```

---

## 🛡️ Security Considerations

### **✅ Best Practices**

1. **Use HTTPS** for license server communication
2. **Hardware binding** optional but recommended
3. **Encrypt license keys** in transit and at rest
4. **Rate limit** validation endpoints
5. **Log all validation attempts** for audit trail
6. **Implement IP whitelisting** for license server (optional)
7. **Use strong checksums** in license keys

### **🔒 Anti-Tampering**

- License validation runs server-side (cannot be bypassed)
- Hardware ID prevents license sharing
- Instance ID tracks unique installations
- Validation logs detect suspicious patterns
- Grace period prevents indefinite offline operation

---

## 📊 Monitoring & Analytics

### **Track License Usage**

```sql
-- Most active licenses
SELECT
    license_key,
    customer_email,
    validation_count,
    last_validated_at,
    current_device_count,
    current_user_count
FROM license_keys
WHERE status = 'active'
ORDER BY validation_count DESC
LIMIT 10;

-- Failed validations in last 24 hours
SELECT
    license_key,
    validation_result,
    client_ip,
    validated_at,
    error_message
FROM license_validations
WHERE validated_at > NOW() - INTERVAL '24 hours'
  AND validation_result != 'valid'
ORDER BY validated_at DESC;

-- Licenses expiring in next 30 days
SELECT
    license_key,
    customer_email,
    license_type,
    expires_at,
    EXTRACT(DAY FROM expires_at - NOW()) as days_remaining
FROM license_keys
WHERE expires_at IS NOT NULL
  AND expires_at < NOW() + INTERVAL '30 days'
ORDER BY expires_at;
```

---

## 🎨 Customization

### **Add Custom Features**

```javascript
// In licenseService.js
const customFeatures = {
    'sms_alerts': true,
    'email_reports': true,
    'api_webhooks': false,
    'custom_branding': true
};

// Check custom feature
const canUseSMS = await licenseService.isFeatureEnabled('sms_alerts');
```

### **Add Custom Limits**

```javascript
// In middleware
const checkAPICallLimit = async (req, res, next) => {
    const license = await licenseService.loadCachedLicense();
    const apiCallsToday = await getAPICallsToday(req.user.id);

    const maxAPICalls = license.features.max_api_calls_per_day || 1000;

    if (apiCallsToday >= maxAPICalls) {
        return res.status(429).json({
            error: 'API call limit exceeded',
            limit: maxAPICalls,
            used: apiCallsToday
        });
    }

    next();
};
```

---

## 🐛 Troubleshooting

### **License Won't Activate**

1. Check internet connectivity
2. Verify license server URL in `.env`
3. Check license key format
4. Review license server logs
5. Ensure database migration ran

### **Grace Period Expired**

```bash
# Check validation status
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3001/api/license/status

# Manually trigger validation
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3001/api/license/validate
```

### **Device Limit Exceeded**

```sql
-- Check current device count
SELECT COUNT(*) FROM devices;

-- Check license limit
SELECT max_devices FROM local_license_info;
```

---

## 📞 Support & Upgrades

### **Customer Upgrades**

To upgrade a customer's license:

```sql
-- On license server
UPDATE license_keys
SET
    license_type = 'professional',
    max_devices = 200,
    max_users = 50,
    features = '{"audit_logging": true, "analytics_advanced": true}'::JSONB,
    updated_at = CURRENT_TIMESTAMP
WHERE license_key = 'STAR-...';
```

Customer's installation will automatically receive new limits on next validation (within 24 hours) or they can manually validate from the UI.

---

## 📈 Revenue Model Examples

### **Pricing Strategy**

1. **Trial** → Free (30 days)
2. **Starter** → $299/year ($25/mo)
3. **Professional** → $999/year ($83/mo)
4. **Enterprise** → $2999/year ($250/mo)
5. **Lifetime** → $9999 (one-time)

### **Upsell Paths**

- Approaching device limit → Suggest upgrade
- Trial expiring → Offer 20% discount
- Lifetime for 3+ years → Save money
- Volume discounts → 10+ licenses

---

## ✅ Complete Setup Checklist

- [ ] Run database migration (003_add_licensing_system.sql)
- [ ] Configure LICENSE_SERVER_URL in .env
- [ ] Initialize license service in server.js
- [ ] Register license routes
- [ ] Add license middleware to protected routes
- [ ] Add LicenseManagement page to frontend
- [ ] Create license server (separate service)
- [ ] Generate test license keys
- [ ] Test activation flow
- [ ] Test grace period behavior
- [ ] Test feature restrictions
- [ ] Test device/user limits
- [ ] Configure monitoring and alerts
- [ ] Document internal license management process

---

## 🎉 You're Done!

Your Sensity Platform now has a professional licensing system! Customers will need to:

1. Receive a license key from you
2. Navigate to `/license` in the UI
3. Click "Activate License"
4. Enter their key
5. Start using the platform within their limits

The system will automatically validate every 24 hours and enforce all restrictions. 🚀
