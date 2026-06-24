# Milestone 1.5 — Database Provisioning

This documentation has been migrated to the GitHub Wiki:

- [Milestone 1.5 — Database Provisioning](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Milestone-1.5-Database-Provisioning)

## Local schema checkpoint

Current schema target: `0.19`. Recent migrations add application logs, log tenant/entity metadata, instance import metadata columns, duplicate instance-name support, a health-detail index on `oxygen_instance_check_history` for instance dashboard reads, a `started_at` retention-pruning index for history cleanup, role-permission assignments, and activity-dashboard performance indexes for latest check-history evidence and filtered log listing, plus real expiration warning issue types for License and SSL. The Settings → Database dashboard is a read-only MySQL/status aggregate and does not require a schema migration; schema `0.15` adds the static issue classification catalog tables used by Settings → Issue Types. Schema `0.16` adds durable role-permission assignments for the RBAC refinement.
