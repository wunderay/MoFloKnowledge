#!/bin/sh
# Run the whole app with Docker (no Node needed) and open http://localhost:8080.
#   ./start.sh           build, start, wait until healthy, print the demo login, open the browser
#   ./start.sh --stop    stop it (the data stays)
#   ./start.sh --reset   stop it and delete its data volume
cd "$(dirname "$0")" || exit 1
ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not installed. Install Docker Desktop (macOS) or Docker Engine (Linux): https://docs.docker.com/get-started/get-docker/" >&2
    exit 1
  fi
  docker info >/dev/null 2>&1 && return
  if [ "$(uname)" != Darwin ]; then
    echo "Docker is not running. Start Docker (for example: sudo systemctl start docker) and run this again." >&2
    exit 1
  fi
  echo "Docker is not running - starting Docker Desktop..."
  open -a Docker || exit 1
  waited=0
  until docker info >/dev/null 2>&1; do
    if [ "$waited" -ge 180 ]; then
      echo
      echo "Docker did not start within 3 minutes. Open Docker Desktop, wait until it says Engine running, then run this again." >&2
      exit 1
    fi
    printf .
    sleep 3
    waited=$((waited + 3))
  done
  echo
}
case "${1:-}" in
  --stop) ensure_docker; docker compose down && echo "Stopped. Run ./start.sh to start again; your data is kept."; exit ;;
  --reset) ensure_docker; docker compose down --volumes && echo "Stopped and deleted the local data."; exit ;;
  "") ensure_docker ;;
  *) echo "Usage: ./start.sh [--stop | --reset]" >&2; exit 2 ;;
esac
docker compose up --build --detach --wait --wait-timeout 900 || { echo "Docker Compose failed (output above). Is Docker running? Is port 8080 free?" >&2; exit 1; }
echo
docker compose logs --no-log-prefix app | grep 'Open http' | tail -n 1 | sed 's/^.*Open http/Open http/'
echo
# `open` is openvt on some Linux systems, so it is used on macOS only.
if [ "$(uname)" = Darwin ]; then open http://localhost:8080
elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:8080 >/dev/null 2>&1 &
else echo "Open http://localhost:8080 in your browser."
fi
exit 0
