-- Verifiable source links for scraped leads.
-- Every lead should point back to the page it was found on, so a human can
-- open it and confirm the business + phone number are real.

ALTER TABLE leads ADD COLUMN source_url TEXT;
ALTER TABLE leads ADD COLUMN source_type TEXT;   -- gmaps | instagram | website
ALTER TABLE leads ADD COLUMN instagram TEXT;

-- Backfill from the existing google_maps_url column.
UPDATE leads
   SET source_url = google_maps_url
 WHERE (source_url IS NULL OR source_url = '')
   AND google_maps_url IS NOT NULL
   AND google_maps_url <> '';

UPDATE leads
   SET source_type = CASE
     WHEN source_url LIKE '%maps.google%'
       OR source_url LIKE '%google.com/maps%'
       OR source_url LIKE '%goo.gl/maps%'
       OR source_url LIKE '%maps.app.goo.gl%' THEN 'gmaps'
     WHEN source_url LIKE '%instagram.com%' THEN 'instagram'
     WHEN source_url IS NULL OR source_url = '' THEN 'gmaps'
     ELSE 'website'
   END
 WHERE source_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_source_type ON leads (source_type);
