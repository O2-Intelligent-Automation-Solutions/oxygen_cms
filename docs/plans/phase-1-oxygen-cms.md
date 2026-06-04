# Phase 1 — OxyGen CMS Implementation Plan

> **For Hermes:** Use subagent-driven-development skill for feature implementation plans that modify code. This document is the milestone roadmap and current alignment source.

**Goal:** Deliver a lightweight standalone React/Node/MySQL central management server for read-only monitoring and management of multiple OxyGen deployments.

**Architecture:** React SPA + Node/Fastify API + local MySQL. CMS initiates outbound HTTPS connections to enrolled OxyGen instances on demand and on a polling interval. Phase 1 does not require remote instances to call back into CMS.

**Tech Stack:** TypeScript, React, Kendo UI for React, Fastify, MySQL 8, Docker.

---

## Current State

Completed foundation through schema `0.07`:

- First-run database/schema/admin setup.
- Durable local auth/RBAC.
- Tenant, user, role, group CRUD.
- Manual instance enrollment CRUD.
- User/group instance access model.
- Managed grid preferences.
- Application labels settings.

## Phase 1 Milestones

### Milestone 0 — Project Foundation

Status: Complete.

Delivered:

- Monorepo scaffold.
- API and web app shells.
- Docker development foundation.
- Basic validation/test gates.

### Milestone 1 — Local Auth and RBAC

Status: Complete.

Delivered:

- First SystemAdmin bootstrap.
- Login/logout/me APIs.
- Users, roles, groups, tenants.
- Password hashing and MySQL-backed sessions.

### Milestone 1.5 — Database Provisioning and Durable Persistence

Status: Complete.

Delivered:

- Database-first setup wizard.
- Managed/custom MySQL setup paths.
- Schema migrations through `0.07`.
- MySQL-backed repositories.

### Milestone 2 — Manual Instance Enrollment UI

Status: Substantially complete, with credential hardening still required.

Delivered:

- Instance CRUD.
- Protocol/host/port/defaults.
- Tenant-locked edit behavior.
- Launch action.
- Access model through users/groups.

Remaining hardening:

- Encrypt remote OxyGen credentials.
- Avoid returning or logging secrets.

### Milestone 2.1 — Encrypted Instance Credentials

Status: Next recommended code milestone.

Acceptance criteria:

- Add encryption/decryption utility using authenticated encryption.
- Require a deployment secret such as `OXYGEN_CMS_ENCRYPTION_KEY`.
- Store encrypted payloads in `oxygen_instances.password_secret` or a renamed migration-backed field.
- Never return decrypted passwords through API responses.
- Edit forms leave password blank unless user replaces it.
- Tests prove stored DB value is not plaintext.

Validation:

```bash
npm run typecheck
npm run build
npm test
MYSQL_INTEGRATION_TESTS=true npm --workspace @oxygen-cms/api test -- --run tests/mysqlInstanceRepository.test.ts
npm audit
```

### Milestone 3 — Real Connectivity Test

Status: Planned.

Scope:

- DNS/host reachability.
- HTTPS/TLS handshake.
- SSL certificate validity/expiration.
- OxyGen auth check via `/v2/Auth/Login`.
- Authenticated API probe, initially `/web-api/global/settings/currenttime` where available.
- Persist latest result and append check history.

### Milestone 4 — Background Monitoring Engine

Status: Planned.

Scope:

- Scheduler service.
- Per-instance polling interval.
- Poll Now action.
- Monitor run and event history.
- Availability/uptime rollups.

### Milestone 5 — OxyGen Snapshot Collectors

Status: Planned.

Scope:

- License status collector.
- Global settings collector.
- Workflow status collector following the OxyGen troubleshooting chain.
- Persist structured snapshots and last-known summaries.

### Milestone 6 — Dashboard and Instance Detail Drill-Down

Status: Planned.

Scope:

- Uptime dashboard.
- Instance detail tabs.
- Connectivity/SSL/license/workflow/history views.
- Status filters and group/tenant scoping.

### Milestone 7 — Packaging, HTTPS, and Deployment Hardening

Status: Planned.

Scope:

- Standalone Docker container/deployment bundle.
- HTTPS binding/certificate management approach.
- Environment/secrets documentation.
- Backup/restore notes for MySQL volume and setup settings.

## Phase 1 Non-Goals

- Remote instance callback registration.
- Persistent outbound tunnels from OxyGen instances to CMS.
- Reverse command execution.
- Centralized user provisioning into remote instances.
- Real-time webhooks/WebSocket callbacks from remote instances.

Those belong to Phase 2.
