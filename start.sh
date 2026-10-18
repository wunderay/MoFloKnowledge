#!/bin/sh
# Run the whole app with Docker (no Node needed) and open http://localhost:8080.
#   ./start.sh           build, start, wait until healthy, print the demo login, open the browser
#   ./start.sh --stop    stop it (the data stays)
#   ./start.sh --reset   stop it and delete its data volume
cd "$(dirname "$0")" || exit 1
case "${1:-}" in
  --stop) docker compose down && echo "Stopped. Run ./start.sh to start again; your data is kept."; exit ;;
  --reset) docker compose down --volumes && echo "Stopped and deleted the local data."; exit ;;
  "") ;;
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
