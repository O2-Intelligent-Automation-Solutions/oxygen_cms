# OxyGen Central Management Server (oxygen_cms)

OxyGen Central Management Server (CMS) is an optional central monitoring and management server for multiple OxyGen BPM/IPaaS OPT Web Services deployments across a tenant/customer base.

Phase 1 is a lightweight standalone React/Node/MySQL web application focused on **read-only** central visibility, health monitoring, and management workflows for enrolled OxyGen deployments.

## Current Status

The project has completed the foundation, database-first setup flow, durable local auth/RBAC persistence, manual instance CRUD, managed Kendo grids, and configurable application labels.

Current pre-production schema version:

```text
0.07
```

Current browser-testable state:

- First-run setup wizard flows: database → schema → first administrator → sign in.
- Self-contained managed MySQL development flow is supported through Docker Compose and repo scripts.
- Local authentication, users, roles, groups, tenants, sessions, enrolled instances, grid preferences, and application label settings persist in MySQL.
- Manual OxyGen instance enrollment/editing is available through the Instances grid.
- User/group instance access is modeled separately from tenant assignment.
- Settings → General → Labels supports changing the displayed tenant label without renaming the underlying data model.

See [Current Status](docs/current-status.md) for details.

## Planning and Architecture

- [Phase 1 Implementation Plan](docs/plans/phase-1-oxygen-cms.md)
- [Phase 2 Roadmap](docs/plans/phase-2-oxygen-cms.md)
- [Milestone 1 — Local Auth and RBAC](docs/milestones/milestone-1-auth-rbac.md)
- [Milestone 1.5 — Database Provisioning](docs/milestones/milestone-1-5-database-provisioning.md)
- [Database Architecture](docs/database-architecture.md)
- [Data Dictionary](docs/data-dictionary.md)
- [First-Run Setup Wizard](docs/setup-wizard.md)
- [User Guide](docs/user-guide.md)
- [Wiki Home](docs/wiki/Home.md)

## Development

- [Development Setup](docs/development.md)

Quick validation gate:

```bash
npm run typecheck
npm run build
npm test
npm audit
```

MySQL integration tests are opt-in and should be run when touching database-backed repositories.

## Schema DDL

The embedded migration registry is the runtime source of truth:

```text
apps/api/src/db/migrations/index.ts
```

SQL DDL artifacts and the canonical current schema are committed under:

```text
apps/api/src/db/migrations/
```
