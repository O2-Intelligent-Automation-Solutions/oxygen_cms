# OxyGen CMS Database Architecture

## Purpose

OxyGen CMS uses a local MySQL database to persist CMS identity, local authentication, authorization, tenants/partners, enrolled OxyGen instances, monitor history, and collected read-only OxyGen snapshots.

Milestone 1.5 introduces the database-first setup architecture: database provisioning and schema validation happen before the first CMS administrator is created.

## Database Platform

- Engine: MySQL 8.x
- Default database: `O2IAS_CMS`
- Development container service: `mysql` in `docker-compose.yml`
- Local setup settings file: `apps/api/data/settings.json`
- Setup settings are intentionally ignored by git.

## Schema Versioning

CMS maintains schema state in:

```sql
cms_schema_versions
```

Current DDL location:

```text
apps/api/src/db/migrations/001_security_tenant_schema.sql
```

Embedded migration registry:

```text
apps/api/src/db/migrations/index.ts
```

Current target schema version:

```text
0.01
```

Versioning rule:

- Pre-production schemas use `0.xx` version numbers.
- Production-ready schemas may move to `1.x`.
- Version strings are stored as `VARCHAR(32)` so versions such as `0.01`, `0.02`, and `1.0` are preserved exactly.

Minimum schema version table:

```sql
CREATE TABLE IF NOT EXISTS cms_schema_versions (
  version VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(128) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Initial Security/Tenancy Schema

Schema version `0.01` creates the security and tenancy foundation:

```text
cms_schema_versions
roles
tenants
user_groups
users
user_role_assignments
user_group_assignments
sessions
```

### `tenants`

Represents partners/customers/tenant boundaries.

Rules:

- `tenant_id = NULL` means global access/scope.
- Tenant assignment is immutable after object creation.
- Only global users can manage tenants/partners.

### `roles`

Represents permission profiles.

Seeded roles:

```text
SystemAdmin   protected, global
TenantAdmin   protected, global template
PartnerAdmin  editable
Operator       editable
Viewer         editable
```

Rules:

- `SystemAdmin` and `TenantAdmin` are protected and cannot be deleted.
- Tenant-scoped roles are allowed later through `roles.tenant_id`.
- Global roles have `tenant_id = NULL`.

### `user_groups`

Represents user folders/groups that can scope instance visibility.

Rules:

- Groups may be global or tenant-scoped.
- Future enrolled instances will be associated to groups/folders for access filtering.

### `users`

Represents local CMS users.

Rules:

- Email is globally unique.
- Password hashes are stored, never raw passwords.
- `tenant_id = NULL` means global user.
- Tenant-scoped creators may only create/manage users inside their tenant.

### Join Tables

```text
user_role_assignments
user_group_assignments
```

Rules:

- Users may have multiple roles.
- Users may belong to multiple groups.
- Group and role assignments determine future instance visibility and permissions.

### `sessions`

Stores bearer-token session state.

Current implementation still uses in-memory runtime auth for review; the schema is ready for durable MySQL-backed sessions in the next pass.

## Setup Settings Store

During the browser-testable scaffold, database settings are stored in:

```text
apps/api/data/settings.json
```

Current shape:

```json
{
  "database": {
    "host": "localhost",
    "port": 3306,
    "database": "O2IAS_CMS",
    "user": "oxygen_cms",
    "password": "..."
  },
  "schemaCurrent": false
}
```

This file is local state only and must never be committed.

Production hardening options:

- Docker secrets
- Environment variables
- OS secret store
- Encrypted local config file

## Docker Development Database

`docker-compose.yml` includes a MySQL service with defaults suitable for local provisioning tests:

```text
MYSQL_DATABASE=O2IAS_CMS
MYSQL_USER=oxygen_cms
MYSQL_PASSWORD=oxygen_cms_dev_password
MYSQL_ROOT_PASSWORD=oxygen_cms_root_dev_password
```

The MySQL data volume is named:

```text
oxygen-cms-mysql-data
```

## Migration Runner

The generic migration runner lives at:

```text
apps/api/src/setup/schemaMigrations.ts
```

It:

1. Ensures `cms_schema_versions` exists.
2. Reads applied versions.
3. Sorts pending migrations by semantic-ish string version order.
4. Applies each pending migration.
5. Records the applied version and checksum.

## Next Database Work

- Implement `MySQLSchemaMigrationAdapter` with `mysql2` or equivalent.
- Execute `001_security_tenant_schema.sql` during the Apply Schema step.
- Record `0.01` in `cms_schema_versions`.
- Add a MySQL-backed `AuthRepository`.
- Persist users, groups, roles, tenants, and sessions.
- Add restart persistence regression tests.
