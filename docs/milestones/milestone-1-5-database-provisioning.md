# Milestone 1.5 — Database Provisioning and Durable Security Persistence

## Objective

Move CMS setup and security data to durable, versioned MySQL persistence. The first-run wizard configures or connects to the CMS database before first administrator creation.

## Status

Complete for the current Phase 1 foundation. The schema is now at `0.07` and runtime repositories use MySQL after setup/schema is complete.

## Delivered Scope

- Database-first setup wizard: database → schema → first admin → sign in.
- Self-contained managed MySQL development path.
- Custom/local MySQL setup paths.
- Setup state persisted in ignored local settings.
- Schema migration runner with string pre-production versions.
- `cms_schema_versions` recording.
- Durable MySQL repositories for auth/RBAC, tenants, roles, users, user groups, sessions, instances, grid preferences, and application settings.
- Managed setup smoke script.
- MySQL integration tests for durable repositories.

## Current Schema Versions

| Version | Name |
| --- | --- |
| `0.01` | security tenant schema |
| `0.02` | oxygen instance enrollment schema |
| `0.03` | expanded instance status schema |
| `0.04` | user and group instance access model |
| `0.05` | grid preferences schema |
| `0.06` | remove partner role terminology |
| `0.07` | application settings schema |

## Validation Gate

```bash
npm run typecheck
npm run build
npm test
npm audit
npm run dev:managed:smoke
```

Repository-specific MySQL integration tests:

```bash
MYSQL_INTEGRATION_TESTS=true npm --workspace @oxygen-cms/api test -- --run tests/mysqlAuthRepository.test.ts
MYSQL_INTEGRATION_TESTS=true npm --workspace @oxygen-cms/api test -- --run tests/mysqlInstanceRepository.test.ts
MYSQL_INTEGRATION_TESTS=true npm --workspace @oxygen-cms/api test -- --run tests/mysqlGridPreferenceRepository.test.ts
MYSQL_INTEGRATION_TESTS=true npm --workspace @oxygen-cms/api test -- --run tests/mysqlAppSettingsRepository.test.ts
```
