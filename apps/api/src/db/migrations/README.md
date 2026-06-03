# OxyGen CMS Schema DDL Scripts

This directory contains SQL DDL artifacts for OxyGen CMS database schema migrations.

## Current Schema

Current pre-production schema version:

```text
0.02
```

DDL artifacts:

```text
001_security_tenant_schema.sql
002_oxygen_instances.sql
```

Embedded TypeScript migration registry:

```text
index.ts
```

## Versioning Rules

- Pre-production schema versions use `0.xx`.
- Production-ready schema releases can move to `1.x`.
- Store schema versions as strings, not integers.
- The `cms_schema_versions.version` column is `VARCHAR(32)`.
- Keep each SQL artifact checksum in sync with the matching entry in `index.ts`.

## Version `0.01`

Creates the current security/tenant foundation:

```text
cms_schema_versions
tenants
roles
user_groups
users
user_role_assignments
user_group_assignments
sessions
```

Seeds global roles:

```text
SystemAdmin
TenantAdmin
PartnerAdmin
Operator
Viewer
```

`SystemAdmin` and `TenantAdmin` are protected global roles.

## Version `0.02`

Creates the durable instance enrollment table:

```text
oxygen_instances
```

`oxygen_instances.group_id` references `user_groups.id` so scoped instance visibility follows CMS group membership.

## Implemented DDL Runtime

The setup wizard's Apply Schema step executes the registered MySQL migrations and records versions `0.01` and `0.02` in `cms_schema_versions`. Auth/RBAC and instance enrollment runtime code now use these tables after schema setup is complete.
