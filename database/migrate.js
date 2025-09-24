const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'iot_monitoring',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
});

async function runMigrations() {
    console.log('Starting database migrations...');

    try {
        // Create schema_migrations table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                version VARCHAR(20) NOT NULL UNIQUE,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Get list of migration files
        const migrationsDir = path.join(__dirname, 'migrations');
        const files = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();

        for (const file of files) {
            const version = file.replace('.sql', '');

            // Check if migration was already applied
            const result = await pool.query(
                'SELECT * FROM schema_migrations WHERE version = $1',
                [version]
            );

            if (result.rows.length > 0) {
                console.log(`Migration ${version} already applied, skipping...`);
                continue;
            }

            console.log(`Applying migration ${version}...`);

            // Read and execute migration file
            const migrationPath = path.join(migrationsDir, file);
            const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

            // Execute migration in transaction
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                // Execute migration SQL
                await client.query(migrationSQL);

                // Record migration as applied
                await client.query(
                    'INSERT INTO schema_migrations (version) VALUES ($1)',
                    [version]
                );

                await client.query('COMMIT');
                console.log(`Migration ${version} applied successfully`);

            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        }

        console.log('All migrations completed successfully!');

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run migrations if called directly
if (require.main === module) {
    runMigrations();
}

module.exports = { runMigrations };