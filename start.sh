#!/usr/bin/env bash
# Run the whole app with Docker (no Node needed) and open http://localhost:8080 (or the next free port up to 8099 when 8080 is busy).
# MOFLO_PORT=9090 ./start.sh uses exactly that port instead. The port picked for a busy 8080 is kept in .moflo-port.
#   ./start.sh           build, start, wait until healthy, print the demo login, open the browser
#   ./start.sh --stop    stop it (the data stays)
#   ./start.sh --reset   stop it and delete its data volume
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@" # `sh start.sh` also works: the port check below needs bash
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
# A port is busy when something accepts a connection on it. This app's own running container does not count as busy.
port_busy() { (: >"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
port_ok() { [ "$1" = "$OWN_PORT" ] || ! port_busy "$1"; }
valid_port() { case $1 in '' | *[!0-9]*) return 1 ;; esac; [ "$1" -ge 1 ] && [ "$1" -le 65535 ]; }
choose_port() {
  OWN_PORT=$(docker compose port app 8080 2>/dev/null | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -n 1)
  valid_port "$OWN_PORT" || OWN_PORT=
  if [ -n "${MOFLO_PORT:-}" ]; then
    valid_port "$MOFLO_PORT" || { echo "MOFLO_PORT must be a port number between 1 and 65535 (got \"$MOFLO_PORT\")." >&2; exit 1; }
    port_ok "$MOFLO_PORT" || { echo "Port $MOFLO_PORT (MOFLO_PORT) is in use. Stop what is using it, or set MOFLO_PORT to a free port, for example: MOFLO_PORT=9090 ./start.sh" >&2; exit 1; }
    PORT=$MOFLO_PORT
    return
  fi
  AUTO_PORT=1
  remembered=$(cat .moflo-port 2>/dev/null)
  if [ -n "$OWN_PORT" ]; then
    PORT=$OWN_PORT
  elif valid_port "$remembered" && port_ok "$remembered"; then
    PORT=$remembered
  else
    PORT=
    for candidate in 8080 $(seq 8081 8099); do
      if port_ok "$candidate"; then PORT=$candidate; break; fi
    done
    [ -n "$PORT" ] || { echo "Ports 8080-8099 are all in use. Free one, or set MOFLO_PORT to a free port, for example: MOFLO_PORT=9090 ./start.sh" >&2; exit 1; }
    [ "$PORT" = 8080 ] || echo "Port 8080 is in use; using $PORT instead."
  fi
}
case "${1:-}" in
  --stop) ensure_docker; docker compose down && echo "Stopped. Run ./start.sh to start again; your data is kept."; exit ;;
  --reset) ensure_docker; docker compose down --volumes && echo "Stopped and deleted the local data."; exit ;;
  "") ensure_docker; choose_port ;;
  *) echo "Usage: ./start.sh [--stop | --reset]" >&2; exit 2 ;;
esac
export MOFLO_PORT=$PORT
docker compose up --build --detach --wait --wait-timeout 900 || { echo "Docker Compose failed (output above). Is Docker running? If it says port $PORT is in use, free it or pick another with MOFLO_PORT, for example: MOFLO_PORT=9090 ./start.sh" >&2; exit 1; }
if [ -n "${AUTO_PORT:-}" ]; then # keep a fallback port so the address stays the same next time; 8080 needs no file
  if [ "$PORT" = 8080 ]; then rm -f .moflo-port; else echo "$PORT" >.moflo-port; fi
fi
echo
docker compose logs --no-log-prefix app | grep 'Open http' | tail -n 1 | sed 's/^.*Open http/Open http/'
echo
# `open` is openvt on some Linux systems, so it is used on macOS only.
if [ "$(uname)" = Darwin ]; then open "http://localhost:$PORT"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:$PORT" >/dev/null 2>&1 &
else echo "Open http://localhost:$PORT in your browser."
fi
exit 0
