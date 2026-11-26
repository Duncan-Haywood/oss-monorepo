#!/usr/bin/env bash
# Applies the current Drizzle schema to the LOCAL D1 database used by `pnpm dev`. Idempotent: the DDL
# from `drizzle-kit export --sql` is rewritten to CREATE TABLE/INDEX IF NOT EXISTS (same approach as
# scripts/e2e-server.sh), so re-running is a no-op and existing local data is kept.
#
#   scripts/local-db.sh            # create missing tables/indexes in .wrangler/state
#   scripts/local-db.sh --reset    # delete the local D1 data first (fresh, empty database)
#   LOCAL_DB_PERSIST=.wrangler/x scripts/local-db.sh   # another local state directory
#
# IF NOT EXISTS does not ALTER existing tables: after a schema change that adds columns, use --reset
# (or apply the generated migrations with `pnpm db:migrate:local` on a database built from them).
set -euo pipefail

cd "$(dirname "$0")/.."

PERSIST="${LOCAL_DB_PERSIST:-.wrangler/state}"
export WRANGLER_SEND_METRICS=false

if [[ "${1:-}" == "--reset" ]]; then
  echo "[local-db] deleting local D1 data in $PERSIST/v3/d1"
  rm -rf "$PERSIST/v3/d1"
elif [[ -n "${1:-}" ]]; then
  echo "usage: scripts/local-db.sh [--reset]" >&2
  exit 2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "[local-db] exporting D1 schema"
pnpm exec drizzle-kit export --sql >"$TMP/raw.sql"
sed -E \
  -e 's/^CREATE TABLE `/CREATE TABLE IF NOT EXISTS `/' \
  -e 's/^CREATE (UNIQUE )?INDEX `/CREATE \1INDEX IF NOT EXISTS `/' \
  "$TMP/raw.sql" >"$TMP/schema.sql"

echo "[local-db] applying schema to local D1 ($PERSIST)"
pnpm exec wrangler d1 execute DB --local --persist-to "$PERSIST" --file "$TMP/schema.sql" \
  >"$TMP/d1.log" 2>&1 || { cat "$TMP/d1.log"; exit 1; }
echo "[local-db] done"
