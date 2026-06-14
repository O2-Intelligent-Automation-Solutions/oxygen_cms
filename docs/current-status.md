# Current Status

This documentation has been migrated to the GitHub Wiki:

- [Current Status](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Current-Status)
- [RBAC Security Refinement Plan](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/RBAC-Security-Refinement-Plan)

## Local repo status summary

### RBAC refinement implementation checkpoint

- Schema target advanced to `0.16` with durable `role_permissions` assignments.
- Auth profiles return effective permission keys; role create/update persists permission selections.
- Current protected API routes use permission + Tenant/global/instance scope checks.
- TenantAdmin users inherit all same-Tenant instance visibility by default when direct instance access is `inherit`; explicit `none` still denies instance visibility, and cross-Tenant/global instances remain hidden.
- Desktop/mobile UI navigation/actions/forms are capability-gated from auth permissions.
- Role editors use a condensed searchable permission grid grouped by type, with `Checkbox | Name | Description | Code` columns, group select-all counts, and an Apply Preset dropdown; user/group instance access uses the searchable pill/tag selector for specific instance assignments.
- Validation: `npm run typecheck --workspace @oxygen-cms/api`, `npm run typecheck --workspace @oxygen-cms/web`, targeted RBAC/app-log/instance suites, and full API suite are green. Remaining closeout: live MySQL migration validation, browser/UAT review, dependency-audit remediation/acceptance.

Current CMS schema version: `0.16`.

Recent dashboard/service-log work adds:

- Dashboard Service card backed by the shared background poller state, including pause/resume and Run Now controls.
- Dashboard section ordering:
  1. Header / tenant filter / refresh
  2. Tenants / Users / User Groups / Roles
  3. Service
  4. Instances / Issues / Connectivity / SSL / License / Processing Issues
  5. Instance Board
- SystemAdmin poller controls for pause/resume plus operator-initiated Run Now execution.
- Database-backed application logs with Audit, Service, CRUD, Connection, Security, and UI log types. CRUD is reserved for user-initiated entity mutations; grid preferences and application settings log as UI activity and managed-grid preference changes are persisted once when the user leaves the page.
- Instance dashboards include a View Logs action that opens Settings → Logs filtered by that instance GUID using `/Logs/Entity/{id}`.
- Settings → Logs page uses the same full-height managed-grid layout as the other admin grids, with a Tenant column, grid-filterable User Name/Entity GUID columns, select-sized dropdown checkbox filters for Type and Severity, manual Refresh, Pause/Resume Refresh, and SystemAdmin-only Clear Logs controls in the grid toolbar; Critical, Error, Warning, and Logging severities are selected by default while Verbose is opt-in. Activity retention moved to Settings → General and is enforced during log reads plus a background retention sweep for both application logs and instance check history.
- Routine successful background poller completion summaries are stored as Verbose service logs. Each poller instance check also writes a Verbose Connection row with `entityGuid` and `tenantId`; new instance issues write one Error/Warning row, repeated identical issues are suppressed, and recovery writes one Logging row that the instance is nominal.
- Best-effort poller log persistence so a missing/unavailable log table cannot crash the API service.
- Dashboard KPI styling uses the OxyGen display font for all KPI numerals, with the administrative KPI group (Tenants, Users, User Groups, Roles) restored to aqua branding while health KPIs retain green/yellow/red semantic severity colors.
- Dashboard health KPI cards are clickable issue filters, the Issues dropdown includes normalized issue labels emitted by the API/UI, endpoint-specific `Connection timed out: <ip>:<port>` labels are consolidated under `Connecting time out`, status messages open instance logs, and `check_license=false` instances are excluded from License issue counts/cards. License issue counts require the instance to be reachable enough to evaluate License; skipped License phases caused by connection/auth blockers do not count as License Errors.
- Settings includes a read-only Issue Types tab backed by `GET /api/system/issue-types`. Schema `0.15` seeds four issue categories, five severities, and normalized discovered issue type mappings; the grid shows category/severity/code/condition/affected counts, and row dialogs list affected instances with dashboard click-through.
- Settings includes a scrollable Database tab backed by `GET /api/system/database-performance`. KPI cards are clickable and open desktop modal/mobile detail panels for schema version/upgrade, status, storage allocation, table hotspots, server connections, slow/bad query digests, and buffer-pool hit health. It shows aggregate CMS database disk used (data + indexes), allocated/free-fragmented space, row estimates, connection/server counters, slow-query counts with the configured threshold, explicit `performance_schema` query-digest availability state, best-effort query digests, buffer-pool hit health, and the largest tables by data plus index size for quick triage when the CMS database is sluggish under load. Maintenance actions are shown from this page; Run Retention deletes expired activity rows using the configured retention window, Purge Logs uses the existing log purge endpoint, and compress/defrag/backup/restore require dedicated guarded backend jobs before execution.
- Dashboard administrative and health KPI cards route to filtered managed-grid views. The dashboard instance-card board is hidden by default and can be shown explicitly; issue-card clicks reveal the board filtered to the selected issue. Tenant rows use a compact hamburger action menu with Dashboard/Edit/Delete actions; the Dashboard action opens the main dashboard filtered to that Tenant. Row action menus render at viewport level so Kendo grid overflow cannot clip the menu.
- Instance connectivity checks now record explicit Resolve, Connect, SSL, Auth, Settings, License, and Triggers phase rows in Response Details. DNS success plus TCP refusal is classified as `down` / `NO CONNECTION`, and TLS handshake closures/resets/timeouts are classified as blocking `TLS / Connection Error` failures rather than SSL warnings; SSL warnings are reserved for certificate-validation problems that still allow the TLS connection. SSL/Auth/License/Settings/Triggers are skipped due to connection failure instead of being reported as authentication errors. HTTP instances hide SSL details; `check_license=false` instances hide License details.

- Issue classification is documented as a static mapping model for the next support/notification slice: issue types belong to exactly one of four categories (`Connectivity`, `SSL`, `License`, `Processing Issues`) and one of five severities (`Critical`, `Error`, `Warning`, `Info`, `Verbose`). Current discovered examples include DNS resolution failures, TCP refused/timeout, TLS handshake failures before certificate evaluation, OxyGen authentication failures, Settings/API probe failures, SSL certificate validation warnings, and License expired/invalid/check-failed conditions.
- Instance dashboards include a Settings card backed by the latest `/web-api/global/settings` payload. The card extracts non-queue global settings such as BUS auto-purge, OxyGen version, and client-domain values; the Raw JSON count reflects the full payload variable count. Queue enable/paused flags move to Workflow & Components as visual indicators on Processing Queue, Email Queue, SMS Queue, and Scheduling Queue rows. Health Status and Settings boolean values use colored pills (`Enabled`/`Disabled` or `Yes`/`No`) with green/red/grey semantics. The Settings dialog displays the full read-only JSON payload like the License dialog.
- The Service card is a compact operational strip; Last Summary is widened for thousands-scale `checked / skipped / failed` values while In Flight remains compact.
- Instances grid includes CSV Export/Import controls for SystemAdmin and TenantAdmin users. Global users export/import a `tenant` column by Tenant name and may leave it blank for global/unassigned instances; tenant-scoped users export without the `tenant` column and imports are forced to their assigned Tenant. `instance_guid` maps to the instance `id`; blank creates a new instance, existing GUID updates, unknown nonblank GUID creates with that GUID. Passwords are never exported; blank import passwords preserve existing credentials on update and are rejected on create.
- Settings → General includes an OxyGen CMS Version panel backed by `GET /api/system/version`, showing current package/build metadata, GitHub latest-release/latest-tag update status, offline warning handling, and a newer-version notice/banner for SystemAdmin users.

Validation gate for this state:

```text
npm run typecheck && npm test && npm run build
```

- Settings → Database Purge Logs currently truncates the CMS activity tables (`application_logs` and `oxygen_instance_check_history`) and refreshes table statistics so dashboard storage metrics update after clearing activity, and returns per-table purge counts for reviewability.
