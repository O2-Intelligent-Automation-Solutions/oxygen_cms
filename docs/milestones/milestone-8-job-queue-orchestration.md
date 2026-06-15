# Milestone 8 — BullMQ Job Queue Orchestration

The GitHub Wiki is the documentation source of truth for the full milestone plan.

Canonical page:

- [Milestone 8 — BullMQ Job Queue Orchestration](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Milestone-8-Job-Queue-Orchestration)

Summary: BullMQ/Redis queue foundation for per-instance scheduled checks, database maintenance jobs, SystemAdmin Bull Board visibility, and eventual native CMS Jobs dashboard. Current checkpoints deliver dependencies, Redis Compose wiring, env config, SystemAdmin queue status API, optional Bull Board mount, Settings → General queue visibility, opt-in worker bootstrap entrypoint/Compose profile, safe `instance-checks` processor dispatch through the saved-instance connectivity persistence path, automatic startup/CRUD/import schedule reconciliation, manual enqueue helpers, and the first `database-maintenance` `purge-logs` queued job/processor path. Analyze/optimize/backup/restore jobs and native Jobs visibility remain next.
