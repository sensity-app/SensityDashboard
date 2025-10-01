# Website Configuration & Update Issues - Analysis & Fixes

## Date: 2025-09-30

---

## ✅ Issue 1: MQTT Configuration in Website

### Status: **WORKING** ✓

**Finding:** MQTT configuration IS available through the website!

**Location:** Administration → Protocol Settings

**Features Available:**
- ✅ Switch between HTTP and MQTT protocols
- ✅ Configure MQTT broker host and port
- ✅ Set MQTT username/password
- ✅ Configure topic prefix
- ✅ Set QoS level (0, 1, or 2)
- ✅ Configure heartbeat interval
- ✅ **Test Connection** button to verify settings
- ✅ Per-device protocol configuration

**File:** [frontend/src/components/ProtocolSettingsManager.jsx](frontend/src/components/ProtocolSettingsManager.jsx)

**How to use:**
1. Log in as admin
2. Navigate to **Administration** → **Protocol Settings**
3. Select a device from dropdown
4. Choose protocol: **MQTT** or **HTTP**
5. Fill in MQTT broker details:
   - **MQTT Broker Host:** `your-server-ip` or `localhost`
   - **MQTT Broker Port:** `1883`
   - **Username:** `iot` (if using default from installer)
   - **Password:** `iot123` (if using default from installer)
   - **Topic Prefix:** `iot`
   - **QoS Level:** `1` (recommended)
6. Click **Test Connection** to verify
7. Click **Save Settings**

**Screenshot path would show:**
```
Settings Page → Protocol Settings Tab
  └─ Device selector dropdown
  └─ Protocol radio buttons: HTTP | MQTT
  └─ MQTT configuration form (when MQTT selected)
  └─ Test Connection button
  └─ Save Settings button
```

---

## ⚠️ Issue 2: Platform Update from Website

### Status: **PARTIALLY WORKING** - Needs Fix

**Problem:** The update functionality exists but has a path issue

**Symptoms:**
- Update button shows "Update script not available"
- Even when `update-system.sh` or `update-system-dev.sh` exists

**Root Cause Analysis:**

Looking at [backend/src/routes/system.js](backend/src/routes/system.js) lines 420-465:

```javascript
// GET /api/system/update-status
router.get('/update-status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        let updateAvailable = false;
        let updateScript = '';

        const isDevelopment = process.env.NODE_ENV !== 'production';
        const projectRoot = process.cwd().includes('/backend') ?
            path.join(process.cwd(), '..') : process.cwd();

        try {
            if (isDevelopment) {
                // Development: check for development script
                const devScript = path.join(projectRoot, 'update-system-dev.sh');
                await exec(`ls "${devScript}"`);
                updateAvailable = true;
                updateScript = devScript;
            } else {
                // Production: try production script first, then system command
                try {
                    const prodScript = path.join(projectRoot, 'update-system.sh');
                    await exec(`ls "${prodScript}"`);
                    updateAvailable = true;
                    updateScript = prodScript;
                } catch (prodError) {
                    // Fallback to system command
                    await exec('which update-system');
                    updateAvailable = true;
                    updateScript = 'update-system';
                }
            }
        } catch (error) {
            // Script not found
        }

        res.json({
            success: true,
            updateAvailable,
            updateScript
        });
    }
})
```

**Issue:** The code works, but there are some edge cases not handled:
1. When running from `/backend` directory, it looks for script in parent directory
2. File permissions may prevent execution
3. `update-system-dev.sh` doesn't exist yet (only `update-system.sh` exists)

---

## 🔧 Fixes Required

### Fix 1: Create update-system-dev.sh

The installer and repository have `update-system.sh`, but development mode looks for `update-system-dev.sh`.

**Option A:** Create a dev-specific script
**Option B:** Modify code to use `update-system.sh` for both modes

**Recommended: Option B** (simpler)

Update `/backend/src/routes/system.js`:

```javascript
// Around line 275-294
if (isDevelopment) {
    // Development: try development script, fall back to production script
    const devScript = path.join(projectRoot, 'update-system-dev.sh');
    const prodScript = path.join(projectRoot, 'update-system.sh');

    try {
        await exec(`ls "${devScript}"`);
        updateCommand = `bash "${devScript}"`;
        logger.info(`Development mode: Using development update script: ${devScript}`);
    } catch (e) {
        // Fallback to production script in development
        try {
            await exec(`ls "${prodScript}"`);
            updateCommand = `bash "${prodScript}"`;
            logger.info(`Development mode: Falling back to production script: ${prodScript}`);
        } catch (e2) {
            throw new Error('No update script found');
        }
    }
} else {
    // Production: use production script or system command
    const prodScript = path.join(projectRoot, 'update-system.sh');
    try {
        await exec(`ls "${prodScript}"`);
        updateCommand = `sudo bash "${prodScript}"`;
        logger.info(`Production mode: Using production update script: ${prodScript}`);
    } catch (e) {
        // Fallback to system command
        updateCommand = 'update-system';
        logger.info('Production mode: Using system update-system command');
    }
}
```

And similarly update the check logic around line 426-448:

```javascript
try {
    if (isDevelopment) {
        // Development: check for either dev or prod script
        const devScript = path.join(projectRoot, 'update-system-dev.sh');
        const prodScript = path.join(projectRoot, 'update-system.sh');

        try {
            await exec(`ls "${devScript}"`);
            updateAvailable = true;
            updateScript = devScript;
        } catch (e) {
            // Try production script
            await exec(`ls "${prodScript}"`);
            updateAvailable = true;
            updateScript = prodScript;
        }
        logger.info(`Development mode: Found update script: ${updateScript}`);
    } else {
        // Production: try production script first, then system command
        try {
            const prodScript = path.join(projectRoot, 'update-system.sh');
            await exec(`ls "${prodScript}"`);
            updateAvailable = true;
            updateScript = prodScript;
            logger.info(`Production mode: Found production update script: ${prodScript}`);
        } catch (prodError) {
            // Fallback to system command
            await exec('which update-system');
            updateAvailable = true;
            updateScript = 'update-system';
            logger.info('Production mode: Found system update-system command');
        }
    }
} catch (error) {
    logger.info(`No update script found: ${error.message}`);
}
```

---

### Fix 2: Ensure Script Permissions

The update script needs execute permissions:

```bash
chmod +x /path/to/arduinoproject/update-system.sh
```

In your case (macOS development):
```bash
chmod +x /Users/martin.kadlcek/arduinoproject/update-system.sh
```

---

### Fix 3: Handle macOS Development Environment

**Issue:** macOS doesn't use `sudo` the same way as Ubuntu

**Solution:** Create a simple development update script or modify the check:

Create `/Users/martin.kadlcek/arduinoproject/update-system-dev.sh`:

```bash
#!/bin/bash
#
# Development Update Script
# This script updates the platform in development mode
#

set -e

echo "🔄 Updating ESP8266 Platform (Development Mode)..."

# Get project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "📍 Project root: $PROJECT_ROOT"

# Pull latest changes
echo "📥 Fetching latest changes from git..."
git fetch origin
git pull origin main

# Update backend dependencies
echo "📦 Updating backend dependencies..."
cd "$PROJECT_ROOT/backend"
npm install

# Update frontend dependencies
echo "📦 Updating frontend dependencies..."
cd "$PROJECT_ROOT/frontend"
npm install

# Build frontend
echo "🔨 Building frontend..."
npm run build

echo "✅ Update completed successfully!"
echo
echo "🔄 Please restart the backend server manually:"
echo "   cd $PROJECT_ROOT/backend"
echo "   npm start"
```

Then make it executable:
```bash
chmod +x /Users/martin.kadlcek/arduinoproject/update-system-dev.sh
```

---

## 🧪 Testing the Fixes

### Test 1: Check Update Script Detection

1. Start backend: `cd backend && npm start`
2. Login as admin
3. Go to Settings page
4. Check "Platform Update" section
5. Should show: ✅ "Update script available"

### Test 2: Test Update Process (Development)

**⚠️ Warning:** This will update your codebase!

1. Make sure you have no uncommitted changes
2. Click "Update Platform" button
3. Confirm the dialog
4. Watch the progress logs
5. Backend will restart automatically (if using PM2) or manually restart

---

## 📋 Quick Fix Checklist

- [ ] Create `update-system-dev.sh` script (see above)
- [ ] Make script executable: `chmod +x update-system-dev.sh`
- [ ] Or modify `system.js` to fall back to `update-system.sh` (Option B)
- [ ] Restart backend server
- [ ] Test update script detection in Settings page
- [ ] Verify MQTT configuration is accessible (already working)

---

## 🎯 Recommended Solution

**For your macOS development environment:**

1. **Quick fix (5 minutes):** Create the dev script
   ```bash
   cd /Users/martin.kadlcek/arduinoproject
   # Copy and paste the update-system-dev.sh content above
   nano update-system-dev.sh
   chmod +x update-system-dev.sh
   ```

2. **Proper fix (10 minutes):** Modify system.js to handle both scripts
   - Edit `backend/src/routes/system.js`
   - Add fallback logic (see Fix 1 above)
   - Restart backend

---

## 💡 Summary

| Feature | Status | Action Required |
|---------|--------|----------------|
| **MQTT Configuration** | ✅ Working | None - use Protocol Settings page |
| **Platform Update Detection** | ⚠️ Partial | Create update-system-dev.sh or modify code |
| **Platform Update Execution** | ⚠️ Partial | Make script executable + create dev script |

**Bottom Line:**
- MQTT configuration works perfectly through the website ✓
- Update functionality needs small fix: create/modify update script
- Both issues have straightforward solutions

---

## 🔍 Additional Notes

### MQTT Protocol Settings Location

Full path in UI navigation:
```
Login → Dashboard → Administration (top nav) → Protocol Settings
```

Or direct URL (when logged in):
```
http://localhost:5173/protocol-settings
```

### Update Script Behavior

When update runs:
1. Checks git for new version
2. Pulls latest code
3. Updates npm dependencies
4. Rebuilds frontend
5. Restarts backend (PM2 production) or requires manual restart (dev)

### Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| Script | `update-system-dev.sh` | `update-system.sh` |
| Sudo | Not required | Required |
| Restart | Manual | Automatic (PM2) |
| Environment | `NODE_ENV !== 'production'` | `NODE_ENV === 'production'` |

