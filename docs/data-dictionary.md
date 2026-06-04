# Data Dictionary

This documentation has been migrated to the GitHub Wiki:

- [Data Dictionary](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Data-Dictionary)

## Current schema additions

### Schema version

Current CMS schema version: `0.08`.

### `application_logs`

Database-backed CMS activity log table used by the Settings → Logs page and background poller diagnostics.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `CHAR(36)` | Primary key UUID. |
| `log_type` | enum-like string | `Audit`, `Service`, `CRUD`, `Connection`, `Security`, `UI`. |
| `severity` | enum-like string | `Critical`, `Error`, `Warning`, `Logging`, `Verbose`. |
| `source` | `VARCHAR(128)` | Origin such as `OxyGen CMS` or `UI`. |
| `user_name` | `VARCHAR(255) NULL` | User email/name when available. Background service logs may be null. |
| `message` | `TEXT` | Human-readable log message. |
| `details_json` | `JSON NULL` | Structured request, status, or service details. |
| `created_at` | `TIMESTAMP` | Insertion timestamp. |

Indexes:

- `idx_application_logs_created_at`
- `idx_application_logs_type`
- `idx_application_logs_severity`
- `idx_application_logs_user_name`

### `application_settings` keys

| Key | Shape | Notes |
| --- | --- | --- |
| `labels` | `{ tenant: string }` | Display label customization. |
| `logRetention` | `{ days: number }` | Log retention setting used by Settings → Logs. Default is 90 days. |
