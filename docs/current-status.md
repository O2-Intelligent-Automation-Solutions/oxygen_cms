# Current Status

This documentation has been migrated to the GitHub Wiki:

- [Current Status](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Current-Status)

## Local repo status summary

Current CMS schema version: `0.08`.

Recent dashboard/service-log work adds:

- Dashboard Service card backed by the shared background poller state, including pause/resume and Run Now controls.
- Dashboard section ordering:
  1. Header / tenant filter / refresh
  2. Tenants / Users / User Groups / Roles
  3. Service
  4. Instances / Issues / Connectivity / SSL / License / Processing Issues
  5. Instance Board
- SystemAdmin poller controls for pause/resume plus operator-initiated Run Now execution.
- Database-backed application logs with Audit, Service, CRUD, Connection, Security, and UI log types.
- Settings → Logs page with filters and retention setting.
- Best-effort poller log persistence so a missing/unavailable log table cannot crash the API service.
- Dashboard KPI styling uses the OxyGen display font for all KPI numerals, with the administrative KPI group (Tenants, Users, User Groups, Roles) restored to aqua branding while health KPIs retain green/yellow/red semantic severity colors.
- The Service card is a compact operational strip; Last Summary is widened for thousands-scale `checked / skipped / failed` values while In Flight remains compact.

Validation gate for this state:

```text
npm run typecheck && npm test && npm run build
```
