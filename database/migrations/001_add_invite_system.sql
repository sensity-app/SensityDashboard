-- Migration: Add invite system and user improvements
-- Version: 001
-- Description: Adds user_invitations table and full_name column to users table

-- Add full_name column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);

-- Create user_invitations table for invite-only registration
CREATE TABLE IF NOT EXISTS user_invitations (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer',
    full_name VARCHAR(255) NOT NULL,
    token VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    invited_by INTEGER REFERENCES users(id),
    used_at TIMESTAMP,
    used_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_invitations_token ON user_invitations(token);
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_user_invitations_expires_at ON user_invitations(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_invitations_used_at ON user_invitations(used_at);

-- Grant necessary permissions (adjust as needed for your database user)
-- GRANT ALL ON user_invitations TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE user_invitations_id_seq TO your_app_user;

-- Insert migration record (optional, for tracking)
-- CREATE TABLE IF NOT EXISTS schema_migrations (
--     id SERIAL PRIMARY KEY,
--     version VARCHAR(20) NOT NULL UNIQUE,
--     applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );
-- INSERT INTO schema_migrations (version) VALUES ('001') ON CONFLICT (version) DO NOTHING;