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

// Helper function to parse .env file content
const parseEnvFile = (content) => {
    const envVars = {};
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmedLine = line.trim();
        // Skip comments and empty lines
        if (trimmedLine && !trimmedLine.startsWith('#')) {
            const equalIndex = trimmedLine.indexOf('=');
            if (equalIndex > 0) {
                const key = trimmedLine.substring(0, equalIndex).trim();
                const value = trimmedLine.substring(equalIndex + 1).trim();
                envVars[key] = value;
            }
        }
    }

    return envVars;
};

// Helper function to format env vars back to file content
const formatEnvFile = (envVars, comments = {}) => {
    const categories = {
        'Database Configuration': ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_SSL', 'DB_SSL_REJECT_UNAUTHORIZED'],
        'Database Pool Settings': ['DB_POOL_MAX', 'DB_IDLE_TIMEOUT', 'DB_CONNECTION_TIMEOUT'],
        'Server Configuration': ['PORT', 'NODE_ENV', 'FRONTEND_URL'],
        'JWT Configuration': ['JWT_SECRET', 'JWT_EXPIRES_IN'],
        'Redis Configuration': ['REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD'],
        'Logging Configuration': ['LOG_LEVEL', 'LOG_FILE', 'LOG_QUERIES'],
        'Email Configuration': ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD'],
        'Twilio Configuration': ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
        'Security Configuration': ['DEFAULT_ADMIN_PASSWORD', 'BCRYPT_ROUNDS', 'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX_REQUESTS'],
        'File Upload Configuration': ['MAX_UPLOAD_SIZE', 'UPLOAD_PATH'],
        'OTA Configuration': ['OTA_BASE_URL', 'OTA_STORAGE_PATH'],
        'WebSocket Configuration': ['WS_HEARTBEAT_INTERVAL']
    };

    let content = '';
    const usedKeys = new Set();

    // Add categorized variables
    for (const [category, keys] of Object.entries(categories)) {
        const categoryVars = keys.filter(key => envVars[key] !== undefined);
        if (categoryVars.length > 0) {
            content += `# ${category}\n`;
            for (const key of categoryVars) {
                content += `${key}=${envVars[key]}\n`;
                usedKeys.add(key);
            }
            content += '\n';
        }
    }

    // Add uncategorized variables
    const uncategorized = Object.keys(envVars).filter(key => !usedKeys.has(key));
    if (uncategorized.length > 0) {
        content += '# Other Configuration\n';
        for (const key of uncategorized) {
            content += `${key}=${envVars[key]}\n`;
        }
    }

    return content.trim();
};

// Helper function to create backup of .env file
const createEnvBackup = async (envFilePath) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(__dirname, '../../backups/env');
        await fs.mkdir(backupDir, { recursive: true });

        const backupPath = path.join(backupDir, `.env-backup-${timestamp}`);

        try {
            await fs.access(envFilePath);
            await fs.copyFile(envFilePath, backupPath);
            logger.info(`Environment backup created: ${backupPath}`);
            return backupPath;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // .env file doesn't exist yet, create empty backup
                await fs.writeFile(backupPath, '');
                logger.info(`Empty environment backup created: ${backupPath}`);
                return backupPath;
            }
            throw error;
        }
    } catch (error) {
        logger.error('Error creating env backup:', error);
        throw error;
    }
};

// GET /api/settings/environment - Get environment variables
router.get('/environment', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const envFilePath = path.join(__dirname, '../../../.env');

        let envContent = '';
        try {
            envContent = await fs.readFile(envFilePath, 'utf8');
        } catch (error) {
            if (error.code === 'ENOENT') {
                // .env file doesn't exist, return example structure
                const examplePath = path.join(__dirname, '../../../.env.example');
                try {
                    envContent = await fs.readFile(examplePath, 'utf8');
                } catch (exampleError) {
                    return res.json({ variables: {}, message: 'No .env file found' });
                }
            } else {
                throw error;
            }
        }

        const envVars = parseEnvFile(envContent);

        // Mask sensitive variables for display
        const sensitiveKeys = ['DB_PASSWORD', 'JWT_SECRET', 'SMTP_PASSWORD', 'TWILIO_AUTH_TOKEN', 'DEFAULT_ADMIN_PASSWORD', 'REDIS_PASSWORD'];
        const maskedVars = { ...envVars };

        for (const key of sensitiveKeys) {
            if (maskedVars[key]) {
                maskedVars[key] = '***MASKED***';
            }
        }

        res.json({
            variables: maskedVars,
            categories: {
                'Database Configuration': ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_SSL', 'DB_SSL_REJECT_UNAUTHORIZED'],
                'Database Pool Settings': ['DB_POOL_MAX', 'DB_IDLE_TIMEOUT', 'DB_CONNECTION_TIMEOUT'],
                'Server Configuration': ['PORT', 'NODE_ENV', 'FRONTEND_URL'],
                'JWT Configuration': ['JWT_SECRET', 'JWT_EXPIRES_IN'],
                'Redis Configuration': ['REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD'],
                'Logging Configuration': ['LOG_LEVEL', 'LOG_FILE', 'LOG_QUERIES'],
                'Email Configuration': ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD'],
                'Twilio Configuration': ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
                'Security Configuration': ['DEFAULT_ADMIN_PASSWORD', 'BCRYPT_ROUNDS', 'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX_REQUESTS'],
                'File Upload Configuration': ['MAX_UPLOAD_SIZE', 'UPLOAD_PATH'],
                'OTA Configuration': ['OTA_BASE_URL', 'OTA_STORAGE_PATH'],
                'WebSocket Configuration': ['WS_HEARTBEAT_INTERVAL']
            },
            sensitiveKeys
        });
    } catch (error) {
        logger.error('Error reading environment variables:', error);
        res.status(500).json({ error: 'Failed to read environment variables' });
    }
});

// PUT /api/settings/environment - Update environment variables
router.put('/environment', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { variables, requireRestart = false } = req.body;

        if (!variables || typeof variables !== 'object') {
            return res.status(400).json({ error: 'Invalid variables format' });
        }

        const envFilePath = path.join(__dirname, '../../../.env');

        // Create backup before making changes
        const backupPath = await createEnvBackup(envFilePath);

        // Read current env file if it exists
        let currentVars = {};
        try {
            const currentContent = await fs.readFile(envFilePath, 'utf8');
            currentVars = parseEnvFile(currentContent);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }

        // Merge with new variables, but don't replace masked sensitive values
        const updatedVars = { ...currentVars };
        const sensitiveKeys = ['DB_PASSWORD', 'JWT_SECRET', 'SMTP_PASSWORD', 'TWILIO_AUTH_TOKEN', 'DEFAULT_ADMIN_PASSWORD', 'REDIS_PASSWORD'];

        for (const [key, value] of Object.entries(variables)) {
            // Skip masked sensitive values
            if (sensitiveKeys.includes(key) && value === '***MASKED***') {
                continue;
            }

            // Validate key format
            if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
                return res.status(400).json({
                    error: `Invalid environment variable key: ${key}. Use only uppercase letters, numbers, and underscores.`
                });
            }

            updatedVars[key] = value;
        }

        // Format and write the new content
        const newContent = formatEnvFile(updatedVars);
        await fs.writeFile(envFilePath, newContent);

        // Log the change
        logger.info(`Environment variables updated by admin user. Backup: ${backupPath}`);

        res.json({
            message: 'Environment variables updated successfully',
            backupCreated: path.basename(backupPath),
            requiresRestart: requireRestart || false
        });

    } catch (error) {
        logger.error('Error updating environment variables:', error);
        res.status(500).json({ error: 'Failed to update environment variables' });
    }
});

// POST /api/settings/environment/validate - Validate environment variables
router.post('/environment/validate', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { variables } = req.body;
        const errors = [];
        const warnings = [];

        // Required variables
        const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET'];

        for (const key of required) {
            if (!variables[key] || variables[key].trim() === '') {
                errors.push(`${key} is required`);
            }
        }

        // Port validation
        if (variables.DB_PORT && !/^\d+$/.test(variables.DB_PORT)) {
            errors.push('DB_PORT must be a number');
        }

        if (variables.PORT && !/^\d+$/.test(variables.PORT)) {
            errors.push('PORT must be a number');
        }

        // JWT Secret strength
        if (variables.JWT_SECRET && variables.JWT_SECRET.length < 32) {
            warnings.push('JWT_SECRET should be at least 32 characters long');
        }

        // Email configuration
        if (variables.SMTP_HOST && !variables.SMTP_USER) {
            warnings.push('SMTP_USER is recommended when SMTP_HOST is configured');
        }

        res.json({
            valid: errors.length === 0,
            errors,
            warnings
        });
    } catch (error) {
        logger.error('Error validating environment variables:', error);
        res.status(500).json({ error: 'Failed to validate environment variables' });
    }
});

// GET /api/settings/environment/backups - List environment backups
router.get('/environment/backups', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const backupDir = path.join(__dirname, '../../backups/env');

        try {
            const files = await fs.readdir(backupDir);
            const backups = [];

            for (const file of files) {
                if (file.startsWith('.env-backup-')) {
                    const filePath = path.join(backupDir, file);
                    const stats = await fs.stat(filePath);
                    backups.push({
                        filename: file,
                        created: stats.birthtime,
                        size: stats.size
                    });
                }
            }

            // Sort by creation date, newest first
            backups.sort((a, b) => new Date(b.created) - new Date(a.created));

            res.json(backups);
        } catch (error) {
            if (error.code === 'ENOENT') {
                res.json([]);
            } else {
                throw error;
            }
        }
    } catch (error) {
        logger.error('Error listing environment backups:', error);
        res.status(500).json({ error: 'Failed to list environment backups' });
    }
});

module.exports = router;