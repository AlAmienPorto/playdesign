-- Backfill scraper aliases on the CRM leads schema.
-- All canonical CRM columns are created by 0001; adding them again here made
-- fresh installs fail with "duplicate column name" after 0004 was repaired.

UPDATE leads
   SET company_name = COALESCE(company_name, company),
       city = COALESCE(city, location),
       phone_number = COALESCE(phone_number, phone),
       company = COALESCE(NULLIF(company, ''), company_name),
       name = COALESCE(NULLIF(name, ''), company_name),
       location = COALESCE(NULLIF(location, ''), city),
       phone = COALESCE(NULLIF(phone, ''), phone_number),
       workspace_id = COALESCE(NULLIF(workspace_id, ''), 'playdesign');
