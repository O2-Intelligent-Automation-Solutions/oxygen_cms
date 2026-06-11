# OxyGen Central Management Server (oxygen_cms)

OxyGen Central Management Server (CMS) is an optional central monitoring and management server for multiple OxyGen BPM/IPaaS OPT Web Services deployments across a tenant/customer base.

The GitHub Wiki is the documentation source of truth for this project.

## Documentation

- [Wiki Home](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki)
- [Current Status](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Current-Status)
- [User Guide](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/User-Guide)
- [Phase 1 Roadmap](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Phase-1-Roadmap)
- [Phase 2 Roadmap](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Phase-2-Roadmap)
- [Milestone 7 — Deployment Hardening and In-Place Updates](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Milestone-7-Deployment-Hardening)
- [Milestone 8 — BullMQ Job Queue Orchestration](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Milestone-8-Job-Queue-Orchestration)
- [Milestone 9 — Event Handling and Support Automation](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Milestone-9-Event-Handling-Support-Automation)
- [Database Architecture](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Database-Architecture)
- [Data Dictionary](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Data-Dictionary)
- [Schema DDL Scripts](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Schema-DDL-Scripts)
- [OpenAPI Spec](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/OpenAPI-Spec)

Canonical OpenAPI file in this repository:

```text
docs/openapi.yaml
```

## Development Validation

```bash
npm run typecheck
npm run build
npm test
npm audit
```

Runtime/schema source of truth remains the application code and migration registry in this repository.
