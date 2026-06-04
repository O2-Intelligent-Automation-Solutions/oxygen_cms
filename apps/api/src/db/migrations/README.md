# OxyGen CMS Schema DDL Scripts

The schema DDL documentation has been migrated to the GitHub Wiki:

- [Schema DDL Scripts](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Schema-DDL-Scripts)
- [Data Dictionary](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Data-Dictionary)
- [Database Architecture](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Database-Architecture)

Runtime migration source of truth remains:

```text
apps/api/src/db/migrations/index.ts
```

Current runtime schema version: `0.08`.

Schema `0.08` adds `application_logs` for persisted CMS Audit, Service, CRUD, Connection, Security, and UI logging used by the Settings → Logs page and background poller diagnostics.

SQL artifacts in this directory remain version-controlled because they are implementation/schema artifacts, not standalone documentation.
