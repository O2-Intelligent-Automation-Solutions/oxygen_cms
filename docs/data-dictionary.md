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

### `application_settings` keys

| Key | Shape | Notes |
| --- | --- | --- |
| `labels` | `{ tenant: string }` | Display label customization. |
| `logRetention` | `{ days: number }` | Log retention setting managed from Settings → General. Default is 90 days. |
