# 🚀 **COMPLETE DEPLOYMENT GUIDE**

## **📋 Prerequisites**

### **System Requirements**
- **Node.js**: v16+ (recommended v18+)
- **PostgreSQL**: v12+ (recommended v14+)
- **Redis**: v6+ (recommended v7+)
- **Memory**: Minimum 2GB RAM (4GB+ recommended)
- **Storage**: Minimum 10GB free space

### **Development Environment**
- **Git**: For version control
- **npm**: Package manager (comes with Node.js)
- **Docker** (optional): For containerized deployment

---

## **🔧 BACKEND DEPLOYMENT**

### **Step 1: Database Setup**

1. **Create PostgreSQL Database**
```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE iot_monitoring;
CREATE USER iot_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE iot_monitoring TO iot_user;

# Exit PostgreSQL
\q
```

2. **Run Initial Schema**
```bash
cd /Users/martin.kadlcek/arduinoproject/database
psql -U iot_user -d iot_monitoring -f schema.sql
```

3. **Run Migrations**
```bash
cd /Users/martin.kadlcek/arduinoproject/database
node migrate.js
```

### **Step 2: Environment Configuration**

Create `.env` file in backend directory:
```bash
cd /Users/martin.kadlcek/arduinoproject/backend
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=iot_monitoring
DB_USER=iot_user
DB_PASSWORD=secure_password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here_min_32_chars

# Server Configuration
PORT=3001
NODE_ENV=production
FRONTEND_URL=http://localhost:3000

# Email Configuration (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=IoT Monitoring <noreply@yourdomain.com>

# SMS Configuration (Twilio)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Logging Configuration
LOG_DIR=./logs
LOG_QUERIES=false
```

### **Step 3: Install Dependencies & Start**

```bash
cd /Users/martin.kadlcek/arduinoproject/backend

# Install dependencies
npm install

# Create logs directory
mkdir -p logs

# Start in development
npm run dev

# OR start in production
npm start
```

### **Step 4: Verify Backend**

Test key endpoints:
```bash
# Check setup status
curl http://localhost:3001/api/auth/setup-check

# Check system health
curl http://localhost:3001/api/system/health
```

---

## **💻 FRONTEND DEPLOYMENT**

### **Step 1: Install Dependencies**

```bash
cd /Users/martin.kadlcek/arduinoproject/frontend

# Install dependencies
npm install
```

### **Step 2: Environment Configuration**

Create `.env` file:
```env
# API Configuration
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_WS_URL=http://localhost:3001

# App Configuration
REACT_APP_VERSION=1.0.0
REACT_APP_ENVIRONMENT=production
```

### **Step 3: Build & Start**

```bash
# Development
npm run dev

# Production build
npm run build

# Serve production build
npm run preview
```

---

## **🐳 DOCKER DEPLOYMENT (Recommended)**

### **Step 1: Create Docker Compose**

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: iot_monitoring
      POSTGRES_USER: iot_user
      POSTGRES_PASSWORD: secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
      - ./database/migrations:/migrations
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U iot_user -d iot_monitoring"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: iot_monitoring
      DB_USER: iot_user
      DB_PASSWORD: secure_password
      REDIS_HOST: redis
      REDIS_PORT: 6379
      JWT_SECRET: your_super_secret_jwt_key_here_min_32_chars
      PORT: 3001
      NODE_ENV: production
      FRONTEND_URL: http://localhost:3000
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/system/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    environment:
      REACT_APP_API_URL: http://localhost:3001/api
      REACT_APP_WS_URL: http://localhost:3001
    ports:
      - "3000:3000"
    depends_on:
      backend:
        condition: service_healthy

volumes:
  postgres_data:
  redis_data:
```

### **Step 2: Create Dockerfiles**

**Backend Dockerfile**:
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/api/system/health || exit 1

# Start application
CMD ["npm", "start"]
```

**Frontend Dockerfile**:
```dockerfile
FROM node:18-alpine as builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
```

### **Step 3: Deploy with Docker**

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Update services
docker-compose pull
docker-compose up -d --build
```

---

## **⚙️ INITIAL CONFIGURATION**

### **Step 1: First-Time Setup**

1. **Access Frontend**: Open http://localhost:3000
2. **Initial Admin Setup**: Create your first administrator account
3. **Configure SMTP/SMS**: Update environment variables for notifications

### **Step 2: Add Device Groups & Tags**

```bash
# Create default groups via API
curl -X POST http://localhost:3001/api/device-groups \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Sensors",
    "description": "All production environment sensors",
    "color": "#EF4444"
  }'

# Create default tags via API
curl -X POST http://localhost:3001/api/device-tags \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Critical",
    "description": "Mission-critical devices",
    "color": "#DC2626"
  }'
```

### **Step 3: Configure Alert Templates**

Default templates are automatically created, but you can add custom ones:

```bash
curl -X POST http://localhost:3001/api/alert-rules/templates \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Custom Temperature Alert",
    "description": "Custom temperature monitoring for server rooms",
    "sensorType": "temperature",
    "ruleConfig": {
      "conditions": [
        {
          "type": "threshold",
          "operator": ">",
          "value": 35
        }
      ],
      "severity": "high",
      "message": "Server room temperature is critically high"
    }
  }'
```

---

## **🔍 TESTING & VERIFICATION**

### **Backend API Tests**

```bash
# Test analytics endpoint
curl "http://localhost:3001/api/analytics/sensor-recommendations/DEVICE_ID/1?timeRange=30d" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Test device groups
curl http://localhost:3001/api/device-groups \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Test device tags
curl http://localhost:3001/api/device-tags \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Test alert rule templates
curl http://localhost:3001/api/alert-rules/templates \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### **Database Verification**

```sql
-- Check new tables exist
\dt device_groups
\dt device_tags
\dt device_health_history
\dt alert_rule_templates

-- Check data
SELECT * FROM device_tags WHERE name = 'Production';
SELECT * FROM alert_rule_templates WHERE is_system_template = true;
```

---

## **📊 MONITORING & MAINTENANCE**

### **Log Files**
- **Backend Logs**: `./backend/logs/combined.log`
- **Error Logs**: `./backend/logs/error.log`
- **Database Logs**: Check PostgreSQL logs

### **Health Check Endpoints**
- **System Health**: `GET /api/system/health`
- **Database Health**: `GET /api/system/db-health`
- **Redis Health**: `GET /api/system/redis-health`

### **Performance Monitoring**
- **Analytics Cache**: Clear via `POST /api/analytics/clear-cache`
- **Database Performance**: Monitor query performance in logs
- **Memory Usage**: Monitor Node.js heap usage

### **Backup Strategy**
```bash
# Database backup
pg_dump -U iot_user -h localhost iot_monitoring > backup_$(date +%Y%m%d).sql

# Restore database
psql -U iot_user -h localhost iot_monitoring < backup_20231201.sql
```

---

## **🔧 TROUBLESHOOTING**

### **Common Issues**

**Database Connection Error**:
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connection
psql -U iot_user -h localhost -d iot_monitoring -c "SELECT 1;"
```

**Redis Connection Error**:
```bash
# Check Redis status
redis-cli ping

# Check Redis configuration
redis-cli info
```

**Migration Failures**:
```bash
# Check migration status
SELECT * FROM schema_migrations ORDER BY applied_at DESC;

# Manually run failed migration
psql -U iot_user -d iot_monitoring -f database/migrations/002_add_device_groups_and_health.sql
```

**Analytics Service Issues**:
- Check if enough historical data exists (minimum 50 data points)
- Clear analytics cache via API
- Check sensor data quality in database

---

## **🎯 PRODUCTION CHECKLIST**

### **Security**
- [ ] Change default JWT secret
- [ ] Configure HTTPS/SSL certificates
- [ ] Set up proper firewall rules
- [ ] Configure rate limiting
- [ ] Enable audit logging

### **Performance**
- [ ] Configure database connection pooling
- [ ] Set up Redis persistence
- [ ] Enable gzip compression
- [ ] Configure log rotation
- [ ] Set up monitoring alerts

### **Backup & Recovery**
- [ ] Automated database backups
- [ ] Log file rotation
- [ ] Disaster recovery plan
- [ ] Test restore procedures

### **Monitoring**
- [ ] Set up system monitoring (CPU, memory, disk)
- [ ] Configure application monitoring
- [ ] Set up log aggregation
- [ ] Configure health check monitoring

---

## ✅ **DEPLOYMENT COMPLETE!**

Your enhanced IoT monitoring platform is now ready with:

- **🧠 Intelligent Alert Recommendations**
- **🏷️ Device Groups & Tags**
- **🏥 Advanced Health Monitoring**
- **📊 Complex Alert Rules**
- **🔒 Secure User Management**
- **🌐 Multi-language Support**

**🚀 Ready for production deployment and real-world IoT device management!**