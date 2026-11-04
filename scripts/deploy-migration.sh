#!/bin/bash
set -e

echo "🚀 Deploying D1 migration to remote..."
npx wrangler d1 execute office-crm --remote --file migrations/0004_leads_scraper.sql
echo "✅ Remote migration complete!"
