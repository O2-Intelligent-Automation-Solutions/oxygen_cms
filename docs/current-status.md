# Current Status

This documentation has been migrated to the GitHub Wiki:

- [Current Status](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Current-Status)

## Local repo status summary

Current CMS schema version: `0.09`.

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
- The Service card is a compact operational strip; Last Summary is widened for thousands-scale `checked / skipped / failed` values while In Flight remains compact.

Validation gate for this state:

```text
npm run typecheck && npm test && npm run build
```
