# Current Status

This documentation has been migrated to the GitHub Wiki:

- [Current Status](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Current-Status)

## Local repo status summary

Current CMS schema version: `0.12`.

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
- Settings → Logs page uses the same full-height managed-grid layout as the other admin grids, with a Tenant column, grid-filterable User Name/Entity GUID columns, select-sized dropdown checkbox filters for Type and Severity, manual Refresh, Pause/Resume Refresh, and SystemAdmin-only Clear Logs controls in the grid toolbar; Critical, Error, Warning, and Logging severities are selected by default while Verbose is opt-in. Log retention moved to Settings → General and is enforced during log reads plus a background retention sweep.
- Routine successful background poller completion summaries are stored as Verbose service logs. Each poller instance check also writes a Verbose Connection row with `entityGuid` and `tenantId`; new instance issues write one Error/Warning row, repeated identical issues are suppressed, and recovery writes one Logging row that the instance is nominal.
- Best-effort poller log persistence so a missing/unavailable log table cannot crash the API service.
- Dashboard KPI styling uses the OxyGen display font for all KPI numerals, with the administrative KPI group (Tenants, Users, User Groups, Roles) restored to aqua branding while health KPIs retain green/yellow/red semantic severity colors.
- Dashboard health KPI cards are clickable issue filters, the Issues dropdown includes normalized issue labels emitted by the API/UI, endpoint-specific `Connection timed out: <ip>:<port>` labels are consolidated under `Connecting time out`, status messages open instance logs, and `check_license=false` instances are excluded from License issue counts/cards.
- Instance connectivity checks now record explicit Resolve, Connect, SSL, Auth, Settings, License, and Triggers phase rows in Response Details. DNS success plus TCP refusal is classified as `down` / `NO CONNECTION`, with SSL/Auth/License/Settings/Triggers skipped due to connection failure instead of being reported as an authentication error. HTTP instances hide SSL details; `check_license=false` instances hide License details.
- Instance dashboards include a Settings card backed by the latest `/web-api/global/settings` payload. The card extracts non-queue global settings such as BUS auto-purge, OxyGen version, and client-domain values; the Raw JSON count reflects the full payload variable count. Queue enable/paused flags move to Workflow & Components as visual indicators on Processing Queue, Email Queue, SMS Queue, and Scheduling Queue rows. Health Status and Settings boolean values use colored pills (`Enabled`/`Disabled` or `Yes`/`No`) with green/red/grey semantics. The Settings dialog displays the full read-only JSON payload like the License dialog.
- The Service card is a compact operational strip; Last Summary is widened for thousands-scale `checked / skipped / failed` values while In Flight remains compact.
- Instances grid includes CSV Export/Import controls for SystemAdmin and TenantAdmin users. Global users export/import a `tenant` column by Tenant name and may leave it blank for global/unassigned instances; tenant-scoped users export without the `tenant` column and imports are forced to their assigned Tenant. `instance_guid` maps to the instance `id`; blank creates a new instance, existing GUID updates, unknown nonblank GUID creates with that GUID. Passwords are never exported; blank import passwords preserve existing credentials on update and are rejected on create.

Validation gate for this state:

```text
npm run typecheck && npm test && npm run build
```
