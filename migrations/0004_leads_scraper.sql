-- Migration: Alter existing leads table to support WhatsApp scraper fields
-- Created: 2026-11-01
-- Purpose: Add specific columns needed by the Google Maps WhatsApp scraper while preserving existing lead records

-- Add new columns for GMaps WhatsApp scraping data (ALTER TABLE statements)
ALTER TABLE leads ADD COLUMN category TEXT;
ALTER TABLE leads ADD COLUMN full_address TEXT;
ALTER TABLE leads ADD COLUMN rating DECIMAL(2,1);
ALTER TABLE leads ADD COLUMN whatsapp_verified BOOLEAN DEFAULT 0;
ALTER TABLE leads ADD COLUMN whatsapp_link TEXT;
ALTER TABLE leads ADD COLUMN google_maps_url TEXT;
ALTER TABLE leads ADD COLUMN confidence_score DECIMAL(3,2);
ALTER TABLE leads ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create indexes for the new/existing fields to optimize queries
CREATE INDEX IF NOT EXISTS idx_leads_location ON leads(location);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_link ON leads(whatsapp_link);
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_verified ON leads(whatsapp_verified);
