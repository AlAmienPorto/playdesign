# WhatsApp Lead Scraper (Jawa Tengah) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build automated Google Maps scraper that finds UMKM contacts in Central Java cities with verified WhatsApp numbers and integrates directly into existing Playdesign CRM leads dashboard.

**Architecture:** Worker-based scraping pipeline using Playwright for browser automation + Cloudflare D1 database persistence + cron-scheduled daily execution, with frontend UI for lead management already integrated into `/leads` route.

**Tech Stack:** 
- Browser Automation: Playwright (stealth mode)
- Database: Cloudflare D1 (existing `office-crm` instance)
- Scheduler: Hermes Cron Job
- Frontend: Existing Vite React + Tailwind CSS (Leads.tsx already built)
- Verification: wa.me API HEAD request validation

**Spec:** This implementation plan implements the approved design document for "Automated WhatsApp Lead Scanner - Jawa Tengah"

## Global Constraints

- **Database Instance ID**: `6edc7e5e-b448-49dc-8654-94ea3bc9d7a1` (remote D1 production)
- **Worker Deploy URL**: `https://kantor.playdesign.my.id` (API_TOKEN already configured)
- **Target Cities**: 12 total (4 big cities + 8 industrial hubs): Semarang, Solo, Tegal, Magelang, Pekalongan, Klaten, Boyolali, Cilacap, Pati, Kudus, Rembang
- **Keywords per City**: 15 general business keywords (UMKM, toko kecil, produsen, katering harian, etc.)
- **Output Format**: Insert directly to D1 `leads` table with `source='gmaps_scraper'`
- **Verification Method**: HEAD request to `https://wa.me/<number>?text=...` validates number exists on WhatsApp
- **Cron Schedule**: Every day at 08:00 WIB (`0 8 * * *`)
- **Maximum Runtime**: 15 minutes per city batch → graceful timeout fallback
- **Rate Limiting**: Max 2 requests/second/city to avoid GMaps IP ban
- **UI Integration**: Must match existing `/leads` page styling and column layout

## Review Focus

| Risk | Test Coverage |
|------|---------------|
| **False-positive WA numbers** | Verify via actual `wa.me` response status before insert |
| **GMaps rate limiting/ban** | Implement exponential backoff, verify 429 retry logic |
| **Duplicate leads** | UNIQUE constraint on `whatsapp_link`, dedupe during batch insert |
| **Data quality variance** | Add `confidence_score` field for scraped metadata accuracy |
| **Network timeout** | Retry logic with max 3 attempts per scrape job |

---

### Task 1: Cloudflare D1 Database Schema Migration

**Files:**
- Create: `migrations/0004_leads_scraper.sql`

**Interfaces:**
- Consumes: None (first-time migration)
- Produces: `leads` table with all required columns and indexes for query performance

Steps:
- [ ] **Step 1: Write SQL migration for `leads` table**

```sql
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
```

- [ ] **Step 2: Run migration locally first**

Command:
```bash
npx wrangler d1 execute office-crm --local --file migrations/0004_leads_scraper.sql
```
Expected: Success without errors, table created

- [ ] **Step 3: Verify local schema**

Run:
```bash
npx wrangler d1 execute office-crm --local --command "PRAGMA table_info(leads)"
```
Expected: Returns 13 columns matching our schema

- [ ] **Step 4: Commit migration file to git**

Command:
```bash
git add migrations/0004_leads_scraper.sql && git commit -m "chore(schema): add leads table for WhatsApp scrapers"
```

- [ ] **Step 5: Create remote migration runner script**

File: `scripts/deploy-migration.sh`
Content:
```bash
#!/bin/bash
set -e
echo "🚀 Deploying D1 migration to remote..."
npx wrangler d1 execute office-crm --remote --file migrations/0004_leads_scraper.sql
echo "✅ Remote migration complete!"
```
Make executable: `chmod +x scripts/deploy-migration.sh`

- [ ] **Step 6: Deploy migration to production**

Command:
```bash
./scripts/deploy-migration.sh
```
Expected: "SUCCESS" message + "changes_written > 0" in output

**Verification test:**
- [ ] **Test**: Query inserted schema remotely
```bash
npx wrangler d1 execute office-crm --remote --command "SELECT COUNT(*) FROM leads"
```
Expected: `{"results":[{"COUNT(*)":0}]}` (empty but valid table)

---

### Task 2: LeadScraper Worker (Backend)

**Files:**
- Create: `worker/scraper/index.ts` (main scraping logic)
- Create: `worker/scraper/utils.ts` (helper functions)
- Modify: `worker/index.ts` (add new routes and export functions)

**Interfaces:**
- Consumes: Playwright browser session, D1 connection
- Produces: Batch-inserted leads with verified WhatsApp links

#### Step 1: Install playwright dependency (if not installed)

- [ ] Check if playwright is installed: `npm list playwright`
- [ ] If missing, install: `npm install playwright@latest`
- [ ] Add to package.json `"devDependencies": { "playwright": "^1.40.0" }`

#### Step 2: Create `worker/scraper/utils.ts`

File content:
```typescript
// Utility functions for lead scraping
export function generateId(): string {
  return `lead-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function formatPhoneNumber(phone: string): string {
  // Extract digits only
  const digits = phone.replace(/\D/g, '');
  
  // Handle Indonesian format
  if (digits.startsWith('08')) {
    return '62' + digits.substring(1);
  }
  
  return digits.startsWith('62') ? digits : null;
}

export function buildWhatsappLink(phone: string): string {
  const formatted = formatPhoneNumber(phone);
  return formatted ? `https://wa.me/${formatted}?text=Hello%20from%20Playdesign` : null;
}

export function validateWhatsappLink(link: string): boolean {
  try {
    const url = new URL(link);
    return url.protocol === 'https:' && url.host === 'wa.me';
  } catch {
    return false;
  }
}

export function calculateConfidenceScore(rating: number | null, reviewCount: number | null): number {
  let score = 0.6; // Base score
  
  if (rating) score += rating / 5 * 0.2;
  if (reviewCount && reviewCount > 10) score += 0.2;
  else if (reviewCount && reviewCount > 0) score += 0.1;
  
  return Math.min(Math.max(score, 0.0), 1.0);
}

// Safe SQL escaping for text fields
export function escapeSql(text: string): string {
  return text.replace(/'/g, "''").replace(/\n/g, '\\n');
}
```

- [ ] **Step 3: Implement main scraper logic in `worker/scraper/index.ts`**

File structure:
```typescript
import type { Env } from '../index';
import { formatPhoneNumber, buildWhatsappLink, validateWhatsappLink, generateId, calculateConfidenceScore, escapeSql } from './utils';

// Configuration
const CITIES = [
  "Semarang", "Solo", "Tegal", "Magelang", "Pekalongan", 
  "Klaten", "Boyolali", "Cilacap", "Pati", "Kudus", "Rembang"
];

const KEYWORDS = [
  "UMKM", "toko kecil", "usaha lokal", "jasa servis", "bisnis rumahan",
  "produsen", "katering harian", "bakeri", "pengolahan pangan", "gastro mobile",
  "kerajinan tangan", "produksen batik", "konveksi", "fabrikasi", "craf craft"
];

export async function scrapeLeads(env: Env): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // Step 1: Execute scrape loop for each city+keyword combo
    let totalCount = 0;
    
    for (const city of CITIES) {
      for (const keyword of KEYWORDS) {
        const results = await scrapeGoogleMapsCity(env, city, keyword);
        if (!results.success) {
          console.error(`[LeadScraper] Failed to scrape ${city}/${keyword}: ${results.error}`);
          continue;
        }
        
        // Step 2: Verify WhatsApp links and insert to D1
        const verified = await verifyAndInsertLeads(env, results.leads);
        totalCount += verified.count;
        
        // Rate limiting: wait 500ms between searches
        await sleep(500);
      }
    }
    
    return { success: true, count: totalCount };
  } catch (error) {
    return { success: false, count: 0, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function scrapeGoogleMapsCity(env: Env, city: string, keyword: string): Promise<{ success: boolean; leads: any[]; error?: string }> {
  // TODO: Implement Playwright-based scraping
  // 1. Navigate to Google Maps (maps.google.com)
  // 2. Search for "${keyword} near ${city}, Jawa Tengah"
  // 3. Extract listing cards (name, address, phone, rating, reviews)
  // 4. Filter for those with WhatsApp button
  // Return: Array of lead objects
}

async function verifyAndInsertLeads(env: Env, rawLeads: any[]): Promise<{ count: number; failed: number }> {
  let successCount = 0;
  let failedCount = 0;
  
  const values: string[] = [];
  const inserts: string[] = [];
  
  for (const lead of rawLeads) {
    // Verify WhatsApp number
    const whatsappLink = buildWhatsappLink(lead.phone);
    if (!whatsappLink || !validateWhatsappLink(whatsappLink)) {
      failedCount++;
      continue;
    }
    
    // Check for duplicates via wa.me HEAD request
    const headRes = await fetch(whatsappLink, { 
      method: 'HEAD', 
      redirect: 'manual',
      signal: AbortSignal.timeout(5000)
    });
    
    const isValid = headRes.status === 200 || headRes.status === 302;
    if (!isValid) {
      failedCount++;
      continue;
    }
    
    // Prepare INSERT statement
    const id = generateId();
    const companyName = escapeSql(lead.company || 'Unknown');
    const cityVal = escapeSql(lead.city);
    const category = escapeSql(lead.keyword || '');
    const address = escapeSql(lead.address || '');
    const rating = lead.rating ?? null;
    const phone = escapeSql(formatPhoneNumber(lead.phone));
    const whatsapp = escapeSql(whatsappLink);
    const mapsUrl = escapeSql(lead.mapsUrl || '');
    const confScore = calculateConfidenceScore(lead.rating, lead.reviewCount);
    
    values.push(`('${id}', '${companyName}', '${cityVal}', '${category}', '${address}', ${rating}, '${phone}', 1, '${whatsapp}', '${mapsUrl}', 'verified', ${confScore}, 'gmaps_scraper', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
    inserts.push(`INSERT INTO leads (id, company_name, city, category, full_address, rating, phone_number, whatsapp_verified, whatsapp_link, google_maps_url, status, confidence_score, source, created_at, updated_at) VALUES ${values.join(', ')}`);
  }
  
  if (inserts.length > 0) {
    // Execute batch insert
    await env.OFFICE_CRM.exec(inserts.join(';'));
    successCount = inserts.length;
  }
  
  return { count: successCount, failed: failedCount };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

- [ ] **Step 4: Register new route in `worker/index.ts`**

Add to existing route handlers:
```typescript
// New endpoint for manual trigger
if (pathname === '/api/leads/sync') {
  return handleLeadSync(env, req);
}

async function handleLeadSync(env: Env, req: Request): Promise<Response> {
  const { cities, force_refresh } = await req.json() as { cities?: string[], force_refresh?: boolean };
  
  console.log('[LeadSync] Starting sync for:', cities?.length || 'all');
  const result = await scrapeLeads(env);
  
  return json({
    success: result.success,
    queued_jobs: CITIES.length * KEYWORDS.length,
    processed: result.count,
    message: `Scraper completed: ${result.count} verified leads added`
  });
}
```

- [ ] **Step 5: Test scraper manually**

Command:
```bash
npx wrangler dev
# Then POST http://localhost:8787/api/leads/sync with body: {}
```
Expected: Console logs showing scraping progress, no crash

**Verification tests:**
- [ ] **Test**: Check D1 table populated after run
```bash
npx wrangler d1 execute office-crm --remote --command "SELECT COUNT(*), MAX(created_at) FROM leads"
```
Expected: Count > 0 if scraping successful

---

### Task 3: Frontend Integration (Leads Dashboard Enhancement)

**Files:**
- Modify: `src/pages/Leads.tsx` (add scraper integration)
- Modify: `src/lib/officeApi.ts` (add scraper endpoints)

#### Step 1: Add scraper API methods to `src/lib/officeApi.ts`

```typescript
// ... existing code

export interface LeadSyncResult {
  success: boolean;
  queued_jobs: number;
  processed: number;
  message: string;
}

export async function triggerLeadSync(cities?: string[]): Promise<LeadSyncResult> {
  const result = await request<LeadSyncResult>('/api/leads/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cities, force_refresh: true }),
  });
  return result;
}

// Fetch leads from D1 (new endpoint needed in worker)
export async function fetchLeads(): Promise<OfficeLead[]> {
  return request<OfficeLead[]>('/api/leads/list');
}
```

- [ ] **Step 2: Update `src/pages/Leads.tsx` to call scraper endpoint**

Add new button to PageHeader (after line ~409):
```tsx
<Button variant="secondary" onClick={runScraper}>
  <Sparkles size={15} /> Run WhatsApp scraper
</Button>
```

Implement handler:
```typescript
const [scraperBusy, setScraperBusy] = useState(false);
const [scraperMessage, setScraperMessage] = useState<string | null>(null);

const runScraper = async () => {
  if (scraperBusy) return;
  setScraperBusy(true);
  setScraperMessage("Starting scraper... This will take a few minutes.");
  
  try {
    const result = await triggerLeadSync();
    if (result.success) {
      setScraperMessage(`✅ Success: ${result.processed} new leads verified and added.`);
      // Refresh leads list
      reloadLeads();
    } else {
      setScraperMessage("❌ Scraper failed. Check console logs.");
    }
  } catch (error) {
    setScraperMessage(`Error: ${error.message}`);
  } finally {
    setScraperBusy(false);
    // Auto-clear message after 10 seconds
    setTimeout(() => setScraperMessage(null), 10000);
  }
};
```

- [ ] **Step 3: Display scraper message banner in UI**

Add after PageHeader:
```tsx
{scraperMessage && (
  <div className={`mt-4 rounded-lg border p-4 ${scraperMessage.includes('success') ? 'border-success bg-success-soft' : 'border-warning bg-warning-soft'}`}>
    <p className="text-sm font-medium">{scraperMessage}</p>
  </div>
)}
```

**Verification tests:**
- [ ] **Test**: Click "Run WhatsApp scraper" button
Expected: Button shows loading state, then success message appears

- [ ] **Test**: New leads appear in table after scraper completes
Expected: Row count increases, new leads show with `Source: GMaps Scraper` tag

---

### Task 4: Cron Job Scheduling

**Files:**
- Create: `.hermes/plugins/superpowers/skills/lead-scraper-daily/SKILL.md` (optional skill for context)
- Configure: Hermes cron via terminal

Steps:
- [ ] **Step 1: Create Hermes cron job**

Command:
```bash
hermes plugins run lead-scraper-daily \
  --schedule "0 8 * * *" \
  --name "Playdesign Daily Lead Scraper" \
  --script "scripts/run-scraper.js" \
  --deliver origin
```

Create `scripts/run-scraper.js`:
```javascript
#!/usr/bin/env node
const { spawn } = require('child_process');

console.log('[Scraper Cron] Running daily WhatsApp lead extraction...');

const wrangler = spawn('npx', ['wrangler', 'dispatch', '--path', '/api/leads/sync'], {
  cwd: '/home/ubuntu/work/playdesign'
});

wrangler.stdout.on('data', (data) => console.log(`[OUT] ${data}`));
wrangler.stderr.on('data', (data) => console.error(`[ERR] ${data}`));
wrangler.on('close', (code) => {
  console.log(`[DONE] Scraper exited with code ${code}`);
  process.exit(code || 0);
});
```

Make executable: `chmod +x scripts/run-scraper.js`

- [ ] **Step 2: Verify cron is scheduled**

Command:
```bash
hermes cronjob_manage list
```
Expected: Find entry "Playdesign Daily Lead Scraper" with next_run_at = tomorrow 08:00 WIB

- [ ] **Step 3: Test manual cron trigger**

Command:
```bash
hermes cronjob_manage run lead-scraper-daily --job-id=<JOB_ID>
```
Expected: Immediate execution and notification delivered to chat

---

### Task 5: Testing & Validation

**Files:**
- N/A (test commands are CLI-based)

Steps:
- [ ] **Test 1: Manual run scraper**
  - Go to `/leads` page
  - Click "Run WhatsApp scraper" button
  - Verify success message and row count increase

- [ ] **Test 2: Verify database integrity**
```bash
npx wrangler d1 execute office-crm --remote --command "SELECT DISTINCT city FROM leads ORDER BY city"
```
Expected: All 11 targeted cities present

- [ ] **Test 3: Validate WhatsApp links**
```bash
npx wrangler d1 execute office-crm --remote --command "SELECT whatsapp_link FROM leads LIMIT 5"
```
Expected: All links start with `https://wa.me/`

- [ ] **Test 4: Check for duplicate handling**
Run scraper twice consecutively
Expected: Second run reports 0 new leads (all duplicates blocked by UNIQUE constraint)

- [ ] **Test 5: Monitor rate limiting behavior**
Add temporary debug logs to scraper for 5-minute window
Expected: No HTTP 429 errors logged

---

### Task 6: Deployment Checklist

Steps:
- [ ] Commit all files:
  ```bash
  git add . && git commit -m "feat(leads): WhatsApp scraper integration from GMaps"
  ```
- [ ] Deploy worker changes:
  ```bash
  npx wrangler deploy --env=production
  ```
- [ ] Deploy DB migration (already done in Task 1)
- [ ] Verify production scraper works:
  - Visit `https://kantor.playdesign.my.id/leads`
  - Trigger manual run
  - Confirm results appear

- [ ] Document setup in project README:
  Add section: "WhatsApp Lead Scraper Setup"

---

## Execution Handoff

**Plan complete and saved.** Please review the plan. Does it capture what you want? Which execution approach would you prefer?

- **Subagent-driven** - A fresh subagent implements each task and a fresh reviewer checks it before the next one starts. Most thorough.
- **Native** - I implement every task myself in this session, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest.

**For this plan I recommend Native**, because the tasks are tightly coupled (each builds on prior tasks' interfaces) and there are 6 major tasks requiring shared state validation.

Does the plan capture what you want, and should we proceed with Native execution?
