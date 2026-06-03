# OxyGen Central Management Server Phase 1 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build the Phase 1 OxyGen Central Management Server (CMS): a lightweight standalone read-only monitoring and management web app for multiple OxyGen BPM/IPaaS OPT Web Services deployments.

**Architecture:** CMS is a single deployable React/Node application with a local MySQL database, local authentication/RBAC, encrypted remote OxyGen credentials, and a background polling worker. Phase 1 is CMS-initiated HTTPS polling only; it does not require agents, tunnels, callbacks, or writes back to remote OxyGen instances.

**Tech Stack:** React + TypeScript + Vite frontend, Node.js + TypeScript API, MySQL, TypeScript schema migration runner, Docker, local HTTPS binding via mounted certificate/key files.

---

## Current Status Checkpoint — 2026-06-02

The project is currently in **Milestone 1.5 — Database Provisioning and Durable Security Persistence**.

Reviewed and approved browser-testable work:

- First-run setup wizard order is database → schema → first administrator → sign in.
- Database setup UI supports local/existing MySQL modes at scaffold level.
- Default CMS database is `O2IAS_CMS`.
- Application DB password is generated automatically, editable, show/hide capable, and regenerated inline.
- Apply Schema step explicitly displays target schema version `0.02`.
- Pre-production schema versions must remain in the `0.xx` range.
- Initial security/tenant DDL is committed at `apps/api/src/db/migrations/001_security_tenant_schema.sql`.
- Setup settings are persisted locally at `apps/api/data/settings.json` and ignored by git.

Still required before Milestone 1.5 is complete:

- Real MySQL connection testing and database list/create/select behavior.
- Real SQL schema execution and `cms_schema_versions` recording.
- MySQL-backed auth/RBAC/tenant repository.
- Restart persistence tests.

Related docs:

- [Current Status](../current-status.md)
- [Database Architecture](../database-architecture.md)
- [First-Run Setup Wizard](../setup-wizard.md)
- [Milestone 1.5](../milestones/milestone-1-5-database-provisioning.md)

---

## Ground Rules / Phase 1 Scope

### In Scope

- Local CMS authentication and authorization.
- User profiles, roles, groups/folders, and group-scoped instance visibility.
- Manual enrollment of OxyGen instances.
- Encrypted storage of remote OxyGen credentials.
- Test connectivity against remote OxyGen instances.
- Always-on background polling plus on-demand poll now.
- Health, uptime, SSL, authentication, and API availability history.
- Read-only OxyGen data collection:
  - License JSON snapshots.
  - Global settings JSON snapshots.
  - Queryable per-instance local settings rows based on `BUS_Global_Settings` / global settings response data.
  - Workflow trigger/event/service-event monitoring based on the existing OxyGen troubleshooting flow.
- Clean SPA dashboard and instance detail screens.
- Standalone Docker deployment.
- Simple HTTPS certificate/key binding.

### Out of Scope for Phase 1

- Remote commands to OxyGen instances.
- CMS-to-instance reverse tunnels.
- Instance-initiated persistent connections.
- Instance callbacks/webhooks/WebSockets.
- Centralized provisioning into remote OxyGen instances.
- Notification engine beyond dashboard/status history.
- Any write/update operation against remote OxyGen instances.

---

## Confirmed / Candidate OxyGen Endpoints

These were cross-checked against the provided Postman collection and local `oxygen_backend` source where available.

### Authentication

```http
POST /v2/Auth/Login
Content-Type: application/x-www-form-urlencoded

Username=<username>&Password=<password>&ReturnUrl=&Fragment=&IsPersistent=false
```

CMS should use a cookie/session-aware HTTP client for each poll.

### License

Backend source confirms:

- File: `/home/administrator/oxygen_backend/OPTWebServices_Package/Areas/BUS/Api/Controllers/LicenseApiController.vb`
- Route prefix: `web-api/bus/license`
- Method: `GET /web-api/bus/license`
- Implementation returns `_busLicense.GetLicense()` as the license view model.

Phase 1 collection rule:

- Call `GET /web-api/bus/license`.
- Store the returned serialized JSON model as the authoritative raw license snapshot for that poll.
- Extract only lightweight searchable/display fields later as needed; do not over-normalize license internals in Phase 1.

### Global Settings

Backend source confirms:

- File: `/home/administrator/oxygen_backend/OPTWebServices_Package/Areas/BUS/Api/Controllers/GlobalSettingsApiController.vb`
- Route prefix: `web-api/global/settings`
- Backing repo points to `BUS_Global_Settings`.
- `GlobalSettingViewModel` fields include:
  - `SettingName`
  - `BooleanValue`
  - `StringValue`
  - `IntegerValue`
  - `Description`
  - `Editable`
  - `Hidden`
  - `Title`
  - `Group`
  - `Controls`
  - `Variables`
  - `DocumentationURL`

Candidate routes from source/Postman:

```http
GET /web-api/global/settings
GET /web-api/global/settings/grid
GET /web-api/global/settings/array/handling/version
GET /web-api/global/settings/currenttime
GET /web-api/global/settings/Routes
```

Phase 1 collection rule:

- Call the settings endpoint, preferring `GET /web-api/global/settings/grid` if it returns the full grid-shaped list expected for `BUS_Global_Settings`; otherwise use `GET /web-api/global/settings`.
- Store the complete serialized JSON response for each poll.
- Also maintain a queryable local per-instance settings table with one row per setting per customer/instance.
- CMS must support queries such as: “which instances have setting `X` equal to value `Y`?”

### Workflow Monitoring

Use the existing OxyGen troubleshooting chain:

```http
GET /web-api/BUS/workflows/triggers/grid?filter=(IsChild~neq~true~and~(Status~eq~'Active'~or~Status~eq~'Pending'~or~Status~eq~'Errored'~or~Status~eq~'Recovery'))
```

For each failed/recovery trigger:

```http
GET /web-api/BUS/workflows/events/grid?filter=WorkflowTriggerId~eq~<Workflow_Trigger_Id>&sort=Id-asc
GET /web-api/BUS/workflows/events/<Workflow_Event_Id>
GET /web-api/<ServiceIdentifier>/Events/Grid?filter=((ParentId~isnull~null~or~ParentId~eq~0)~and~WorkflowEventId~eq~<Workflow_Event_Id>~and~WorkflowTriggerId~eq~<Workflow_Trigger_Id>~and~JobId~eq~<JobId>)
GET /web-api/<ServiceIdentifier>/Events/<ServiceEventId>
```

---

## Recommended Repository Structure

```text
oxygen_cms/
  apps/
    api/
      src/
        auth/
        config/
        db/
        instances/
        oxyGenClient/
        polling/
        dashboard/
        workflows/
        server.ts
      tests/
    web/
      src/
        app/
        api/
        auth/
        components/
        pages/
        routes/
        styles/
      tests/
  packages/
    shared/
      src/
        types/
        validation/
  docker/
  docs/
    plans/
  .env.example
  Dockerfile
  docker-compose.yml
  README.md
```

---

## Data Model

### Core Auth / RBAC

```text
users
roles
user_roles
groups
user_groups
audit_log
```

### Instances

```text
instances
instance_groups
instance_credentials
instance_polling_config
```

`instance_credentials` must store encrypted username/password data. Do not log decrypted values.

### Health Monitoring

```text
monitor_runs
monitor_events
instance_status_snapshots
ssl_certificate_snapshots
auth_check_snapshots
api_check_snapshots
```

### OxyGen Snapshots

```text
oxygen_license_snapshots
oxygen_settings_snapshots
oxygen_instance_settings
oxygen_workflow_trigger_snapshots
oxygen_workflow_event_snapshots
oxygen_service_event_snapshots
```

#### `oxygen_license_snapshots`

Purpose: preserve the full license model returned by OxyGen.

Suggested columns:

```text
id
instance_id
monitor_run_id
collected_at
http_status
success
raw_json
error_message
created_at
```

#### `oxygen_settings_snapshots`

Purpose: preserve the full serialized response from the settings endpoint.

Suggested columns:

```text
id
instance_id
monitor_run_id
collected_at
endpoint
http_status
success
raw_json
error_message
created_at
```

#### `oxygen_instance_settings`

Purpose: maintain the latest queryable per-instance settings rows corresponding to remote `BUS_Global_Settings` data.

Suggested columns:

```text
id
instance_id
remote_setting_id nullable
setting_name
boolean_value nullable
string_value nullable
integer_value nullable
normalized_value
value_type
description nullable
editable
hidden
title nullable
setting_group nullable
controls_json nullable
variables_json nullable
documentation_url nullable
raw_json
last_seen_at
first_seen_at
last_snapshot_id
```

Recommended indexes:

```text
unique(instance_id, setting_name)
index(setting_name)
index(setting_name, normalized_value)
index(instance_id, setting_group)
```

`normalized_value` should be a string representation selected from the typed values so the CMS can answer cross-instance questions efficiently.

Example normalization:

```text
if IntegerValue is not null -> value_type = 'integer', normalized_value = IntegerValue as string
else if StringValue is not null -> value_type = 'string', normalized_value = StringValue
else -> value_type = 'boolean', normalized_value = BooleanValue as 'true'/'false'
```

---

## API Surface

### CMS Auth

```http
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/change-password
```

### Groups / Users / Roles

```http
GET    /api/users
POST   /api/users
GET    /api/users/:id
PATCH  /api/users/:id
DELETE /api/users/:id

GET    /api/groups
POST   /api/groups
PATCH  /api/groups/:id
DELETE /api/groups/:id

GET    /api/roles
```

### Instances

```http
GET    /api/instances
POST   /api/instances
GET    /api/instances/:id
PATCH  /api/instances/:id
DELETE /api/instances/:id
POST   /api/instances/:id/test-connectivity
POST   /api/instances/:id/poll-now
GET    /api/instances/:id/status
GET    /api/instances/:id/history
```

### OxyGen Data

```http
GET /api/instances/:id/license
GET /api/instances/:id/settings/raw
GET /api/instances/:id/settings
GET /api/settings/search?settingName=<name>&value=<value>
GET /api/instances/:id/workflows/triggers
GET /api/instances/:id/workflows/triggers/:triggerId
GET /api/instances/:id/workflows/events/:eventId
```

### Dashboard

```http
GET /api/dashboard/summary
GET /api/dashboard/status-by-group
GET /api/dashboard/incidents
GET /api/dashboard/settings/search?settingName=<name>&value=<value>
```

---

## Milestones

## Milestone 0 — Project Foundation

**Objective:** Establish a working app skeleton.

Tasks:

1. Create monorepo folders under `apps/api`, `apps/web`, and `packages/shared`.
2. Add TypeScript base config.
3. Add Vite React app.
4. Add Node API app with `GET /api/health`.
5. Add MySQL connection module.
6. Add migration tooling.
7. Add `.env.example`.
8. Add Docker Compose for API/web/MySQL local dev.
9. Add README local startup instructions.

Acceptance criteria:

- `docker compose up` starts MySQL and app services.
- `GET /api/health` returns OK.
- React app loads.

## Milestone 1 — Local Auth and RBAC

**Objective:** Secure the CMS with local users, roles, and group scoping.

Tasks:

1. Add user/role/group tables and migrations.
2. Add password hashing.
3. Add login/logout endpoints.
4. Add authenticated request middleware.
5. Add role authorization middleware.
6. Add group membership checks.
7. Add admin bootstrap flow.
8. Add login UI.
9. Add user/group admin UI.

Acceptance criteria:

- Admin can log in.
- Admin can create users and groups.
- Users can only see instances belonging to assigned groups.

## Milestone 1.5 — Database Provisioning and Durable Security Persistence

**Objective:** Configure/create the CMS MySQL database before first-admin setup and move security/tenant data from the in-memory review repository to durable, versioned persistence.

Tasks:

1. Convert first-run setup into a multi-step wizard: database setup, schema validation/migration, first admin creation.
2. Support connecting to an existing local/remote MySQL server.
3. Allow selecting an existing database or creating a new database.
4. Default the database name to `O2IAS_CMS`, while allowing override.
5. Support default local MySQL provisioning via Docker Compose for repeatable setup testing.
6. Prompt for the application database user/password when provisioning a local database.
7. Save database settings to local ignored application settings.
8. Add versioned schema migrations with `cms_schema_versions`.
9. Create durable tables for tenants, roles, users, groups, role assignments, group assignments, and sessions.
10. Replace the runtime in-memory auth repository with MySQL-backed persistence while preserving existing API contracts.
11. Update docs and validation gates.

Acceptance criteria:

- User cannot create the first admin until CMS is connected to a valid database and schema is current.
- User can connect to existing MySQL and select/create `O2IAS_CMS` or an overridden database name.
- User can create/configure the CMS database on a reachable local MySQL server for repeatable development testing. Deploying the MySQL service itself is handled by Docker Compose or an installer.
- Restarting the API preserves users, groups, roles, tenants, and sessions.
- Schema versions are recorded and pending migrations are applied in order.
- Existing auth/RBAC/tenant UI behavior remains unchanged after persistence is wired.

## Milestone 2 — Manual Instance Enrollment

**Objective:** Allow admins to enroll remote OxyGen instances.

Tasks:

1. Add instance schema/migrations.
2. Add encrypted credential storage.
3. Add CRUD APIs for instances.
4. Add group assignment APIs.
5. Add polling config fields.
6. Add instance list UI.
7. Add create/edit instance UI.
8. Add “Open OxyGen” action using `https://{hostname}/OPTWS/OxyGen.aspx` unless overridden.

Acceptance criteria:

- Admin can create/edit/delete an instance.
- Instance credentials are encrypted at rest.
- Instance visibility respects group permissions.

## Milestone 3 — Connectivity Test

**Objective:** Provide immediate validation during enrollment.

Tasks:

1. Implement DNS/HTTPS reachability check.
2. Implement SSL certificate inspection.
3. Implement OxyGen login check.
4. Implement simple authenticated API probe, preferably `GET /web-api/global/settings/currenttime`.
5. Return structured test results.
6. Display test results in the instance form.

Acceptance criteria:

- User can click “Test Connectivity.”
- CMS reports SSL/auth/API errors separately.
- Credentials are not exposed in logs or responses.

## Milestone 4 — Health Monitoring Engine

**Objective:** Poll instances on schedule and record health history.

Tasks:

1. Add polling scheduler.
2. Add per-instance interval and enabled/disabled flag.
3. Add concurrent polling limit.
4. Add timeout and retry policy.
5. Add jitter to avoid thundering herd.
6. Add `monitor_runs` records.
7. Add `monitor_events` records.
8. Add current status calculation.
9. Add manual “Poll Now.”

Acceptance criteria:

- CMS polls enabled instances automatically.
- Status transitions are recorded.
- Manual poll stores a normal monitor run.

## Milestone 5 — OxyGen License Collector

**Objective:** Collect license status as serialized JSON.

Tasks:

1. Add `OxyGenClient.getLicense()` using `GET /web-api/bus/license`.
2. Add `oxygen_license_snapshots` migration.
3. Store full raw serialized JSON response per poll.
4. Store error details when license collection fails.
5. Add latest license endpoint for CMS UI.
6. Add license summary card to instance detail page.

Acceptance criteria:

- Each successful poll stores license raw JSON.
- Latest license data is visible from the instance detail page.
- License collection failure does not fail the whole monitor run.

## Milestone 6 — OxyGen Settings Collector

**Objective:** Collect settings as raw JSON and maintain queryable per-instance setting rows.

Tasks:

1. Add `OxyGenClient.getGlobalSettings()`.
2. Prefer `GET /web-api/global/settings/grid`; fall back to `GET /web-api/global/settings` if needed.
3. Add `oxygen_settings_snapshots` migration.
4. Add `oxygen_instance_settings` migration.
5. Store full raw serialized JSON response per poll.
6. Parse settings rows into local `oxygen_instance_settings` rows.
7. Upsert by `(instance_id, setting_name)`.
8. Compute `normalized_value` and `value_type`.
9. Preserve `controls_json`, `variables_json`, and original row `raw_json`.
10. Add settings search API across accessible instances.
11. Add settings list/search UI.

Acceptance criteria:

- CMS stores full settings JSON snapshots.
- CMS keeps latest queryable settings by instance/customer.
- User can query which accessible instances have a specific setting/value.
- Settings collection failure does not fail the whole monitor run.

## Milestone 7 — Workflow Monitoring Collector

**Objective:** Collect OxyGen workflow trigger/event/service-event status.

Tasks:

1. Add trigger grid client call.
2. Store trigger snapshots.
3. For `Errored`/`Recovery` triggers, collect workflow event grid.
4. Store workflow event snapshots.
5. Fetch workflow event detail.
6. If service event fields are present, fetch service event grid/detail.
7. Store summarized error fields and raw JSON.
8. Add workflow status API.
9. Add workflow UI tab.

Acceptance criteria:

- Dashboard can show pending/failed/recovery workflow counts.
- Instance detail page can drill into failed/recovery triggers.
- Deep diagnostic details are preserved as raw JSON and summarized fields.

## Milestone 8 — Dashboard and UX

**Objective:** Provide clean operational visibility.

Tasks:

1. Build dashboard summary query.
2. Build status cards/table.
3. Add group filter.
4. Add status filter.
5. Add search.
6. Add instance detail route.
7. Add health tab.
8. Add license tab.
9. Add settings tab.
10. Add workflows tab.
11. Add history tab.

Acceptance criteria:

- User sees only accessible instances.
- User can identify down/degraded/auth/SSL/workflow issues quickly.
- User can launch a remote OxyGen instance in a new tab.

## Milestone 9 — Docker / HTTPS Deployment

**Objective:** Make CMS deployable as a standalone Dockerized app.

Tasks:

1. Add production Dockerfile.
2. Add docker-compose deployment example.
3. Add MySQL volume configuration.
4. Add env-based configuration.
5. Add mounted certificate/key support.
6. Add HTTPS listener configuration.
7. Add container healthcheck.
8. Document backup/restore guidance.

Acceptance criteria:

- CMS can run from Docker.
- HTTPS can be enabled via mounted cert/key.
- Required environment variables are documented.

---

## Key Design Notes

### Credentials

Remote OxyGen credentials must be encrypted at rest. Recommended environment variable:

```text
OXYGEN_CMS_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
```

Use AES-256-GCM or a well-reviewed equivalent. Never write decrypted credentials to logs, audit records, or API responses.

### Polling Reliability

Each poll should be resilient:

- Per-check timeout.
- Per-instance timeout.
- Partial failures allowed.
- Store failure details per collector.
- Never let one bad instance block the scheduler.
- Add backoff after repeated failures.

### Read-Only Boundary

All OxyGen collectors must use read-only calls for Phase 1. License activate/sync/deactivate/update routes exist but must not be used by CMS Phase 1.

### Settings Queryability

Raw settings JSON alone is not enough. The CMS must maintain local queryable rows so support/partner users can ask cross-customer questions such as:

```text
Show all instances where Database_Concurrency_Limit = 20.
Show all instances where Support_Email_Address contains optbusinessservices.com.
Show all instances where a setting is hidden/editable.
```

---

## Immediate Next Implementation Order

1. Project scaffold.
2. Database/migrations.
3. Auth/RBAC/group model.
4. Instance CRUD and encrypted credentials.
5. Connectivity test.
6. Polling engine.
7. License collector.
8. Settings collector and queryable `oxygen_instance_settings` table.
9. Workflow collector.
10. Dashboard/detail UI.
11. Docker/HTTPS deployment.
