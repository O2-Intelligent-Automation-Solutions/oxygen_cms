# OxyGen CMS Current Status

_Last updated: 2026-06-04_

## Current Checkpoint

OxyGen CMS is in the late Phase 1 foundation stage. The repo now has a durable MySQL-backed CMS foundation, instance enrollment CRUD, reusable managed grids, configurable labels, and a browser-reviewable admin shell.

Current schema target:

```text
0.07
```

Latest committed feature checkpoint:

```text
cf85e02 feat: add configurable application labels
```

## Current Browser-Testable Flow

The first-run setup UI follows this order:

1. **Configure database** — self-contained managed MySQL, local MySQL, or existing MySQL.
2. **Apply schema** — shows target CMS schema version before applying pending migrations.
3. **Create first administrator** — blocked until database settings exist and schema is current.
4. **Sign in** — auth/RBAC, instances, grid preferences, and application settings use configured MySQL persistence.

## Implemented API Contract

Setup endpoints:

```http
GET /api/setup/status
GET /api/setup/deployment
POST /api/setup/database/provision-managed
POST /api/setup/database/test-connection
POST /api/setup/database/list-databases
POST /api/setup/database/provision
POST /api/setup/database/apply-schema
```

Auth/admin endpoints:

```http
GET /api/auth/bootstrap-status
POST /api/auth/bootstrap
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me

GET|POST|PATCH|DELETE /api/tenants
GET|POST|PATCH|DELETE /api/roles
GET|POST|PATCH|DELETE /api/groups
GET|POST|PATCH|DELETE /api/users
GET|POST|PATCH|DELETE /api/instances
POST /api/instances/:instanceId/test-connectivity
```

Managed grid/application settings endpoints:

```http
GET /api/grid-preferences/:gridKey
PUT /api/grid-preferences/:gridKey

GET /api/app-settings/labels
PUT /api/app-settings/labels
```

## Completed Capabilities

### Foundation / setup

- React + Node + TypeScript monorepo.
- MySQL-backed setup wizard with managed Docker development path.
- Versioned schema migrations through `0.07`.
- Setup-aware repositories that use MySQL after database/schema setup is complete.

### Local security

- First SystemAdmin bootstrap after schema setup.
- Password hashing with per-user salts.
- Session persistence in MySQL.
- Users, roles, groups, and tenants persisted in MySQL.
- Tenant assignment is immutable after creation for users/groups/roles/instances.

### Instance enrollment

- Manual instance CRUD.
- Protocol/host/port fields with HTTPS/443 and HTTP/80 defaults.
- Username defaults to `admin`.
- Launch action opens `{protocol}://{host}:{port}/optws/oxygen.aspx`.
- Instance access model is controlled through users and groups, not the instance record itself.

### Managed grids and UI settings

- Reusable Kendo managed grid component.
- Per-user/per-grid persisted layout preferences: columns, order, width, sort, group, filter state.
- Settings → General → Labels lets the user change the displayed tenant label across the application.

## Current Validation Gate

```bash
npm run typecheck
npm run build
npm test
npm audit
git diff --check
```

Run MySQL integration tests when touching database-backed repositories:

```bash
MYSQL_INTEGRATION_TESTS=true npm --workspace @oxygen-cms/api test -- --run tests/mysqlAuthRepository.test.ts
MYSQL_INTEGRATION_TESTS=true npm --workspace @oxygen-cms/api test -- --run tests/mysqlInstanceRepository.test.ts
MYSQL_INTEGRATION_TESTS=true npm --workspace @oxygen-cms/api test -- --run tests/mysqlGridPreferenceRepository.test.ts
MYSQL_INTEGRATION_TESTS=true npm --workspace @oxygen-cms/api test -- --run tests/mysqlAppSettingsRepository.test.ts
```

## Open Phase 1 Gaps

1. Encrypt stored remote OxyGen credentials.
2. Replace the connectivity scaffold with real DNS/HTTPS/SSL/auth/API checks.
3. Add monitor run/history persistence and background polling.
4. Add OxyGen license, global settings, and workflow collectors.
5. Build instance detail and dashboard drill-down views.
6. Complete Docker/HTTPS deployment hardening.
