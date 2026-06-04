# OxyGen CMS Database Architecture

## Purpose

OxyGen CMS uses a local MySQL database to persist CMS identity, authentication, authorization, tenants, enrolled OxyGen instances, per-user grid preferences, application settings, monitor history, and collected read-only OxyGen snapshots.

The setup architecture is database-first: database provisioning and schema validation happen before the first CMS administrator is created.

## Database Platform

- Engine: MySQL 8.x
- Default database: `O2IAS_CMS`
- Development container service: `mysql` in `docker-compose.yml`
- Local setup settings file: `apps/api/data/settings.json`
- Setup settings are intentionally ignored by git.

## Schema Versioning

CMS maintains schema state in `cms_schema_versions`.

Runtime migration registry:

```text
apps/api/src/db/migrations/index.ts
```

Canonical current schema DDL:

```text
apps/api/src/db/migrations/current-schema-0.07.sql
```

Current target schema version:

```text
0.07
```

Versioning rules:

- Pre-production schemas use `0.xx` version numbers.
- Production-ready schemas may move to `1.x`.
- Version strings are stored as `VARCHAR(32)`.
- `index.ts` is the runtime source of truth. SQL artifact files document the same schema and should be kept aligned.

## Current Schema Versions

| Version | Name | Purpose |
| --- | --- | --- |
| `0.01` | security tenant schema | Creates CMS security foundation and seed roles. |
| `0.02` | oxygen instance enrollment schema | Adds durable OxyGen instance enrollment table. |
| `0.03` | expanded instance status schema | Adds instance details, status summary, and check history tables. |
| `0.04` | user and group instance access model | Moves instance access control to users/groups. |
| `0.05` | grid preferences schema | Adds per-user/per-grid managed grid layout persistence. |
| `0.06` | remove partner role terminology | Removes legacy unprotected role terminology. |
| `0.07` | application settings schema | Adds application settings including display labels. |

## Security and Tenancy Model

Core tables:

```text
tenants
roles
users
user_groups
user_role_assignments
user_group_assignments
sessions
```

Rules:

- `tenant_id = NULL` means global scope.
- Tenant assignment is immutable after creation for scoped records.
- Only global users can manage tenant records.
- `SystemAdmin` and `TenantAdmin` are protected global roles.
- `Operator` and `Viewer` are editable default roles.
- Users may belong to multiple roles and groups.

## Instance Access Model

Instance access is controlled through users and user groups:

```text
users.instance_access_mode
user_groups.instance_access_mode
user_instance_access
user_group_instance_access
```

Access modes:

| Mode | User behavior | Group behavior |
| --- | --- | --- |
| `inherit` | User inherits access from assigned groups. | Not used for groups. |
| `none` | User has no directly assigned instances. | Group grants no instances. |
| `all` | User can see all instances allowed by tenant/global scope. | Group grants all tenant/global instances. |
| `specific` | User has direct rows in `user_instance_access`. | Group has rows in `user_group_instance_access`. |

## Instance and Monitoring Tables

Current implemented instance tables:

```text
oxygen_instances
oxygen_instance_status
oxygen_instance_check_history
```

Credential note:

- `oxygen_instances.password_secret` exists today but the next Phase 1 milestone must replace plaintext storage with encrypted credential payloads.
- Remote OxyGen credentials must never be logged or returned to the browser.

## UI Preference and Application Settings Tables

```text
grid_preferences
application_settings
```

- `grid_preferences` stores per-user Kendo managed grid layouts by `grid_key`.
- `application_settings` stores JSON settings by key; currently used for configurable display labels.

## Future Monitoring/Snapshot Tables

Phase 1 still needs persistent collector tables for:

```text
monitor_runs
monitor_events
oxygen_license_snapshots
oxygen_settings_snapshots
oxygen_instance_settings
oxygen_workflow_trigger_snapshots
oxygen_workflow_event_snapshots
oxygen_service_event_snapshots
```

See also:

- [Data Dictionary](data-dictionary.md)
- [Phase 1 Plan](plans/phase-1-oxygen-cms.md)
- [Phase 2 Roadmap](plans/phase-2-oxygen-cms.md)
