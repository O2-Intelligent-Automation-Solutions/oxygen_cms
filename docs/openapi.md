# OpenAPI Spec

The canonical OpenAPI 3.1 specification is maintained in this repository:

```text
docs/openapi.yaml
```

Current API spec version: `0.8.0`.
Current CMS schema version: `0.17`.

The canonical rich contract summary is maintained in the GitHub Wiki. This repo pointer tracks the current schema/security checkpoint: protected routes use bearer authentication plus explicit permission and Tenant/global/instance scope checks; auth profiles expose effective permission keys; role create/update accepts explicit `permissionKeys` assignments.

This update documents:

- instance CSV import/export endpoints:
  - `GET /api/instances/export.csv` exports visible instances as CSV. Global users receive a `tenant` column populated by Tenant name; tenant-scoped users receive only their Tenant's instances and the `tenant` column is omitted. The export includes `check_license`, `archived`, `metadata`, and `notes`; the `password` column is always blank.
  - `POST /api/instances/import` imports CSV text with `{ csv, dryRun? }`, upserting by `instance_guid` / instance `id`. Global users assign Tenants by Tenant name, leave `tenant` blank for global instances, and create missing Tenant names automatically for new instance rows. Tenant-scoped users import only into their assigned Tenant. Column order is header-driven, and trailing blank spreadsheet columns are ignored. `metadata` must be valid JSON when provided; notes can be HTML/Markdown/RTF/text. Blank update passwords preserve stored credentials; create rows require a password.
- `GET /api/instances?includeArchived=true` archive visibility for retained servers
- dashboard `poller` status payloads
- `GET /api/system/version` returns SystemAdmin-only CMS build/version metadata and non-blocking GitHub update availability for Settings > General. If deployment build stamps are absent, the route falls back to the local Git commit and commit date so development/review builds do not show only static package metadata. If no GitHub Release or tag exists, the route falls back to the repository default branch commit. If GitHub is unavailable, the route still returns current metadata with `update.source=unavailable` and a non-secret error.
- `GET /api/system/update-status` returns the Milestone 7D update orchestration status contract: guarded command availability, confirmation requirement, ordered dry-run/backup/checkout/build/restart/schema steps, and in-memory runner history/error details.
- `POST /api/system/update-runner/dry-run` and `POST /api/system/update-runner/update` start guarded host-side update runner requests when explicitly enabled by deployment configuration; confirmed updates require a confirmation acknowledgement.
- `GET /api/system/queues` returns the Phase 1.5/Milestone 8A queue orchestration status contract for SystemAdmins: disabled/BullMQ mode, Redis configuration/connectivity, Bull Board enabled/path metadata, and waiting/active/delayed/failed/completed counts for `instance-checks`, `database-maintenance`, and `system-maintenance`. Optional Bull Board mounts at the configured admin path behind the same CMS auth/RBAC guard when enabled; Settings uses native queue visibility as the primary review UI.
- `GET /api/system/queue-jobs` returns a Phase 1.5 sanitized native queue visibility contract for SystemAdmins: latest jobs from the named queues with queue/name/state/attempt/timestamp/failure summary and safe public metadata (`task`, `source`, `instanceId`, `requestedBy`) only. Raw BullMQ payloads and secrets are not returned.
- `GET /api/system/issue-types` returns a SystemAdmin-only read-only issue classification catalog for Settings > Issue Types, including the static categories, severities, discovered issue type mappings, affected instance counts, and click-through instance evidence for each matched condition.
- `GET /api/system/database-performance` returns a SystemAdmin-only CMS database performance snapshot for the Settings > Database dashboard, including configured/connected status, schema current/target version and upgrade availability, explicit query-digest availability status, aggregate table count/estimated rows/storage bytes, selected MySQL server counters, the `long_query_time` threshold for the `Slow_queries` lifetime counter, InnoDB buffer pool read-hit percentage when available, the largest tables by data plus index size, and normalized `performance_schema` query digests ordered by total execution time when available.
- connectivity test payloads include explicit `dns`, `connect`, `ssl`, `authentication`, `license`, and `api`/Settings phase details plus `settingsJson` when the global settings probe returns JSON. `api` is the `/web-api/global/settings` probe and runs after License when `check_license` is enabled. `responseTimeMs` is the dashboard response metric computed from Resolve + Connect + SSL + Auth phases; TCP connection failures and TLS handshake closures/resets/timeouts return `unreachable`/`down` before Auth/License/Settings probes; only certificate-validation failures that still allow TLS remain `ssl-error` warnings; Auth requires `/v2/Auth/Login` to return a 2xx/3xx response that is not a login/forbidden page and includes an OxyGen session cookie; missing/non-session cookies, forbidden pages, and login forms are `auth-error` and skip downstream probes; skipped License phases preserve the prior license rollup and do not count as License Errors; failed required License probes are stored as License errors with Settings/Triggers skipped. Instance dashboard health details expose the persisted `settingsJson` payload; the Settings card extracts non-queue BUS auto-purge, OxyGen version, and client-domain values, Workflow & Components renders BUS/EMM/SMS/Hangfire queue indicators, dashboard issue filters normalize endpoint-specific timeout labels as `Connecting time out`, and Settings opens a full JSON dialog.
- background poller system controls:
  - `GET /api/system/poller`
  - `POST /api/system/poller/pause`
  - `POST /api/system/poller/resume`
  - `POST /api/system/poller/run-now`
- persisted application logs:
  - `GET /api/logs` lists persisted Audit, Service, CRUD, Connection, Security, and UI logs after enforcing the configured retention window across application logs and instance check history. CRUD is reserved for user-initiated entity create/update/delete operations; settings/grid preference saves log as UI. `type` and `severity` accept one or more values via repeated or comma-separated query parameters, `entityGuid` filters logs for a specific instance/entity, and `tenantId` filters tenant-associated logs. Tenant-scoped users are automatically limited to their tenant. API activity details include friendly `message`, `apiCall` with `{Entity_Guid}` route tokens, `responseCode`, nullable `entityGuid`, nullable `tenantId`, and failed response error text when available. Manual connectivity checks log Warning/Error based on the connectivity result even when the test endpoint itself returns HTTP 200. The route returns a bounded page total for refresh performance instead of running a full activity-table count on every poll.
  - `POST /api/logs/retention/run` runs the configured activity retention window immediately, deletes expired `application_logs` and `oxygen_instance_check_history` rows, refreshes table statistics when rows are removed, and returns `{ retention, deleted, tables }` with per-table row counts.
  - `POST /api/logs/retention/queue` enqueues the same retention purge as a credential-free `database-maintenance` `purge-logs` job when BullMQ/database maintenance queueing is enabled; returns `202` with `{ queued, queue, jobId, task }` or `400` when queueing is disabled.
  - `DELETE /api/logs` truncates current CMS activity tables (`application_logs` and `oxygen_instance_check_history`), refreshes table statistics, and returns `{ deleted, tables }` with per-table row counts; this endpoint is excluded from automatic application log capture so clearing activity does not recreate a log row.
- activity retention settings:
  - `GET /api/app-settings/log-retention`
  - `PUT /api/app-settings/log-retention`

It is also published in the GitHub Wiki:

- [OpenAPI Spec](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/OpenAPI-Spec)
