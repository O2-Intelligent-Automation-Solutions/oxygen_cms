# Deployment

Milestone 7A adds the first production-oriented Docker deployment baseline for the current API/web/MySQL MVP.

## Model

The baseline stack runs:

- `app` — the production OxyGen CMS image built from this repository. The API serves `/api/*` and the built React app from the same container.
- `mysql` — MySQL 8.4 with persistent Docker volume storage.

Redis is included as the Phase 1.5 queue foundation service. BullMQ and Bull Board are installed but disabled by default for the API (`BULLMQ_ENABLED=false`, `BULL_BOARD_ENABLED=false`) so the MVP in-process poller remains the active execution path until worker scheduling is explicitly enabled. Optional worker services are present under the Compose `workers` profile and use the `start:worker`/`dev:worker` entrypoints.

## Quick start

```bash
scripts/deploy.sh init
scripts/deploy.sh check
scripts/deploy.sh start
```

Then open:

```text
http://localhost:8080
```

Change `CMS_HTTP_PORT` in `deploy/.env` if port `8080` is not appropriate.

## Files

- `docker-compose.deploy.yml` — production/self-contained Docker Compose stack.
- `deploy.env.example` — non-secret template for deployment environment variables.
- `scripts/deploy.sh` — user-friendly lifecycle helper.
- `deploy/.env` — generated local deployment secrets. This file is ignored by git and must not be committed.

## Lifecycle commands

```bash
scripts/deploy.sh init       # Create deploy/.env with generated secrets
scripts/deploy.sh check      # Validate Docker/Compose and Compose config
scripts/deploy.sh build      # Build the production image
scripts/deploy.sh start      # Build and start app + MySQL
scripts/deploy.sh status     # Show containers
scripts/deploy.sh logs       # Follow app logs
scripts/deploy.sh logs mysql # Follow MySQL logs
scripts/deploy.sh backup     # Create timestamped MySQL/app-data backup
scripts/deploy.sh pre-update # Validate stack and create a safety backup before update
scripts/deploy.sh update --dry-run main
                             # Resolve the target update without changing the stack
CONFIRM_UPDATE=YES scripts/deploy.sh update main
                             # Backup, checkout target, rebuild, restart, health-check, and apply schema migrations
scripts/deploy.sh restart    # Restart services
scripts/deploy.sh stop       # Stop services, preserving volumes
```

## Secrets

`deploy/.env` is generated with mode `600` and includes:

- `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `OXYGEN_CMS_ENCRYPTION_KEY`

Do not commit or share `deploy/.env`.

## Backup and restore

Create a timestamped backup with:

```bash
scripts/deploy.sh backup
```

Backups are written under `deploy/backups/<timestamp>/` by default and include:

- `mysql.sql.gz` — MySQL logical dump for the CMS database.
- `app-data.tar.gz` — CMS app data/settings volume backup.
- `manifest.txt` — non-secret backup metadata.

Before any application update, run:

```bash
scripts/deploy.sh pre-update
```

Milestone 7D starts the guarded in-place update path with:

```bash
scripts/deploy.sh update --dry-run main
CONFIRM_UPDATE=YES scripts/deploy.sh update main
```

The update command requires a clean Git working tree, resolves the requested ref from the configured remote, creates the same pre-update safety backup, checks out the resolved commit, rebuilds/restarts the Compose stack, waits for `/api/health`, and then calls `/api/setup/database/apply-schema` so pending CMS schema migrations are applied automatically. Use `UPDATE_SOURCE_REMOTE` and `UPDATE_TARGET_REF` to change the default source/target. Use `CMS_BASE_URL` when the deployment is not reachable at the default `http://127.0.0.1:${CMS_HTTP_PORT}` path.

Restore is intentionally guarded because it replaces database contents:

```bash
CONFIRM_RESTORE=YES scripts/deploy.sh restore-db deploy/backups/<timestamp>/mysql.sql.gz
```

Always take a fresh backup before restore/update operations.

## Queued backup job design

Milestone 8C adds backend configuration and the first guarded worker runner for queued CMS database backups. The runner is not exposed as a Run Now UI action yet. When a future queue control enqueues `database-maintenance:backup-database`, artifact creation remains disabled unless the deployment explicitly opts in. The storage target defaults to the same local artifact root used by `scripts/deploy.sh backup`:

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `CMS_BACKUP_JOBS_ENABLED` | `false` | Opt-in gate before CMS workers may create backup artifacts. |
| `CMS_BACKUP_DIR` | `deploy/backups` | Directory where queued backup artifacts will be written. |
| `CMS_BACKUP_RETENTION_DAYS` | `30` | Planned cleanup window for old backup artifacts. |
| `CMS_BACKUP_MAX_ARTIFACTS` | `25` | Planned cap for retained backup artifact directories. |
| `CMS_BACKUP_INCLUDE_APP_DATA` | `true` | Include CMS app data/settings payloads in addition to MySQL logical dumps. |

Safety gates for the queued job implementation:

1. Keep BullMQ backup payloads credential-free; workers read current setup/database settings at execution time.
2. Require `CMS_BACKUP_JOBS_ENABLED=true` before any worker writes files or invokes `mysqldump`.
3. Resolve each run to a timestamped subdirectory under the configured backup root.
4. Write `mysql.sql.gz` plus a non-secret `manifest.json`, matching the host-side backup model.
5. Use MySQL logical dumps with transaction-safe options where possible; do not expose database passwords in job data, logs, or manifests.
6. Enforce retention cleanup only after a successful backup; cleanup deletes only timestamp-shaped artifact directories under the configured backup root and never deletes the current run.
7. Treat app-data packaging as a follow-up runner slice; the current runner records an explicit warning when app-data inclusion is configured but not yet packaged.

The first queued runner slice is intentionally database-dump-only and worker-only. `scripts/deploy.sh backup` remains the primary operator-facing backup command until Run Now controls and app-data packaging are reviewed.

## Queued restore job design

Restore remains host/operator-driven today:

```bash
CONFIRM_RESTORE=YES scripts/deploy.sh restore-db deploy/backups/<timestamp>/mysql.sql.gz
```

A future queued restore path must be treated as destructive and stay separate from the backup runner. Design gates before any CMS worker may restore data:

1. Add a dedicated restore runner dependency and task contract; do not reuse the backup runner or direct route logic.
2. Require an explicit deployment opt-in and a per-request confirmation phrase such as `RESTORE_DATABASE`, not just an authenticated click.
3. Require a fresh pre-restore backup to complete first, and record both source backup and safety-backup artifact IDs in a non-secret manifest/audit log.
4. Accept only server-local backup artifact IDs under the configured backup root; never accept arbitrary file paths, URLs, uploaded SQL, credentials, or raw shell fragments in queue payloads.
5. Validate backup manifest shape before restore, including expected database artifact name and creation timestamp.
6. Stop or pause competing workers/schedulers before restore, apply the database dump, restart the app/worker, then run schema-current checks and health smoke before reporting success.
7. Keep restore hidden from Run Now/general queue controls until the explicit confirmation UX, audit trail, rollback guidance, and tests are reviewed.

## HTTPS / certificates

The MVP deployment exposes the CMS app over HTTP on `CMS_HTTP_PORT`. For production HTTPS, place a reverse proxy or load balancer in front of the app port and terminate TLS there. Supported near-term patterns:

1. **Existing reverse proxy / load balancer** — route HTTPS traffic to `http://<host>:${CMS_HTTP_PORT}`.
2. **Customer-supplied certificate proxy** — bundled proxy automation is skipped for now; advanced/custom deployments may add their own proxy that mounts supplied certificate/key files.
3. **Generated/self-signed local certificate outside CMS automation** — acceptable only for internal testing, not recommended for production users.

Keep MySQL unexposed to the public network. Only the app HTTP port should be reachable by users/proxies.

## Data persistence

The Compose stack uses named volumes:

- `oxygen-cms-mysql` for MySQL data.
- `oxygen-cms-app-data` for CMS setup/settings state.

Stopping the stack with `scripts/deploy.sh stop` preserves these volumes.

## Current limitations

This deployment baseline now includes GitHub update detection, the CMS Settings → General update notice, and disabled-by-default guarded update runner API endpoints. It does not yet include:

- Milestone 7 local validation has passed for `scripts/deploy.sh init`, `scripts/deploy.sh check`, `scripts/deploy.sh update --dry-run main`, clean isolated Compose deployment, backup/restore, and a throwaway-clone tagged-update smoke using local smoke tags. The repository does not yet have real release tags, so future release management should still exercise an actual release-tag-to-release-tag update once published. The host-side guarded `scripts/deploy.sh update` command, backend execution/status tracking, Settings UI action buttons, automatic post-restart schema migration follow-through, and in-CMS recovery guidance are present.
- Native Jobs dashboard/review surface and remaining database maintenance jobs. Redis/BullMQ configuration, status API, optional Bull Board mount, Settings → General queue visibility, opt-in worker bootstrap/profile wiring, safe instance-check processor, schedule/manual enqueue helpers, automatic startup/CRUD/import schedule reconciliation, and the queued `purge-logs` database-maintenance path are present as the Phase 1.5 foundation.

Bundled HTTPS/certificate automation is intentionally skipped for now in favor of external reverse-proxy/load-balancer TLS termination.
