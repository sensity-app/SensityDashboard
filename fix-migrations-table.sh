#!/bin/bash

# Fix Migrations Table Column Mismatch
# This script fixes the mismatch between 'name' and 'migration_name' columns

set -e

DB_NAME="${1:-sensity_notino}"

echo "Fixing migrations table for database: $DB_NAME"

# Run SQL to fix the migrations table
sudo -u postgres psql -d "$DB_NAME" << 'EOF'
-- First, check if migration_name column exists
DO $$
BEGIN
    -- If name column exists but migration_name doesn't, rename it
    IF EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'migrations' AND column_name = 'name'
    ) AND NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'migrations' AND column_name = 'migration_name'
    ) THEN
        ALTER TABLE migrations RENAME COLUMN name TO migration_name;
        RAISE NOTICE 'Renamed migrations.name to migrations.migration_name';
    END IF;
    
    -- If both exist (shouldn't happen), drop name and keep migration_name
    IF EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'migrations' AND column_name = 'name'
    ) AND EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'migrations' AND column_name = 'migration_name'
    ) THEN
        ALTER TABLE migrations DROP COLUMN name;
        RAISE NOTICE 'Dropped duplicate migrations.name column';
    END IF;
END $$;

-- Show current state
\d migrations

-- Show applied migrations
SELECT * FROM migrations ORDER BY id;
EOF

echo ""
echo "✓ Migrations table fixed"
echo ""
echo "Now restart the application to run pending migrations:"
echo "  sudo -u sensity_$DB_NAME pm2 restart sensity-platform-$DB_NAME"
echo "  sudo -u sensity_$DB_NAME pm2 logs --lines 50"
