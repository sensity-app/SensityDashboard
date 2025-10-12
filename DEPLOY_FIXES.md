# Deploy Critical Fixes to Production

**Date**: 2025-10-12
**Commit**: `1cdf81a`
**Issues Fixed**:
- ✅ React error #310 preventing /devices page from loading
- ✅ System information showing "unknown" (added better diagnostics)

---

## What Was Fixed

### 1. React Error #310 - Device Management Page Not Loading

**Problem**: The `/devices` page was crashing with React error #310 (minified).

**Root Cause**: `filteredDevices` was created as a new array on every render without `useMemo`, causing unstable dependencies in the useEffect hook.

**Fix**: Wrapped `filteredDevices` in `useMemo` with proper dependencies:
```javascript
const filteredDevices = useMemo(() => {
    return allDevices.filter(device => {
        // ... filtering logic
    });
}, [allDevices, filterStatus, filterType, filterLocation, filterGroup, filterTag, searchQuery]);
```

**File Changed**: `frontend/src/pages/DeviceManagement.jsx`

---

### 2. System Information Showing "Unknown"

**Problem**: Settings page showing "Unknown" for:
- Version
- Uptime
- Node.js Version
- System Status

**Diagnostic Added**: Enhanced logging to help identify the issue on production:
```javascript
logger.debug('Git detection:', {
    cwd: process.cwd(),
    gitRoot,
    hasBackendInPath: process.cwd().includes('/backend')
});
```

**File Changed**: `backend/src/routes/system.js`

---

## Deployment Steps

### Option 1: Quick Deploy (Recommended)

```bash
# SSH to production server
ssh root@notino.sensity.app

# Navigate to project
cd /root/SensityDashboard  # or wherever your project is

# Pull latest changes
git pull origin main

# Restart backend to apply changes
pm2 restart sensity-backend

# Check logs for git detection
pm2 logs sensity-backend | grep "Git detection"

# Verify fix
curl https://notino.sensity.app/api/system/info
```

### Option 2: Full Deployment with Frontend Rebuild

```bash
# SSH to production server
ssh root@notino.sensity.app

# Navigate to project
cd /root/SensityDashboard

# Pull latest changes
git pull origin main

# Rebuild frontend
cd frontend
npm install  # Only if package.json changed
npm run build

# Restart backend
cd ..
pm2 restart sensity-backend

# Restart frontend (if using PM2)
pm2 restart sensity-frontend

# Or restart Nginx if serving static files
systemctl restart nginx
```

### Option 3: Manual File Copy (If Git Not Working)

If git is not working on production, you can manually copy the fixed files:

```bash
# From your local machine, copy the fixed files
scp frontend/src/pages/DeviceManagement.jsx root@notino.sensity.app:/root/SensityDashboard/frontend/src/pages/
scp backend/src/routes/system.js root@notino.sensity.app:/root/SensityDashboard/backend/src/routes/

# SSH to server
ssh root@notino.sensity.app

# Rebuild frontend
cd /root/SensityDashboard/frontend
npm run build

# Restart backend
pm2 restart sensity-backend
```

---

## Verification Steps

### 1. Test Device Management Page

```bash
# Open in browser:
https://notino.sensity.app/devices

# Should load without errors
# No React error #310 in browser console
```

### 2. Test System Information

```bash
# Open in browser:
https://notino.sensity.app/settings

# Click "System" tab
# Should show:
# - Running status
# - Actual uptime (not "Unknown")
# - Node.js version
# - Git commit/branch/date
```

### 3. Check Backend Logs

```bash
# View logs on production server
pm2 logs sensity-backend

# Look for:
# "Git detection:" - Shows cwd, gitRoot paths
# "Git commit detected:" - Shows detected commit
# "Git branch detected:" - Shows detected branch
# "Git date detected:" - Shows detected date

# If you see warnings:
# "Git information not available:" - Check the error details
```

### 4. API Test

```bash
# Test system info API directly
curl https://notino.sensity.app/api/system/info

# Should return JSON with:
# - nodeVersion: "v18.x.x" (not "Unknown")
# - uptime: number (not "Unknown")
# - version.commit: "1cdf81a" (not "unknown")
# - version.branch: "main" (not "unknown")
# - version.date: ISO date (not "unknown")
```

---

## Troubleshooting

### Issue: Git still showing "unknown" after deployment

**Possible causes**:
1. Git not installed on production server
2. .git directory missing or permissions issue
3. Running from wrong directory

**Check git availability**:
```bash
# SSH to server
ssh root@notino.sensity.app

# Check git is installed
git --version

# Check .git directory exists
ls -la /root/SensityDashboard/.git

# Test git commands from project root
cd /root/SensityDashboard
git rev-parse HEAD
git rev-parse --abbrev-ref HEAD

# Test git commands from backend directory
cd /root/SensityDashboard/backend
git rev-parse HEAD  # Should work now with fix
```

**View debug logs**:
```bash
# Check PM2 logs for git detection
pm2 logs sensity-backend --lines 100 | grep -A 5 "Git detection"

# Should show:
# Git detection: { cwd: '/root/SensityDashboard/backend', gitRoot: '/root/SensityDashboard', hasBackendInPath: true }
# Git commit detected: 1cdf81a
# Git branch detected: main
# Git date detected: 2025-10-12...
```

### Issue: Device page still showing error

**Check browser console**:
1. Open https://notino.sensity.app/devices
2. Open browser DevTools (F12)
3. Go to Console tab
4. Look for any React errors

**Check if frontend was rebuilt**:
```bash
# SSH to server
ssh root@notino.sensity.app

# Check build timestamp
ls -lh /root/SensityDashboard/frontend/build/static/js/main.*.js

# Should be recent (after deployment)
```

**Force browser cache refresh**:
- Press Ctrl+Shift+R (Windows/Linux)
- Press Cmd+Shift+R (Mac)

### Issue: PM2 not restarting

```bash
# Check PM2 status
pm2 status

# If not running, start it
pm2 start ecosystem.config.js

# Or start manually
cd /root/SensityDashboard/backend
pm2 start src/server.js --name sensity-backend

# Save PM2 configuration
pm2 save
```

---

## Expected Results After Deployment

### ✅ Working /devices Page
- Page loads without errors
- Device list displays correctly
- Filters work (status, type, location, group, tag)
- Search works
- No React errors in browser console

### ✅ Working /settings Page
- System tab shows correct information:
  - **Status**: "Running" (green)
  - **Uptime**: Actual uptime (e.g., "2 days, 14 hours")
  - **Version**: Git commit (e.g., "1cdf81a")
  - **Node.js Version**: Actual version (e.g., "v18.19.0")
  - **Platform**: Linux x64
  - **Memory**: Actual usage
  - **CPU**: Actual count

### ✅ Clean Logs
```bash
pm2 logs sensity-backend

# Should see:
✅ Git detection: { cwd: '/root/SensityDashboard/backend', gitRoot: '/root/SensityDashboard', hasBackendInPath: true }
✅ Git commit detected: 1cdf81a
✅ Git branch detected: main
✅ Git date detected: 2025-10-12T...

# Should NOT see:
❌ Git information not available
❌ React error #310
❌ Minified React error
```

---

## Rollback (If Needed)

If the deployment causes issues, you can rollback:

```bash
# SSH to server
ssh root@notino.sensity.app
cd /root/SensityDashboard

# Rollback to previous commit
git log --oneline -5  # Find previous commit
git reset --hard PREVIOUS_COMMIT_HASH

# Rebuild frontend
cd frontend
npm run build

# Restart backend
pm2 restart sensity-backend
```

---

## Post-Deployment Checklist

- [ ] SSH to production server
- [ ] Pull latest changes from git
- [ ] Restart backend with PM2
- [ ] Test /devices page loads without errors
- [ ] Test /settings page shows correct system info
- [ ] Check PM2 logs for git detection
- [ ] Test API endpoint: `curl https://notino.sensity.app/api/system/info`
- [ ] Verify browser console has no React errors
- [ ] Check that filters and search work on /devices
- [ ] Verify system information is accurate (not "unknown")

---

## Files Changed in This Deploy

| File | Changes | Impact |
|------|---------|--------|
| `frontend/src/pages/DeviceManagement.jsx` | Wrapped filteredDevices in useMemo | Fixes React error #310, prevents crashes |
| `backend/src/routes/system.js` | Added debug logging for git detection | Helps diagnose system info issues |

---

## Next Steps After Deployment

1. **Monitor logs** for the next few hours:
   ```bash
   pm2 logs sensity-backend -f
   ```

2. **Test thoroughly**:
   - Try all filters on /devices page
   - Test search functionality
   - Verify system information updates
   - Check that performance is good

3. **If system info still shows "unknown"**:
   - Check the debug logs in PM2
   - Verify .git directory exists
   - Ensure git commands work from backend directory
   - Consider setting environment variables as fallback

4. **Report back**:
   - ✅ /devices page working?
   - ✅ /settings showing correct info?
   - ✅ Any errors in logs?

---

**Deployment Command (Quick)**:
```bash
ssh root@notino.sensity.app 'cd /root/SensityDashboard && git pull && pm2 restart sensity-backend'
```

---

**Questions?**
- Check PM2 logs: `pm2 logs sensity-backend`
- Test API: `curl https://notino.sensity.app/api/system/info`
- Browser console for frontend errors

**Status**: Ready to deploy! 🚀
