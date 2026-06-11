# Milestone 1.5 — Database Provisioning

This documentation has been migrated to the GitHub Wiki:

- [Milestone 1.5 — Database Provisioning](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/Milestone-1.5-Database-Provisioning)

## Local schema checkpoint

Current schema target: `0.12`. Recent migrations add application logs, log tenant/entity metadata, instance import metadata columns, and duplicate instance-name support. The Settings → Database dashboard is a read-only MySQL/status aggregate and does not require a schema migration.
