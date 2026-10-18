#!/usr/bin/env bash
# Runs on the VM as the SSH login user (needs passwordless sudo), copied there by the deploy workflow.
# Usage: remote-deploy.sh <full commit sha>
# Optional environment: REWRITE_ENV=1 replaces an existing /etc/moflo/worker.env with the uploaded one.
set -euo pipefail

SHA="${1:-}"
if ! [[ "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: remote-deploy.sh <40-character commit sha>" >&2
  exit 1
fi

APP_DIR=/opt/moflo
ENV_FILE=/etc/moflo/worker.env
INCOMING="$HOME/moflo-worker.env.incoming"
as_app() { sudo -H -u moflo "$@"; }

[ -d "$APP_DIR/.git" ] || { echo "$APP_DIR is not a checkout: run deploy/worker/bootstrap.sh on this VM first." >&2; exit 1; }

previous="$(as_app git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || echo none)"

echo "== worker environment"
if [ -f "$INCOMING" ]; then
  if [ ! -f "$ENV_FILE" ] || [ "${REWRITE_ENV:-0}" = 1 ]; then
    sudo install -d -m 755 -o root -g root /etc/moflo
    sudo install -m 600 -o root -g root "$INCOMING" "$ENV_FILE"
    echo "wrote $ENV_FILE"
  else
    echo "$ENV_FILE exists; left unchanged (set REWRITE_ENV=1 to replace it)"
  fi
  rm -f "$INCOMING"
fi
sudo test -f "$ENV_FILE" || { echo "$ENV_FILE is missing and no environment was uploaded." >&2; exit 1; }

echo "== checkout $SHA"
as_app git -C "$APP_DIR" fetch --prune origin "$SHA" || as_app git -C "$APP_DIR" fetch --prune origin main
as_app git -C "$APP_DIR" checkout --force --detach "$SHA"
[ "$(as_app git -C "$APP_DIR" rev-parse HEAD)" = "$SHA" ]

echo "== dependencies"
# tsx, which runs the worker, is a devDependency, so install the full tree.
(cd "$APP_DIR" && as_app env SKIP_SIMPLE_GIT_HOOKS=1 npm ci --no-audit --no-fund)

echo "== service"
sudo install -m 644 "$APP_DIR/deploy/worker/moflo-worker.service" /etc/systemd/system/moflo-worker.service
sudo systemctl daemon-reload
sudo systemctl enable moflo-worker
sudo systemctl restart moflo-worker
sleep 8
if ! systemctl is-active --quiet moflo-worker; then
  sudo journalctl -u moflo-worker -n 60 --no-pager || true
  echo "moflo-worker is not running. Previous commit: $previous (redeploy it to roll back)." >&2
  exit 1
fi
echo "moflo-worker is running at $SHA (previous: $previous)"
