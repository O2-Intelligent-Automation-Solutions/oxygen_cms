# OxyGen CMS Schema DDL Scripts

This directory contains SQL DDL artifacts for OxyGen CMS database schema migrations.

## Current Schema

Current pre-production schema version:

```text
0.01
```

DDL artifact:

```text
001_security_tenant_schema.sql
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

## Implemented DDL Runtime

The setup wizard's Apply Schema step executes the registered MySQL migrations and records version `0.01` in `cms_schema_versions`. Auth/RBAC runtime code now uses these tables after schema setup is complete.
