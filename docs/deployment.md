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
                             # Backup, checkout target, rebuild, and restart
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

The update command requires a clean Git working tree, resolves the requested ref from the configured remote, creates the same pre-update safety backup, checks out the resolved commit, rebuilds the production image, and restarts the Compose stack. Use `UPDATE_SOURCE_REMOTE` and `UPDATE_TARGET_REF` to change the default source/target. After the app restarts, open the CMS setup/status UI and apply any pending schema migrations if prompted.

Restore is intentionally guarded because it replaces database contents:

```bash
CONFIRM_RESTORE=YES scripts/deploy.sh restore-db deploy/backups/<timestamp>/mysql.sql.gz
```

Always take a fresh backup before restore/update operations.

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

- CMS UI action buttons that trigger the guarded dry-run/update endpoints. The host-side guarded `scripts/deploy.sh update` command and backend execution/status tracking are present; UI buttons and automatic schema-migration follow-through remain next.
- Native Jobs dashboard/review surface and remaining database maintenance jobs. Redis/BullMQ configuration, status API, optional Bull Board mount, Settings → General queue visibility, opt-in worker bootstrap/profile wiring, safe instance-check processor, schedule/manual enqueue helpers, automatic startup/CRUD/import schedule reconciliation, and the queued `purge-logs` database-maintenance path are present as the Phase 1.5 foundation.

Bundled HTTPS/certificate automation is intentionally skipped for now in favor of external reverse-proxy/load-balancer TLS termination.
