#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MYSQL_CONTAINER_NAME="${MYSQL_CONTAINER_NAME:-oxygen-cms-mysql}"
SETTINGS_FILE="${SETTINGS_FILE:-apps/api/data/settings.json}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-180}"

printf 'Resetting disposable OxyGen CMS MySQL development database...\n'

if ! command -v docker >/dev/null 2>&1; then
  printf 'ERROR: docker is required for the managed MySQL development workflow.\n' >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  printf 'ERROR: docker compose is required for the managed MySQL development workflow.\n' >&2
  exit 1
fi

printf 'Stopping Compose services and removing volumes...\n'
docker compose down -v --remove-orphans

printf 'Removing local setup state: %s\n' "$SETTINGS_FILE"
rm -f "$SETTINGS_FILE"

printf 'Creating and starting MySQL service...\n'
docker compose create mysql >/dev/null
docker compose start mysql >/dev/null

printf 'Waiting for %s to become healthy' "$MYSQL_CONTAINER_NAME"
deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
while (( SECONDS < deadline )); do
  status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$MYSQL_CONTAINER_NAME" 2>/dev/null || true)"
  if [[ "$status" == "healthy" ]]; then
    printf '\nMySQL is healthy.\n'
    docker ps --filter "name=$MYSQL_CONTAINER_NAME" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    printf '\nNext: npm run dev:managed\n'
    exit 0
  fi
  printf '.'
  sleep 2
done

printf '\nERROR: MySQL did not become healthy within %s seconds.\n' "$HEALTH_TIMEOUT_SECONDS" >&2
docker logs "$MYSQL_CONTAINER_NAME" --tail=120 >&2 || true
exit 1
