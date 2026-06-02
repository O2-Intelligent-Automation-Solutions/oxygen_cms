# Development Setup

## Prerequisites

- Node.js 22+
- npm 10+
- Docker / Docker Compose for local MySQL provisioning tests

## Local Development

Install dependencies:

```bash
npm install
```

Start the MySQL/API/web development stack:

```bash
docker compose up
```

Or run services directly after starting MySQL:

```bash
npm --workspace @oxygen-cms/api run dev
npm --workspace @oxygen-cms/web run dev -- --host 0.0.0.0
```

Default local URLs:

- API health: <http://localhost:3000/api/health>
- Setup status: <http://localhost:3000/api/setup/status>
- Web app: <http://localhost:5173>

Remote development review:

- API binds to `0.0.0.0` by default via `API_HOST=0.0.0.0`.
- The Vite web server should be run with `--host 0.0.0.0` for remote review.
- Replace `<server-host>` with the remote server DNS name or IP:
  - API health: `http://<server-host>:3000/api/health`
  - Setup status: `http://<server-host>:3000/api/setup/status`
  - Web app: `http://<server-host>:5173`

## First-Run Wizard Review

The first-run setup wizard is documented in [First-Run Setup Wizard](setup-wizard.md).

Current setup order:

```text
Database setup → Apply schema → Create first administrator → Sign in
```

Local setup state is stored in:

```text
apps/api/data/settings.json
```

This path is ignored by git.

Reset to database setup:

```bash
rm -f apps/api/data/settings.json
```

Review the setup API state:

```bash
curl -sS http://localhost:3000/api/setup/status | jq
```

## Database Defaults

Default CMS database:

```text
O2IAS_CMS
```

Default application DB user:

```text
oxygen_cms
```

Pre-production schema version convention:

```text
0.xx
```

Current target schema version:

```text
0.01
```

Schema DDL artifact:

```text
apps/api/src/db/migrations/001_security_tenant_schema.sql
```

## Docker Compose MySQL

The `mysql` service in `docker-compose.yml` provides a repeatable local database for provisioning work.

Common commands:

```bash
docker compose up mysql
# or full stack
docker compose up
```

MySQL volume:

```text
oxygen-cms-mysql-data
```

To reset local Docker data during development:

```bash
docker compose down -v
```

## Validation

Run before and after each milestone commit:

```bash
npm run typecheck
npm run build
npm test
npm audit
```

Current expected result:

```text
14 tests passed
0 vulnerabilities
```

GitHub Dependabot/security alerts must be resolved before starting the next milestone.

## Scope Guard

This repository is standalone. Do not modify `oxygen_backend` or `oxygen_frontend` while developing CMS unless Brad explicitly grants per-session permission.
