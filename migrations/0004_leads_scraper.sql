-- Table for scraped WhatsApp leads from Google Maps
CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,                 -- UUID-style identifier
    company_name TEXT NOT NULL,          -- Business name (required)
    city TEXT NOT NULL,                  -- Kota/kabupaten target
    category TEXT,                        -- Keyword used for search
    full_address TEXT,                   -- Full address from GMaps
    rating DECIMAL(2,1),                -- Google Maps rating (0-5, nullable)
    phone_number TEXT,                  -- Phone number scraped
    whatsapp_verified BOOLEAN DEFAULT 0, -- Verified via wa.me HEAD check
    whatsapp_link TEXT UNIQUE,          -- Formatted: https://wa.me/<number>
    google_maps_url TEXT,              -- Source link for reference
    status TEXT DEFAULT 'pending',     -- pending | verified | invalid | outreach_started
    confidence_score DECIMAL(3,2),     -- Scraped data reliability (0.00-1.00)
    source TEXT DEFAULT 'gmaps_scraper', -- Always 'gmaps_scraper' for batch jobs
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast filtering and aggregation
CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp ON leads(whatsapp_verified);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);

-- Trigger for updated_at auto-update
CREATE TRIGGER IF NOT EXISTS update_leads_updated_at 
AFTER UPDATE ON leads 
BEGIN
    UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
