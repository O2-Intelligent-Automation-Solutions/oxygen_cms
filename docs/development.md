# Development Setup

## Prerequisites

- Node.js 22+
- npm 10+
- Docker / Docker Compose for local MySQL provisioning tests

In Hermes sessions, ensure the configured Node path is available before running npm commands:

```bash
export PATH=/home/administrator/.hermes/node/bin:$PATH
```

## Install

```bash
npm install
```

## Development Servers

Start the self-contained managed development flow:

```bash
npm run dev:db:reset
npm run dev:managed
```

Or start services manually after MySQL is available:

```bash
npm --workspace @oxygen-cms/api run dev
npm --workspace @oxygen-cms/web run dev -- --host 0.0.0.0
```

Default local URLs:

- API health: <http://localhost:3000/api/health>
- Setup status: <http://localhost:3000/api/setup/status>
- Web app: <http://localhost:5173>

## Database Defaults

```text
Database: O2IAS_CMS
Application user: oxygen_cms
Current schema target: 0.07
```

Canonical DDL:

```text
apps/api/src/db/migrations/current-schema-0.07.sql
```

## Validation

Run before and after each milestone commit:

```bash
npm run typecheck
npm run build
npm test
npm audit
git diff --check
```

MySQL integration tests are opt-in:

```bash
MYSQL_INTEGRATION_TESTS=true npm --workspace @oxygen-cms/api test -- --run tests/mysqlAuthRepository.test.ts
MYSQL_INTEGRATION_TESTS=true npm --workspace @oxygen-cms/api test -- --run tests/mysqlInstanceRepository.test.ts
MYSQL_INTEGRATION_TESTS=true npm --workspace @oxygen-cms/api test -- --run tests/mysqlGridPreferenceRepository.test.ts
MYSQL_INTEGRATION_TESTS=true npm --workspace @oxygen-cms/api test -- --run tests/mysqlAppSettingsRepository.test.ts
```

## Scope Guard

This repository is standalone. Do not modify `oxygen_backend` or `oxygen_frontend` while developing CMS unless Brad explicitly grants per-session permission.
