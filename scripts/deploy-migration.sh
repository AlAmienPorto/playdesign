#!/bin/bash
set -e

TARGET="${1:---remote}"

if [ "$TARGET" == "--local" ]; then
  echo "🚀 Deploying D1 migration locally..."
  npx wrangler d1 execute office-crm --local --file migrations/0004_leads_scraper.sql
  echo "✅ Local migration complete!"
elif [ "$TARGET" == "--remote" ]; then
  echo "🚀 Deploying D1 migration to remote..."
  npx wrangler d1 execute office-crm --remote --file migrations/0004_leads_scraper.sql
  echo "✅ Remote migration complete!"
else
  echo "Error: Unknown target '$TARGET'. Use '--local' or '--remote'."
  exit 1
fi
