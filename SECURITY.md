# Security Policy

## Supported Versions

OxyGen CMS is in pre-production Phase 1 development.

| Version / Schema | Supported | Notes |
| --- | --- | --- |
| `0.xx` | Active development | Pre-production schema versions. Current target: `0.07`. |
| `1.x` | Future | Production-ready schema line after Phase 1 hardening. |

## Current Security Architecture

- Local CMS authentication is required before accessing admin APIs after first-run setup completes.
- Passwords are hashed with per-user salts and are never returned by the API.
- `SystemAdmin` and `TenantAdmin` are protected global roles.
- Users, roles, groups, and instances may be scoped by tenant.
- `tenant_id = NULL` means global scope.
- Tenant-scoped users must not manage tenants outside their assigned tenant.
- Only global users may manage tenants.

## Setup Secret Handling

Database setup settings are stored in a local ignored file:

```text
apps/api/data/settings.json
```

Rules:

- Do not commit this file.
- Do not log database passwords.
- Do not expose generated application DB passwords after setup beyond the setup form visibility toggle.
- Production hardening should move secrets to Docker secrets, environment-backed secret stores, OS secret storage, or encrypted local config.

## Schema Security Notes

Current canonical DDL artifact:

```text
apps/api/src/db/migrations/current-schema-0.07.sql
```

Current schema version:

```text
0.07
```

The `cms_schema_versions` table records applied schema versions and checksums. Pre-production versions must use the `0.xx` convention until production readiness.

## Reporting a Vulnerability

Report security issues privately to the OPT/O2 IAS engineering leadership team. Do not open public issues containing secrets, credentials, customer hostnames, database connection strings, or exploit details.

When reporting, include:

- Affected component or endpoint.
- Reproduction steps.
- Expected vs. actual behavior.
- Logs/screenshots with secrets redacted.
- Suggested severity and impact.
