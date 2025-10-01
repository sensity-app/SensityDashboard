// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const db = require('../src/models/database');
const logger = require('../src/utils/logger');

async function addTelegramSupport() {
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        logger.info('Adding Telegram support to users table...');

        // Add Telegram fields to users table
        await client.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS notification_telegram BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN DEFAULT false
        `);

        logger.info('Creating Telegram configuration table...');

        // Create system-wide Telegram configuration table
        await client.query(`
            CREATE TABLE IF NOT EXISTS telegram_config (
                id SERIAL PRIMARY KEY,
                bot_token VARCHAR(255),
                bot_username VARCHAR(255),
                bot_name VARCHAR(255),
                enabled BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert default config if not exists
        await client.query(`
            INSERT INTO telegram_config (enabled)
            SELECT false
            WHERE NOT EXISTS (SELECT 1 FROM telegram_config)
        `);

        logger.info('Creating Telegram notification log table...');

        // Create Telegram notification tracking table
        await client.query(`
            CREATE TABLE IF NOT EXISTS telegram_notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                chat_id VARCHAR(255) NOT NULL,
                message_text TEXT NOT NULL,
                notification_type VARCHAR(50),
                alert_id INTEGER REFERENCES alerts(id) ON DELETE SET NULL,
                device_id VARCHAR(50) REFERENCES devices(id) ON DELETE SET NULL,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN DEFAULT true,
                error_message TEXT
            )
        `);

        // Add index for faster queries
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_telegram_notifications_user_id
            ON telegram_notifications(user_id)
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_telegram_notifications_sent_at
            ON telegram_notifications(sent_at)
        `);

        await client.query('COMMIT');
        logger.info('Telegram support migration completed successfully!');

        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Telegram support migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run migration if called directly
if (require.main === module) {
    addTelegramSupport()
        .then(() => {
            logger.info('Migration completed');
            process.exit(0);
        })
        .catch((error) => {
            logger.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = addTelegramSupport;
