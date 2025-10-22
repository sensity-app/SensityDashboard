-- Migration: Seed default branding settings
-- Date: 2025-10-22
-- Description: Initialize default branding settings in the settings table (uses existing infrastructure)

-- Insert default branding settings into the settings table
-- The settings table already exists and uses category/key/value(JSONB) structure

-- Insert company name
INSERT INTO settings (category, key, value, created_at, updated_at)
VALUES ('branding', 'companyName', '"Sensity"', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (category, key) DO NOTHING;

-- Insert primary color
INSERT INTO settings (category, key, value, created_at, updated_at)
VALUES ('branding', 'primaryColor', '"#2563eb"', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (category, key) DO NOTHING;

-- Insert accent color
INSERT INTO settings (category, key, value, created_at, updated_at)
VALUES ('branding', 'accentColor', '"#1d4ed8"', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (category, key) DO NOTHING;
