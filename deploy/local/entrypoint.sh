#!/bin/bash
# All-in-one local stack in one container: postgres, one-time DB setup, gotrue, postgrest, gateway, web app, worker.
# The secrets are generated here on the first start and kept in the data volume (secrets.env); none are baked into the image.
# Every path, port and binary below can be overridden by an environment variable, which is how this script is also run
# outside Docker for testing. The defaults are the layout of deploy/local/Dockerfile.
set -euo pipefail

PUBLIC_PORT=${PUBLIC_PORT:-8080}
PUBLIC_URL=${PUBLIC_URL:-http://localhost:$PUBLIC_PORT}
WEB_PORT=${WEB_PORT:-3001}
GOTRUE_PORT=${GOTRUE_PORT:-9999}
POSTGREST_PORT=${POSTGREST_PORT:-3000}
PG_PORT=${PG_PORT:-5432}
DB_NAME=${DB_NAME:-moflo_local_test} # migrate.mjs refuses a database name that does not end in _test

APP_DIR=${APP_DIR:-/app}
LIB_DIR=${LIB_DIR:-/opt/moflo-local}
DATA_ROOT=${DATA_ROOT:-/var/lib/postgresql/data}
RUN_DIR=${RUN_DIR:-/run/moflo-local}
PGDATA_DIR=$DATA_ROOT/pgdata
PG_BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
GOTRUE_BIN=${GOTRUE_BIN:-/usr/local/bin/gotrue}
POSTGREST_BIN=${POSTGREST_BIN:-/usr/local/bin/postgrest}
GOTRUE_DB_MIGRATIONS_PATH=${GOTRUE_DB_MIGRATIONS_PATH:-/usr/local/etc/auth/migrations}
SVC_USER=${SVC_USER:-postgres}
GATEWAY_HOST=${GATEWAY_HOST:-0.0.0.0}
# The app is built with this stand-in for the publishable key (the key does not exist until the first start) and gets the real one below.
ANON_KEY_PLACEHOLDER=${ANON_KEY_PLACEHOLDER:-moflo-local-publishable-key-placeholder}
export PUBLIC_URL PUBLIC_PORT RUN_DIR

log() { echo "[local] $*"; }
prefix() { sed -u "s/^/[$1] /"; }
# An array, not a function: launch() must run setpriv itself so that the PID it records is the service's own (setpriv execs).
AS_SVC=(setpriv --reuid="$SVC_USER" --regid="$SVC_USER" --init-groups)
as_svc() { "${AS_SVC[@]}" "$@"; }
# A service sees only the variables it is given, so the web app and worker never receive the database admin password.
svc_env() { env -i "PATH=$PATH" "HOME=$RUN_DIR/home" "TMPDIR=$RUN_DIR/tmp" "$@"; }
psql_admin() { as_svc "$PG_BIN/psql" -X -q -h "$RUN_DIR" -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 "$@"; }

PIDS=()
NAMES=()
launch() {
  local name=$1
  shift
  "$@" > >(prefix "$name") 2>&1 &
  PIDS+=("$!")
  NAMES+=("$name")
}

PG_STARTED=0
cleanup() {
  local rc=$?
  trap - EXIT TERM INT
  log "stopping"
  local i
  for ((i = ${#PIDS[@]} - 1; i >= 0; i--)); do
    kill -TERM "${PIDS[i]}" 2>/dev/null || true
  done
  for i in "${!PIDS[@]}"; do
    wait "${PIDS[i]}" 2>/dev/null || true
  done
  if [ "$PG_STARTED" = 1 ]; then
    as_svc "$PG_BIN/pg_ctl" -D "$PGDATA_DIR" -m fast -w stop >/dev/null || true
  fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 0' TERM INT

wait_http() { # name url [seconds]
  local i
  for ((i = 0; i < ${3:-90}; i++)); do
    if node -e 'fetch(process.argv[1]).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))' "$2" 2>/dev/null; then
      log "$1 is up"
      return 0
    fi
    sleep 1
  done
  log "$1 did not come up in time"
  return 1
}

mkdir -p "$DATA_ROOT" "$RUN_DIR/home" "$RUN_DIR/tmp"
rm -f "$RUN_DIR/ready"
chown "$SVC_USER" "$DATA_ROOT" "$RUN_DIR" "$RUN_DIR/home" "$RUN_DIR/tmp"
chmod 755 "$RUN_DIR"
cd "$APP_DIR"

# 0. secrets: generated once into the data volume, reused on every later start
node "$LIB_DIR/secrets.mjs" "$DATA_ROOT/secrets.env" | prefix secrets
set -a
# shellcheck disable=SC1091
. "$DATA_ROOT/secrets.env"
set +a
# Next.js inlines NEXT_PUBLIC_* values when it builds, so the build used a placeholder; swap in the real key (a no-op once done).
grep -rlZF --exclude-dir=cache -- "$ANON_KEY_PLACEHOLDER" "$APP_DIR/.next" | xargs -0 -r sed -i "s|$ANON_KEY_PLACEHOLDER|$ANON_KEY|g" || true

# 1. postgres. A data directory without the marker is a first start or an interrupted one: start it again from nothing.
MARKER=$DATA_ROOT/.moflo-local-initialized
if [ ! -f "$MARKER" ]; then
  log "first start: creating the database cluster"
  rm -rf -- "${PGDATA_DIR:?}"
  pwfile=$(mktemp)
  echo "$PG_SUPER_PASSWORD" >"$pwfile"
  chown "$SVC_USER" "$pwfile"
  as_svc "$PG_BIN/initdb" -D "$PGDATA_DIR" -U postgres --auth-local=trust --auth-host=scram-sha-256 --pwfile="$pwfile" -E UTF8 >/dev/null
  rm -f "$pwfile"
fi
as_svc "$PG_BIN/pg_ctl" -D "$PGDATA_DIR" -o "-p $PG_PORT -k $RUN_DIR -c listen_addresses=127.0.0.1" -l "$RUN_DIR/postgres.log" -w start >/dev/null || {
  tail -n 30 "$RUN_DIR/postgres.log" >&2 || true
  exit 1
}
PG_STARTED=1

# 2. one-time database setup, then the migrations (all idempotent, so a rebuilt image upgrades an existing volume)
if [ ! -f "$MARKER" ]; then
  log "creating the database and roles"
  psql_admin -d postgres -c "CREATE DATABASE $DB_NAME"
  psql_admin -d "$DB_NAME" -v dbname="$DB_NAME" -v authenticator_pw="$AUTHENTICATOR_PASSWORD" -v auth_admin_pw="$AUTH_ADMIN_PASSWORD" -f "$LIB_DIR/roles.sql"
  touch "$MARKER"
fi

gotrue_env=(
  "API_EXTERNAL_URL=$PUBLIC_URL/auth/v1" GOTRUE_DB_DRIVER=postgres DB_NAMESPACE=auth
  "GOTRUE_DB_MIGRATIONS_PATH=$GOTRUE_DB_MIGRATIONS_PATH"
  "DATABASE_URL=postgres://supabase_auth_admin:$AUTH_ADMIN_PASSWORD@127.0.0.1:$PG_PORT/$DB_NAME"
  GOTRUE_API_HOST=127.0.0.1 "PORT=$GOTRUE_PORT" "GOTRUE_JWT_SECRET=$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated
  GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role "GOTRUE_SITE_URL=$PUBLIC_URL"
  "GOTRUE_URI_ALLOW_LIST=$PUBLIC_URL/**" GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true
  GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_SMTP_HOST= GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_LOG_LEVEL=info
)
log "applying the auth and application migrations"
as_svc "$(command -v env)" -i "PATH=$PATH" "HOME=$RUN_DIR/home" "${gotrue_env[@]}" "$GOTRUE_BIN" migrate 2>&1 | prefix gotrue-migrate
psql_admin -d "$DB_NAME" -f "$APP_DIR/tests/db/storage-shim.sql" # Storage is not part of this stack: the schema stand-in the migrations expect
as_svc "$(command -v env)" -i "PATH=$PATH" "HOME=$RUN_DIR/home" "DATABASE_URL=postgres://postgres:$PG_SUPER_PASSWORD@127.0.0.1:$PG_PORT/$DB_NAME" node scripts/migrate.mjs
# The worker's restricted login: a member of moflo_worker (created by the migrations) and nothing else.
psql_admin -d "$DB_NAME" -v worker_pw="$WORKER_PASSWORD" <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'moflo_worker_login') THEN
    CREATE ROLE moflo_worker_login LOGIN IN ROLE moflo_worker;
  END IF;
END $$;
ALTER ROLE moflo_worker_login PASSWORD :'worker_pw';
SQL

# 3. gotrue
launch gotrue "${AS_SVC[@]}" "$(command -v env)" -i "PATH=$PATH" "HOME=$RUN_DIR/home" "${gotrue_env[@]}" "$GOTRUE_BIN"

# 4. postgrest
launch postgrest "${AS_SVC[@]}" "$(command -v env)" -i "PATH=$PATH" "HOME=$RUN_DIR/home" \
  "PGRST_DB_URI=postgres://authenticator:$AUTHENTICATOR_PASSWORD@127.0.0.1:$PG_PORT/$DB_NAME" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
  "PGRST_JWT_SECRET=$JWT_SECRET" PGRST_SERVER_HOST=127.0.0.1 "PGRST_SERVER_PORT=$POSTGREST_PORT" PGRST_DB_POOL=10 PGRST_DB_CHANNEL_ENABLED=false \
  "$POSTGREST_BIN"
wait_http gotrue "http://127.0.0.1:$GOTRUE_PORT/health"
wait_http postgrest "http://127.0.0.1:$POSTGREST_PORT/"

# 5. gateway: the one origin (PUBLIC_URL) for the browser and for the web app's own Supabase calls
launch gateway "${AS_SVC[@]}" "$(command -v env)" -i "PATH=$PATH" "HOME=$RUN_DIR/home" "GATEWAY_PORT=$PUBLIC_PORT" "GATEWAY_HOST=$GATEWAY_HOST" \
  "WEB_PORT=$WEB_PORT" "GOTRUE_PORT=$GOTRUE_PORT" "POSTGREST_PORT=$POSTGREST_PORT" node "$LIB_DIR/gateway.mjs"
wait_http gateway "http://127.0.0.1:$PUBLIC_PORT/__gateway/health"

# 6. the web app
launch web "${AS_SVC[@]}" "$(command -v env)" -i "PATH=$PATH" "HOME=$RUN_DIR/home" "TMPDIR=$RUN_DIR/tmp" NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
  "NEXT_PUBLIC_SUPABASE_URL=$PUBLIC_URL" "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY" "APP_ORIGIN=$PUBLIC_URL" \
  node node_modules/next/dist/bin/next start -p "$WEB_PORT" -H 127.0.0.1
wait_http web "http://127.0.0.1:$WEB_PORT/sign-in"

# 7. the worker: what `npm run worker` runs, started directly because npm does not pass SIGTERM on to it
launch worker "${AS_SVC[@]}" "$(command -v env)" -i "PATH=$PATH" "HOME=$RUN_DIR/home" "TMPDIR=$RUN_DIR/tmp" NODE_ENV=production \
  "WORKER_DATABASE_URL=postgres://moflo_worker_login:$WORKER_PASSWORD@127.0.0.1:$PG_PORT/$DB_NAME" WORKER_ID=local-worker-1 \
  node node_modules/tsx/dist/cli.mjs src/worker/main.ts

# 8. the demo login, through the gateway like a real sign-up
PUBLIC_URL=$PUBLIC_URL ANON_KEY=$ANON_KEY DEMO_EMAIL=$DEMO_EMAIL DEMO_PASSWORD=$DEMO_PASSWORD node "$LIB_DIR/demo-user.mjs"
touch "$RUN_DIR/ready"
log "Open $PUBLIC_URL — log in as $DEMO_EMAIL / $DEMO_PASSWORD"
wait -n "${PIDS[@]}" || true
for i in "${!PIDS[@]}"; do
  if ! kill -0 "${PIDS[i]}" 2>/dev/null; then
    log "${NAMES[i]} exited; stopping everything"
  fi
done
exit 1
