#!/bin/bash

###############################################################################
# ESP8266 IoT Platform - Development Update Script
#
# This script updates the development environment (no root required)
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PROJECT_DIR}/backups"

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

create_backup() {
    print_status "Creating backup..."

    # Create backup directory if it doesn't exist
    mkdir -p "$BACKUP_DIR"

    # Create backup with timestamp
    BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S)"
    BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

    # Backup key directories and files
    mkdir -p "$BACKUP_PATH"

    # Backup package.json files and node_modules (just package files)
    if [ -f "$PROJECT_DIR/backend/package.json" ]; then
        cp "$PROJECT_DIR/backend/package.json" "$BACKUP_PATH/backend-package.json"
    fi
    if [ -f "$PROJECT_DIR/frontend/package.json" ]; then
        cp "$PROJECT_DIR/frontend/package.json" "$BACKUP_PATH/frontend-package.json"
    fi

    # Backup environment files
    if [ -f "$PROJECT_DIR/backend/.env" ]; then
        cp "$PROJECT_DIR/backend/.env" "$BACKUP_PATH/backend.env"
    fi

    # Save git commit info
    git rev-parse HEAD > "$BACKUP_PATH/git-commit.txt" 2>/dev/null || echo "unknown" > "$BACKUP_PATH/git-commit.txt"

    print_success "Backup created: $BACKUP_PATH"
    echo "$BACKUP_PATH" > "$PROJECT_DIR/.last-backup"
}

rollback_from_backup() {
    if [ ! -f "$PROJECT_DIR/.last-backup" ]; then
        print_error "No recent backup found for rollback"
        return 1
    fi

    BACKUP_PATH=$(cat "$PROJECT_DIR/.last-backup")
    if [ ! -d "$BACKUP_PATH" ]; then
        print_error "Backup directory not found: $BACKUP_PATH"
        return 1
    fi

    print_status "Rolling back from backup: $BACKUP_PATH"

    # Restore git state if available
    if [ -f "$BACKUP_PATH/git-commit.txt" ]; then
        BACKUP_COMMIT=$(cat "$BACKUP_PATH/git-commit.txt")
        if [ "$BACKUP_COMMIT" != "unknown" ]; then
            print_status "Restoring git state to: $BACKUP_COMMIT"
            git reset --hard "$BACKUP_COMMIT" || print_warning "Git reset failed"
        fi
    fi

    # Restore package files if they exist
    if [ -f "$BACKUP_PATH/backend-package.json" ]; then
        cp "$BACKUP_PATH/backend-package.json" "$PROJECT_DIR/backend/package.json"
        print_status "Restored backend package.json"
    fi

    if [ -f "$BACKUP_PATH/frontend-package.json" ]; then
        cp "$BACKUP_PATH/frontend-package.json" "$PROJECT_DIR/frontend/package.json"
        print_status "Restored frontend package.json"
    fi

    # Restore environment files
    if [ -f "$BACKUP_PATH/backend.env" ]; then
        cp "$BACKUP_PATH/backend.env" "$PROJECT_DIR/backend/.env"
        print_status "Restored backend .env"
    fi

    print_success "Rollback completed!"
}

cleanup_old_backups() {
    if [ ! -d "$BACKUP_DIR" ]; then
        return 0
    fi

    print_status "Cleaning up old backups..."

    # Count current backups
    BACKUP_COUNT=$(ls -1 "$BACKUP_DIR" | wc -l)

    if [ "$BACKUP_COUNT" -gt 3 ]; then
        print_status "Found $BACKUP_COUNT backups, keeping only the 3 most recent ones"

        # Remove old backups, keeping only the 3 most recent
        cd "$BACKUP_DIR"
        ls -1t | tail -n +4 | xargs -I {} rm -rf "{}"

        NEW_COUNT=$(ls -1 "$BACKUP_DIR" | wc -l)
        print_status "Cleaned up old backups, now have $NEW_COUNT backup(s)"
    else
        print_status "Have $BACKUP_COUNT backup(s), no cleanup needed"
    fi
}

update_development_system() {
    print_status "🔄 Updating ESP8266 IoT Platform (Development Mode)..."

    cd "$PROJECT_DIR"

    # Create backup first
    create_backup

    # Check if we have git repository
    if [ ! -d ".git" ]; then
        print_warning "Not a git repository - cannot pull updates"
        print_status "Please manually update your code"
        return 0
    fi

    # Update from Git
    print_status "Fetching latest version from Git..."
    git fetch origin || {
        print_error "Git fetch failed"
        print_status "Attempting rollback..."
        rollback_from_backup
        return 1
    }

    # Check if we're behind
    LOCAL=$(git rev-parse @)
    REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "")

    if [ "$LOCAL" = "$REMOTE" ]; then
        print_status "Already up to date!"
        return 0
    fi

    print_status "Pulling latest changes..."
    git pull origin main || git pull origin master || {
        print_error "Git pull failed"
        print_status "Attempting rollback..."
        rollback_from_backup
        return 1
    }

    # Update backend dependencies
    if [ -f "backend/package.json" ]; then
        print_status "Updating backend dependencies..."
        cd "$PROJECT_DIR/backend"
        npm install --include=dev || {
            print_error "Backend npm install failed"
            cd "$PROJECT_DIR"
            rollback_from_backup
            return 1
        }
    fi

    # Update and build frontend
    if [ -f "frontend/package.json" ]; then
        print_status "Updating and building frontend..."
        cd "$PROJECT_DIR/frontend"
        npm install --include=dev || {
            print_error "Frontend npm install failed"
            cd "$PROJECT_DIR"
            rollback_from_backup
            return 1
        }

        NODE_ENV=production npm run build || {
            print_error "Frontend build failed"
            cd "$PROJECT_DIR"
            rollback_from_backup
            return 1
        }
    fi

    cd "$PROJECT_DIR"

    # Clean up old backups on successful update (keep only the most recent one as safety)
    cleanup_old_backups

    print_success "✅ Development system updated successfully!"
    echo
    print_status "📝 Restart your development server to apply changes"
    print_status "🔧 Backend: npm start (in backend directory)"
    print_status "🎨 Frontend: npm start (in frontend directory)"
}

# Main script logic
main() {
    if [[ "$1" == "rollback" ]]; then
        rollback_from_backup
    elif [[ "$1" == "update" ]] || [[ "$1" == "" ]]; then
        update_development_system
    else
        echo "ESP8266 IoT Platform Development Update Script"
        echo
        echo "Usage:"
        echo "  $0                # Update development system"
        echo "  $0 update         # Update development system"
        echo "  $0 rollback       # Rollback to last backup"
        echo
    fi
}

main "$@"
