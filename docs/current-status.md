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
   - Existing in-memory auth/session behavior remains available for review until MySQL-backed auth is wired.

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

## Validation Gate

Latest local validation passed:

```bash
npm run typecheck
npm run build
npm test
npm audit
```
