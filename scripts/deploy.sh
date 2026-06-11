#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DEPLOY_DIR="${DEPLOY_DIR:-$ROOT_DIR/deploy}"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.deploy.yml}"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_DIR/backups}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

usage() {
  cat <<'USAGE'
OxyGen CMS deployment helper

Usage:
  scripts/deploy.sh init       Create deploy/.env with generated secrets
  scripts/deploy.sh check      Verify Docker/Compose and env prerequisites
  scripts/deploy.sh build      Build the production CMS image
  scripts/deploy.sh start      Start the CMS stack
  scripts/deploy.sh stop       Stop the CMS stack
  scripts/deploy.sh restart    Restart the CMS stack
  scripts/deploy.sh status     Show container status
  scripts/deploy.sh logs       Follow app logs
  scripts/deploy.sh logs mysql Follow MySQL logs
  scripts/deploy.sh backup     Backup MySQL data and CMS app data
  scripts/deploy.sh restore-db <backup.sql.gz>
                              Restore a database backup; requires CONFIRM_RESTORE=YES
  scripts/deploy.sh pre-update Create a safety backup and validate the stack before update

Environment overrides:
  DEPLOY_DIR=/path/to/deploy
  ENV_FILE=/path/to/.env
  COMPOSE_FILE=/path/to/docker-compose.deploy.yml
  BACKUP_DIR=/path/to/backups
USAGE
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32
  else
    LC_ALL=C tr -dc 'A-Za-z0-9_@%+=:,.-' </dev/urandom | head -c 48
    printf '\n'
  fi
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    printf 'ERROR: Docker is required but was not found on PATH.\n' >&2
    printf 'Install Docker Engine/Desktop, then rerun this command.\n' >&2
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    printf 'ERROR: Docker Compose v2 is required but was not found.\n' >&2
    exit 1
  fi
}

require_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    printf 'ERROR: %s does not exist. Run scripts/deploy.sh init first.\n' "$ENV_FILE" >&2
    exit 1
  fi
}


load_env_value() {
  local key="$1"
  local value=""
  if [[ -f "$ENV_FILE" ]]; then
    value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
  fi
  printf '%s' "$value"
}

ensure_stack_running() {
  require_env
  "${COMPOSE[@]}" up -d mysql >/dev/null
  "${COMPOSE[@]}" exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqladmin ping -h localhost -u root --silent' >/dev/null
}

backup_stack() {
  require_docker
  require_env
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR" 2>/dev/null || true

  local stamp target_dir db_file data_file manifest_file
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  target_dir="$BACKUP_DIR/$stamp"
  db_file="$target_dir/mysql.sql.gz"
  data_file="$target_dir/app-data.tar.gz"
  manifest_file="$target_dir/manifest.txt"
  mkdir -p "$target_dir"
  chmod 700 "$target_dir" 2>/dev/null || true

  printf 'Creating backup in %s\n' "$target_dir"
  ensure_stack_running

  "${COMPOSE[@]}" exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --routines --triggers "$MYSQL_DATABASE"' | gzip -9 >"$db_file"

  if "${COMPOSE[@]}" ps --services --filter status=running | grep -qx 'app'; then
    "${COMPOSE[@]}" exec -T app sh -c 'tar -C /app/apps/api/data -czf - .' >"$data_file"
  else
    printf 'App service is not running; writing empty app-data backup placeholder.\n'
    tar -czf "$data_file" -T /dev/null
  fi

  {
    printf 'created_utc=%s\n' "$stamp"
    printf 'compose_project=%s\n' "$(load_env_value COMPOSE_PROJECT_NAME)"
    printf 'mysql_database=%s\n' "$(load_env_value MYSQL_DATABASE)"
    printf 'db_backup=mysql.sql.gz\n'
    printf 'app_data_backup=app-data.tar.gz\n'
  } >"$manifest_file"

  printf 'Backup complete: %s\n' "$target_dir"
}

restore_database() {
  require_docker
  require_env
  local backup_file="${1:-}"
  if [[ -z "$backup_file" || ! -f "$backup_file" ]]; then
    printf 'ERROR: Provide a database backup file, for example: scripts/deploy.sh restore-db deploy/backups/<timestamp>/mysql.sql.gz\n' >&2
    exit 1
  fi
  if [[ "${CONFIRM_RESTORE:-}" != "YES" ]]; then
    printf 'ERROR: restore-db is destructive. Re-run with CONFIRM_RESTORE=YES after taking a fresh backup.\n' >&2
    exit 1
  fi
  ensure_stack_running
  printf 'Restoring database from %s\n' "$backup_file"
  gzip -dc "$backup_file" | "${COMPOSE[@]}" exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot "$MYSQL_DATABASE"'
  printf 'Database restore complete. Restarting app service.\n'
  "${COMPOSE[@]}" restart app
}

pre_update() {
  require_docker
  require_env
  "${COMPOSE[@]}" config >/dev/null
  backup_stack
  printf 'Pre-update safety check complete. Review the backup above before applying an update.\n'
}

init_env() {
  mkdir -p "$DEPLOY_DIR"
  if [[ -f "$ENV_FILE" ]]; then
    printf '%s already exists; leaving it unchanged.\n' "$ENV_FILE"
    return 0
  fi
  cat >"$ENV_FILE" <<EOF_ENV
COMPOSE_PROJECT_NAME=oxygen-cms
CMS_IMAGE=oxygen-cms:local
CMS_HTTP_PORT=8080
CMS_APP_CONTAINER_NAME=oxygen-cms-prod-app
CMS_MYSQL_CONTAINER_NAME=oxygen-cms-prod-mysql

MYSQL_DATABASE=O2IAS_CMS
MYSQL_USER=oxygen_cms
MYSQL_PASSWORD=$(random_secret)
MYSQL_ROOT_PASSWORD=$(random_secret)
OXYGEN_CMS_ENCRYPTION_KEY=$(random_secret)
EOF_ENV
  chmod 600 "$ENV_FILE"
  printf 'Created %s with generated secrets.\n' "$ENV_FILE"
  printf 'Review CMS_HTTP_PORT before starting the stack.\n'
}

cmd="${1:-}"
case "$cmd" in
  init)
    require_docker
    init_env
    ;;
  check)
    require_docker
    require_env
    "${COMPOSE[@]}" config >/dev/null
    printf 'Deployment prerequisites look valid.\n'
    ;;
  build)
    require_docker
    require_env
    "${COMPOSE[@]}" build app
    ;;
  start|up)
    require_docker
    require_env
    "${COMPOSE[@]}" up -d --build
    "${COMPOSE[@]}" ps
    ;;
  stop|down)
    require_docker
    require_env
    "${COMPOSE[@]}" down
    ;;
  restart)
    require_docker
    require_env
    "${COMPOSE[@]}" restart
    "${COMPOSE[@]}" ps
    ;;
  status|ps)
    require_docker
    require_env
    "${COMPOSE[@]}" ps
    ;;
  logs)
    require_docker
    require_env
    service="${2:-app}"
    "${COMPOSE[@]}" logs -f --tail=200 "$service"
    ;;
  backup)
    backup_stack
    ;;
  restore-db)
    restore_database "${2:-}"
    ;;
  pre-update)
    pre_update
    ;;
  ''|-h|--help|help)
    usage
    ;;
  *)
    printf 'ERROR: Unknown command: %s\n\n' "$cmd" >&2
    usage >&2
    exit 1
    ;;
esac
