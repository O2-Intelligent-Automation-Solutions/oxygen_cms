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
  scripts/deploy.sh start      Start the CMS app/MySQL/Redis stack
  scripts/deploy.sh start-workers
                              Start app plus the BullMQ worker profile with BULLMQ enabled
  scripts/deploy.sh stop       Stop the CMS stack
  scripts/deploy.sh stop-workers
                              Stop only the BullMQ worker service
  scripts/deploy.sh restart    Restart the CMS stack
  scripts/deploy.sh restart-workers
                              Restart the app and BullMQ worker profile with BULLMQ enabled
  scripts/deploy.sh status     Show container status
  scripts/deploy.sh logs       Follow app logs
  scripts/deploy.sh logs mysql Follow MySQL logs
  scripts/deploy.sh logs worker
                              Follow BullMQ worker logs
  scripts/deploy.sh backup     Backup MySQL data and CMS app data
  scripts/deploy.sh restore-db <backup.sql.gz>
                              Restore a database backup; requires CONFIRM_RESTORE=YES
  scripts/deploy.sh pre-update Create a safety backup and validate the stack before update
  scripts/deploy.sh update [--dry-run] [ref]
                              Guarded in-place app update from Git; requires CONFIRM_UPDATE=YES unless --dry-run

Environment overrides:
  DEPLOY_DIR=/path/to/deploy
  ENV_FILE=/path/to/.env
  COMPOSE_FILE=/path/to/docker-compose.deploy.yml
  BACKUP_DIR=/path/to/backups
  UPDATE_SOURCE_REMOTE=origin
  UPDATE_TARGET_REF=main
  CMS_BASE_URL=http://127.0.0.1:8080
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

cms_base_url() {
  local configured port
  configured="${CMS_BASE_URL:-}"
  if [[ -n "$configured" ]]; then
    printf '%s' "${configured%/}"
    return 0
  fi
  port="$(load_env_value CMS_HTTP_PORT)"
  printf 'http://127.0.0.1:%s' "${port:-8080}"
}

wait_for_cms_health() {
  local base_url="$1"
  local attempts="${CMS_UPDATE_HEALTH_ATTEMPTS:-60}"
  local delay="${CMS_UPDATE_HEALTH_DELAY_SECONDS:-2}"
  local i
  if ! command -v curl >/dev/null 2>&1; then
    printf 'ERROR: curl is required to verify CMS health and apply schema migrations after update.\n' >&2
    exit 1
  fi
  for i in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 5 "$base_url/api/health" >/dev/null; then
      return 0
    fi
    sleep "$delay"
  done
  printf 'ERROR: CMS did not become healthy at %s/api/health after update.\n' "$base_url" >&2
  exit 1
}

apply_schema_after_update() {
  local base_url="$1"
  local response_file status
  response_file="$(mktemp)"
  printf 'Applying CMS schema migrations through %s/api/setup/database/apply-schema...\n' "$base_url"
  status="$(curl -sS --max-time 120 -o "$response_file" -w '%{http_code}' -X POST "$base_url/api/setup/database/apply-schema" || true)"
  if [[ "$status" != "200" ]]; then
    printf 'ERROR: schema migration endpoint returned HTTP %s.\n' "${status:-curl-failed}" >&2
    cat "$response_file" >&2 || true
    rm -f "$response_file"
    exit 1
  fi
  printf 'Schema migration response: '
  cat "$response_file"
  printf '\n'
  rm -f "$response_file"
}

require_clean_git_tree() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf 'ERROR: update requires a Git checkout. Use manual package replacement for non-Git deployments.\n' >&2
    exit 1
  fi
  if [[ -n "$(git status --porcelain)" ]]; then
    printf 'ERROR: working tree has local changes. Commit, stash, or discard them before running an in-place update.\n' >&2
    git status --short >&2
    exit 1
  fi
}

resolve_update_commit() {
  local remote="$1"
  local target_ref="$2"
  git fetch --tags "$remote" >/dev/null
  if git rev-parse --verify --quiet "${target_ref}^{commit}" >/dev/null; then
    git rev-parse --verify "${target_ref}^{commit}"
    return 0
  fi
  if git rev-parse --verify --quiet "${remote}/${target_ref}^{commit}" >/dev/null; then
    git rev-parse --verify "${remote}/${target_ref}^{commit}"
    return 0
  fi
  printf 'ERROR: unable to resolve update target %s from %s.\n' "$target_ref" "$remote" >&2
  exit 1
}

update_stack() {
  require_docker
  require_env
  local dry_run="false"
  local target_ref="${UPDATE_TARGET_REF:-main}"
  if [[ "${1:-}" == "--dry-run" ]]; then
    dry_run="true"
    shift
  fi
  if [[ -n "${1:-}" ]]; then
    target_ref="$1"
  fi

  require_clean_git_tree
  "${COMPOSE[@]}" config >/dev/null

  local remote target_commit current_commit
  remote="${UPDATE_SOURCE_REMOTE:-origin}"
  current_commit="$(git rev-parse --short HEAD)"
  target_commit="$(resolve_update_commit "$remote" "$target_ref")"

  printf 'Current commit: %s\n' "$current_commit"
  printf 'Target ref: %s (%s)\n' "$target_ref" "$(printf '%s' "$target_commit" | cut -c1-12)"
  if [[ "$dry_run" == "true" ]]; then
    printf 'Dry run only. No backup, checkout, build, container restart, or schema migration was performed.\n'
    printf 'Planned post-restart schema endpoint: %s/api/setup/database/apply-schema\n' "$(cms_base_url)"
    return 0
  fi

  if [[ "${CONFIRM_UPDATE:-}" != "YES" ]]; then
    printf 'ERROR: update is guarded. Re-run with CONFIRM_UPDATE=YES after reviewing scripts/deploy.sh update --dry-run %s.\n' "$target_ref" >&2
    exit 1
  fi

  pre_update
  printf 'Checking out update target %s...\n' "$target_commit"
  git checkout --detach "$target_commit"
  printf 'Rebuilding and restarting CMS stack...\n'
  "${COMPOSE[@]}" up -d --build
  "${COMPOSE[@]}" ps
  local base_url
  base_url="$(cms_base_url)"
  printf 'Waiting for updated CMS to become healthy at %s...\n' "$base_url"
  wait_for_cms_health "$base_url"
  apply_schema_after_update "$base_url"
  printf 'Update command complete. CMS is healthy and schema migrations have been applied.\n'
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
CMS_BASE_URL=http://127.0.0.1:8080
CMS_APP_CONTAINER_NAME=oxygen-cms-prod-app
CMS_MYSQL_CONTAINER_NAME=oxygen-cms-prod-mysql
CMS_REDIS_CONTAINER_NAME=oxygen-cms-prod-redis
CMS_WORKER_CONTAINER_NAME=oxygen-cms-prod-worker

# BullMQ/Redis worker orchestration is opt-in. Use `scripts/deploy.sh start-workers`
# when ready to replace the MVP in-process poller with durable queue workers.
BULLMQ_ENABLED=false
REDIS_HOST=redis
REDIS_PORT=6379
BULL_BOARD_ENABLED=false
BULL_BOARD_PATH=/admin/queues

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
  start-workers|workers-up)
    require_docker
    require_env
    BULLMQ_ENABLED=true "${COMPOSE[@]}" --profile workers up -d --build app worker
    BULLMQ_ENABLED=true "${COMPOSE[@]}" --profile workers ps
    printf 'BullMQ worker profile is running. Verify Settings > Operations shows BullMQ/Redis connected.\n'
    ;;
  stop|down)
    require_docker
    require_env
    "${COMPOSE[@]}" down
    ;;
  stop-workers|workers-down)
    require_docker
    require_env
    "${COMPOSE[@]}" --profile workers stop worker
    "${COMPOSE[@]}" --profile workers ps
    ;;
  restart)
    require_docker
    require_env
    "${COMPOSE[@]}" restart
    "${COMPOSE[@]}" ps
    ;;
  restart-workers|workers-restart)
    require_docker
    require_env
    BULLMQ_ENABLED=true "${COMPOSE[@]}" --profile workers up -d --build app worker
    BULLMQ_ENABLED=true "${COMPOSE[@]}" --profile workers restart app worker
    BULLMQ_ENABLED=true "${COMPOSE[@]}" --profile workers ps
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
  update)
    shift
    update_stack "$@"
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
