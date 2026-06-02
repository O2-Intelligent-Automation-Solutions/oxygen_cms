# First-Run Setup Wizard

## Purpose

The OxyGen CMS first-run wizard ensures the application has durable database configuration and a current schema before the first local administrator account is created.

The required order is:

```text
Database setup → Apply schema → Create first administrator → Sign in
```

## Step 1 — Configure Database

The wizard starts at database configuration when `/api/setup/status` returns:

```json
{
  "nextStep": "database"
}
```

### Modes

#### Create local MySQL instance

Default mode for local development and simple standalone deployment.

Fields:

- Database name, default `O2IAS_CMS`
- Application DB user, default `oxygen_cms`
- Application DB password

The password field:

- Auto-generates a secure password.
- Allows manual override.
- Includes an eye icon to show/hide the value.
- Includes an inline `Generate Password` button to the right of the input.

#### Connect to existing MySQL server

For local or remote MySQL infrastructure.

Fields:

- Hostname/IP
- Port, default `3306`
- Database name, default `O2IAS_CMS`
- Application DB user
- Application DB password

Future implementation will add real DB probing, list existing databases, and create/select database options.

## Step 2 — Apply Schema

The wizard advances to schema when database settings are saved and `/api/setup/status` returns:

```json
{
  "nextStep": "schema",
  "database": {
    "schemaCurrent": false,
    "targetSchemaVersion": "0.01"
  }
}
```

The screen must clearly display:

```text
CMS schema version 0.01
```

The apply button currently reads:

```text
Apply schema version 0.01
```

Versioning convention:

- Pre-production schemas use `0.xx`.
- Production schema releases can move to `1.x`.

Current schema artifact:

```text
apps/api/src/db/migrations/001_security_tenant_schema.sql
```

## Step 3 — Create First Administrator

The wizard advances to first admin when schema is current and no users exist:

```json
{
  "nextStep": "admin"
}
```

Fields:

- Email
- Display name
- Password

Admin creation remains backed by the current in-memory auth repository until the MySQL-backed repository is implemented.

## Step 4 — Sign In

After the first administrator exists, setup is complete and the user can sign in.

Completed setup status:

```json
{
  "nextStep": "complete",
  "requiresSetup": false
}
```

## API Endpoints

```http
GET  /api/setup/status
POST /api/setup/database/test-connection
POST /api/setup/database/list-databases
POST /api/setup/database/provision
POST /api/setup/database/apply-schema
POST /api/auth/bootstrap
POST /api/auth/login
```

## Local Review State

The wizard state is currently persisted in:

```text
apps/api/data/settings.json
```

This file is ignored by git.

To reset to the database step:

```bash
rm -f apps/api/data/settings.json
```

To force review of the schema step, create a local settings file with `schemaCurrent: false`:

```json
{
  "database": {
    "host": "localhost",
    "port": 3306,
    "database": "O2IAS_CMS",
    "user": "oxygen_cms",
    "password": "review-only-placeholder"
  },
  "schemaCurrent": false
}
```

## Current Scaffold Limitation

The wizard is browser-testable, but the database actions are scaffolded:

- `test-connection` validates input but does not yet open a real MySQL socket.
- `provision` saves local settings but does not yet create the database/user.
- `apply-schema` marks schema current but does not yet execute SQL against MySQL.

The next implementation pass must wire these endpoints to real MySQL provisioning and migration execution.
