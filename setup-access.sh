#!/usr/bin/env bash
# Pasang Cloudflare Access untuk kantor.playdesign.my.id (idempoten).
# Prasyarat: Zero Trust / Access sudah di-"Enable" di dashboard (sekali saja).
# Pakai: ./setup-access.sh [email-yang-boleh-masuk]
set -euo pipefail

ACC="208bdedb8ffedb4931cd6b5fc5cd5d7c"
HOST="kantor.playdesign.my.id"
EMAIL="${1:-corocyber99@gmail.com}"
APP_NAME="Playdesign Office CRM"
TOKEN=$(grep -oP 'oauth_token\s*=\s*"\K[^"]+' "$HOME/.config/.wrangler/config/default.toml")

say() { printf "\n\033[1;36m▸ %s\033[0m\n" "$1"; }
die() { printf "\n\033[1;31m✗ %s\033[0m\n" "$1" >&2; exit 1; }

api() { # method path [body]
  local m="$1" p="$2" b="${3:-}"
  if [ -n "$b" ]; then
    curl -s -X "$m" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d "$b" "https://api.cloudflare.com/client/v4$p"
  else
    curl -s -X "$m" -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4$p"
  fi
}

# ---------- 1. pastikan Access aktif ----------
say "Cek status Access"
ORG=$(api GET "/accounts/$ACC/access/organizations")
if ! echo "$ORG" | python3 -c "import json,sys; sys.exit(0 if json.load(sys.stdin).get('success') else 1)"; then
  echo "$ORG" | python3 -c "import json,sys; d=json.load(sys.stdin); print('  error:', [e.get('message') for e in d.get('errors',[])])"
  die "Access belum aktif. Buka https://one.dash.cloudflare.com/ → pilih nama team → Enable Access. Lalu ulangi script ini."
fi
echo "$ORG" | python3 -c "
import json,sys
r=json.load(sys.stdin)['result']
print('  team domain:', r.get('auth_domain'))
print('  name       :', r.get('name'))
"

# ---------- 2. app sudah ada? ----------
say "Cek Access application untuk $HOST"
APPS=$(api GET "/accounts/$ACC/access/apps")
APP_ID=$(echo "$APPS" | python3 -c "
import json,sys
host='$HOST'
for a in json.load(sys.stdin).get('result') or []:
    if a.get('domain')==host: print(a['id']); break
")

if [ -z "$APP_ID" ]; then
  say "Membuat application baru"
  CREATED=$(api POST "/accounts/$ACC/access/apps" "$(python3 -c "
import json
print(json.dumps({
  'name':'$APP_NAME',
  'domain':'$HOST',
  'type':'self_hosted',
  'session_duration':'24h',
  'app_launcher_visible':False,
  'auto_redirect_to_identity':False,
  'allowed_idps':[]
}))
")")
  APP_ID=$(echo "$CREATED" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if not d.get('success'):
    print('ERR', [e.get('message') for e in d.get('errors',[])], file=sys.stderr); sys.exit(1)
print(d['result']['id'])
") || die "Gagal membuat Access application"
  echo "  app_id: $APP_ID"
else
  echo "  app sudah ada: $APP_ID"
fi

# ---------- 3. policy allow email ----------
say "Cek policy"
POL=$(api GET "/accounts/$ACC/access/apps/$APP_ID/policies")
HAS=$(echo "$POL" | python3 -c "
import json,sys
em='$EMAIL'
for p in json.load(sys.stdin).get('result') or []:
    for inc in p.get('include') or []:
        if (inc.get('email') or {}).get('email')==em: print('yes'); break
" || true)

if [ "$HAS" = "yes" ]; then
  echo "  policy untuk $EMAIL sudah ada"
else
  say "Membuat policy allow: $EMAIL"
  api POST "/accounts/$ACC/access/apps/$APP_ID/policies" "$(python3 -c "
import json
print(json.dumps({
  'name':'Owner only',
  'decision':'allow',
  'include':[{'email':{'email':'$EMAIL'}}]
}))
")" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('  ', 'OK' if d.get('success') else d.get('errors'))
"
fi

say "Selesai — Access aktif untuk https://$HOST"
echo "Langkah berikut: set ACCESS_ENABLED=1 pada Worker, lalu build ulang frontend dengan VITE_OFFICE_API=1."
