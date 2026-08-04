#!/usr/bin/env bash
#
# A throwaway Postgres for the integration tests.
#
# The point of this script is that a coding agent in a sandbox and a person on
# a laptop get the *same* database with the same command. `docs/decisions/0004`
# assumed no database was reachable from an agent sandbox and designed around
# it; that turned out to be false — the Postgres 16 server binaries are present
# in the image, they are just not on PATH and initdb refuses to run as root.
# Both of those are handled below.
#
#   scripts/test-db.sh start    initdb (first run), start, migrate, seed
#   scripts/test-db.sh stop     stop the server, keep the data
#   scripts/test-db.sh reset    drop the database and rebuild it from scratch
#   scripts/test-db.sh status   is it up, and on which URL
#   scripts/test-db.sh env      print the export lines for a shell
#
# Everything lives in .testdb/ (gitignored) or, when running as root, in
# /var/lib/postgresql/quickpick-test — postgres cannot own a directory it
# cannot traverse to.

set -euo pipefail

PORT="${QP_TEST_DB_PORT:-5544}"
DB_NAME="${QP_TEST_DB_NAME:-quickpick_test}"
HOST=127.0.0.1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- locate the server binaries -------------------------------------------
# `psql` is usually on PATH while `initdb`/`pg_ctl` are not: Debian and Ubuntu
# ship the client in /usr/bin and the server under /usr/lib/postgresql/<v>/bin.
find_bindir() {
  if command -v pg_ctl >/dev/null 2>&1; then
    dirname "$(command -v pg_ctl)"
    return
  fi
  local candidate
  for candidate in /usr/lib/postgresql/*/bin /usr/local/pgsql/bin /opt/homebrew/opt/postgresql*/bin; do
    if [ -x "$candidate/pg_ctl" ]; then
      echo "$candidate"
      return
    fi
  done
  echo "" # not found
}

BINDIR="$(find_bindir)"
if [ -z "$BINDIR" ]; then
  cat >&2 <<'MSG'
No Postgres server binaries found (looked for pg_ctl on PATH, then in
/usr/lib/postgresql/*/bin, /usr/local/pgsql/bin and /opt/homebrew).

  Debian/Ubuntu   apt-get install -y postgresql
  macOS           brew install postgresql@16

The unit tests (`npm test`) do not need a database. Only `npm run
test:integration` does.
MSG
  exit 1
fi

# --- decide where the cluster lives ---------------------------------------
# initdb and postgres both refuse to run as root, so as root we hand the work
# to the postgres system user — which means the data directory has to be
# somewhere that user can reach.
AS_ROOT=0
if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
  AS_ROOT=1
  DATA_DIR="${QP_TEST_DB_DIR:-/var/lib/postgresql/quickpick-test/data}"
else
  DATA_DIR="${QP_TEST_DB_DIR:-$REPO_ROOT/.testdb/data}"
fi
LOG_FILE="$(dirname "$DATA_DIR")/postgres.log"

# Run a server binary as whichever user is allowed to.
pg() {
  local bin="$1"
  shift
  if [ "$AS_ROOT" = "1" ]; then
    su postgres -c "$(printf '%q ' "$BINDIR/$bin" "$@")"
  else
    "$BINDIR/$bin" "$@"
  fi
}

DB_URL="postgresql://postgres@$HOST:$PORT/$DB_NAME?schema=public"

export_env() {
  export POSTGRES_PRISMA_URL="$DB_URL"
  export POSTGRES_URL_NON_POOLING="$DB_URL"
  export ADMIN_KEY="${ADMIN_KEY:-integration-admin-key}"
  export ADMIN_SESSION_SECRET="${ADMIN_SESSION_SECRET:-integration-session-secret}"
}

is_up() {
  "$BINDIR/pg_isready" -h "$HOST" -p "$PORT" -q >/dev/null 2>&1
}

start() {
  if is_up; then
    echo "Postgres already up on $HOST:$PORT"
  else
    if [ ! -s "$DATA_DIR/PG_VERSION" ]; then
      echo "Creating a cluster in $DATA_DIR"
      mkdir -p "$(dirname "$DATA_DIR")"
      [ "$AS_ROOT" = "1" ] && chown -R postgres:postgres "$(dirname "$DATA_DIR")"
      # -A trust: this cluster listens on loopback only and holds nothing but
      # generated test data. A password here would be ceremony, not security.
      pg initdb -D "$DATA_DIR" -U postgres -A trust >/dev/null
    fi
    echo "Starting Postgres on $HOST:$PORT"
    pg pg_ctl -D "$DATA_DIR" -l "$LOG_FILE" -o "-p $PORT -h $HOST" -w start >/dev/null
  fi

  if ! "$BINDIR/psql" -h "$HOST" -p "$PORT" -U postgres -lqt | cut -d\| -f1 | grep -qw "$DB_NAME"; then
    "$BINDIR/createdb" -h "$HOST" -p "$PORT" -U postgres "$DB_NAME"
    echo "Created database $DB_NAME"
  fi

  export_env
  echo "Applying migrations"
  (cd "$REPO_ROOT" && npx prisma migrate deploy >/dev/null)
  echo "Seeding surveys"
  (cd "$REPO_ROOT" && npx prisma db seed >/dev/null)
  echo "Ready: $DB_URL"
}

stop() {
  if is_up; then
    pg pg_ctl -D "$DATA_DIR" -m fast -w stop >/dev/null
    echo "Stopped"
  else
    echo "Not running"
  fi
}

reset() {
  start >/dev/null
  "$BINDIR/dropdb" -h "$HOST" -p "$PORT" -U postgres --if-exists "$DB_NAME"
  "$BINDIR/createdb" -h "$HOST" -p "$PORT" -U postgres "$DB_NAME"
  export_env
  (cd "$REPO_ROOT" && npx prisma migrate deploy >/dev/null && npx prisma db seed >/dev/null)
  echo "Reset: $DB_URL"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  reset) reset ;;
  status)
    if is_up; then echo "up   $DB_URL"; else echo "down $DB_URL"; fi
    ;;
  env)
    echo "export POSTGRES_PRISMA_URL=\"$DB_URL\""
    echo "export POSTGRES_URL_NON_POOLING=\"$DB_URL\""
    echo "export ADMIN_KEY=\"${ADMIN_KEY:-integration-admin-key}\""
    echo "export ADMIN_SESSION_SECRET=\"${ADMIN_SESSION_SECRET:-integration-session-secret}\""
    ;;
  *)
    echo "usage: scripts/test-db.sh {start|stop|reset|status|env}" >&2
    exit 2
    ;;
esac
