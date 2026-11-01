#!/usr/bin/env bash
# Deploy Playdesign Office CRM ke Cloudflare Workers + D1
# Pakai: ./deploy-cf.sh [--domain kantor.playdesign.my.id]
set -euo pipefail

DOMAIN="${2:-}"
DB_NAME="office-crm"
WRANGLER="npx wrangler"

say() { printf "\n\033[1;36m▸ %s\033[0m\n" "$1"; }
die() { printf "\n\033[1;31m✗ %s\033[0m\n" "$1" >&2; exit 1; }

# ---------- 0. cek auth ----------
say "Cek autentikasi Cloudflare"
if ! $WRANGLER whoami 2>/dev/null | grep -qiE "associated with the email|account"; then
  die "Belum login. Jalankan dulu: npx wrangler login   (atau set CLOUDFLARE_API_TOKEN)"
fi
$WRANGLER whoami

# ---------- 1. pastikan D1 ada ----------
say "Cek database D1 '$DB_NAME'"
DB_ID=$(npx wrangler d1 list --json 2>/dev/null \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((x['uuid'] for x in d if x['name']=='$DB_NAME'),''))")

if [ -z "$DB_ID" ]; then
  say "Database belum ada — membuat baru"
  $WRANGLER d1 create "$DB_NAME"
  DB_ID=$(npx wrangler d1 list --json 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((x['uuid'] for x in d if x['name']=='$DB_NAME'),''))")
fi
[ -z "$DB_ID" ] && die "Gagal mendapatkan database_id"
echo "database_id = $DB_ID"

# ---------- 2. suntik database_id ke config ----------
say "Menulis database_id ke wrangler.jsonc"
python3 - "$DB_ID" <<'PY'
import re, sys, pathlib
db_id = sys.argv[1]
p = pathlib.Path("wrangler.jsonc")
s = p.read_text()
s = re.sub(r'("database_id":\s*")[^"]*(")', r'\g<1>' + db_id + r'\g<2>', s, count=1)
p.write_text(s)
print("ok:", db_id)
PY

# ---------- 3. migrasi + seed ----------
say "Menerapkan migrasi ke D1 remote"
$WRANGLER d1 migrations apply "$DB_NAME" --remote

say "Memuat seed data (synthetic demo)"
$WRANGLER d1 execute "$DB_NAME" --remote --file=seed/seed.sql --yes

# ---------- 4. secret API_TOKEN ----------
say "Cek secret API_TOKEN"
if ! $WRANGLER secret list 2>/dev/null | grep -q "API_TOKEN"; then
  echo "Secret API_TOKEN belum ada."
  echo "Buat token acak dulu:  openssl rand -hex 32"
  echo "Lalu jalankan:         npx wrangler secret put API_TOKEN"
  die "Set API_TOKEN dulu, lalu ulangi script ini"
fi

# ---------- 5. build + deploy ----------
say "Build SPA"
npm run build

say "Deploy ke Cloudflare Workers"
$WRANGLER deploy

# ---------- 6. custom domain ----------
if [ -n "$DOMAIN" ]; then
  say "Memasang custom domain: $DOMAIN"
  cat > wrangler.domain.jsonc <<EOF
{
  "\$schema": "node_modules/wrangler/config-schema.json",
  "name": "playdesign-office-crm",
  "main": "worker/index.ts",
  "compatibility_date": "2026-09-01",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "$DB_NAME", "database_id": "$DB_ID", "migrations_dir": "migrations" }
  ],
  "observability": { "enabled": true },
  "routes": [ { "pattern": "$DOMAIN", "custom_domain": true } ]
}
EOF
  $WRANGLER deploy --config wrangler.domain.jsonc || die "Deploy custom domain gagal — pastikan zona playdesign.my.id sudah aktif di akun Cloudflare ini (nameserver harus sudah pindah ke Cloudflare)"
fi

say "Selesai"
