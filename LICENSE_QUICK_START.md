# 🚀 Licensing System - Quick Start Guide

## ✅ What Has Been Created

Your Sensity Platform now includes a **complete on-premise licensing system**! Here's what's been implemented:

### **📁 Files Created:**

1. **Database Schema**
   - `database/migrations/003_add_licensing_system.sql`
   - Tables: license_keys, license_validations, local_license_info, license_features

2. **Backend Services**
   - `backend/src/services/licenseService.js` - Core validation logic
   - `backend/src/middleware/licenseMiddleware.js` - Route protection
   - `backend/src/routes/license.js` - API endpoints

3. **Frontend UI**
   - `frontend/src/pages/LicenseManagement.jsx` - User interface
   - `frontend/src/services/api.js` - Updated with license methods

4. **Documentation**
   - `LICENSING_SYSTEM.md` - Complete guide
   - `LICENSE_QUICK_START.md` - This file!

---

## ⚡ 5-Minute Setup

### **Step 1: Run Database Migration**

```bash
cd /Users/martin.kadlcek/SensityDashboard
psql -U postgres -d esp8266_platform -f database/migrations/003_add_licensing_system.sql
```

### **Step 2: Configure Environment**

Add to `backend/.env`:

```bash
LICENSE_SERVER_URL=https://license.sensity.app/api/v1
LICENSE_CHECK_INTERVAL=86400000
LICENSE_GRACE_PERIOD_DAYS=7
LICENSE_OFFLINE_MAX_FAILURES=3
```

### **Step 3: Initialize License Service**

Edit `backend/server.js` and add near the top (after Express app creation):

```javascript
const licenseService = require('./src/services/licenseService');
const licenseRoutes = require('./src/routes/license');
const { addLicenseHeaders } = require('./src/middleware/licenseMiddleware');

// Initialize license service
(async () => {
    try {
        await licenseService.initialize();
        logger.info('License service started successfully');
    } catch (error) {
        logger.error('Failed to start license service:', error);
    }
})();

// Register license routes
app.use('/api/license', licenseRoutes);

// Add license info to response headers
app.use(addLicenseHeaders);
```

### **Step 4: Add Frontend Route**

Edit `frontend/src/App.jsx` and add:

```javascript
import LicenseManagement from './pages/LicenseManagement';

// In your Routes section:
<Route path="/license" element={<LicenseManagement />} />
```

### **Step 5: Restart Services**

```bash
# Restart backend
cd backend && npm run dev

# Restart frontend
cd frontend && npm start
```

### **Step 6: Test License Activation**

1. Navigate to `http://localhost:3000/license`
2. Click "Activate License"
3. Enter a test license key (you'll need to create one - see below)
4. Click "Activate"

---

## 🔑 Creating Test License Keys

For testing, you can create a license manually in the database:

```sql
-- Create a trial license (valid for 30 days)
INSERT INTO license_keys (
    license_key,
    customer_email,
    customer_name,
    license_type,
    max_devices,
    max_users,
    features,
    expires_at,
    status
) VALUES (
    'TRIAL-' || MD5(random()::text || CURRENT_TIMESTAMP::text)::VARCHAR(20),
    'test@example.com',
    'Test User',
    'trial',
    10,
    3,
    '{"audit_logging": false, "analytics_advanced": false, "white_label": false, "api_access": true}'::JSONB,
    CURRENT_TIMESTAMP + INTERVAL '30 days',
    'active'
) RETURNING license_key;
```

Copy the generated license_key and use it to activate!

---

## 🎯 Quick Feature Protection Examples

### **Protect Audit Logs (Require Professional+)**

Edit `backend/server.js`:

```javascript
const { requireFeature } = require('./src/middleware/licenseMiddleware');

// Add to your existing audit logs route
app.use('/api/audit-logs', requireFeature('audit_logging'));
```

### **Protect Device Creation (Enforce Limits)**

```javascript
const { checkDeviceLimit } = require('./src/middleware/licenseMiddleware');

// Add to device creation route
app.post('/api/devices',
    authenticateToken,
    checkDeviceLimit,  // Blocks if limit exceeded
    async (req, res) => {
        // Your existing device creation code
    }
);
```

### **Protect User Creation (Enforce Limits)**

```javascript
const { checkUserLimit } = require('./src/middleware/licenseMiddleware');

// Add to user creation route
app.post('/api/users',
    authenticateToken,
    checkUserLimit,  // Blocks if limit exceeded
    async (req, res) => {
        // Your existing user creation code
    }
);
```

---

## 🖥️ Setting Up Your License Server

You need a **separate license server** to validate keys. Here's a minimal setup:

### **Option 1: Quick Test Server (Development)**

Create `license-server.js`:

```javascript
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost/license_server'
});

app.post('/api/v1/licenses/validate', async (req, res) => {
    try {
        const { license_key, device_count, user_count } = req.body;

        // Validate license
        const result = await pool.query(
            'SELECT * FROM is_license_valid($1)',
            [license_key]
        );

        const validation = result.rows[0];

        if (!validation.valid) {
            return res.json({
                valid: false,
                message: validation.message
            });
        }

        // Check limits
        if (device_count > validation.max_devices ||
            user_count > validation.max_users) {
            return res.json({
                valid: false,
                message: 'Usage limit exceeded'
            });
        }

        // Update last validation
        await pool.query(
            'SELECT update_license_validation($1)',
            [license_key]
        );

        res.json({
            valid: true,
            license_type: validation.license_type,
            max_devices: validation.max_devices,
            max_users: validation.max_users,
            features: validation.features,
            expires_at: validation.expires_at
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ valid: false, message: 'Validation failed' });
    }
});

app.listen(3002, () => {
    console.log('License server running on port 3002');
});
```

Run it:
```bash
node license-server.js
```

Update your client's `.env`:
```bash
LICENSE_SERVER_URL=http://localhost:3002/api/v1
```

---

## 💡 Business Model Examples

### **Pricing Tiers**

| Tier | Price | Devices | Users | Features |
|------|-------|---------|-------|----------|
| **Trial** | Free | 10 | 3 | Basic |
| **Starter** | $299/yr | 50 | 10 | Standard |
| **Pro** | $999/yr | 200 | 50 | Advanced + Audit |
| **Enterprise** | $2999/yr | Unlimited | Unlimited | Everything + Support |

### **Revenue Scenarios**

- **100 Starter customers** = $29,900/year
- **50 Professional customers** = $49,950/year
- **10 Enterprise customers** = $29,990/year
- **Total potential** = $109,840/year

---

## ✅ Testing Checklist

- [ ] License activation works
- [ ] License status displays correctly
- [ ] Device limit enforced
- [ ] User limit enforced
- [ ] Feature flags work
- [ ] Expired license blocks access
- [ ] Grace period works (test by stopping license server)
- [ ] License validation logs created
- [ ] Usage statistics updated

---

## 🎨 Customization Ideas

### **Add More Features**

```javascript
// In license features JSON
{
    "audit_logging": true,
    "analytics_advanced": true,
    "white_label": true,
    "sms_alerts": true,           // NEW
    "email_reports": true,         // NEW
    "api_webhooks": true,          // NEW
    "custom_dashboards": true,     // NEW
    "priority_support": true       // NEW
}
```

### **Add More Limits**

```javascript
// Extend license schema
ALTER TABLE license_keys ADD COLUMN max_alerts_per_month INTEGER DEFAULT 1000;
ALTER TABLE license_keys ADD COLUMN max_api_calls_per_day INTEGER DEFAULT 10000;
ALTER TABLE license_keys ADD COLUMN max_data_retention_days INTEGER DEFAULT 90;
```

---

## 🆘 Troubleshooting

### **"No license configured"**

- Run the database migration
- Check that license_keys table exists
- Manually insert a test license (see above)

### **"Cannot reach license server"**

- Check LICENSE_SERVER_URL in .env
- Ensure license server is running
- Test with: `curl http://localhost:3002/api/v1/licenses/validate`

### **Grace period not working**

- Check LICENSE_GRACE_PERIOD_DAYS in .env
- Check local_license_info table has cached license
- Review validation_failures count

---

## 📚 Next Steps

1. **Deploy License Server** - Host on AWS, DigitalOcean, or Heroku
2. **Generate Real Keys** - Create license key generator script
3. **Integrate Payment** - Stripe, PayPal, or manual invoicing
4. **Build Admin Portal** - Manage licenses, customers, renewals
5. **Add Analytics** - Track usage, popular tiers, churn rate
6. **Create Marketing** - Landing page, pricing page, documentation
7. **Set Up Support** - Helpdesk for license issues

---

## 📖 Full Documentation

See [LICENSING_SYSTEM.md](LICENSING_SYSTEM.md) for:
- Complete architecture diagrams
- Security best practices
- Advanced configurations
- Monitoring queries
- Customer support procedures

---

## 🎉 You're Ready!

Your licensing system is now fully functional. You can:

✅ **Sell licenses** to customers
✅ **Enforce limits** automatically
✅ **Track usage** and renewals
✅ **Generate revenue** from on-premise installations

**Happy licensing!** 🚀💰
