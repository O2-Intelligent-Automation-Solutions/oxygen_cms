# OxyGen Central Management Server (oxygen_cms)

OxyGen Central Management Server (CMS) is an optional central monitoring and management server for multiple OxyGen BPM/IPaaS OPT Web Services deployments across a partner/customer base.

Phase 1 is a lightweight standalone React/Node/MySQL web application focused on **read-only** central visibility, health monitoring, and management workflows for enrolled OxyGen deployments.

## Current Status

The project is currently in **Milestone 1.5 — Database Provisioning and Durable Security Persistence**.

Reviewed browser-testable state:

- First-run setup wizard now flows: database → schema → first administrator → sign in.
- Database name defaults to `O2IAS_CMS`.
- Application DB password is auto-generated, editable, visible via an eye toggle, and can be regenerated inline.
- Apply Schema step clearly displays the target schema version.
- Current pre-production schema version: `0.01`.
- Setup state is stored locally in `apps/api/data/settings.json` and ignored by git.
- Real MySQL provisioning/execution is the next implementation pass; the current wizard actions are scaffolded for review.

See [Current Status](docs/current-status.md) for details.

## Planning and Architecture

- [Phase 1 Implementation Plan](docs/plans/phase-1-oxygen-cms.md)
- [Milestone 1 — Local Auth and RBAC](docs/milestones/milestone-1-auth-rbac.md)
- [Milestone 1.5 — Database Provisioning](docs/milestones/milestone-1-5-database-provisioning.md)
- [Database Architecture](docs/database-architecture.md)
- [First-Run Setup Wizard](docs/setup-wizard.md)

## Development

- [Development Setup](docs/development.md)

Quick validation gate:

```bash
npm run typecheck
npm run build
npm test
npm audit
```

Expected current result:

```text
14 tests passed
0 vulnerabilities
```

## Schema DDL

The current schema DDL artifact is committed at:

```text
apps/api/src/db/migrations/001_security_tenant_schema.sql
```

The embedded migration registry is at:

```text
apps/api/src/db/migrations/index.ts
```
