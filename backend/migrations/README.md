# Database Migrations System

This directory contains database migrations for the ESP8266 IoT Platform.

## How Migrations Work

1. **Automatic Execution:** Migrations run automatically during:
   - Fresh installation (`install-ubuntu.sh`)
   - System updates (`update-system.sh`)
   - Manual migration run (`node migrations/migrate.js`)

2. **Idempotent:** Migrations are tracked in the `migrations` table to prevent duplicate execution

3. **Transactional:** Each migration runs in a database transaction (all-or-nothing)

## Migration Tracking

The system maintains a `migrations` table:
```sql
CREATE TABLE migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

Before running a migration, the system checks if it has already been applied.

## Available Migrations

### `fix_esp8266_sensors_and_ips.js`
**Created:** October 16, 2025  
**Purpose:** Fix data inconsistencies in ESP8266 devices

**What it fixes:**
1. **Pin Normalization:** ESP8266 analog sensors (light, sound, gas) must use pin A0
   - Finds sensors on wrong pins (e.g., pin 17)
   - Updates them to A0 or removes duplicates
   
2. **Invalid IP Cleanup:** Removes placeholder IP addresses
   - Clears: 127.0.0.1, 0.0.0.0, localhost, ::1
   - Allows proper IP detection on next heartbeat

**Safe to run:** Yes - migration is idempotent and handles conflicts

**Manual execution:**
```bash
cd /opt/esp8266-platform/backend
node migrations/fix_esp8266_sensors_and_ips.js
```

### `add_telegram_support.js`
Adds Telegram notification support to the platform.

### `add_auto_calibration.js`
Adds automatic sensor calibration features.

## Creating New Migrations

### 1. Create Migration File

```javascript
// migrations/your_migration_name.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const db = require('../src/models/database');
const logger = require('../src/utils/logger');

async function yourMigrationName() {
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        logger.info('Starting your migration...');

        // Your migration logic here
        await client.query(`
            -- SQL statements
        `);

        // Track migration
        await client.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            INSERT INTO migrations (name)
            VALUES ('your_migration_name')
            ON CONFLICT (name) DO NOTHING
        `);

        await client.query('COMMIT');
        logger.info('✅ Migration completed successfully');

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Allow direct execution
if (require.main === module) {
    yourMigrationName()
        .then(() => process.exit(0))
        .catch((error) => {
            logger.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = yourMigrationName;
```

### 2. Add to migrate.js

Edit `migrations/migrate.js` and add your migration:

```javascript
const yourMigration = require('./your_migration_name');

// In runMigrations():
const migrationCheck = await db.query(`
    SELECT * FROM migrations WHERE name = 'your_migration_name'
`);

if (migrationCheck.rows.length === 0) {
    logger.info('Running your migration...');
    await yourMigration();
} else {
    logger.info('Your migration already applied, skipping...');
}
```

### 3. Test Locally

```bash
cd backend
node migrations/your_migration_name.js
```

### 4. Commit and Deploy

```bash
git add migrations/your_migration_name.js
git add migrations/migrate.js
git commit -m "Add migration: your_migration_name"
git push origin main
```

Users will get the migration automatically on next update!

## Migration Best Practices

1. **Idempotent:** Use `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, etc.
2. **Transactional:** Wrap in `BEGIN`/`COMMIT` with `ROLLBACK` on error
3. **Logged:** Use `logger.info()` to track progress
4. **Tracked:** Insert into `migrations` table
5. **Documented:** Add comments explaining what and why
6. **Tested:** Test on development environment first

## Rollback Strategy

Migrations don't have automatic rollback. If a migration causes issues:

### Option 1: Fix Forward
Create a new migration that fixes the problem:
```bash
node migrations/fix_your_migration.js
```

### Option 2: Manual Rollback
```bash
sudo -u postgres psql -d esp8266_platform
```
Then manually undo the changes and remove from tracking:
```sql
DELETE FROM migrations WHERE name = 'problematic_migration';
```

### Option 3: Restore Backup
```bash
cd /opt
sudo cp -r esp8266-platform.backup.YYYYMMDD-HHMMSS esp8266-platform
sudo systemctl restart pm2-esp8266app
```

## Checking Migration Status

### List Applied Migrations
```bash
sudo -u postgres psql -d esp8266_platform -c "SELECT * FROM migrations ORDER BY applied_at DESC;"
```

### Check If Specific Migration Applied
```bash
sudo -u postgres psql -d esp8266_platform -c "SELECT * FROM migrations WHERE name = 'fix_esp8266_sensors_and_ips';"
```

## Troubleshooting

### Migration Failed During Update
```bash
cd /opt/esp8266-platform/backend
sudo -u esp8266app node migrations/migrate.js
```

### Migration Partially Applied
1. Check what was applied:
```bash
sudo -u postgres psql -d esp8266_platform
\dt  -- List tables
SELECT * FROM migrations;  -- Check migrations
```

2. Manual fix if needed, then mark as complete:
```sql
INSERT INTO migrations (name) VALUES ('migration_name');
```

### Permission Errors
```bash
cd /opt/esp8266-platform
sudo ./update-system.sh fix-permissions
```

## System Integration

### Fresh Installation
`install-ubuntu.sh` provisions the database and then executes `scripts/run-migrations.sh`, which applies both SQL and JavaScript migrations using the instance-specific environment variables.

### System Update
`update-system.sh` pulls the latest codebase and calls the same `scripts/run-migrations.sh` helper, keeping installations and updates in sync.

### Manual Migration
```bash
cd /opt/esp8266-platform
sudo APP_DIR=/opt/esp8266-platform APP_USER=esp8266app DB_NAME=esp8266_platform ./scripts/run-migrations.sh
```

## Migration Order

Migrations run in this order:
1. Database initialization (`db.initialize()`)
2. Individual migrations in `migrate.js` (in order listed)
3. Installation script may run additional specific migrations

## Security Considerations

1. **Credentials:** Migrations use database credentials from `.env`
2. **Permissions:** Run as `esp8266app` user (not root)
3. **Backup:** System auto-backs up before updates
4. **Validation:** Migrations validate data before changes

## Related Files

- `/backend/migrations/` - Migration scripts
- `/backend/migrations/migrate.js` - Main migration runner
- `/install-ubuntu.sh` - Installation script
- `/update-system.sh` - Update script
- `/backend/src/models/database.js` - Database interface

## Support

If migrations fail:
1. Check logs: `sudo -u esp8266app pm2 logs`
2. Check database: `sudo -u postgres psql -d esp8266_platform`
3. Review migration code in `backend/migrations/`
4. Contact support with error details
