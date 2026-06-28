# Phase 2 Roadmap

This documentation has been migrated to the GitHub Wiki:

- [Phase 2 Roadmap](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Phase-2-Roadmap)

## Phase 1 collector handoff status

- [x] Implement ordered Resolve → Connect → SSL → Auth → License → Settings → Triggers probe details.
- [x] Gate downstream probes on connection/auth/license outcomes and hide SSL/License sections when disabled by protocol/settings.
- [x] Persist and expose `/web-api/global/settings` for the Settings card/dialog.
- [x] Move queue enable/paused indicators to Workflow & Components.
- [x] Normalize noisy timeout issue labels in the dashboard issue filter.
- [x] Add Settings → Database performance visibility for CMS MySQL storage, server counters, slow queries, buffer-pool health, and table/query hotspots.
- [x] Add Settings → Issue Types read-only issue classification grid backed by static catalog tables and affected-instance drill-through.
- [x] Add dashboard KPI-to-grid drill-downs and Tenant row Dashboard actions for scoped triage.
- [x] Complete RBAC/Tenant security closeout for the current MVP: explicit permission catalog, durable role-permission assignments, effective auth permissions, Tenant/global/instance scope checks, authorized navigation/actions, audit coverage, and cross-Tenant regression tests.
- [ ] Carry the RBAC future-state backlog into Phase 2 design: explicit issue/notification/template/integration/webhook/command/enrollment permissions, reusable resource-scope helpers, audit report filters, retention/redaction policy, and cross-Tenant regression gates.
- [ ] Complete trigger/workflow error MVP: the first API/UI slice now surfaces trigger errors, correlates to Workflow/Workflow Event/Service Event details, and exposes the **Processing Errors** dashboard; remaining closeout is live OxyGen validation plus final completion/recovery tracking.
- [ ] Complete initial Milestone 7 deployment hardening for the current API/web/MySQL MVP before BullMQ: automated Docker deployment, setup/dependency scripts, GitHub update detection, CMS UI update notice, and non-technical in-place app/database update flow.
- [ ] Add BullMQ/Redis queue orchestration as Phase 1.5 before Phase 2 fan-in/fan-out work: per-instance scheduled checks, database maintenance jobs, event ingestion, notification delivery, outbound webhook dispatch, SystemAdmin Bull Board visibility, and eventual native Jobs dashboard.
- [ ] Revisit Milestone 7 after Phase 1.5 for worker/Redis/BullMQ deployment topology.
- [ ] Add Milestone 9 event handling/support automation: global/Tenant severity mappings, custom inbound collectors, issue lifecycle/acknowledgement, queue dashboards, Unlayer email templates, and outbound integrations.
- [ ] Add database-backed issue classification catalog tables for static categories, static severities, and discovered issue types, then expose a read-only Kendo managed-grid review page with affected-instance drill-through to the Instance Dashboard.
- [ ] Add richer trend/history visualizations after collector data matures.
