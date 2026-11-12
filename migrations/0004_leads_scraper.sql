-- Extend the CRM leads table created by 0001 with scraper-specific fields.
--
-- The old version used CREATE TABLE IF NOT EXISTS leads (...), but 0001
-- already owns that table. SQLite therefore kept the CRM schema unchanged and
-- the following index on `city` failed on every fresh database.

ALTER TABLE leads ADD COLUMN company_name TEXT;
ALTER TABLE leads ADD COLUMN city TEXT;
ALTER TABLE leads ADD COLUMN category TEXT;
ALTER TABLE leads ADD COLUMN full_address TEXT;
ALTER TABLE leads ADD COLUMN rating REAL;
ALTER TABLE leads ADD COLUMN phone_number TEXT;
ALTER TABLE leads ADD COLUMN whatsapp_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN whatsapp_link TEXT;
ALTER TABLE leads ADD COLUMN google_maps_url TEXT;
ALTER TABLE leads ADD COLUMN confidence_score REAL;
ALTER TABLE leads ADD COLUMN updated_at TEXT;

-- Preserve the CRM values as scraper-compatible aliases for existing rows.
UPDATE leads
   SET company_name = COALESCE(company_name, company),
       city = COALESCE(city, location),
       phone_number = COALESCE(phone_number, phone),
       updated_at = COALESCE(updated_at, created_at);

CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp ON leads(whatsapp_verified);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_whatsapp_link
  ON leads(whatsapp_link)
  WHERE whatsapp_link IS NOT NULL AND whatsapp_link <> '';

CREATE TRIGGER IF NOT EXISTS update_leads_updated_at
AFTER UPDATE ON leads
BEGIN
  UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
