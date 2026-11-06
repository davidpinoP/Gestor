#!/usr/bin/env bash
# Crea el proyecto Supabase, aplica el esquema y deja URL + anon key en ./out.env
set -euo pipefail
API=https://api.supabase.com/v1
j() { curl -sS -f "$@"; }
ORG=$(j $API/organizations | node -e 'const o=JSON.parse(require("fs").readFileSync(0));console.log(o[0].id)')
REF=$(j $API/projects | node -e 'const p=JSON.parse(require("fs").readFileSync(0)).find(x=>x.name==="wealth-os");console.log(p?p.id:"")')
if [ -z "$REF" ]; then
  PASS=$(node -e 'console.log(require("crypto").randomBytes(24).toString("base64url"))')
  REF=$(j -X POST $API/projects -H 'Content-Type: application/json' \
    -d "{\"name\":\"wealth-os\",\"organization_id\":\"$ORG\",\"region\":\"eu-central-1\",\"db_pass\":\"$PASS\"}" \
    | node -e 'console.log(JSON.parse(require("fs").readFileSync(0)).id)')
  echo "proyecto creado: $REF"
fi
for i in $(seq 1 60); do
  ST=$(j $API/projects/$REF | node -e 'console.log(JSON.parse(require("fs").readFileSync(0)).status)')
  echo "estado: $ST"; [ "$ST" = ACTIVE_HEALTHY ] && break; sleep 15
done
HAS=$(j -X POST $API/projects/$REF/database/query -H 'Content-Type: application/json' \
  -d '{"query":"select to_regclass('"'"'public.transactions'"'"') is not null as ok"}' | node -e 'console.log(JSON.parse(require("fs").readFileSync(0))[0].ok)')
if [ "$HAS" != true ]; then
  node -e 'process.stdout.write(JSON.stringify({query:require("fs").readFileSync(process.argv[1],"utf8")}))' "$(dirname "$0")/../supabase/migrations/0001_core.sql" > "${TMPDIR:-/tmp}/wos-mig.json"
  j -X POST $API/projects/$REF/database/query -H 'Content-Type: application/json' --data-binary @"${TMPDIR:-/tmp}/wos-mig.json" >/dev/null
  echo "esquema aplicado"
fi
ANON=$(j "$API/projects/$REF/api-keys" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0)).find(k=>k.name==="anon").api_key)')
printf "REF=%s\nSUPABASE_URL=https://%s.supabase.co\nANON=%s\n" "$REF" "$REF" "$ANON" > "$(dirname "$0")/../.deploy.env"
echo "listo: https://$REF.supabase.co"
