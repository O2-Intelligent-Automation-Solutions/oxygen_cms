# OxyGen CMS Data Dictionary

Current schema version: `0.07`.

The runtime migration registry is `apps/api/src/db/migrations/index.ts`. The canonical current schema snapshot is `apps/api/src/db/migrations/current-schema-0.07.sql`.

## Naming Conventions

- UUID primary keys use `CHAR(36)`.
- Timestamps are MySQL `TIMESTAMP` values in UTC as provided by the database/runtime.
- `tenant_id = NULL` means global scope.
- JSON columns store structured snapshots/preferences/settings.
- Remote OxyGen secrets must never be returned to the browser.

## Core Schema Tables

### `cms_schema_versions`

Tracks applied schema migrations.

| Column | Type | Required | Description |
| --- | --- | --- | --- |
| `version` | `VARCHAR(32)` | Yes, PK | Applied migration version, stored as a string. |
| `name` | `VARCHAR(255)` | Yes | Human-readable migration name. |
| `checksum` | `VARCHAR(128)` | Yes | Migration checksum from registry. |
| `applied_at` | `TIMESTAMP` | Yes | Apply timestamp. |

### `tenants`

Tenant/customer boundary for scoped CMS records. The display label can be changed in Settings → General → Labels; the data model remains `tenant`.

| Column | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `CHAR(36)` | Yes, PK | Tenant ID. |
| `name` | `VARCHAR(255)` | Yes, unique | Tenant name. |
| `description` | `TEXT` | No | Tenant description. |
| `created_at` | `TIMESTAMP` | Yes | Creation timestamp. |
| `updated_at` | `TIMESTAMP` | Yes | Last update timestamp. |

### `roles`

Permission profiles assigned to users.

| Column | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `CHAR(36)` | Yes, PK | Role ID. |
| `name` | `VARCHAR(128)` | Yes | Role name. |
| `description` | `TEXT` | No | Role description. |
| `tenant_id` | `CHAR(36)` | No | Tenant scope; null means global. |
| `protected` | `TINYINT(1)` | Yes | Protected roles cannot be deleted. |
| `created_at` | `TIMESTAMP` | Yes | Creation timestamp. |
| `updated_at` | `TIMESTAMP` | Yes | Last update timestamp. |

### `user_groups`

User group/folder membership and group-level instance access.

| Column | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `CHAR(36)` | Yes, PK | Group ID. |
| `name` | `VARCHAR(255)` | Yes | Group name. |
| `description` | `TEXT` | No | Group description. |
| `tenant_id` | `CHAR(36)` | No | Tenant scope; null means global. |
| `instance_access_mode` | `ENUM('none','all','specific')` | Yes | Group instance access behavior. |
| `created_at` | `TIMESTAMP` | Yes | Creation timestamp. |
| `updated_at` | `TIMESTAMP` | Yes | Last update timestamp. |

### `users`

Local CMS users.

| Column | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `CHAR(36)` | Yes, PK | User ID. |
| `email` | `VARCHAR(320)` | Yes, unique | Sign-in email. |
| `display_name` | `VARCHAR(255)` | Yes | Display name. |
| `password_hash` | `TEXT` | Yes | Password hash. Never expose. |
| `password_salt` | `VARCHAR(64)` | Yes | Per-user password salt. Never expose. |
| `tenant_id` | `CHAR(36)` | No | Tenant scope; null means global. |
| `instance_access_mode` | `ENUM('inherit','none','all','specific')` | Yes | User direct/inherited instance access behavior. |
| `is_active` | `TINYINT(1)` | Yes | Active flag. |
| `created_at` | `TIMESTAMP` | Yes | Creation timestamp. |
| `updated_at` | `TIMESTAMP` | Yes | Last update timestamp. |

### Assignment Tables

| Table | Purpose |
| --- | --- |
| `user_role_assignments` | Many-to-many user/role assignments. |
| `user_group_assignments` | Many-to-many user/group assignments. |
| `user_instance_access` | Direct user-to-instance grants when mode is `specific`. |
| `user_group_instance_access` | Group-to-instance grants when mode is `specific`. |

### `sessions`

Bearer-token sessions.

| Column | Type | Required | Description |
| --- | --- | --- | --- |
| `token` | `VARCHAR(128)` | Yes, PK | Session token. Never log. |
| `user_id` | `CHAR(36)` | Yes | Session user. |
| `created_at` | `TIMESTAMP` | Yes | Creation timestamp. |
| `expires_at` | `TIMESTAMP` | No | Expiration timestamp. |

## Instance and Monitoring Tables

### `oxygen_instances`

Enrolled remote OxyGen deployment configuration.

| Column | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `CHAR(36)` | Yes, PK | Instance ID. |
| `name` | `VARCHAR(255)` | Yes, unique | Instance display name. |
| `description` | `TEXT` | No | Instance description. |
| `tenant_id` | `CHAR(36)` | No | Tenant scope. Immutable after creation. |
| `protocol` | `ENUM('http','https')` | Yes | Connection protocol. Defaults to `https`. |
| `host` | `VARCHAR(255)` | Yes | Hostname/domain without protocol. |
| `port` | `INT` | No | Effective port. UI/API default to 443 for HTTPS and 80 for HTTP. |
| `hostname` | `VARCHAR(255)` | Yes | Normalized host/port value used by earlier schema. |
| `base_url` | `VARCHAR(1024)` | Yes | Normalized base URL. |
| `launch_url` | `VARCHAR(1200)` | Yes | Browser launch URL. |
| `api_base_url` | `VARCHAR(1200)` | Yes | API base URL for collectors. |
| `username` | `VARCHAR(255)` | Yes | Remote OxyGen username. Defaults to `admin`. |
| `password_secret` | `TEXT` | Yes | Remote OxyGen password storage field. Must be encrypted in next milestone. |
| `polling_interval_seconds` | `INT` | Yes | Per-instance polling interval. |
| `is_enabled` | `TINYINT(1)` | Yes | Enables scheduled checks. |
| `status` | `ENUM(...)` | Yes | Legacy/high-level availability status. |
| `last_checked_at` | `TIMESTAMP` | No | Last check timestamp. |
| `last_error` | `TEXT` | No | Last check error summary. |
| `created_at` | `TIMESTAMP` | Yes | Creation timestamp. |
| `updated_at` | `TIMESTAMP` | Yes | Last update timestamp. |

### `oxygen_instance_status`

Latest rollup for each enrolled instance.

| Column group | Description |
| --- | --- |
| Availability | `availability_status`, `last_checked_at`, success/failure timestamps, uptime percentages, response time. |
| SSL | `ssl_valid`, `ssl_expires_at`. |
| Processing | `processing_status`, `emm_queue_status`, `sms_status`, `hangfire_status`. |
| License/settings/workflow | `license_key`, `license_status`, `license_json`, `settings_json`, `workflow_summary_json`. |
| Errors | `last_error`. |

### `oxygen_instance_check_history`

Append-only check history for connectivity, SSL, auth, license, settings, workflow, and processing checks.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | History row ID. |
| `instance_id` | `CHAR(36)` | Checked instance. |
| `check_type` | `ENUM(...)` | Check domain. |
| `status` | `ENUM(...)` | Check result. |
| `started_at` / `finished_at` | `TIMESTAMP` | Check timing. |
| `duration_ms` | `INT` | Duration in milliseconds. |
| `http_status_code` | `INT` | HTTP result, if any. |
| `error_code` / `error_message` | text | Normalized error details. |
| `details_json` | `JSON` | Structured check details. |

## UI and Settings Tables

### `grid_preferences`

Per-user/per-grid Kendo grid layout preferences.

| Column | Type | Description |
| --- | --- | --- |
| `user_id` | `CHAR(36)` | Owner user. |
| `grid_key` | `VARCHAR(128)` | Logical grid key. |
| `columns_json` | `JSON` | Column order/visibility/width. |
| `sort_json` | `JSON` | Sort descriptors. |
| `group_json` | `JSON` | Group descriptors. |
| `filter_json` | `JSON` | Filter descriptor. |
| `filters_visible` | `TINYINT(1)` | Whether grid filter UI is visible. |

### `application_settings`

Global JSON settings by key.

| Column | Type | Description |
| --- | --- | --- |
| `setting_key` | `VARCHAR(128)` | Setting key. Current key: `labels`. |
| `value_json` | `JSON` | Setting payload. Current labels payload: `{ "tenant": "Tenant" }`. |
| `created_at` / `updated_at` | `TIMESTAMP` | Audit timestamps. |
