# Milestone 1 — Local Auth and RBAC

## Objective

Secure OxyGen CMS with local users, role assignments, and group/folder membership that future instance APIs will use for backend-enforced access control.

## Delivered Scope

- Password hashing with per-user salts using Node `scrypt`.
- Admin bootstrap API.
- Login/logout/me API endpoints.
- Bearer-token authenticated request middleware.
- Role authorization middleware.
- SystemAdmin-only user and group administration APIs.
- MySQL schema migration artifacts for users, roles, groups, sessions, and join tables.
- Reviewable React UI for bootstrap, login, profile, group creation, and user creation.

## API Endpoints

```http
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
- This milestone uses an in-memory repository at runtime for immediate review; the MySQL schema is included and will be wired to a durable repository as persistence work expands.

## Validation Gate

Run before and after committing:

```bash
npm run typecheck
npm run build
npm test
npm audit
```
