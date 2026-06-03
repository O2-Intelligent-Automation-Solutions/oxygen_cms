#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but was not found on PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is required but was not found." >&2
  exit 1
fi

echo "Stopping compose services and removing disposable MySQL volume..."
docker compose down -v --remove-orphans

SETTINGS_FILE="apps/api/data/settings.json"
if [ -f "$SETTINGS_FILE" ]; then
  echo "Removing CMS setup state: $SETTINGS_FILE"
  rm -f "$SETTINGS_FILE"
fi

echo "Starting disposable MySQL service..."
docker compose create mysql >/dev/null 2>&1 || true
docker compose start mysql >/dev/null

echo "Waiting for oxygen-cms-mysql to become healthy..."
for _ in $(seq 1 90); do
  status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' oxygen-cms-mysql 2>/dev/null || true)"
  if [ "$status" = "healthy" ]; then
    echo "MySQL is healthy."
    docker ps --filter name=oxygen-cms-mysql --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    echo
    echo "Next: npm run dev:managed"
    exit 0
  fi
  printf '.'
  sleep 2
done

echo
echo "MySQL did not become healthy in time. Recent logs:" >&2
docker logs oxygen-cms-mysql --tail=120 >&2 || true
exit 1
