# OxyGen CMS Current Status

_Last updated: 2026-06-02_

## Review Status

The current reviewed milestone slice is the **Milestone 1.5 setup wizard scaffold**. Brad reviewed the browser workflow and approved the current wizard behavior for the next commit.

## Current Browser-Testable Flow

The first-run setup UI now follows this order:

1. **Configure database**
   - Choose `Create local MySQL instance` or `Connect to existing MySQL server`.
   - Default CMS database name: `O2IAS_CMS`.
   - Application DB user defaults to `oxygen_cms`.
   - Application DB password is auto-generated, editable, and can be shown/hidden with an eye icon.
   - `Generate Password` is inline to the right of the password input.
2. **Apply schema**
   - Shows the target CMS schema version before applying.
   - Current pre-production target schema version: `0.01`.
   - Pre-production schemas use `0.xx`; production can move to `1.x`.
3. **Create first administrator**
   - Admin creation is blocked until database settings are saved and the schema step is complete.
4. **Sign in**
   - Existing in-memory auth/session behavior remains available for review.

## Current API Contract

Setup status:

```http
GET /api/setup/status
```

Response shape:

```json
{
  "database": {
    "configured": true,
    "connected": true,
    "schemaCurrent": false,
    "defaultDatabaseName": "O2IAS_CMS",
    "targetSchemaVersion": "0.01"
  },
  "admin": {
    "exists": false
  },
  "nextStep": "schema",
  "requiresSetup": true
}
```

Setup endpoints currently scaffolded for browser testing:

```http
POST /api/setup/database/test-connection
POST /api/setup/database/list-databases
POST /api/setup/database/provision
POST /api/setup/database/apply-schema
```

## Implemented in This Slice

- File-backed setup settings store at `apps/api/data/settings.json`.
- Git ignore protection for local setup settings.
- Setup status provider that drives the wizard state.
- Versioned schema migration runner supporting string versions (`0.01`, `0.02`, etc.).
- Initial SQL schema artifact for security, tenancy, roles, groups, users, and sessions.
- Docker Compose MySQL service defaults for repeatable local provisioning tests.
- Browser setup wizard with database → schema → admin ordering.
- Schema step displays `0.01` explicitly.
- Generated application DB password UX.

## Still Scaffolded / Next Work

The browser wizard is intentionally scaffolded for review. The next implementation pass must replace the simulated DB actions with real MySQL behavior:

- Real MySQL connectivity test.
- Existing database listing.
- Create/select `O2IAS_CMS` or custom database.
- Create/update the application DB user with least privilege.
- Execute schema DDL against MySQL and record `cms_schema_versions`.
- Replace in-memory auth repository with MySQL-backed persistence.
- Prove users/groups/roles/tenants/sessions survive API restart.

## Validation Gate

Latest local validation passed:

```bash
npm run typecheck
npm run build
npm test
npm audit
```

Expected result:

```text
14 tests passed
0 vulnerabilities
```
