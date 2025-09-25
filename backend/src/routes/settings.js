const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { query, transaction } = require('../models/database');
const logger = require('../utils/logger');

const router = express.Router();

// Configure multer for logo uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads/settings');
        // Ensure directory exists
        require('fs').mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `company-logo${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/svg+xml'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images are allowed.'), false);
        }
    }
});

// Initialize settings table if it doesn't exist
const initializeSettingsTable = async () => {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                category VARCHAR(50) NOT NULL,
                key VARCHAR(100) NOT NULL,
                value JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(category, key)
            );
        `);

        // Create index for better performance
        await query(`
            CREATE INDEX IF NOT EXISTS idx_settings_category_key ON settings(category, key);
        `);

        logger.info('Settings table initialized');
    } catch (error) {
        logger.error('Error initializing settings table:', error);
        throw error;
    }
};

// Initialize the table on module load
initializeSettingsTable().catch(err => logger.error('Settings table initialization failed:', err));

// Helper function to get all settings organized by category
const getAllSettings = async () => {
    try {
        const result = await query('SELECT category, key, value FROM settings ORDER BY category, key');

        const settings = {};
        result.rows.forEach(row => {
            if (!settings[row.category]) {
                settings[row.category] = {};
            }
            settings[row.category][row.key] = row.value;
        });

        return settings;
    } catch (error) {
        logger.error('Error getting all settings:', error);
        return {};
    }
};

// Helper function to update or insert a setting
const upsertSetting = async (category, key, value) => {
    try {
        await query(`
            INSERT INTO settings (category, key, value, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (category, key)
            DO UPDATE SET
                value = EXCLUDED.value,
                updated_at = CURRENT_TIMESTAMP
        `, [category, key, JSON.stringify(value)]);
    } catch (error) {
        logger.error(`Error upserting setting ${category}.${key}:`, error);
        throw error;
    }
};

// GET /api/settings - Get all settings
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const settings = await getAllSettings();

        // Add logo URL if it exists
        const logoPath = path.join(__dirname, '../../uploads/settings');
        try {
            const files = await fs.readdir(logoPath);
            const logoFile = files.find(file => file.startsWith('company-logo'));
            if (logoFile) {
                if (!settings.branding) settings.branding = {};
                settings.branding.companyLogo = `/api/settings/logo`;
            }
        } catch (err) {
            // Logo directory or file doesn't exist, which is fine
        }

        res.json(settings);
    } catch (error) {
        logger.error('Error getting settings:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

// PUT /api/settings - Update settings
router.put('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { system, branding, email, security, database } = req.body;

        await transaction(async (client) => {
            // Update system settings
            if (system) {
                for (const [key, value] of Object.entries(system)) {
                    await client.query(`
                        INSERT INTO settings (category, key, value, updated_at)
                        VALUES ('system', $1, $2, CURRENT_TIMESTAMP)
                        ON CONFLICT (category, key)
                        DO UPDATE SET
                            value = EXCLUDED.value,
                            updated_at = CURRENT_TIMESTAMP
                    `, [key, JSON.stringify(value)]);
                }
            }

            // Update branding settings
            if (branding) {
                for (const [key, value] of Object.entries(branding)) {
                    // Skip companyLogo as it's handled by upload endpoint
                    if (key !== 'companyLogo') {
                        await client.query(`
                            INSERT INTO settings (category, key, value, updated_at)
                            VALUES ('branding', $1, $2, CURRENT_TIMESTAMP)
                            ON CONFLICT (category, key)
                            DO UPDATE SET
                                value = EXCLUDED.value,
                                updated_at = CURRENT_TIMESTAMP
                        `, [key, JSON.stringify(value)]);
                    }
                }
            }

            // Update email settings
            if (email) {
                for (const [key, value] of Object.entries(email)) {
                    await client.query(`
                        INSERT INTO settings (category, key, value, updated_at)
                        VALUES ('email', $1, $2, CURRENT_TIMESTAMP)
                        ON CONFLICT (category, key)
                        DO UPDATE SET
                            value = EXCLUDED.value,
                            updated_at = CURRENT_TIMESTAMP
                    `, [key, JSON.stringify(value)]);
                }
            }

            // Update security settings
            if (security) {
                for (const [key, value] of Object.entries(security)) {
                    await client.query(`
                        INSERT INTO settings (category, key, value, updated_at)
                        VALUES ('security', $1, $2, CURRENT_TIMESTAMP)
                        ON CONFLICT (category, key)
                        DO UPDATE SET
                            value = EXCLUDED.value,
                            updated_at = CURRENT_TIMESTAMP
                    `, [key, JSON.stringify(value)]);
                }
            }

            // Update database settings
            if (database) {
                for (const [key, value] of Object.entries(database)) {
                    await client.query(`
                        INSERT INTO settings (category, key, value, updated_at)
                        VALUES ('database', $1, $2, CURRENT_TIMESTAMP)
                        ON CONFLICT (category, key)
                        DO UPDATE SET
                            value = EXCLUDED.value,
                            updated_at = CURRENT_TIMESTAMP
                    `, [key, JSON.stringify(value)]);
                }
            }
        });

        const updatedSettings = await getAllSettings();
        res.json({ message: 'Settings updated successfully', settings: updatedSettings });
    } catch (error) {
        logger.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// POST /api/settings/logo - Upload company logo
router.post('/logo', authenticateToken, requireAdmin, upload.single('logo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No logo file provided' });
        }

        // Update the logo setting in database
        await upsertSetting('branding', 'companyLogo', `/api/settings/logo`);

        res.json({
            message: 'Logo uploaded successfully',
            logoUrl: `/api/settings/logo`
        });
    } catch (error) {
        logger.error('Error uploading logo:', error);
        res.status(500).json({ error: 'Failed to upload logo' });
    }
});

// GET /api/settings/logo - Serve company logo
router.get('/logo', async (req, res) => {
    try {
        const logoPath = path.join(__dirname, '../../uploads/settings');
        const files = await fs.readdir(logoPath);
        const logoFile = files.find(file => file.startsWith('company-logo'));

        if (!logoFile) {
            return res.status(404).json({ error: 'Logo not found' });
        }

        const fullLogoPath = path.join(logoPath, logoFile);

        // Set appropriate content type
        const ext = path.extname(logoFile).toLowerCase();
        const contentTypeMap = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml'
        };

        res.setHeader('Content-Type', contentTypeMap[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day

        // Stream the file
        const fileStream = require('fs').createReadStream(fullLogoPath);
        fileStream.pipe(res);
    } catch (error) {
        logger.error('Error serving logo:', error);
        res.status(500).json({ error: 'Failed to serve logo' });
    }
});

// DELETE /api/settings/logo - Remove company logo
router.delete('/logo', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const logoPath = path.join(__dirname, '../../uploads/settings');
        const files = await fs.readdir(logoPath);
        const logoFile = files.find(file => file.startsWith('company-logo'));

        if (logoFile) {
            const fullLogoPath = path.join(logoPath, logoFile);
            await fs.unlink(fullLogoPath);
        }

        // Remove logo setting from database
        await query(`
            DELETE FROM settings
            WHERE category = 'branding' AND key = 'companyLogo'
        `);

        res.json({ message: 'Logo removed successfully' });
    } catch (error) {
        logger.error('Error removing logo:', error);
        res.status(500).json({ error: 'Failed to remove logo' });
    }
});

// POST /api/settings/backup - Create database backup
router.post('/backup', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { exec } = require('child_process');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(__dirname, '../../backups');

        // Ensure backup directory exists
        await fs.mkdir(backupPath, { recursive: true });

        const backupFile = path.join(backupPath, `backup-${timestamp}.sql`);

        const dbHost = process.env.DB_HOST || 'localhost';
        const dbName = process.env.DB_NAME || 'esp8266_platform';
        const dbUser = process.env.DB_USER || 'postgres';
        const dbPort = process.env.DB_PORT || 5432;

        const pgDumpCmd = `pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -f "${backupFile}"`;

        exec(pgDumpCmd, { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD } }, (error, stdout, stderr) => {
            if (error) {
                logger.error('Database backup error:', error);
                return res.status(500).json({ error: 'Failed to create database backup' });
            }

            res.json({
                message: 'Database backup created successfully',
                backupFile: path.basename(backupFile)
            });
        });
    } catch (error) {
        logger.error('Error creating backup:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

// GET /api/settings/system-info - Get system information
router.get('/system-info', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const os = require('os');
        const { pool } = require('../models/database');

        const systemInfo = {
            server: {
                nodeVersion: process.version,
                uptime: process.uptime(),
                platform: os.platform(),
                architecture: os.arch(),
                totalMemory: os.totalmem(),
                freeMemory: os.freemem(),
                cpus: os.cpus().length
            },
            database: {
                totalConnections: pool.totalCount,
                idleConnections: pool.idleCount,
                waitingCount: pool.waitingCount
            }
        };

        res.json(systemInfo);
    } catch (error) {
        logger.error('Error getting system info:', error);
        res.status(500).json({ error: 'Failed to get system information' });
    }
});

module.exports = router;