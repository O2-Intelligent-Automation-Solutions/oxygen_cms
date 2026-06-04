# Milestone 1 — Local Auth and RBAC

## Objective

Secure OxyGen CMS with local users, protected roles, group membership, and backend-enforced access control foundations.

## Status

Complete and superseded by durable MySQL-backed persistence in Milestone 1.5.

## Delivered Scope

- Password hashing with per-user salts using Node `scrypt`.
- First SystemAdmin bootstrap flow.
- Login/logout/session APIs.
- Bearer-token authenticated request middleware.
- Role authorization middleware.
- SystemAdmin-only user, group, role, and tenant administration APIs.
- Durable MySQL-backed users, roles, groups, tenants, sessions, and assignments.
- Tenant assignment rules and global-vs-tenant scope foundation.

## Current API Endpoints

```http
GET  /api/auth/bootstrap-status
POST /api/auth/bootstrap
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me

GET|POST|PATCH|DELETE /api/tenants
GET|POST|PATCH|DELETE /api/groups
GET|POST|PATCH|DELETE /api/users
GET|POST|PATCH|DELETE /api/roles
```

## Roles

Seeded global roles in current schema:

- `SystemAdmin` — protected global CMS system administrator.
- `TenantAdmin` — protected global tenant administrator template.
- `Operator` — editable operational user.
- `Viewer` — editable read-only user.

## Security Rules

- Passwords are never returned by the API.
- Password hashes are salted and verified with timing-safe comparison.
- User/group/role/tenant admin endpoints require SystemAdmin privileges today.
- `tenant_id = NULL` means global scope.
- Tenant assignment is immutable after creation for scoped records.
- Only global users can manage tenants.

## Validation Gate

```bash
npm run typecheck
npm run build
npm test
npm audit
MYSQL_INTEGRATION_TESTS=true npm --workspace @oxygen-cms/api test -- --run tests/mysqlAuthRepository.test.ts
```
