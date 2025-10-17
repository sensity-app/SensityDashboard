#!/bin/bash

# Shared migration runner for Sensity platform installation/update scripts.
# Expects environment variables:
#   APP_DIR  - absolute path to the platform repository
#   APP_USER - system user that owns the application processes
#   DB_NAME  - PostgreSQL database name
#
# This script is intentionally idempotent. SQL and JS migrations are executed
# only if they have not yet been recorded in the `migrations` tracking table.

set -e

# Colour definitions (fallback to plain text if output not a TTY)
if [[ -t 1 ]]; then
    BLUE='\033[0;34m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    RED='\033[0;31m'
    NC='\033[0m'
else
    BLUE=''
    GREEN=''
    YELLOW=''
    RED=''
    NC=''
fi

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validate required environment variables
if [[ -z "$APP_DIR" ]]; then
    print_error "APP_DIR is not set"
    exit 1
fi

if [[ -z "$APP_USER" ]]; then
    print_error "APP_USER is not set"
    exit 1
fi

if [[ -z "$DB_NAME" ]]; then
    print_error "DB_NAME is not set"
    exit 1
fi

if [[ ! -d "$APP_DIR" ]]; then
    print_error "Application directory '$APP_DIR' does not exist"
    exit 1
fi

print_status "Running database migrations for ${DB_NAME}..."

# Temporarily disable errexit so we can capture individual exit codes
local_errexit=0
if [[ $- == *e* ]]; then
    local_errexit=1
    set +e
fi

# Ensure migrations tracking table exists
print_status "Ensuring migrations tracking table exists..."
sudo -u postgres psql -d "$DB_NAME" <<'EOF'
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) UNIQUE NOT NULL,
    migration_type VARCHAR(10) NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
EOF
tracking_exit=$?
if [[ $tracking_exit -ne 0 ]]; then
    print_error "Failed to ensure migrations table (exit code: $tracking_exit)"
fi

migrations_run=0
migrations_failed=0
migrations_skipped=0

# ---------------------------------------------------------------------------
# SQL migrations
# ---------------------------------------------------------------------------
print_status "Checking SQL migrations in ${APP_DIR}/database/migrations..."
if [[ -d "$APP_DIR/database/migrations" ]]; then
    for sql_migration in "$APP_DIR"/database/migrations/*.sql; do
        [[ -f "$sql_migration" ]] || continue
        migration_name=$(basename "$sql_migration")

        already_applied=$(sudo -u postgres psql -d "$DB_NAME" -t -c \
            "SELECT COUNT(*) FROM migrations WHERE migration_name = '$migration_name' AND migration_type = 'sql';" \
            2>/dev/null | tr -d ' ')

        if [[ "$already_applied" == "0" ]]; then
            print_status "Running SQL migration: $migration_name..."
            sudo -u postgres psql -d "$DB_NAME" -f "$sql_migration"
            migration_exit=$?

            if [[ $migration_exit -eq 0 ]]; then
                sudo -u postgres psql -d "$DB_NAME" -c \
                    "INSERT INTO migrations (migration_name, migration_type) VALUES ('$migration_name', 'sql') ON CONFLICT (migration_name) DO NOTHING;" \
                    2>/dev/null
                record_exit=$?

                if [[ $record_exit -eq 0 ]]; then
                    print_success "✓ SQL migration completed: $migration_name"
                    ((migrations_run++))
                else
                    print_error "✗ SQL migration recorded but tracking insert failed: $migration_name (exit code: $record_exit)"
                    ((migrations_failed++))
                fi
            else
                print_error "✗ SQL migration failed: $migration_name (exit code: $migration_exit)"
                ((migrations_failed++))
            fi
        else
            print_status "⊙ SQL migration already applied: $migration_name"
            ((migrations_skipped++))
        fi
    done
else
    print_warning "SQL migrations directory not found"
fi

# ---------------------------------------------------------------------------
# JavaScript migrations
# ---------------------------------------------------------------------------
print_status "Checking JavaScript migrations in ${APP_DIR}/backend/migrations..."
if [[ -d "$APP_DIR/backend/migrations" ]]; then
    pushd "$APP_DIR/backend" > /dev/null 2>&1
    for js_migration in migrations/*.js; do
        [[ -f "$js_migration" ]] || continue
        migration_name=$(basename "$js_migration")

        if [[ "$migration_name" == "migrate.js" ]]; then
            continue
        fi

        already_applied=$(sudo -u postgres psql -d "$DB_NAME" -t -c \
            "SELECT COUNT(*) FROM migrations WHERE migration_name = '$migration_name' AND migration_type = 'js';" \
            2>/dev/null | tr -d ' ')

        if [[ "$already_applied" == "0" ]]; then
            print_status "Running JS migration: $migration_name..."
            sudo -u "$APP_USER" NODE_ENV=production node "$js_migration"
            migration_exit=$?

            if [[ $migration_exit -eq 0 ]]; then
                sudo -u postgres psql -d "$DB_NAME" -c \
                    "INSERT INTO migrations (migration_name, migration_type) VALUES ('$migration_name', 'js') ON CONFLICT (migration_name) DO NOTHING;" \
                    2>/dev/null
                record_exit=$?

                if [[ $record_exit -eq 0 ]]; then
                    print_success "✓ JS migration completed: $migration_name"
                    ((migrations_run++))
                else
                    print_error "✗ JS migration recorded but tracking insert failed: $migration_name (exit code: $record_exit)"
                    ((migrations_failed++))
                fi
            else
                print_error "✗ JS migration failed: $migration_name (exit code: $migration_exit)"
                ((migrations_failed++))
            fi
        else
            print_status "⊙ JS migration already applied: $migration_name"
            ((migrations_skipped++))
        fi
    done
    popd > /dev/null 2>&1
else
    print_warning "JavaScript migrations directory not found"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_status "Migration Summary:"
print_success "  ✓ Executed:      $migrations_run"
print_status "  ⊙ Already done:  $migrations_skipped"
if [[ $migrations_failed -gt 0 ]]; then
    print_error "  ✗ Failed:        $migrations_failed"
fi
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ $migrations_failed -gt 0 ]]; then
    print_warning "Some migrations failed - check logs above for details"
else
    print_success "All database migrations completed successfully"
fi

# Restore errexit state if needed
if [[ $local_errexit -eq 1 ]]; then
    set -e
fi

exit 0
