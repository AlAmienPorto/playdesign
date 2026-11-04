-- Migration: Ensure all legacy and new CRM columns exist on leads table
ALTER TABLE leads ADD COLUMN workspace_id TEXT DEFAULT 'playdesign';
ALTER TABLE leads ADD COLUMN name TEXT;
ALTER TABLE leads ADD COLUMN company TEXT;
ALTER TABLE leads ADD COLUMN role TEXT DEFAULT 'Owner';
ALTER TABLE leads ADD COLUMN email TEXT;
ALTER TABLE leads ADD COLUMN phone TEXT;
ALTER TABLE leads ADD COLUMN location TEXT;
ALTER TABLE leads ADD COLUMN score INTEGER DEFAULT 60;
ALTER TABLE leads ADD COLUMN value INTEGER DEFAULT 5000000;
ALTER TABLE leads ADD COLUMN owner_id TEXT DEFAULT 'ja';
ALTER TABLE leads ADD COLUMN last_activity TEXT DEFAULT 'Added via GMaps Scraper';
ALTER TABLE leads ADD COLUMN tags TEXT DEFAULT '["UMKM", "Jawa Tengah"]';
ALTER TABLE leads ADD COLUMN next_step TEXT DEFAULT 'Kirim perkenalan WhatsApp';
ALTER TABLE leads ADD COLUMN notes TEXT;

-- Update existing rows so company and location are populated from company_name and city
UPDATE leads SET company = company_name WHERE company IS NULL;
UPDATE leads SET name = company_name WHERE name IS NULL;
UPDATE leads SET location = city WHERE location IS NULL;
UPDATE leads SET phone = phone_number WHERE phone IS NULL;
UPDATE leads SET workspace_id = 'playdesign' WHERE workspace_id IS NULL;
