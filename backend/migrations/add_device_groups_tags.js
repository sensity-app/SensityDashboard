// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const db = require('../src/models/database');
const logger = require('../src/utils/logger');

async function addDeviceGroupsAndTags() {
    try {
        logger.info('Adding device groups and tags tables...');

        // Create device groups tables
        await db.query(`
            CREATE TABLE IF NOT EXISTS device_groups (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT,
                color VARCHAR(7) DEFAULT '#3B82F6', -- hex color code
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS device_group_members (
                id SERIAL PRIMARY KEY,
                group_id INTEGER REFERENCES device_groups(id) ON DELETE CASCADE,
                device_id VARCHAR(50) REFERENCES devices(id) ON DELETE CASCADE,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(group_id, device_id)
            );
        `);

        // Create device tags tables
        await db.query(`
            CREATE TABLE IF NOT EXISTS device_tags (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                color VARCHAR(7) DEFAULT '#6B7280', -- hex color code
                description TEXT,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS device_tag_assignments (
                id SERIAL PRIMARY KEY,
                tag_id INTEGER REFERENCES device_tags(id) ON DELETE CASCADE,
                device_id VARCHAR(50) REFERENCES devices(id) ON DELETE CASCADE,
                assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tag_id, device_id)
            );
        `);

        // Create indexes
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_device_group_members_group ON device_group_members(group_id);
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_device_group_members_device ON device_group_members(device_id);
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_device_tag_assignments_tag ON device_tag_assignments(tag_id);
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_device_tag_assignments_device ON device_tag_assignments(device_id);
        `);

        logger.info('Device groups and tags tables created successfully');
        process.exit(0);
    } catch (error) {
        logger.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run migration if this script is executed directly
if (require.main === module) {
    addDeviceGroupsAndTags();
}

module.exports = addDeviceGroupsAndTags;