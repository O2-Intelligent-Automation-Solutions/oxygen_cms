# OxyGen CMS Schema DDL Scripts

This directory contains SQL DDL artifacts for OxyGen CMS database schema migrations.

## Source of Truth

Runtime migrations are registered in:

```text
apps/api/src/db/migrations/index.ts
```

The SQL artifact files in this directory document the same migration history and should be kept aligned with the embedded registry.

## Current Schema

Current pre-production schema version:

```text
0.07
```

Canonical schema snapshot:

```text
current-schema-0.07.sql
```

## DDL Artifacts

```text
001_security_tenant_schema.sql
002_oxygen_instances.sql
003_instance_status_schema.sql
004_instance_access_model.sql
005_grid_preferences_schema.sql
006_remove_partner_role_terminology.sql
007_application_settings_schema.sql
```

## Version History

| Version | SQL artifact | Purpose |
| --- | --- | --- |
| `0.01` | `001_security_tenant_schema.sql` | Creates schema version table, tenants, roles, users, groups, assignments, and sessions. |
| `0.02` | `002_oxygen_instances.sql` | Adds initial durable OxyGen instance enrollment table. |
| `0.03` | `003_instance_status_schema.sql` | Adds instance description/tenant/protocol/host/port/API URL fields, latest status table, and check history table. |
| `0.04` | `004_instance_access_model.sql` | Moves access control from instance group assignment to user/group instance access tables. |
| `0.05` | `005_grid_preferences_schema.sql` | Adds per-user/per-grid managed grid layout preferences. |
| `0.06` | `006_remove_partner_role_terminology.sql` | Removes legacy unprotected role terminology rows from existing databases. |
| `0.07` | `007_application_settings_schema.sql` | Adds application settings JSON table for configurable labels and future general settings. |

## Effective Seed Roles

```text
SystemAdmin
TenantAdmin
Operator
Viewer
```

`SystemAdmin` and `TenantAdmin` are protected global roles.
