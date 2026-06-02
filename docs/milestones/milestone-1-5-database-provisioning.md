# Milestone 1.5 — Database Provisioning and Durable Security Persistence

## Objective

Move CMS setup from an in-memory review store to a durable, versioned MySQL database. The first-run wizard must configure or create the CMS database **before** creating the first CMS administrator.

## User Experience

The current first-admin setup flow becomes a multi-step first-run provisioning wizard:

1. **Database setup**
2. **Schema validation / migration**
3. **First CMS administrator creation**

The user must not be asked to create the first admin until CMS has connected to a valid database and applied the current schema version.

## Database Setup Modes

### Mode A — Connect to an existing local/remote MySQL server

The user supplies:

- Hostname / IP
- Port, default `3306`
- Administrative SQL username
- Administrative SQL password
- TLS/SSL option, if needed later

CMS then allows the user to:

- Select an existing database, or
- Create a new database

Default database name:

```text
O2IAS_CMS
```

The database name must be editable.

### Mode B — Create a new local MySQL instance, default path

This is the default first-run option.

CMS should provision a local MySQL instance for repeatable development/deployment, initially via Docker Compose.

The user is prompted for the application database user:

- App DB username
- App DB password
- Confirm password

CMS creates or connects to:

- MySQL server
- Database, default `O2IAS_CMS`
- App database user with least privileges needed by CMS

## Configuration Persistence

After CMS connects to or creates the target database, it saves the application DB settings to local application settings.

Initial development implementation may save to a local ignored settings file, for example:

```text
apps/api/data/settings.json
```

Production hardening later can move secrets to env vars, Docker secrets, or OS secret storage.

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
- groups
- user_roles
- user_groups
- sessions

Rules to preserve:

- `SystemAdmin` and `TenantAdmin` are global protected roles.
- Users are tied to roles and user groups.
- Users, groups, roles, and future instances may be tied to tenants/partners.
- `tenant_id = null` means global.
- Tenant assignment is immutable after creation.
- Only global users can manage tenants/partners.

## Docker / Repeatable Test Assets

Create Docker assets as part of this milestone:

```text
docker-compose.yml
docker/mysql/init/
```

The Docker setup should support repeatable local provisioning tests without requiring manual MySQL installation.

## API Scope

Add setup/provisioning APIs separate from authenticated admin APIs because they run before the first admin exists:

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

Update the setup UI to include:

- Setup progress indicator
- Database mode selection:
  - Create local MySQL instance
  - Connect to existing local/remote MySQL server
- Connection form
- Database name field, default `O2IAS_CMS`
- Existing database selector for existing server mode
- App DB user/password fields for local-create mode
- Test connection button
- Create/connect button
- Schema migration status
- Then first admin form

## Acceptance Criteria

- Fresh checkout can start setup wizard with no configured DB.
- User can choose default local MySQL provisioning path.
- User can connect to an existing MySQL server and select/create `O2IAS_CMS` or another DB name.
- DB settings are saved locally and ignored by git.
- Schema version table is created and current migration is recorded.
- Current users/groups/roles/tenants APIs use durable MySQL-backed persistence.
- Restarting the API preserves users/groups/roles/tenants/sessions.
- Existing auth/RBAC/tenant tests pass against the durable repository.
- New setup tests cover DB setup status and schema versioning.
- `npm run typecheck` passes.
- `npm run build` passes.
- `npm test` passes.
- `npm audit` reports 0 vulnerabilities.

## Proposed Implementation Order

1. Add setup status model and tests.
2. Add local settings store for DB configuration.
3. Add schema migration runner and `cms_schema_versions` table.
4. Add initial SQL migration for current security/tenant tables.
5. Add MySQL-backed auth repository behind the current `AuthRepository` interface.
6. Add setup database test/list/provision APIs.
7. Add Docker Compose MySQL service for repeatable testing.
8. Update first-run React wizard to run DB setup before admin creation.
9. Update docs and validation commands.
10. Run full validation and pause for review before Milestone 2.
