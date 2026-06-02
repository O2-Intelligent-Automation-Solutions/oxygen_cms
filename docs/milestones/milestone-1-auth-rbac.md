# Milestone 1 — Local Auth and RBAC

## Objective

Secure OxyGen CMS with local users, role assignments, and group/folder membership that future instance APIs will use for backend-enforced access control.

## Delivered Scope

- Password hashing with per-user salts using Node `scrypt`.
- Initial setup wizard UI.
- Database-first setup wizard scaffold introduced in Milestone 1.5; first admin creation is now gated behind database setup and schema version `0.01`.
- The login UI is hidden until the first SystemAdmin account exists.
- Bearer-token authenticated request middleware.
- Role authorization middleware.
- SystemAdmin-only user and group administration APIs.
- MySQL schema migration artifacts for users, roles, groups, sessions, and join tables.
- Reviewable React UI for bootstrap, login, profile, group creation, and user creation.

## API Endpoints

```http
GET  /api/auth/bootstrap-status
POST /api/auth/bootstrap
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
GET  /api/groups
POST /api/groups
GET  /api/users
POST /api/users
```

## Roles

- `SystemAdmin`
- `PartnerAdmin`
- `Operator`
- `Viewer`

## Security Notes

- Passwords are never returned by the API.
- Password hashes are salted and verified with timing-safe comparison.
- User/group admin endpoints require `SystemAdmin`.
- Database setup secrets are stored only in ignored local setup state during the current scaffold.
- Current runtime auth remains in-memory for review; the MySQL DDL and migration metadata are committed and will be wired to a durable repository as Milestone 1.5 continues.
- Pre-production schema version `0.01` defines the initial security/tenant tables.

## Validation Gate

Run before and after committing:

```bash
npm run typecheck
npm run build
npm test
npm audit
```
