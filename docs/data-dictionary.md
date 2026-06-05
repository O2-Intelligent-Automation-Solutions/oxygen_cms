# Data Dictionary

This documentation has been migrated to the GitHub Wiki:

- [Data Dictionary](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Data-Dictionary)

## Current schema additions

### Schema version

Current CMS schema version: `0.10`.

### `application_logs`

Database-backed CMS activity log table used by the Settings → Logs page and background poller diagnostics.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `CHAR(36)` | Primary key UUID. |
| `log_type` | enum-like string | `Audit`, `Service`, `CRUD`, `Connection`, `Security`, `UI`. |
| `severity` | enum-like string | `Critical`, `Error`, `Warning`, `Logging`, `Verbose`. |
| `source` | `VARCHAR(128)` | Origin such as the authenticated user email, `OxyGen CMS`, or `UI`. |
| `user_name` | `VARCHAR(255) NULL` | User email/name when available. Background service logs may be null. |
| `entity_guid` | `CHAR(36) NULL` | Optional entity GUID associated with the row. Instance checks populate this with the OxyGen instance GUID so logs can be filtered from the instance dashboard. |
| `tenant_id` | `CHAR(36) NULL` | Tenant association for tenant-tied entities. Tenant-scoped users only see logs for their tenant; SystemAdmin can query all/global rows. |
| `message` | `TEXT` | Human-readable log message with troubleshooting detail for Critical/Error/Warning rows. |
| `details_json` | `JSON NULL` | Structured context. User API activity uses `apiCall`, `responseCode`, `entityGuid`, and `tenantId`; legacy compatibility may also include `method`, `url`, and `statusCode`. |
| `created_at` | `TIMESTAMP` | Insertion timestamp. |

Indexes:

- `idx_application_logs_created_at`
- `idx_application_logs_type`
- `idx_application_logs_severity`
- `idx_application_logs_user_name`
- `idx_application_logs_entity_guid`
- `idx_application_logs_tenant_id`

### Instance CSV import/export contract

Instance CSV import/export is an API/UI contract; it does not add a new table.

| CSV column | Maps to | Notes |
| --- | --- | --- |
| `instance_guid` | `oxygen_instances.id` | Upsert key. Blank creates a new GUID; unknown nonblank GUID creates an instance preserving that GUID. |
| `name` | `oxygen_instances.name` | Required. |
| `description` | `oxygen_instances.description` | Blank imports as null. |
| `tenant` | `oxygen_instances.tenant_id` via Tenant name | Present only for global users. Uses Tenant name, not GUID. Blank means global/unassigned. Tenant-scoped exports omit this column and imports are forced to the user's assigned Tenant. |
| `protocol` | `oxygen_instances.protocol` | `http` or `https`; defaults to `https` when omitted. |
| `host` | `oxygen_instances.host` | Hostname/domain without protocol. |
| `port` | `oxygen_instances.port` | Blank imports as null. |
| `username` | encrypted remote credential username | Defaults to `admin` when omitted. |
| `polling_interval_seconds` | `oxygen_instances.polling_interval_seconds` | Defaults to `300` when omitted. |
| `is_enabled` | `oxygen_instances.is_enabled` | Accepts common truthy values such as `true`, `1`, `yes`, `y`, `on`. |
| `check_license` | `oxygen_instances.check_license` | Accepts common truthy values. When false, polling skips the OxyGen license/settings API probe. |
| `archived` | `oxygen_instances.archived` | Accepts common truthy values. Archived servers are hidden from the default instance list but data/history is retained and the server can be unarchived. |
| `metadata` | `oxygen_instances.metadata` | Optional JSON object stored with the instance and shown as a JSON dashboard card. Nonblank CSV import values must be valid JSON. |
| `notes` | `oxygen_instances.notes` | Optional large notes block. May contain HTML, Markdown, RTF, or plain text; dashboard display auto-detects the format. |
| `password` | encrypted remote credential password | Import-only. Always blank on export. Required for creates; blank preserves the current password on updates. |

### `application_settings` keys

| Key | Shape | Notes |
| --- | --- | --- |
| `labels` | `{ tenant: string }` | Display label customization. |
| `logRetention` | `{ days: number }` | Log retention setting managed from Settings → General. Default is 90 days. |
