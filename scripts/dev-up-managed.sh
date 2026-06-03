#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export PATH="${HERMES_NODE_BIN:-/home/administrator/.hermes/node/bin}:$PATH"

if ! command -v npm >/dev/null 2>&1; then
  printf 'npm is required but was not found on PATH.\n' >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker is required but was not found on PATH.\n' >&2
  exit 1
fi

export CMS_MANAGED_MYSQL="${CMS_MANAGED_MYSQL:-true}"
export MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
export MYSQL_PORT="${MYSQL_PORT:-3306}"
export MYSQL_DATABASE="${MYSQL_DATABASE:-O2IAS_CMS}"
export MYSQL_USER="${MYSQL_USER:-oxygen_cms}"
export MYSQL_PASSWORD="${MYSQL_PASSWORD:-oxygen_cms_dev_password}"
export MYSQL_PRIVILEGED_USER="${MYSQL_PRIVILEGED_USER:-root}"
export MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-oxygen_cms_root_dev_password}"
export API_HOST="${API_HOST:-0.0.0.0}"
export API_PORT="${API_PORT:-3000}"

API_URL="http://127.0.0.1:${API_PORT}"
WEB_URL="http://127.0.0.1:5173"

if ! docker inspect oxygen-cms-mysql >/dev/null 2>&1; then
  printf 'MySQL container was not found. Run npm run dev:db:reset first.\n' >&2
  exit 1
fi

mysql_status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' oxygen-cms-mysql 2>/dev/null || true)"
if [[ "$mysql_status" != "healthy" ]]; then
  printf 'MySQL container is not healthy yet (status: %s). Run npm run dev:db:reset or wait for health.\n' "${mysql_status:-unknown}" >&2
  exit 1
fi

if [[ "${KILL_PORTS:-true}" == "true" ]]; then
  fuser -k "${API_PORT}/tcp" 5173/tcp >/dev/null 2>&1 || true
fi

cleanup() {
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
  fi
  if [[ -n "${WEB_PID:-}" ]] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

printf 'Starting OxyGen CMS API in managed MySQL mode...\n'
npm --workspace @oxygen-cms/api run dev &
API_PID=$!

printf 'Starting OxyGen CMS Web...\n'
npm --workspace @oxygen-cms/web run dev -- --host 0.0.0.0 &
WEB_PID=$!

printf '\nManaged development environment starting...\n'
printf '  API: %s\n' "$API_URL"
printf '  Web: %s\n' "$WEB_URL"
printf '  MySQL: %s:%s/%s as %s\n\n' "$MYSQL_HOST" "$MYSQL_PORT" "$MYSQL_DATABASE" "$MYSQL_USER"
printf 'Run smoke test in another terminal: npm run dev:managed:smoke\n\n'

wait -n "$API_PID" "$WEB_PID"
exit_code=$?
printf '\nA development process exited; shutting down remaining process.\n'
exit "$exit_code"
