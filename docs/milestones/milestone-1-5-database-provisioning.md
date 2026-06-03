# Milestone 1.5 — Database Provisioning and Durable Security Persistence

## Objective

Move CMS setup from an in-memory review store to a durable, versioned MySQL database. The first-run wizard must configure or create the CMS database **before** creating the first CMS administrator.

## Current Status

Milestone 1.5 is partially implemented and browser-reviewed as a setup-wizard scaffold.

Completed and reviewed:

- Multi-step first-run wizard order: database → schema → first admin.
- Database setup UI with local/existing MySQL mode selector.
- Default database name: `O2IAS_CMS`.
- Default app DB user: `oxygen_cms`.
- Secure auto-generated application DB password.
- Inline `Generate Password` button to the right of the password input.
- Eye icon inside the password input to show/hide the generated password.
- Apply Schema step displays target schema version `0.01`.
- Local setup settings are saved in `apps/api/data/settings.json` and ignored by git.
- Schema migration runner supports string versions such as `0.01` and `0.02`.
- Initial DDL artifact exists at `apps/api/src/db/migrations/001_security_tenant_schema.sql`.
- Validation gate passes: typecheck, build, tests, audit.

Still to implement:

- Real MySQL connectivity test.
- Existing database listing.
- Database create/select behavior.
- Application DB user creation/update with least privilege.
- MySQL schema execution and `cms_schema_versions` recording.
- MySQL-backed `AuthRepository`.
- Restart persistence tests for users/groups/roles/tenants/sessions.

## User Experience

The current first-admin setup flow is a multi-step first-run provisioning wizard:

1. **Database setup**
2. **Schema validation / migration**
3. **First CMS administrator creation**

The user must not be asked to create the first admin until CMS has connected to a valid database and applied the current schema version.

See also: [First-Run Setup Wizard](../setup-wizard.md).

## Database Setup Modes

### Mode A — Connect to an existing local/remote MySQL server

The user supplies:

- Hostname / IP
- Port, default `3306`
- Database name, default `O2IAS_CMS`
- Application DB username
- Application DB password
- TLS/SSL option, if needed later

Future implementation will allow the user to:

- Select an existing database, or
- Create a new database

The database name must remain editable.

### Deployment Boundary

The browser wizard should not directly install or launch MySQL as an operating-system service. It can provision the CMS database, users, grants, and schema on a MySQL server that is already reachable from the API. Local MySQL deployment should be supplied by Docker Compose, a product installer, or another host-level supervisor before setup begins.

### Mode B — Create/configure a database on a local MySQL server, default path

This is the default first-run option.

CMS should create/configure its database and application user on a local MySQL server that is already running. Deploying the MySQL service itself should be handled by Docker Compose, an installer, or a host/service manager before the browser wizard runs.

The user is prompted for the application database user:

- App DB username
- App DB password

Password UX rules:

- Generate a secure password automatically.
- Allow the user to record it.
- Allow the user to replace it.
- Provide an eye icon to show/hide it.
- Keep `Generate Password` inline to the right of the input.

CMS creates or connects to:

- MySQL server
- Database, default `O2IAS_CMS`
- App database user with least privileges needed by CMS

## Configuration Persistence

After CMS connects to or creates the target database, it saves the application DB settings to local application settings.

Current development implementation saves to:

```text
apps/api/data/settings.json
```

Production hardening later can move secrets to env vars, Docker secrets, OS secret storage, or encrypted local config.

Settings must not be committed.

## Schema Versioning

CMS must maintain a versioned schema.

Required table:

```text
cms_schema_versions
```

Minimum columns:

```text
version
name
applied_at
checksum
```

Current versioning convention:

- Pre-production schemas use `0.xx`.
- Current target schema: `0.01`.
- Production-ready schema releases may move to `1.x`.
- Store versions as strings (`VARCHAR(32)`), not integers.

Schema startup behavior:

1. Connect to configured database.
2. Read applied schema versions.
3. Apply pending migrations in order.
4. Refuse to start admin/API features if schema validation fails.

## Durable Security Tables

Milestone 1.5 persists the current in-memory security model:

- tenants
- roles
- users
- user groups
- user role assignments
- user group assignments
- sessions

Rules to preserve:

- `SystemAdmin` and `TenantAdmin` are global protected roles.
- Users are tied to roles and user groups.
- Users, groups, roles, and future instances may be tied to tenants/partners.
- `tenant_id = null` means global.
- Tenant assignment is immutable after creation.
- Only global users can manage tenants/partners.

## Docker / Repeatable Test Assets

Current Docker assets:

```text
docker-compose.yml
docker/mysql/init/.gitkeep
```

The Docker setup should support repeatable local provisioning tests without requiring manual MySQL installation.

## API Scope

Setup/provisioning APIs run before the first admin exists:

```http
GET  /api/setup/status
POST /api/setup/database/test-connection
POST /api/setup/database/list-databases
POST /api/setup/database/provision
POST /api/setup/database/apply-schema
```

The existing endpoint may remain as a compatibility wrapper:

```http
GET /api/auth/bootstrap-status
```

But its logic changes to:

```text
requires setup if database is not configured OR schema is not current OR no admin user exists
```

## UI Scope

Current setup UI includes:

- Database mode selection:
  - Create/configure database on local MySQL server
  - Connect to existing local/remote MySQL server
- Database name field, default `O2IAS_CMS`
- App DB user/password fields
- Generated password with show/hide icon
- Inline generate password button
- Test/save database settings action
- Schema migration status and target schema version
- First admin form after schema is current

## Acceptance Criteria

### Completed in Current Scaffold

- Fresh checkout can start setup wizard with no configured DB.
- User can choose default local MySQL provisioning path in UI.
- DB settings are saved locally and ignored by git.
- Setup status reports `targetSchemaVersion: "0.01"`.
- Apply Schema screen clearly states the target schema version.
- New setup tests cover DB setup status and schema versioning.
- `npm run typecheck` passes.
- `npm run build` passes.
- `npm test` passes.
- `npm audit` reports 0 vulnerabilities.

### Remaining for Milestone Completion

- User can connect to an existing MySQL server and select/create `O2IAS_CMS` or another DB name.
- Schema version table is created in MySQL and current migration is recorded.
- Current users/groups/roles/tenants APIs use durable MySQL-backed persistence.
- Restarting the API preserves users/groups/roles/tenants/sessions.
- Existing auth/RBAC/tenant tests pass against the durable repository.

## Proposed Implementation Order From Here

1. Implement `MySQLSchemaMigrationAdapter`.
2. Add real MySQL connection test API.
3. Add database list/create/select API behavior.
4. Add app DB user provisioning/privilege logic.
5. Execute `001_security_tenant_schema.sql` during Apply Schema.
6. Record `0.01` in `cms_schema_versions`.
7. Add MySQL-backed `AuthRepository`.
8. Add restart persistence tests.
9. Update setup wizard copy as real MySQL actions replace scaffold responses.
10. Run full validation and pause for review before Milestone 2.
