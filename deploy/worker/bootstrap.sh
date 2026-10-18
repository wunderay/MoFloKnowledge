#!/usr/bin/env bash
# One-time (and safe to repeat) setup of the crawler VM: Ubuntu on Oracle Cloud Always Free, x86_64 or arm64.
# Run as root:   sudo REPO_URL=<git url> bash bootstrap.sh
# Or paste this file as the instance's cloud-init user data (it then runs as root with the default REPO_URL).
#
# It creates the unprivileged `moflo` user, installs Node 22 (pinned, checksum verified), git, clones the
# repository to /opt/moflo and installs the systemd unit. It does not start the worker: the first deploy
# from GitHub Actions writes /etc/moflo/worker.env, installs dependencies and starts the service.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/wunderay/MoFloKnowledge.git}"
APP_DIR=/opt/moflo
NODE_VERSION=22.23.3
NODE_SHA256_X64=df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de
NODE_SHA256_ARM64=a44aeb94849a299b22df10b9e622ec2f605c2183501bc40590705131de7c740f

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (sudo bash bootstrap.sh)." >&2
  exit 1
fi
command -v apt-get >/dev/null || { echo "This script supports Debian and Ubuntu images only." >&2; exit 1; }

echo "== packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends ca-certificates curl git openssh-client xz-utils

echo "== node ${NODE_VERSION}"
if [ "$(/usr/local/bin/node --version 2>/dev/null || true)" != "v${NODE_VERSION}" ]; then
  case "$(uname -m)" in
    x86_64) node_arch=x64; node_sha=$NODE_SHA256_X64 ;;
    aarch64) node_arch=arm64; node_sha=$NODE_SHA256_ARM64 ;;
    *) echo "Unsupported CPU architecture: $(uname -m)" >&2; exit 1 ;;
  esac
  tarball="node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${tarball}" -o "${work}/${tarball}"
  echo "${node_sha}  ${work}/${tarball}" | sha256sum -c -
  rm -rf "/opt/node-v${NODE_VERSION}"
  mkdir -p "/opt/node-v${NODE_VERSION}"
  tar -xJf "${work}/${tarball}" -C "/opt/node-v${NODE_VERSION}" --strip-components=1
  for tool in node npm npx; do
    ln -sf "/opt/node-v${NODE_VERSION}/bin/${tool}" "/usr/local/bin/${tool}"
  done
fi

echo "== user and directories"
if ! id moflo >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/moflo --shell /usr/sbin/nologin moflo
fi
install -d -o moflo -g moflo -m 755 "$APP_DIR"
install -d -o root -g root -m 755 /etc/moflo

echo "== repository"
case "$REPO_URL" in
  git@* | ssh://*)
    # Private repository: use a read-only deploy key owned by the moflo user.
    ssh_dir=/var/lib/moflo/.ssh
    install -d -o moflo -g moflo -m 700 "$ssh_dir"
    if [ ! -f "$ssh_dir/id_ed25519" ]; then
      sudo -H -u moflo ssh-keygen -q -t ed25519 -N '' -C "moflo-worker@$(hostname)" -f "$ssh_dir/id_ed25519"
    fi
    printf 'Host github.com\n  IdentityFile %s/id_ed25519\n  IdentitiesOnly yes\n  StrictHostKeyChecking accept-new\n' "$ssh_dir" >"$ssh_dir/config"
    chown moflo:moflo "$ssh_dir/config"
    chmod 600 "$ssh_dir/config"
    ;;
esac
if [ ! -d "$APP_DIR/.git" ]; then
  if ! sudo -H -u moflo git clone "$REPO_URL" "$APP_DIR"; then
    echo >&2
    echo "Clone failed. If the repository is private, add this read-only deploy key" >&2
    echo "(GitHub: Settings > Deploy keys, leave 'Allow write access' off), use an ssh REPO_URL, and run this script again:" >&2
    cat /var/lib/moflo/.ssh/id_ed25519.pub >&2 2>/dev/null || true
    exit 2
  fi
fi

echo "== systemd unit"
install -m 644 "$APP_DIR/deploy/worker/moflo-worker.service" /etc/systemd/system/moflo-worker.service
systemctl daemon-reload
systemctl enable moflo-worker

echo
echo "Bootstrap complete. The worker is enabled but not started."
echo "Next: set the GitHub secrets (see docs/deploy.md) and let the deploy workflow run; it writes /etc/moflo/worker.env and starts the service."
