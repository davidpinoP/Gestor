#!/usr/bin/env bash
# Aplica las migraciones en un Postgres efímero con un esquema "auth" mínimo
# (equivalente a Supabase) y ejecuta pruebas de integridad, RLS y saldos.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | tail -1)}"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
SOCK="$DATA/sock"; mkdir -p "$SOCK"
RUNAS=""
if [ "$(id -u)" = "0" ]; then chown -R postgres "$DATA"; RUNAS="sudo -u postgres"; fi
$RUNAS "$PGBIN/initdb" -D "$DATA/db" -A trust -U postgres >/dev/null
$RUNAS "$PGBIN/pg_ctl" -D "$DATA/db" -o "-p $PORT -k $SOCK -c listen_addresses=''" -l "$DATA/log" start >/dev/null
trap '$RUNAS "$PGBIN/pg_ctl" -D "$DATA/db" stop -m immediate >/dev/null; rm -rf "$DATA"' EXIT
PSQL="psql -h $SOCK -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f "$ROOT/scripts/sql/supabase-auth-stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "→ $(basename "$f")"; $PSQL -f "$f"; done
$PSQL -f "$ROOT/scripts/sql/tests.sql"
echo "✓ Migraciones y pruebas SQL correctas"
