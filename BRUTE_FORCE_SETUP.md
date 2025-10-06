# 🛡️ Brute Force Protection - Setup Guide

Comprehensive brute force protection system for Sensity with account lockout, IP blocking, and progressive delays.

## 🎯 Features

### Multi-Layer Protection
- ✅ **Account Lockout**: Lock accounts after 5 failed attempts (30 min lockout)
- ✅ **IP Blocking**: Block IPs after 10 failed attempts (1 hour ban)
- ✅ **Progressive Delays**: Exponentially slow down responses after failures
- ✅ **CAPTCHA Requirement**: Require CAPTCHA after 3 failed attempts
- ✅ **Distributed Attack Detection**: Detect attacks from multiple IPs
- ✅ **Real-time Monitoring**: Track ongoing attacks and threats

### Security Features
- 🔐 Failed attempt tracking in database
- 🚀 Fast Redis-based rate limiting
- 📊 Comprehensive security dashboard
- 🔔 Suspicious activity alerts
- ⚙️ Admin controls to unlock accounts/IPs
- 📈 Detailed statistics and threat assessment

## 📦 Installation

### Step 1: Integrate Middleware into Auth Routes

Edit `backend/src/routes/auth.js`:

```javascript
// Add import at the top
const { bruteForceProtection } = require('../middleware/bruteForceProtection');

// Apply to login route (BEFORE the route handler)
router.post('/login', [
    bruteForceProtection,  // Add this line
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;

        // Find user
        const result = await db.query(
            'SELECT id, email, password_hash, role, full_name, preferred_language FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            // Record failed attempt
            await req.bruteForce.recordFailure('user_not_found');
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            // Record failed attempt
            await req.bruteForce.recordFailure('invalid_password');
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Clear failed attempts on successful login
        await req.bruteForce.clearAttempts();

        // Generate JWT token (existing code)
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        logger.info(`User logged in: ${email}`);

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                fullName: user.full_name,
                full_name: user.full_name,
                preferred_language: user.preferred_language
            }
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});
```

### Step 2: Add Security Routes

Edit `backend/server.js`:

```javascript
// Add with other route imports
const securityRoutes = require('./src/routes/security');

// Add with other route registrations
app.use('/api/security', securityRoutes);
```

### Step 3: Verify Redis is Running

The brute force protection uses Redis for fast rate limiting:

```bash
# Check if Redis is running
redis-cli ping

# If not installed, install Redis
sudo apt install redis-server  # Ubuntu/Debian
brew install redis             # macOS

# Start Redis
sudo systemctl start redis-server  # Linux
brew services start redis          # macOS
```

### Step 4: Configure Protection Settings (Optional)

Edit `backend/src/middleware/bruteForceProtection.js` to adjust thresholds:

```javascript
const CONFIG = {
    MAX_FAILED_ATTEMPTS: 5,         // Change from 5 to your preference
    LOCKOUT_DURATION: 30 * 60,      // 30 minutes (in seconds)
    MAX_ATTEMPTS_PER_IP: 10,        // Max attempts from single IP
    IP_BAN_DURATION: 60 * 60,       // 1 hour IP ban
    CAPTCHA_AFTER_ATTEMPTS: 3,      // Require CAPTCHA after X attempts
    // ... other settings
};
```

### Step 5: Restart Application

```bash
pm2 restart esp8266-backend
# or
npm run dev
```

## 🧪 Testing

### Test Account Lockout

```bash
# Try logging in with wrong password 5 times
for i in {1..5}; do
  curl -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrongpassword"}'
  echo "\nAttempt $i"
done

# 6th attempt should show account locked
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrongpassword"}'

# Response:
# {
#   "error": "Account temporarily locked",
#   "message": "Too many failed login attempts. Please try again in 30 minute(s).",
#   "remainingTime": 1800,
#   "locked": true
# }
```

### Test IP Blocking

```bash
# Try multiple different accounts from same IP
for email in user1 user2 user3 user4 user5 user6 user7 user8 user9 user10 user11; do
  curl -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email@example.com\",\"password\":\"wrong\"}"
done

# Should get IP blocked response:
# {
#   "error": "Too many requests",
#   "message": "Your IP has been temporarily blocked...",
#   "ipBlocked": true
# }
```

### Test Progressive Delay

```bash
# First attempt - fast response
time curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}'

# Second attempt - 1 second delay
time curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}'

# Third attempt - 2 second delay
time curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}'

# Fourth attempt - 4 second delay
# Fifth attempt - 8 second delay
```

## 📊 Admin Dashboard

### View Security Statistics

```http
GET /api/security/brute-force/stats
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "summary": {
    "total_failed_attempts": 145,
    "unique_emails": 12,
    "unique_ips": 23,
    "locked_accounts": 3,
    "last_hour": 15,
    "last_24h": 89
  },
  "topTargets": [
    { "email": "admin@example.com", "attempts": 45 }
  ],
  "topAttackers": [
    { "ip_address": "203.0.113.0", "attempts": 67, "targets": 15 }
  ]
}
```

### View Locked Accounts

```http
GET /api/security/locked-accounts
Authorization: Bearer <admin_token>
```

### View Blocked IPs

```http
GET /api/security/blocked-ips
Authorization: Bearer <admin_token>
```

### Unlock an Account

```http
POST /api/security/unlock-account
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### Unblock an IP

```http
POST /api/security/unblock-ip
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "ip_address": "203.0.113.0"
}
```

### Active Threats (Real-time)

```http
GET /api/security/active-threats
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "ongoing_attacks": [
    {
      "ip_address": "203.0.113.0",
      "attempts": 15,
      "unique_targets": 8,
      "last_attempt": "2025-10-07T10:35:00Z",
      "targeted_emails": ["admin@...", "user1@..."]
    }
  ],
  "attacked_accounts": [
    {
      "email": "admin@example.com",
      "attempts": 12,
      "unique_ips": 5,
      "last_attempt": "2025-10-07T10:35:00Z"
    }
  ],
  "threat_level": "high"
}
```

## 🎨 Frontend Integration

### Update Login Form

Edit `frontend/src/pages/Login.jsx`:

```jsx
import { useState } from 'react';
import toast from 'react-hot-toast';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [requiresCaptcha, setRequiresCaptcha] = useState(false);
    const [lockoutInfo, setLockoutInfo] = useState(null);

    const handleLogin = async (e) => {
        e.preventDefault();

        try {
            const response = await api.post('/auth/login', {
                email,
                password
            });

            // Success - store token
            localStorage.setItem('token', response.data.token);
            navigate('/dashboard');
        } catch (error) {
            if (error.response?.status === 429) {
                // Account locked or IP blocked
                const data = error.response.data;

                if (data.locked) {
                    const minutes = Math.ceil(data.remainingTime / 60);
                    setLockoutInfo({
                        type: 'account',
                        message: `Account locked. Try again in ${minutes} minutes.`,
                        remainingTime: data.remainingTime
                    });
                    toast.error(`Account locked for ${minutes} minutes`);
                } else if (data.ipBlocked) {
                    const minutes = Math.ceil(data.remainingTime / 60);
                    setLockoutInfo({
                        type: 'ip',
                        message: `IP blocked. Try again in ${minutes} minutes.`,
                        remainingTime: data.remainingTime
                    });
                    toast.error(`IP temporarily blocked`);
                } else if (data.requiresCaptcha) {
                    setRequiresCaptcha(true);
                    toast.error('Please complete CAPTCHA verification');
                }
            } else {
                toast.error(error.response?.data?.error || 'Login failed');
            }
        }
    };

    return (
        <form onSubmit={handleLogin}>
            <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
            />
            <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
            />

            {/* Show CAPTCHA if required */}
            {requiresCaptcha && (
                <div className="captcha-container">
                    {/* Add your CAPTCHA component here */}
                    <p className="text-sm text-orange-600">
                        CAPTCHA verification required after multiple failed attempts
                    </p>
                </div>
            )}

            {/* Show lockout message */}
            {lockoutInfo && (
                <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
                    <p className="text-red-800 text-sm">{lockoutInfo.message}</p>
                </div>
            )}

            <button type="submit" disabled={lockoutInfo !== null}>
                Login
            </button>
        </form>
    );
};
```

### Create Security Dashboard (Admin)

Create `frontend/src/pages/SecurityDashboard.jsx`:

```jsx
import { useState, useEffect } from 'react';
import api from '../services/api';
import { Shield, AlertTriangle, Lock, Ban } from 'lucide-react';

const SecurityDashboard = () => {
    const [stats, setStats] = useState(null);
    const [lockedAccounts, setLockedAccounts] = useState([]);
    const [blockedIPs, setBlockedIPs] = useState([]);
    const [threats, setThreats] = useState(null);

    useEffect(() => {
        fetchSecurityData();
        const interval = setInterval(fetchSecurityData, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    const fetchSecurityData = async () => {
        try {
            const [statsRes, accountsRes, ipsRes, threatsRes] = await Promise.all([
                api.get('/security/brute-force/stats'),
                api.get('/security/locked-accounts'),
                api.get('/security/blocked-ips'),
                api.get('/security/active-threats')
            ]);

            setStats(statsRes.data);
            setLockedAccounts(accountsRes.data.locked_accounts);
            setBlockedIPs(ipsRes.data.blocked_ips);
            setThreats(threatsRes.data);
        } catch (error) {
            console.error('Failed to fetch security data:', error);
        }
    };

    const handleUnlockAccount = async (email) => {
        try {
            await api.post('/security/unlock-account', { email });
            toast.success('Account unlocked');
            fetchSecurityData();
        } catch (error) {
            toast.error('Failed to unlock account');
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
                <Shield className="w-8 h-8" />
                Security Dashboard
            </h1>

            {/* Threat Level */}
            {threats && (
                <div className={`p-4 rounded-lg mb-6 ${
                    threats.threat_level === 'high' ? 'bg-red-100 border-red-300' :
                    threats.threat_level === 'medium' ? 'bg-yellow-100 border-yellow-300' :
                    'bg-green-100 border-green-300'
                } border-2`}>
                    <div className="flex items-center gap-2">
                        <AlertTriangle className={`w-6 h-6 ${
                            threats.threat_level === 'high' ? 'text-red-600' :
                            threats.threat_level === 'medium' ? 'text-yellow-600' :
                            'text-green-600'
                        }`} />
                        <span className="font-semibold">
                            Threat Level: {threats.threat_level.toUpperCase()}
                        </span>
                    </div>
                    {threats.ongoing_attacks.length > 0 && (
                        <p className="mt-2 text-sm">
                            {threats.ongoing_attacks.length} ongoing attack(s) detected
                        </p>
                    )}
                </div>
            )}

            {/* Statistics Grid */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white p-4 rounded-lg shadow">
                        <div className="text-sm text-gray-600">Failed Attempts (24h)</div>
                        <div className="text-2xl font-bold">{stats.summary.last_24h}</div>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow">
                        <div className="text-sm text-gray-600">Locked Accounts</div>
                        <div className="text-2xl font-bold text-red-600">
                            {lockedAccounts.length}
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow">
                        <div className="text-sm text-gray-600">Blocked IPs</div>
                        <div className="text-2xl font-bold text-orange-600">
                            {blockedIPs.length}
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow">
                        <div className="text-sm text-gray-600">Unique Attackers</div>
                        <div className="text-2xl font-bold">{stats.summary.unique_ips}</div>
                    </div>
                </div>
            )}

            {/* Locked Accounts Table */}
            <div className="bg-white rounded-lg shadow mb-6 p-4">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Lock className="w-5 h-5" />
                    Locked Accounts
                </h2>
                <table className="min-w-full">
                    <thead>
                        <tr className="border-b">
                            <th className="text-left p-2">Email</th>
                            <th className="text-left p-2">Attempts</th>
                            <th className="text-left p-2">Last Attempt</th>
                            <th className="text-left p-2">Remaining Time</th>
                            <th className="text-left p-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lockedAccounts.map(account => (
                            <tr key={account.email} className="border-b">
                                <td className="p-2">{account.email}</td>
                                <td className="p-2">{account.total_attempts}</td>
                                <td className="p-2">
                                    {new Date(account.last_attempt).toLocaleString()}
                                </td>
                                <td className="p-2">
                                    {Math.ceil(account.remaining_time / 60)} min
                                </td>
                                <td className="p-2">
                                    <button
                                        onClick={() => handleUnlockAccount(account.email)}
                                        className="text-blue-600 hover:underline"
                                    >
                                        Unlock
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Similar tables for Blocked IPs and Active Threats */}
        </div>
    );
};

export default SecurityDashboard;
```

## ⚙️ Configuration

### Adjust Protection Levels

Edit `backend/src/middleware/bruteForceProtection.js`:

```javascript
const CONFIG = {
    // Stricter (more secure):
    MAX_FAILED_ATTEMPTS: 3,         // Lock after 3 attempts
    LOCKOUT_DURATION: 60 * 60,      // 1 hour lockout
    MAX_ATTEMPTS_PER_IP: 5,         // 5 attempts per IP

    // More lenient (better UX):
    MAX_FAILED_ATTEMPTS: 10,        // Lock after 10 attempts
    LOCKOUT_DURATION: 15 * 60,      // 15 minute lockout
    MAX_ATTEMPTS_PER_IP: 20,        // 20 attempts per IP
};
```

### Disable Progressive Delays

```javascript
const CONFIG = {
    USE_PROGRESSIVE_DELAYS: false,  // Set to false
    // ...
};
```

## 🔔 Monitoring & Alerts

### Set Up Alert Notifications

Edit `backend/src/middleware/bruteForceProtection.js`:

```javascript
async function checkSuspiciousActivity(email, ipAddress) {
    // ... existing code ...

    if (ipCount >= CONFIG.SUSPICIOUS_IPS_THRESHOLD) {
        logger.error('SECURITY ALERT: Distributed brute force attack', {
            email,
            uniqueIPs: ipCount
        });

        // Send alert email to admins
        await emailService.send({
            to: process.env.ADMIN_EMAIL,
            subject: 'SECURITY ALERT: Brute Force Attack Detected',
            text: `Distributed attack detected on account: ${email}\n` +
                  `Unique IPs: ${ipCount}\n` +
                  `Current IP: ${ipAddress}`
        });
    }
}
```

## 📈 Best Practices

1. **Monitor Daily**: Check security dashboard daily for unusual patterns
2. **Review Logs**: Regularly review failed login attempts
3. **Update Thresholds**: Adjust based on your user behavior
4. **Alert Admins**: Set up email alerts for high-threat situations
5. **User Communication**: Inform users why their account is locked
6. **Cleanup**: Regularly clean old failed attempts data

## 🐛 Troubleshooting

### Redis Connection Issues

```bash
# Check Redis status
systemctl status redis-server

# Test connection
redis-cli ping

# Check logs
tail -f /var/log/redis/redis-server.log
```

### Account Won't Unlock

```bash
# Manually unlock via Redis CLI
redis-cli
> DEL account_lock:user@example.com
> DEL ip_attempts:192.168.1.1

# Or via API
curl -X POST http://localhost:3001/api/security/unlock-account \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

### Progressive Delays Too Slow

Reduce delay settings in CONFIG or disable:
```javascript
USE_PROGRESSIVE_DELAYS: false
```

## 📊 Security Metrics

Monitor these key metrics:
- Failed attempts per hour/day
- Locked accounts count
- Blocked IPs count
- Average time to lockout
- Repeat offenders (same IP attacking multiple accounts)
- Distributed attacks (multiple IPs, same account)

---

**Questions?** Check the main documentation or open an issue on GitHub.

**Security Tip**: Combine with strong password policies and 2FA for maximum protection!
