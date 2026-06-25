# Milestone 7 — Deployment Hardening and In-Place Updates

The GitHub Wiki is the documentation source of truth for the full milestone plan.

Canonical page:

- [Milestone 7 — Deployment Hardening and In-Place Updates](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Milestone-7-Deployment-Hardening)

Summary: automated Docker deployment for the current API/web/MySQL MVP, setup/dependency/environment scripts, reverse-proxy HTTPS guidance, backup/restore safety, GitHub update detection, CMS UI new-version notification, and a non-technical in-place application/database update flow. Revisit after Phase 1.5/BullMQ for worker/Redis topology.

Implementation status: Milestone 7A deployment baseline, Milestone 7B secret generation/backup/pre-update safety/reverse-proxy HTTPS guidance, and Milestone 7C version metadata/GitHub update detection/CMS update notice are delivered. Bundled HTTPS/certificate automation is intentionally skipped for now. Milestone 7D — the non-technical in-place app/database update flow — is active after RBAC closeout approval on 2026-06-15. Delivered 7D slices include the guarded host-side `scripts/deploy.sh update` command, `GET /api/system/update-status` progress/status contract, disabled-by-default guarded runner endpoints for dry-run/confirmed execution, the Settings → General Update Readiness UI actions, and automatic post-restart schema-migration follow-through. Local deployment-helper validation is complete for `scripts/deploy.sh init`, `scripts/deploy.sh check`, guarded `scripts/deploy.sh update --dry-run main`, and a clean isolated Compose deployment smoke with `/api/health` and SPA root returning 200; tagged-update and backup/restore validation remain next.
