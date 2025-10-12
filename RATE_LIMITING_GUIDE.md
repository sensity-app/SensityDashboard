# User-Based Rate Limiting System

## Overview

The Sensity Dashboard implements a sophisticated **per-user rate limiting system** using Redis for distributed rate limit tracking. Unlike traditional IP-based rate limiting, this system provides fair usage limits based on user roles and tracks limits across multiple server instances.

## Features

### 1. Role-Based Rate Limits
Different limits for different user roles:
- **Admin**: 2,000 requests per 15 minutes
- **User**: 500 requests per 15 minutes
- **Viewer**: 200 requests per 15 minutes
- **API**: 5,000 requests per 15 minutes (for API clients)
- **Guest**: 100 requests per 15 minutes (unauthenticated)

### 2. Endpoint-Specific Limits
More restrictive limits for sensitive operations:
- **Login**: 5 attempts per 15 minutes (1-hour block)
- **Export**: 10 exports per hour
- **Device Control**: 100 control actions per hour
- **Firmware Upload**: 20 uploads per hour

### 3. Automatic Blocking
- Users exceeding limits are automatically blocked
- Configurable block duration per endpoint/role
- Blocked users receive HTTP 429 with retry information

### 4. Admin Management
- View all blocked users
- Reset rate limits for specific users
- Real-time statistics dashboard
- Update rate limit configurations dynamically

### 5. Response Headers
Every API response includes rate limit information:
```
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 487
X-RateLimit-Reset: 1697123456789
Retry-After: 900 (when blocked)
```

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                      Client Request                      │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Express.js Server (Node.js)                │
│                                                           │
│  ┌───────────────────────────────────────────────────┐  │
│  │   UserRateLimiter Middleware                      │  │
│  │   - Identify user (userId or IP)                  │  │
│  │   - Determine role (admin, user, viewer, etc.)   │  │
│  │   - Check endpoint type (login, export, etc.)    │  │
│  │   - Query Redis for current count                 │  │
│  │   - Allow/Block request                            │  │
│  └───────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    Redis Cache                           │
│                                                           │
│  Keys:                                                   │
│  - ratelimit:user:123        → count: 45, TTL: 532s    │
│  - ratelimit:login:456       → count: 3, TTL: 620s     │
│  - ratelimit:user:123:blocked → timestamp, TTL: 900s   │
└─────────────────────────────────────────────────────────┘
```

### Key Generation Strategy

Rate limit keys follow this pattern:
```
ratelimit:{endpointType}:{userId}
ratelimit:{role}:{userId}
ratelimit:{endpointType}:{userId}:blocked
```

Examples:
- `ratelimit:user:john@example.com` - General user limit
- `ratelimit:login:192.168.1.10` - Login attempts from IP
- `ratelimit:export:john@example.com:blocked` - Blocked from exporting

## Implementation

### Backend Integration

#### 1. Server Setup (server.js)

```javascript
const UserRateLimiter = require('./src/middleware/userRateLimit');
const userRateLimiter = new UserRateLimiter(redis);

// Apply to all API routes
app.use('/api/', userRateLimiter.middleware());

// Or apply to specific routes with custom options
app.use('/api/auth/login', userRateLimiter.middleware({
    endpointType: 'login'
}));
```

#### 2. Rate Limit Middleware (userRateLimit.js)

The middleware automatically:
1. Extracts user ID from `req.user.id` (authenticated) or uses `req.ip` (guest)
2. Determines user role from `req.user.role`
3. Detects endpoint type from request path
4. Checks Redis for current usage
5. Increments counter or blocks request
6. Adds rate limit headers to response

#### 3. Admin Routes (routes/rateLimit.js)

Management endpoints:
- `GET /api/rate-limits/stats` - Overall statistics
- `GET /api/rate-limits/config` - Current configuration
- `GET /api/rate-limits/blocked` - List blocked users
- `GET /api/rate-limits/status/:userId` - User-specific status
- `POST /api/rate-limits/reset/:userId` - Reset user limit (admin)
- `PUT /api/rate-limits/config/:role` - Update role config (admin)
- `PUT /api/rate-limits/endpoint-config/:endpointType` - Update endpoint config

### Frontend Integration

#### 1. Admin Dashboard (RateLimitManagement.jsx)

React component providing:
- Real-time statistics cards
- Blocked users list with unblock action
- Rate limit configuration tables
- Auto-refresh every 10-30 seconds

```jsx
import RateLimitManagement from './pages/RateLimitManagement';

// Add to admin routes
<Route path="/admin/rate-limits" element={<RateLimitManagement />} />
```

#### 2. API Service (api.js)

Client-side methods:
```javascript
// Get statistics
const stats = await apiService.getRateLimitStats();

// Get blocked users
const blocked = await apiService.getBlockedUsers();

// Reset limit for user
await apiService.resetRateLimit(userId, role, endpointType);

// Update configuration
await apiService.updateRoleLimitConfig('user', {
    points: 1000,
    duration: 900,
    blockDuration: 1800
});
```

## Configuration

### Default Limits

#### Role Limits
```javascript
{
    admin: {
        points: 2000,       // 2000 requests
        duration: 900,      // per 15 minutes
        blockDuration: 900  // blocked for 15 minutes
    },
    user: {
        points: 500,
        duration: 900,
        blockDuration: 900
    },
    viewer: {
        points: 200,
        duration: 900,
        blockDuration: 900
    },
    api: {
        points: 5000,
        duration: 900,
        blockDuration: 1800
    },
    guest: {
        points: 100,
        duration: 900,
        blockDuration: 1800
    }
}
```

#### Endpoint Limits
```javascript
{
    login: {
        points: 5,
        duration: 900,       // 5 attempts per 15 min
        blockDuration: 3600  // blocked for 1 hour
    },
    export: {
        points: 10,
        duration: 3600,      // 10 exports per hour
        blockDuration: 3600
    },
    'device-control': {
        points: 100,
        duration: 3600,
        blockDuration: 1800
    },
    'firmware-upload': {
        points: 20,
        duration: 3600,
        blockDuration: 3600
    }
}
```

### Updating Configuration

#### Via Admin UI
1. Navigate to "Rate Limit Management" in admin panel
2. Click on any role or endpoint row
3. Edit values in modal
4. Save changes

#### Via API
```bash
# Update user role limit
curl -X PUT http://localhost:3000/api/rate-limits/config/user \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "points": 1000,
    "duration": 900,
    "blockDuration": 1800
  }'

# Update login endpoint limit
curl -X PUT http://localhost:3000/api/rate-limits/endpoint-config/login \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "points": 10,
    "duration": 900,
    "blockDuration": 3600
  }'
```

#### Programmatically
```javascript
// In server code
userRateLimiter.updateLimits('user', {
    points: 1000,
    duration: 3600
});

userRateLimiter.updateEndpointLimits('export', {
    points: 20,
    blockDuration: 7200
});
```

## Usage Examples

### Checking Rate Limit Status

```javascript
// Backend
const status = await userRateLimiter.getUserStatus('user123', 'user');
console.log(status);
/*
{
    userId: 'user123',
    userRole: 'user',
    isBlocked: false,
    requestCount: 342,
    limit: 500,
    remaining: 158,
    resetIn: 432,  // seconds
    blockedFor: 0
}
*/
```

### Resetting Rate Limit

```javascript
// Reset all limits for a user
await userRateLimiter.resetUserLimit('user123');

// Reset specific endpoint limit
await userRateLimiter.resetUserLimit('user123', 'user', 'export');
```

### Getting Blocked Users

```javascript
const blocked = await userRateLimiter.getBlockedUsers();
console.log(blocked);
/*
[
    {
        key: 'ratelimit:login:192.168.1.10:blocked',
        userId: '192.168.1.10',
        blockedFor: 2847  // seconds remaining
    },
    ...
]
*/
```

### Client-Side Handling

```javascript
// Handle rate limit in API calls
try {
    const response = await apiService.getDevices();
} catch (error) {
    if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'];
        toast.error(
            `Rate limit exceeded. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`
        );
    }
}
```

## Redis Keys

### Structure

```
ratelimit:user:john@example.com
├── Value: "487"              # Current request count
└── TTL: 532 seconds          # Time until reset

ratelimit:login:192.168.1.10
├── Value: "4"
└── TTL: 620 seconds

ratelimit:export:john@example.com:blocked
├── Value: "1697123456789"    # Timestamp of block
└── TTL: 3600 seconds         # Block duration
```

### Key Management

```bash
# View all rate limit keys
redis-cli KEYS "ratelimit:*"

# Check specific user
redis-cli GET "ratelimit:user:john@example.com"
redis-cli TTL "ratelimit:user:john@example.com"

# View blocked users
redis-cli KEYS "ratelimit:*:blocked"

# Manually unblock user
redis-cli DEL "ratelimit:user:john@example.com:blocked"

# Clear all rate limits (emergency)
redis-cli KEYS "ratelimit:*" | xargs redis-cli DEL
```

## Monitoring

### Metrics to Track

1. **Total blocked users** - High numbers may indicate limits are too strict
2. **Block frequency** - Sudden spikes may indicate attack
3. **Top blocked users** - Identify problematic users or bots
4. **Average requests per user** - Understand typical usage patterns
5. **Limit hit rate** - Percentage of users hitting limits

### Log Examples

```
[2025-10-12 10:15:23] INFO: Rate limit check - userId: john@example.com, role: user, remaining: 342
[2025-10-12 10:15:45] WARN: Rate limit exceeded - userId: attacker@bad.com, role: guest, endpointType: login, count: 5
[2025-10-12 10:15:45] WARN: User blocked due to rate limit - userId: attacker@bad.com, blockDuration: 3600
[2025-10-12 10:20:00] INFO: Rate limit reset by admin - adminId: admin@sensity.com, targetUserId: user123
```

### Alerts to Set Up

1. **High block rate**: > 10 users blocked per minute
2. **Repeated blocks**: Same user blocked > 3 times in 24h
3. **Redis connection failure**: Rate limiter fails open, log warning
4. **Unusual patterns**: Sudden spike in requests from single user/IP

## Security Considerations

### 1. Fail-Open vs Fail-Closed
Current implementation: **Fail-open**
- If Redis connection fails, requests are allowed
- Prevents denial of service if Redis goes down
- Trade-off: Temporary bypass during outages

### 2. User Identification
- Authenticated users: Use `req.user.id`
- Unauthenticated: Use `req.ip`
- Consider using both for tighter security

### 3. Distributed Systems
- Redis ensures limits work across multiple server instances
- All servers share the same Redis instance
- Atomic increment operations prevent race conditions

### 4. DDoS Protection
- Rate limiting helps but is not complete DDoS protection
- Combine with:
  - IP-based rate limiting (already implemented)
  - CDN/proxy (Cloudflare, AWS Shield)
  - Connection limits
  - Request size limits

### 5. Bypassing Attempts
Potential bypass methods and mitigations:
- **IP rotation**: Track by user ID, not just IP
- **Multiple accounts**: Implement email verification, CAPTCHA
- **Header manipulation**: Don't trust client-provided IDs
- **Slowloris attacks**: Use connection timeouts

## Performance

### Redis Operations
- **GET**: O(1) - Check current count
- **INCR**: O(1) - Increment counter
- **SETEX**: O(1) - Set with expiry
- **TTL**: O(1) - Get time to live
- **KEYS**: O(N) - Scan keys (use sparingly)

### Overhead Per Request
- ~2-5ms latency added per request
- Two Redis calls: GET (check count) + INCR (increment)
- Negligible compared to typical API processing time

### Scalability
- Redis can handle 100,000+ ops/second
- Rate limiter adds minimal load
- Horizontal scaling: Add Redis replicas for reads

## Troubleshooting

### Rate Limit Not Working

1. **Check Redis connection**:
```javascript
redis.ping().then(() => console.log('Redis connected'));
```

2. **Verify middleware order**:
```javascript
// Correct order
app.use('/api/auth', authRoutes);      // Auth first
app.use('/api/', userRateLimiter.middleware());  // Rate limit second
app.use('/api/devices', deviceRoutes); // Protected routes last
```

3. **Check user object**:
```javascript
console.log('User:', req.user);  // Should contain id and role
```

### User Incorrectly Blocked

1. **Check block status**:
```bash
redis-cli GET "ratelimit:user:john@example.com:blocked"
redis-cli TTL "ratelimit:user:john@example.com:blocked"
```

2. **Manually unblock**:
```bash
# Via API
curl -X POST http://localhost:3000/api/rate-limits/reset/john@example.com \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Via Redis
redis-cli DEL "ratelimit:user:john@example.com:blocked"
```

### Limits Too Strict/Lenient

1. **Analyze usage patterns**:
```javascript
const status = await userRateLimiter.getUserStatus('john@example.com', 'user');
console.log('Average usage:', status.requestCount, 'per', status.resetIn / 60, 'minutes');
```

2. **Adjust limits**:
```javascript
// Increase limit for power users
userRateLimiter.updateLimits('user', {
    points: 1000  // Doubled from 500
});
```

## Best Practices

### 1. Set Appropriate Limits
- Monitor actual usage before setting limits
- Start lenient, tighten based on data
- Different limits for different user tiers
- More restrictive for sensitive operations

### 2. Inform Users
- Show remaining requests in UI
- Warning at 80% of limit
- Clear error messages when blocked
- Display retry time

### 3. Graceful Degradation
- Don't completely block users immediately
- Implement soft limits (warning) before hard limits (block)
- Provide way for users to request limit increase

### 4. Admin Tools
- Easy way to view blocked users
- One-click unblock
- Audit log of limit changes
- Real-time monitoring dashboard

### 5. Testing
- Test with realistic traffic patterns
- Verify limits work correctly
- Test edge cases (exactly at limit, Redis failure)
- Load test with concurrent requests

## Production Checklist

- [ ] Redis configured with persistence (RDB/AOF)
- [ ] Redis password set (`requirepass`)
- [ ] Redis maxmemory policy configured
- [ ] Rate limit values tuned based on load testing
- [ ] Monitoring alerts set up
- [ ] Admin dashboard accessible only to admins
- [ ] Log rotation configured
- [ ] Backup rate limiter (IP-based) if Redis fails
- [ ] Rate limit documentation shared with team
- [ ] API clients notified of limits

## Future Enhancements

1. **Dynamic Limits**: Adjust based on server load
2. **Machine Learning**: Detect anomalous patterns
3. **Tiered Limiting**: Warning → Throttle → Block
4. **Whitelist/Blacklist**: Permanent allow/deny lists
5. **Geographic Limits**: Different limits per region
6. **Time-Based Limits**: Relax limits during off-peak hours
7. **Burst Allowance**: Allow short bursts above limit
8. **Distributed Blocks**: Share block list across services

---

## Support

For issues or questions:
- Check Redis connection: `redis-cli ping`
- Review logs: `tail -f combined.log | grep "rate limit"`
- Contact: support@sensity.app

---

**Last Updated**: 2025-10-12
**Version**: 1.0.0
**Status**: Production Ready
