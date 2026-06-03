#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export PATH="${HERMES_NODE_BIN:-/home/administrator/.hermes/node/bin}:$PATH"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found on PATH." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but was not found on PATH." >&2
  exit 1
fi

mysql_status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' oxygen-cms-mysql 2>/dev/null || true)"
if [ "$mysql_status" != "healthy" ]; then
  echo "Disposable MySQL is not healthy; starting it now..."
  docker compose create mysql >/dev/null 2>&1 || true
  docker compose start mysql >/dev/null
  for _ in $(seq 1 90); do
    mysql_status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' oxygen-cms-mysql 2>/dev/null || true)"
    [ "$mysql_status" = "healthy" ] && break
    printf '.'
    sleep 2
  done
  echo
fi

if [ "$mysql_status" != "healthy" ]; then
  echo "MySQL is not healthy. Run: npm run dev:db:reset" >&2
  exit 1
fi

if [ "${KILL_PORTS:-true}" = "true" ]; then
  fuser -k 3000/tcp 5173/tcp >/dev/null 2>&1 || true
fi

export CMS_MANAGED_MYSQL="${CMS_MANAGED_MYSQL:-true}"
export MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
export MYSQL_PORT="${MYSQL_PORT:-3306}"
export MYSQL_DATABASE="${MYSQL_DATABASE:-O2IAS_CMS}"
export MYSQL_USER="${MYSQL_USER:-oxygen_cms}"
export MYSQL_PASSWORD="${MYSQL_PASSWORD:-oxygen_cms_dev_password}"
export MYSQL_PRIVILEGED_USER="${MYSQL_PRIVILEGED_USER:-root}"
export MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-oxygen_cms_root_dev_password}"

echo "Starting OxyGen CMS managed dev servers..."
echo "API: http://localhost:3000"
echo "Web: http://localhost:5173"
echo "Network Web: http://10.18.0.201:5173"
echo

cleanup() {
  jobs -p | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

npm --workspace @oxygen-cms/api run dev &
api_pid=$!
npm --workspace @oxygen-cms/web run dev -- --host 0.0.0.0 &
web_pid=$!

wait -n "$api_pid" "$web_pid"
