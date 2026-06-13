# Data Dictionary

This documentation has been migrated to the GitHub Wiki:

- [Data Dictionary](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Data-Dictionary)

## Current schema additions

### Schema version

Current CMS schema version: `0.14`.

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

The Settings > Database dashboard does not add CMS tables; it reads existing setup/schema state and MySQL runtime statistics. Its `/api/system/database-performance` payload is derived from `cms_schema_versions`, setup schema-current metadata, MySQL `information_schema.tables`, `SHOW GLOBAL STATUS`, `SHOW VARIABLES`, and best-effort `performance_schema.events_statements_summary_by_digest` query digests using the configured CMS database connection. Disk used is data + index bytes; free/fragmented bytes are shown separately as allocated-but-not-used table space. `estimatedRows` is approximate because it follows MySQL/InnoDB table statistics semantics. Slow queries use MySQL's `Slow_queries` lifetime server counter and the returned `longQueryTimeSeconds` threshold; `queryDigestStatus` distinguishes available, empty, and unavailable digest collection so the UI does not infer availability from an empty array. Clickable query details show normalized statement patterns, not raw parameter values, when `performance_schema` digest collection is available. Buffer-pool hit health is derived from InnoDB read counters when available. Maintenance actions are surfaced in the UI; Run Retention uses the configured retention window, Purge Logs truncates current activity tables, schema upgrade calls the setup schema endpoint when the target version is newer, and compress/defrag/backup/restore remain guarded until dedicated backend jobs exist.

### Connectivity check history details

`oxygen_instance_check_history.details_json` for `check_type='connectivity'` stores the latest phase details used by Response Details: `dns` (Resolve), `connect`, `ssl`, `authentication`, `license`, `api` (Settings via `/web-api/global/settings`), and `settingsJson` (the raw Settings JSON payload when collected). DNS details may include `address`; connect details include the resolved `host`/`port`. TCP connection failure or TLS handshake closure/reset/timeout sets the instance availability to `down` and stores skipped Auth/License/Settings details rather than reporting an auth error; when the TLS handshake fails before a certificate is received, `oxygen_instance_status.ssl_valid` is stored as `NULL` because certificate validity was not evaluated. Certificate-validation failures that still allow TLS are the only `ssl-error` warnings. Authentication succeeds only when `/v2/Auth/Login` returns a 2xx/3xx response that is not a login/forbidden page and includes an OxyGen session cookie; missing/non-session cookies, forbidden pages, and login forms are auth failures. License/Settings/Triggers are skipped after auth failure. Skipped License phases preserve the prior license rollup and do not count as License Errors on the dashboard; License issue counts require the instance to be reachable enough to evaluate License. When `check_license=true`, License runs before Settings; attempted License failures are stored as license `error` and Settings/Triggers are skipped. When `check_license=false`, License is skipped and can be hidden by the UI. `oxygen_instance_status.response_time_ms` is Resolve + Connect + SSL + Auth for collected, non-skipped phases.

Schema `0.13` adds `idx_oxygen_instance_check_history_instance_started_id_type (instance_id, started_at, id, check_type)` so Instance Dashboard health-detail reads can satisfy `WHERE instance_id = ? AND check_type IN (...) ORDER BY started_at DESC, id DESC LIMIT 50` with a backward index scan instead of a filesort. Schema `0.14` adds `idx_oxygen_instance_check_history_started_at (started_at)` so activity retention can prune old history rows without a full table scan.

`oxygen_instance_status.settings_json` stores the most recent raw `/web-api/global/settings` JSON payload. The Instance Dashboard Settings card extracts non-queue values from `BUS_Auto_Purge`, `OxyGen_Version`, and `ClientDomain`; its Raw JSON count is based on all `Variables[]` entries in the full payload. Queue-oriented flags from `BUS_Trigger_Processing`, `EMM_Delayed_Processing`, `SMS_Delayed_Processing`, and `Hangfire_CheckIn` are displayed on Workflow & Components queue rows instead of in Settings. The Settings dialog shows the full read-only JSON payload, matching the License JSON dialog pattern.


Dashboard issue filters normalize noisy endpoint-specific connectivity errors before display. In particular, labels matching `Connection timed out: <ip>:<port>` are displayed and filtered as `Connecting time out` while raw endpoint-specific details remain in logs/history.


### Planned issue classification catalog

The issue support/notification foundation will use three static/reference tables rather than hard-coded UI-only labels:

| Table | Purpose |
| --- | --- |
| `issue_categories` | Static four-row category set: `Connectivity`, `SSL`, `License`, `Processing Issues`. |
| `issue_severities` | Static five-row severity set: `Critical`, `Error`, `Warning`, `Info`, `Verbose`. |
| `discovered_issue_types` | Static mapping catalog for normalized issue codes/conditions. Each row maps one discovered condition to one category and one severity, stores one or more raw error codes/condition tokens, a normalized display label, description, phase/gating rules, and future notification/support defaults. |

Initial catalog rows should be seeded from the current health-check evidence:

| Issue type | Category | Severity | Source codes/conditions |
| --- | --- | --- | --- |
| DNS resolution failed | Connectivity | Error | `ENOTFOUND`, failed Resolve phase |
| TCP connection refused / port closed | Connectivity | Error | `ECONNREFUSED`, failed Connect phase |
| TCP connection timed out / port filtered | Connectivity | Error | `CONNECT_TIMEOUT`, failed Connect phase |
| TLS handshake failed before certificate evaluation | Connectivity | Error | `ECONNRESET`, `TLS_TIMEOUT`, secure TLS connection not established |
| OxyGen authentication failed: no session cookie | Connectivity | Error | `AUTH_NO_SESSION_COOKIE` |
| OxyGen authentication endpoint HTTP error | Connectivity | Error | `AUTH_HTTP_ERROR` |
| OxyGen authentication timed out | Connectivity | Error | login/auth request timeout |
| OxyGen Settings/API unavailable after authentication | Connectivity | Error | `SETTINGS_HTTP_ERROR` |
| SSL certificate expired | SSL | Warning | `CERT_HAS_EXPIRED` after certificate evaluation |
| SSL certificate issuer/chain not trusted | SSL | Warning | `UNABLE_TO_VERIFY_LEAF_SIGNATURE` after certificate evaluation |
| OxyGen license expired | License | Error | `LICENSE_STATUS_ERROR` with expired license |
| OxyGen license missing/blank/invalid | License | Error | `LICENSE_STATUS_ERROR` with missing, blank, or invalid license |
| OxyGen license check failed | License | Error | license probe timeout/request failure after successful reachability/auth |

Gating rule: Resolve/Connect/TLS/auth blockers are Connectivity Errors and suppress downstream License/Settings issue assignment for that check. SSL issues are warnings only when HTTPS reaches certificate evaluation. License issues require `check_license=true` and sufficient reachability/authentication to execute the License probe.

### `application_settings` keys

| Key | Shape | Notes |
| --- | --- | --- |
| `labels` | `{ tenant: string }` | Display label customization. |
| `logRetention` | `{ days: number }` | Activity retention setting managed from Settings → General. Default is 90 days. It prunes `application_logs.created_at` and `oxygen_instance_check_history.started_at`; Settings → Database can trigger the same retention cleanup immediately via `POST /api/logs/retention/run`. |

### `GET /api/system/version`

The Settings → General update panel is backed by a read-only SystemAdmin endpoint. It does not add CMS tables or store GitHub state. The route derives current version metadata from the package/build environment and performs a non-blocking GitHub latest-release check with tag fallback.

| Field group | Description |
| --- | --- |
| `current.version` / `current.commit` / `current.buildDate` | Currently running CMS package version plus optional build commit/date supplied by deployment metadata. |
| `current.repository` / `current.sourceUrl` / `current.updateChannel` | GitHub repository, source URL, and update channel used for update checks. |
| `update.checkedAt` / `update.source` | Timestamp and source of the latest check: `github-release`, `github-tag`, `github-branch`, or `unavailable`. |
| `update.available` / `update.latestVersion` / `update.releaseUrl` | Whether GitHub reports a newer semantic version, plus latest version and release/tag URL when available. |
| `update.error` | Non-secret failure detail when GitHub is unreachable or returns unusable metadata. Update-check failures do not block CMS startup or Settings rendering. |
