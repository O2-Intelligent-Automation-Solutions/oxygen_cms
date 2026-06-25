# Data Dictionary

This documentation has been migrated to the GitHub Wiki:

- [Data Dictionary](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Data-Dictionary)

## Current schema additions

### Schema version

Current CMS schema version: `0.19`.

### `role_permissions`

Durable role-to-permission assignments introduced in schema `0.16`.

| Column | Type | Notes |
| --- | --- | --- |
| `role_id` | `CHAR(36)` | FK to `roles.id`; cascades on role delete. |
| `permission_key` | `VARCHAR(128)` | Stable permission catalog key validated by application code. |
| `created_at` | `TIMESTAMP` | Assignment creation timestamp. |

Primary key: `(role_id, permission_key)`. Index: `idx_role_permissions_permission_key`.

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
- `idx_application_logs_created_id`
- `idx_application_logs_type_severity`
- `idx_application_logs_severity_created_id`
- `idx_application_logs_source`
- `idx_application_logs_user_name`
- `idx_application_logs_entity_guid`
- `idx_application_logs_entity_created_id`
- `idx_application_logs_tenant_id`
- `idx_application_logs_tenant_created_id`
- `idx_application_logs_tenant_entity`

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

Schema `0.13` adds `idx_oxygen_instance_check_history_instance_started_id_type (instance_id, started_at, id, check_type)` so Instance Dashboard health-detail reads can satisfy `WHERE instance_id = ? AND check_type IN (...) ORDER BY started_at DESC, id DESC LIMIT 50` with a backward index scan instead of a filesort. Schema `0.14` adds `idx_oxygen_instance_check_history_started_at (started_at)` so activity retention can prune old history rows without a full table scan. Schema `0.17` adds `idx_oxygen_instance_check_history_type_instance_id (check_type, instance_id, id)` so Settings → Issue Types can read latest connectivity/license evidence with indexed per-instance `MAX(id)` probes instead of grouping the full activity-history table.

`oxygen_instance_status.settings_json` stores the most recent raw `/web-api/global/settings` JSON payload. The Instance Dashboard Settings card extracts non-queue values from `BUS_Auto_Purge`, `OxyGen_Version`, and `ClientDomain`; its Raw JSON count is based on all `Variables[]` entries in the full payload. Queue-oriented flags from `BUS_Trigger_Processing`, `EMM_Delayed_Processing`, `SMS_Delayed_Processing`, and `Hangfire_CheckIn` are displayed on Workflow & Components queue rows instead of in Settings. The Settings dialog shows the full read-only JSON payload, matching the License JSON dialog pattern.


Dashboard issue filters normalize noisy endpoint-specific connectivity errors before display. In particular, labels matching `Connection timed out: <ip>:<port>` are displayed and filtered as `Connecting time out` while raw endpoint-specific details remain in logs/history.


### Issue classification catalog

Schema version `0.15` adds static/reference tables for issue support, notification mapping, and the read-only Settings → Issue Types grid. The catalog is database-backed so normalized issue mapping is not duplicated only in UI conditionals.

| Table | Purpose |
| --- | --- |
| `issue_categories` | Static four-row category set: `Connectivity`, `SSL`, `License`, `Processing`. |
| `issue_severities` | Static five-row severity set: `Critical`, `Error`, `Warning`, `Logging`, `Verbose`; the operational rank is stored in `severity_rank`. |
| `discovered_issue_types` | Static mapping catalog for normalized issue codes/conditions. Each row maps one condition to one category and one severity, stores the matching kind/value used by the current reader, and remains stable for future notification/support defaults. |

Initial seeded issue type rows cover DNS failures, TCP refused/timeout/reset conditions, TLS connection failures before certificate evaluation, OxyGen authentication failures, HTTP 500/502 remote errors, generic availability down, SSL certificate expired/untrusted/invalid warnings, license expired/invalid/missing/warning conditions, and processing warning/error component states.

`GET /api/system/issue-types` returns a SystemAdmin-only read-only snapshot with `categories`, `severities`, `issueTypes`, and per-issue `affectedInstances`. The affected-instance list is computed from current enabled/non-archived instance status, license status, processing component statuses, SSL flags, and last-error evidence. Settings → Issue Types shows the mapping in a managed grid; the row dialog lists affected instances and links through to each instance dashboard.

Gating rule: Resolve/Connect/TLS/auth blockers are Connectivity Errors and suppress downstream License/Settings issue assignment for that check. SSL issues are warnings when HTTPS reaches certificate evaluation, including expired certificates, invalid/untrusted certificates, and otherwise valid certificates inside the global Expiring Soon threshold. License issues require `check_license=true` and sufficient reachability/authentication to execute the License probe; expired licenses and otherwise valid licenses inside the global Expiring Soon threshold are real License issue warnings/errors for future ticket/notification routing.

### `application_settings` keys

| Key | Shape | Notes |
| --- | --- | --- |
| `labels` | `{ tenant: string }` | Display label customization. |
| `logRetention` | `{ days: number }` | Activity retention setting managed from Settings → General. Default is 90 days. It prunes `application_logs.created_at` and `oxygen_instance_check_history.started_at`; Settings → Database can trigger the same retention cleanup immediately via `POST /api/logs/retention/run`. |
| `sslCertificateWarning` | `{ daysBeforeExpiration: number }` | Global SSL threshold managed from Settings → General. Default is 30 days. Expired certificates display as `Expired` first; otherwise valid HTTPS certificates with expiration within this threshold display as `Expiring Soon` and register as `SSL_EXPIRING_SOON`. |
| `licenseExpirationWarning` | `{ daysBeforeExpiration: number }` | Global License threshold managed from Settings → General. Default is 30 days. Expired licenses display as `Expired` first; otherwise valid OxyGen licenses with `license_json.ExpiryDate` inside this threshold display as `Expiring Soon` and register as `LICENSE_EXPIRING_SOON`. |
| `queueSchedules` | `{ jobs: [{ key, enabled, everySeconds, schedule }] }` | Recurring maintenance scheduler settings managed from Settings → General → Queue. Keys are `database-maintenance:purge-logs`, `database-maintenance:prune-check-history`, `database-maintenance:analyze-tables`, `database-maintenance:optimize-tables`, `system-maintenance:check-application-updates`, and `system-maintenance:prune-queue-history`. Analyze/Optimize are disabled by default but can be queued via Run Now. The UI displays whole-day cadence with `Every [n] day(s)`. The API normalizes current schedules as `schedule: { type: 'interval', everySeconds }` while preserving legacy `everySeconds` compatibility and one-day minimums; CRON/anchored schedules are designed but not accepted until the next runtime/UI slice. Disabled schedules grey/disable cadence + Save while leaving Run Now independent from recurring state. Saving changes immediately reconciles BullMQ schedulers. |


### `GET /api/system/queues`

Phase 1.5 queue orchestration status is exposed as a read-only SystemAdmin endpoint. It does not add CMS tables in the 8A foundation slice. Redis/BullMQ owns queue execution state when enabled; MySQL remains the source of truth for domain state, instance status/history, logs, and future user-facing job summaries.

| Field group | Description |
| --- | --- |
| `enabled` / `mode` | Indicates whether BullMQ mode is enabled or the MVP in-process poller remains the active execution path. |
| `redis` | Safe connectivity/configuration summary: configured/connected booleans, host/port, and non-secret error text. |
| `bullBoard` | Safe Bull Board mount metadata: whether the optional board is enabled and its configured path. The board remains protected by CMS auth/RBAC; Settings uses native queue status/latest-jobs as the primary UI because browser navigation cannot carry bearer auth headers to Bull Board. |
| `queues[]` | Named queue counts for `instance-checks`, `database-maintenance`, and `system-maintenance`: waiting/ready, active/running, delayed/scheduled, retained failed-job history, and completed. The failed count is retained BullMQ history; active backlog is represented by waiting/active/delayed. |

Bull Board can be mounted at the configured admin path when enabled, but it is protected by CMS authentication and the same SystemAdmin queue-management permission.

### `GET /api/system/queue-jobs` and queue actions

`GET /api/system/queue-jobs` returns sanitized queue job summaries for native CMS visibility. Rows include queue/name/state, safe metadata (`task`, `source`, `instanceId`, `requestedBy`), timestamps, retained failure summary, scheduler cadence/next-run metadata where available, and enriched Tenant/Instance context for instance-check jobs. Operations exposes Run Now plus Pause/Resume actions for recurring maintenance and instance scheduler rows. Run Now enqueues a one-off job and does not change the recurring enabled/paused state.

`POST /api/system/queue-jobs/{key}/pause` and `/resume` persist recurring maintenance enabled state through `application_settings.queueSchedules`; instance keys use `instance-check:{instanceId}` and map to the instance enabled flag. `POST /api/system/queue-jobs/{key}/run-now` queues an immediate one-off job for maintenance or instance schedulers.

### `GET /api/system/version`

The Settings → General update panel is backed by a read-only SystemAdmin endpoint. It does not add CMS tables or store GitHub state. The route derives current version metadata from the package/build environment and performs a non-blocking GitHub latest-release check with tag fallback.

| Field group | Description |
| --- | --- |
| `current.version` / `current.commit` / `current.buildDate` | Currently running CMS package version plus optional build commit/date supplied by deployment metadata. |
| `current.repository` / `current.sourceUrl` / `current.updateChannel` | GitHub repository, source URL, and update channel used for update checks. |
| `update.checkedAt` / `update.source` | Timestamp and source of the latest check: `github-release`, `github-tag`, `github-branch`, or `unavailable`. |
| `update.available` / `update.latestVersion` / `update.releaseUrl` | Whether GitHub reports a newer semantic version, plus latest version and release/tag URL when available. |
| `update.error` | Non-secret failure detail when GitHub is unreachable or returns unusable metadata. Update-check failures do not block CMS startup or Settings rendering. |

### `GET /api/system/update-status`

Milestone 7D update orchestration status is exposed as a SystemAdmin endpoint for the non-technical update flow. Guarded execution endpoints are present but disabled by default; self-hosted deployments must explicitly set `CMS_UPDATE_RUNNER_ENABLED=true` and related runner configuration before the API will spawn the host update script.

| Field group | Description |
| --- | --- |
| `runner.enabled` / `runner.state` / `runner.inProgress` / `runner.canRun` | Current guarded runner state. Disabled deployments report `blocked`, `false`, and `false`; enabled deployments report `idle`/`running` and reject overlapping runs. |
| `runner.command` / `runner.dryRunCommand` / `runner.requiresConfirmation` / `runner.confirmationVariable` | Operator command contract and confirmation env variable used for real updates. |
| `runner.currentRef` / `runner.targetRef` | Current/target refs when configured or selected for a run. |
| `steps[]` | Ordered update phases: dry run, backup, checkout, build, restart, and schema migration, including state/timestamps/messages. |
| `lastRun` / `lastError` | Last in-memory runner summary/error for dry-run or confirmed execution requests. |

### `POST /api/system/update-runner/dry-run` and `POST /api/system/update-runner/update`

SystemAdmin guarded execution endpoints for the update flow. Both are disabled unless the deployment opts in with `CMS_UPDATE_RUNNER_ENABLED=true`. Dry runs execute the configured host script with `update --dry-run`; real updates require explicit confirmation (`confirmed=true` or `confirmation=YES`) and set the configured confirmation env variable before running `update`.
