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
- [x] Add dashboard KPI-to-grid drill-downs and Tenant row Dashboard actions for scoped triage.
- [ ] Revisit RBAC/Tenant security before Phase 1 closeout: confirmed Tenant filters, authorized navigation/actions only, configurable roles/permission sets, and cross-Tenant regression tests.
- [ ] Complete trigger/workflow error MVP: surface trigger errors, correlate to Workflow/Workflow Event/Service Event details, and track completion/recovery.
- [ ] Complete initial Milestone 7 deployment hardening for the current API/web/MySQL MVP before BullMQ: automated Docker deployment, setup/dependency scripts, GitHub update detection, CMS UI update notice, and non-technical in-place app/database update flow.
- [ ] Add BullMQ/Redis queue orchestration as Phase 1.5 before Phase 2 fan-in/fan-out work: per-instance scheduled checks, database maintenance jobs, event ingestion, notification delivery, outbound webhook dispatch, SystemAdmin Bull Board visibility, and eventual native Jobs dashboard.
- [ ] Revisit Milestone 7 after Phase 1.5 for worker/Redis/BullMQ deployment topology.
- [ ] Add Milestone 9 event handling/support automation: global/Tenant severity mappings, custom inbound collectors, issue lifecycle/acknowledgement, queue dashboards, Unlayer email templates, and outbound integrations.
- [ ] Add database-backed issue classification catalog tables for static categories, static severities, and discovered issue types, then expose a read-only Kendo managed-grid review page with affected-instance drill-through to the Instance Dashboard.
- [ ] Add richer trend/history visualizations after collector data matures.
