# Data Dictionary

This documentation has been migrated to the GitHub Wiki:

- [Data Dictionary](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Data-Dictionary)

## Current schema additions

### Schema version

Current CMS schema version: `0.12`.

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
| `tenant` | `oxygen_instances.tenant_id` via Tenant name | Present only for global users. Uses Tenant name, not GUID. Blank means global/unassigned. Missing Tenant names are created for new instance rows. Existing instance Tenant assignments remain immutable. Tenant-scoped exports omit this column and imports are forced to the user's assigned Tenant. |
| `protocol` | `oxygen_instances.protocol` | `http` or `https`; defaults to `https` when omitted. |
| `host` | `oxygen_instances.host` | Hostname/domain without protocol. |
| `port` | `oxygen_instances.port` | Blank imports as null. |
| `username` | encrypted remote credential username | Defaults to `admin` when omitted. |
| `polling_interval_seconds` | `oxygen_instances.polling_interval_seconds` | Defaults to `300` when omitted. |
| `is_enabled` | `oxygen_instances.is_enabled` | Accepts common truthy values such as `true`, `1`, `yes`, `y`, `on`. |
| `check_license` | `oxygen_instances.check_license` | Accepts common truthy values. When false, polling skips the OxyGen license probe and hides License response details/KPIs for that instance. |
| `archived` | `oxygen_instances.archived` | Accepts common truthy values. Archived servers are hidden from the default instance list but data/history is retained and the server can be unarchived. |
| `metadata` | `oxygen_instances.metadata` | Optional JSON object stored with the instance and shown as a JSON dashboard card. Nonblank CSV import values must be valid JSON. |
| `notes` | `oxygen_instances.notes` | Optional large notes block. May contain HTML, Markdown, RTF, or plain text; dashboard display auto-detects the format. |
| `password` | encrypted remote credential password | Import-only. Always blank on export. Required for creates; blank preserves the current password on updates. |

### Database performance dashboard contract

The Settings > Database dashboard is read-only and does not add CMS tables. Its `/api/system/database-performance` payload is derived from MySQL `information_schema.tables`, `SHOW GLOBAL STATUS`, `SHOW VARIABLES`, and best-effort `performance_schema.events_statements_summary_by_digest` query digests using the configured CMS database connection. Disk used is data + index bytes; free/fragmented bytes are shown separately as allocated-but-not-used table space. `estimatedRows` is approximate because it follows MySQL/InnoDB table statistics semantics. Slow queries use MySQL's `Slow_queries` lifetime server counter and the returned `longQueryTimeSeconds` threshold; clickable query details show normalized statement patterns, not raw parameter values, when `performance_schema` digest collection is available. Buffer-pool hit health is derived from InnoDB read counters when available. Maintenance actions are surfaced in the UI; only Purge Logs is wired to the existing logs endpoint until dedicated backend jobs exist for compress/defrag/backup/restore safeguards.

### Connectivity check history details

`oxygen_instance_check_history.details_json` for `check_type='connectivity'` stores the latest phase details used by Response Details: `dns` (Resolve), `connect`, `ssl`, `authentication`, `license`, `api` (Settings via `/web-api/global/settings`), and `settingsJson` (the raw Settings JSON payload when collected). DNS details may include `address`; connect details include the resolved `host`/`port`. TCP connection failure sets the instance availability to `down` and stores skipped SSL/Auth/License/Settings details rather than reporting an auth error. Authentication succeeds only when `/v2/Auth/Login` returns a 2xx/3xx response that is not a login/forbidden page and includes an OxyGen session cookie; missing/non-session cookies, forbidden pages, and login forms are auth failures. License/Settings/Triggers are skipped after auth failure. Skipped License phases preserve the prior license rollup and do not count as License Errors on the dashboard; License issue counts require the instance to be reachable enough to evaluate License. When `check_license=true`, License runs before Settings; attempted License failures are stored as license `error` and Settings/Triggers are skipped. When `check_license=false`, License is skipped and can be hidden by the UI. `oxygen_instance_status.response_time_ms` is Resolve + Connect + SSL + Auth for collected, non-skipped phases.

`oxygen_instance_status.settings_json` stores the most recent raw `/web-api/global/settings` JSON payload. The Instance Dashboard Settings card extracts non-queue values from `BUS_Auto_Purge`, `OxyGen_Version`, and `ClientDomain`; its Raw JSON count is based on all `Variables[]` entries in the full payload. Queue-oriented flags from `BUS_Trigger_Processing`, `EMM_Delayed_Processing`, `SMS_Delayed_Processing`, and `Hangfire_CheckIn` are displayed on Workflow & Components queue rows instead of in Settings. The Settings dialog shows the full read-only JSON payload, matching the License JSON dialog pattern.


Dashboard issue filters normalize noisy endpoint-specific connectivity errors before display. In particular, labels matching `Connection timed out: <ip>:<port>` are displayed and filtered as `Connecting time out` while raw endpoint-specific details remain in logs/history.

### `application_settings` keys

| Key | Shape | Notes |
| --- | --- | --- |
| `labels` | `{ tenant: string }` | Display label customization. |
| `logRetention` | `{ days: number }` | Log retention setting managed from Settings → General. Default is 90 days. |
