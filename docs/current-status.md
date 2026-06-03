# OxyGen CMS Current Status

_Last updated: 2026-06-03_

## Current Browser-Testable Flow

The first-run setup UI now follows this order:

1. **Configure database**
   - Step 1: choose deployment model.
   - Step 2: enter connection details when needed.
   - Step 3: enter credentials when needed.
   - Step 4: review and provision.
   - Self-contained deployments use managed MySQL settings supplied by Docker Compose / installer environment and do not expose generated secrets in the browser.
   - Custom existing MySQL deployments collect privileged schema credentials separately from application runtime credentials.
2. **Apply schema**
   - Shows target CMS schema version before applying.
   - Current pre-production target schema version: `0.01`.
3. **Create first administrator**
   - Admin creation is blocked until database settings are saved and schema is current.
4. **Sign in**
   - After schema is current, auth/RBAC operations use the configured MySQL database through the setup-aware auth repository.
   - Admin users, roles, groups, tenants, and sessions survive API/Web process restarts.

## Current API Contract

```http
GET /api/setup/status
GET /api/setup/deployment
POST /api/setup/database/provision-managed
POST /api/setup/database/test-connection
POST /api/setup/database/list-databases
POST /api/setup/database/provision
POST /api/setup/database/apply-schema
```

## Implemented in This Slice

- Managed deployment capability endpoint that redacts MySQL secrets.
- Self-contained managed provisioning endpoint using deployment-provided MySQL secrets.
- Step-by-step database wizard UI.
- Docker Compose flags for managed MySQL mode.
- Real MySQL provisioning and schema execution remain code-backed; live self-contained provisioning requires Docker/MySQL to be available in the runtime environment.
- Disposable development database scripts:
  - `npm run dev:db:reset` — destroy/recreate the MySQL container and clear local setup state.
  - `npm run dev:managed` — run API/Web in self-contained managed MySQL mode.
  - `npm run dev:managed:smoke` — exercise managed provision + schema endpoints.
- MySQL-backed auth repository:
  - Uses the configured runtime application DB credentials after schema is current.
  - Persists bootstrap admin, sessions, tenants, roles, groups, and users in MySQL.
  - Integration test: `npm run test:mysql-auth`.
- Instance enrollment scaffold:
  - Adds authenticated `/api/instances` CRUD endpoints.
  - SystemAdmin users can create, update, delete, and run the current connectivity-test scaffold.
  - Non-admin users only see instances assigned to their CMS user groups.
  - The browser Instances page now has an enrollment grid and create/edit modal.
  - Current instance repository is in-memory for browser review; MySQL persistence and live OxyGen connectivity are the next implementation slices.

## Validation Gate

Latest local validation passed:

```bash
npm run typecheck
npm run build
npm test
npm audit
```
