# Processing Errors OxyGen Parity Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace the failed embedded-grid approach with a CMS-native **Processing Errors** module that provides 100% feature parity with the OxyGen frontend trigger grid, workflow event grid, service event grid, event details page/dialog, and all related user actions, while preserving the OxyGen CMS shell, Tenant/RBAC controls, and operational safety for very large OxyGen datasets.

**Architecture:** Use **Option B: typed CMS API endpoints**. The browser never calls arbitrary OxyGen instance URLs and never receives remote OxyGen credentials/cookies. OxyGen CMS API exposes a bounded, instance-aware Processing Errors API that enforces Tenant/RBAC, authenticates to the selected OxyGen instance server-side, forwards schema/grid/action calls with server-side paging/filtering/sorting, and returns only the requested page/detail/action result. The CMS web app ports the OxyGen frontend behavior and interaction model into CMS-styled Kendo/ManagedGrid components rather than embedding OxyGen or wholesale copying its app shell.

**Tech Stack:** OxyGen CMS API/web monorepo, TypeScript, React, KendoReact Grid, existing CMS auth/RBAC/Tenant scope, server-side OxyGen form-session authentication, OxyGen `/web-api/*` Processing endpoints, Vitest/TypeScript build, OpenAPI/Wiki/data dictionary closeout via `oxygen-docs-custodian`.

---

## Current Context

Brad approved Option B and added these requirements:

1. Use typed CMS endpoints rather than a generic proxy.
2. Port **all** OxyGen Processing user actions as a milestone, including RBAC around those actions.
3. Target **100% feature parity** with the OxyGen frontend behavior for:
   - workflow trigger grid
   - workflow event grid
   - service event grid
   - event details page/dialog
   - all row/bulk/actions/details/download/message/recovery/cancel/restore flows exposed by `oxygen_frontend`
4. Keep the OxyGen CMS shell, but expect the shell and grid layouts to keep iterating as features move in.
5. Treat large datasets as a first-class design constraint: some instances can have tens or hundreds of thousands of processing rows. Avoid massive API calls; preserve server-side filters, paging, sorting, virtual scrolling/windowed reads, and defaults that narrow operational scope.
6. Keep the dashboard name **Processing Errors**.
7. After each main repo code commit/push, hand off to `oxygen-docs-custodian` asynchronously with commit SHA, changed behavior, changed files, validation, and docs expectations.

## OxyGen Frontend Source Inventory

Reference repo: `/home/administrator/oxygen_frontend/apps/oxygen/src`

### Trigger grid

- UI: `features/Processing/ui/Triggers/Triggers.tsx`
- Actions: `features/Processing/ui/Triggers/Actions/Actions.tsx`
- Row actions: `features/Processing/ui/Triggers/ActionsCell/ActionsCell.tsx`
- Child rows: `features/Processing/ui/Triggers/ChildTriggers/ChildTriggers.tsx`
- Processing state: `features/Processing/ui/Triggers/Processing/Processing.tsx`
- Dialog route/filter helpers: `features/Processing/ui/dialogs/Trigger/Trigger.tsx`
- Entity/API/types:
  - `entities/Trigger/Trigger.api.ts`
  - `entities/Trigger/Trigger.interface.ts`
  - `features/Processing/ui/Triggers/api/getTriggersSchema.ts`

OxyGen endpoints:

```text
GET  /web-api/BUS/workflows/triggers/schema
GET  /web-api/BUS/workflows/triggers/grid?...DataSourceRequest
POST /web-api/BUS/workflows/triggers/{id}/cancel?isParent={bool}
POST /web-api/BUS/workflows/triggers/cancel?...DataSourceRequest
```

Important behavior:

- Schema-driven columns via OxyGen schema endpoint.
- Parent grid filters `IsChild neq true`.
- Child grid filters `IsChild eq true` and `TriggerGroupId eq parentId`.
- Search fields: `WorkflowId`, `WorkflowTriggerId`, `ServiceIdentifier`, `JobId`, `Status`.
- Parent rows styled when `IsParent && ChildTriggers`.
- Bulk cancel uses the current grid state with `skip: 0`, `take: total`; this is dangerous on huge datasets and needs guarded CMS behavior.

### Workflow event grid

- UI: `features/Processing/ui/TriggerEvents/TriggerEvents.tsx`
- Row actions: `features/Processing/ui/TriggerEvents/ActionsCell/ActionsCell.tsx`
- Cancel action: `features/Processing/ui/TriggerEvents/CancelEvent/CancelEvent.tsx`
- Dialog route/filter helper: `features/Processing/ui/dialogs/TriggerEvent/TriggerEvent.tsx`
- Entity/API/types:
  - `entities/TriggerEvent/TriggerEvent.api.ts`
  - `entities/TriggerEvent/TriggerEvent.interface.ts`
  - `features/Processing/ui/TriggerEvents/api/getTriggerEventsSchema.ts`

OxyGen endpoints:

```text
GET  /web-api/BUS/workflows/events/schema
GET  /web-api/BUS/workflows/events/grid?...DataSourceRequest
POST /web-api/BUS/workflows/events/{id}/recovery?triggerId={triggerId}
POST /web-api/BUS/workflows/events/{id}/cancel?action={deleteRecoveryFile}
```

Important behavior:

- Schema-driven columns.
- Sorts by `Id asc` in the OxyGen frontend API helper.
- Search fields: `WorkflowId`, `WorkflowTriggerId`, `ServiceIdentifier`, `Status`.
- Row actions include recovery/cancel paths.

### Service event grid

- UI: `features/Processing/ui/JobEvents/JobEvents.tsx`
- Context/provider: `features/Processing/ui/JobEvents/JobEvents.provider.tsx`
- Row actions: `features/Processing/ui/JobEvents/ActionsCell/ActionsCell.tsx`
- Child rows: `features/Processing/ui/JobEvents/ChildEvents/ChildEvents.tsx`
- Queue/restore action: `features/Processing/ui/JobEvents/QueueAction/QueueAction.tsx`
- Entity/API/types:
  - `entities/JobEvent/JobEvent.api.ts`
  - `entities/JobEvent/interfaces/JobEvent.interface.ts`
  - `entities/JobEvent/interfaces/EventDetails.interface.ts`

OxyGen endpoints:

```text
GET  /web-api/{ServiceIdentifier}/Events/Schema
GET  /web-api/{ServiceIdentifier}/Events/Grid?...DataSourceRequest
GET  /web-api/{ServiceIdentifier}/Events/{eventId}
POST /web-api/WHE/events/queue/{eventId}
POST /web-api/WHE/events/queue
```

Important behavior:

- Schema-driven columns per `ServiceIdentifier`.
- Parent grid filters `(ParentId is null OR ParentId eq 0)`.
- Child grid filters `ParentId eq parentId`.
- Search fields: `WorkflowId`, `WorkflowTriggerId`, `WorkflowEventId`, `ServiceIdentifier`, `JobId`, `Status`.
- `EMM` and `WHE` have wider actions.
- Queue/restore action is service-specific; initially appears WHE-specific.

### Event details and message/file actions

- Details dialog: `features/Processing/ui/dialogs/JobEventDetails/JobEventDetails.tsx`
- Details hook: `features/Processing/ui/dialogs/JobEventDetails/useJobEventDetails.ts`
- Field renderers:
  - `FieldList/FieldList.tsx`
  - `IdAndNameField/IdAndNameField.tsx`
  - `DetailField/DetailField.tsx`
  - `ErrorField/ErrorField.tsx`
  - `DownloadField/DownloadField.tsx`
  - `ViewMessage/ViewMessage.tsx`
- Message dialog/actions:
  - `features/Processing/ui/dialogs/JobEventMessage/JobEventMessage.tsx`
  - `OriginalMessage/OriginalMessage.tsx`
  - `ReceiptControl/ReceiptControl.tsx`
  - `EmailErrors/EmailErrors.tsx`
  - `EMMMessage/EMMMessage.tsx`
  - `AttachmentControl/AttachmentControl.tsx`
- Details API: `entities/JobEvent/JobEvent.api.ts`

OxyGen endpoints identified so far:

```text
GET /web-api/{ServiceIdentifier}/Events/{eventId}
GET /web-api/{ServiceIdentifier}/Events/{eventId}/{fileName}/File
```

Additional EMM/WHE message endpoints must be inventoried in the first milestone before action parity work starts.

---

## Non-Negotiable Performance Rules

These rules apply to every milestone.

1. **Never fetch all rows by default.** All grids must use server-side paging/windowing.
2. **Preserve OxyGen Kendo DataSourceRequest semantics.** CMS should forward or safely translate `skip`, `take`, `sort`, `filter`, and search parameters to OxyGen grid endpoints.
3. **Hard cap `take`.** CMS API must clamp page/window sizes. Suggested starting cap: `take <= 250` for standard paging and configurable later if virtual scrolling requires larger windows.
4. **No unbounded bulk action without guardrails.** Bulk cancel/restore must require explicit filter scope, total preview, confirmation, RBAC permission, and possibly a backend batch plan. Avoid immediately forwarding `take=total` if `total` is huge.
5. **Default filters should be narrow.** Processing Errors entry points should default to active/error/recovery/recent records rather than historical all-time data.
6. **Virtual scrolling must remain server-driven.** If used, it should request only visible windows and not materialize massive arrays in browser memory.
7. **Details fetch on demand only.** Service event details, files, and messages load only when a user selects/opens a row/action.
8. **Schema caching is allowed; grid data caching should be conservative.** Cache OxyGen schema per instance/service briefly; do not cache massive grid responses unless there is a specific operational reason.
9. **Add request observability.** Log OxyGen endpoint, instance, bounded page size, duration, status, and row total for diagnostics, without secrets/cookies/raw payloads.
10. **Operational failure must be graceful.** Remote timeout/auth/API errors should show as CMS-safe grid errors and must not lock the shell.

---

## Security / RBAC Model

Introduce explicit permissions rather than hiding buttons only in the UI.

Suggested permission codes:

```text
processing.errors.view
processing.triggers.view
processing.triggers.cancel
processing.triggers.cancelBulk
processing.workflowEvents.view
processing.workflowEvents.recover
processing.workflowEvents.cancel
processing.serviceEvents.view
processing.serviceEvents.details.view
processing.serviceEvents.files.download
processing.serviceEvents.messages.view
processing.serviceEvents.restore
processing.serviceEvents.restoreBulk
processing.actions.audit.view
```

Rules:

- View permissions gate every CMS API route server-side.
- Action permissions gate remote mutating OxyGen operations server-side.
- Tenant/global visibility rules determine which instances a user can inspect or act on.
- Every mutating action must create a CMS audit/application log row with instance, Tenant, actor, action, target IDs, outcome, duration, and sanitized remote result.
- Bulk actions require stronger permissions than row actions.
- Bulk actions need confirmation and scope preview.
- Do not expose stored OxyGen credentials or OxyGen session cookies to browser code.

---

## Milestone 0: Discovery, Parity Matrix, and Shell/API Contract Plan

**Objective:** Produce a complete parity inventory before code implementation so no OxyGen frontend functionality is missed.

**Files:**

- Read/reference:
  - `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/**`
  - `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/Trigger/**`
  - `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/TriggerEvent/**`
  - `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/JobEvent/**`
  - `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/QueueEntry/**`
  - `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/ProcessingState/**`
- Create:
  - `docs/plans/processing-errors-oxygen-parity-inventory.md`

**Tasks:**

1. Inventory every Processing grid/component/dialog/action in `oxygen_frontend`.
2. Inventory every OxyGen endpoint used by those components.
3. Capture request methods, query/body shapes, response shapes, schema dependencies, and action side effects.
4. Capture feature parity checklist:
   - trigger grid columns/schema/search/sort/filter/page/detail/action/bulk action behavior
   - child trigger expansion
   - workflow event grid columns/schema/search/sort/filter/page/action behavior
   - recovery/cancel action behavior and confirm dialogs
   - service event grid columns/schema/search/sort/filter/page/detail/action behavior
   - child service event expansion
   - event details grouping/advanced mode
   - files/download behavior
   - EMM message view behavior
   - WHE restore/queue behavior
   - processing state labels/status rendering
5. Identify CMS shell/layout changes needed for large multi-grid workflow.
6. Identify OxyGen CMS route names and UI labels. User-facing label is **Processing Errors** even if an internal route still says workflow-errors.
7. Define performance defaults and maximum page/window sizes.

**Validation:**

```bash
cd /home/administrator/workspace/oxygen_cms
git diff --check
```

**Review gate:** Brad reviews and approves parity matrix before API implementation.

**Commit suggestion:**

```bash
git add docs/plans/processing-errors-oxygen-parity-inventory.md
git commit -m "docs: inventory processing errors oxygen parity"
```

**Custodian handoff:** After push, hand off the plan commit to `oxygen-docs-custodian` for roadmap/Wiki planning sync.

---

## Milestone 1: Instance-Aware OxyGen Processing Client and Typed Read-Only API Foundation

**Objective:** Add a bounded CMS API adapter for OxyGen Processing schema/grid/detail reads without implementing the full UI yet.

**Likely files:**

- Create:
  - `apps/api/src/processing/oxygenProcessingClient.ts`
  - `apps/api/src/processing/processingDataSourceRequest.ts`
  - `apps/api/src/processing/processingRoutes.ts`
  - `apps/api/src/processing/types.ts`
  - `apps/api/tests/processingRoutes.test.ts`
  - `apps/api/tests/oxygenProcessingClient.test.ts`
- Modify:
  - `apps/api/src/server.ts` or current route registration composition file
  - `apps/api/src/auth/permissions.ts` or current permission catalog
  - `docs/openapi.yaml` only after route contract is stable

**Typed CMS endpoints:**

```http
GET /api/instances/:instanceId/processing/triggers/schema
GET /api/instances/:instanceId/processing/triggers/grid
GET /api/instances/:instanceId/processing/triggers/:triggerId/children

GET /api/instances/:instanceId/processing/workflow-events/schema
GET /api/instances/:instanceId/processing/workflow-events/grid

GET /api/instances/:instanceId/processing/service-events/:serviceIdentifier/schema
GET /api/instances/:instanceId/processing/service-events/:serviceIdentifier/grid
GET /api/instances/:instanceId/processing/service-events/:serviceIdentifier/:eventId
GET /api/instances/:instanceId/processing/service-events/:serviceIdentifier/:eventId/children
```

**Implementation rules:**

1. Enforce instance visibility/Tenant scope before remote calls.
2. Enforce read permissions server-side.
3. Authenticate to the selected OxyGen instance server-side.
4. Forward only allowlisted OxyGen endpoints.
5. Sanitize/validate `serviceIdentifier` to an allowlisted token pattern such as `^[A-Za-z0-9_-]+$`.
6. Clamp paging/window sizes.
7. Preserve `skip`, `take`, `sort`, and `filter` behavior.
8. Return OxyGen grid shape as `{ data, total }` or a CMS-normalized equivalent, but keep schema-driven fields intact.
9. Unit test the forwarded endpoint path and DataSourceRequest query construction.
10. Unit test that unbounded `take` is clamped.
11. Unit test Tenant/permission denial.
12. Unit test auth retry behavior if the current remote auth client supports retry; otherwise record retry as follow-up.

**Performance acceptance criteria:**

- No API route returns all rows by default.
- `take` is required or defaults to a small safe value.
- `take` above cap is reduced or rejected.
- Filters are passed through, not applied by loading all data in CMS memory.

**Validation:**

```bash
cd /home/administrator/workspace/oxygen_cms
npm --workspace @oxygen-cms/api test -- --run tests/processingRoutes.test.ts tests/oxygenProcessingClient.test.ts
npm --workspace @oxygen-cms/api run typecheck
npm run typecheck
```

**Review gate:** API route contract and performance guardrails reviewed before UI work.

---

## Milestone 2: Processing Errors Shell and Read-Only Trigger Grid

**Objective:** Replace the embedded-grid idea with a CMS-native trigger grid that mirrors OxyGen trigger grid behavior and scales to huge datasets.

**Likely files:**

- Create:
  - `apps/web/src/features/processing-errors/ProcessingErrorsPage.tsx`
  - `apps/web/src/features/processing-errors/api.ts`
  - `apps/web/src/features/processing-errors/types.ts`
  - `apps/web/src/features/processing-errors/schemaColumns.ts`
  - `apps/web/src/features/processing-errors/TriggerGrid.tsx`
  - `apps/web/src/features/processing-errors/ChildTriggerGrid.tsx`
  - `apps/web/src/features/processing-errors/processingErrors.css` or integrate into existing style modules
- Modify:
  - `apps/web/src/app/App.tsx` or current route registry
  - shared grid styles only where needed

**Features:**

1. Route/page label: **Processing Errors**.
2. Instance context in header.
3. Refresh button and last-refreshed time.
4. Trigger grid uses server paging/sorting/filtering.
5. Default filter is operationally safe: active/error/recovery/recent, not all-time history.
6. Schema-driven columns from OxyGen trigger schema.
7. Search fields from OxyGen frontend: `WorkflowId`, `WorkflowTriggerId`, `ServiceIdentifier`, `JobId`, `Status`.
8. Row selection drives downstream panes.
9. Parent/child trigger expansion uses server-side child call, not preloaded children.
10. No embedded iframe/OxyGen grid remains as primary UX.
11. Dark CMS style and ManagedGrid toolbar conventions.
12. Horizontal scroll for wide schema columns.
13. Optional virtual scrolling only if it remains server-windowed.

**Performance acceptance criteria:**

- Initial page load requests only schema + first trigger page/window.
- Child rows fetch only on expand.
- Changing filters cancels/ignores stale requests.
- UI does not store historical all-row arrays.

**Validation:**

```bash
cd /home/administrator/workspace/oxygen_cms
npm --workspace @oxygen-cms/web run typecheck
npm --workspace @oxygen-cms/web run build
npm run typecheck
```

Add focused frontend/source assertions or component tests if the repo already has a web test pattern for pages.

**Review gate:** Brad reviews Trigger Grid UX before workflow/service event panes are added.

---

## Milestone 3: Workflow Event Grid Driven by Selected Trigger

**Objective:** Add OxyGen-equivalent workflow event grid filtered by the selected trigger and safely server-paged.

**Likely files:**

- Create/modify:
  - `apps/web/src/features/processing-errors/WorkflowEventGrid.tsx`
  - `apps/web/src/features/processing-errors/api.ts`
  - `apps/web/src/features/processing-errors/schemaColumns.ts`
  - API tests from Milestone 1 extended if needed

**Features:**

1. Selecting a trigger loads workflow events filtered by `WorkflowTriggerId`.
2. Schema-driven columns from `/web-api/BUS/workflows/events/schema`.
3. Grid endpoint forwards Kendo DataSourceRequest to `/web-api/BUS/workflows/events/grid`.
4. Preserve OxyGen default sort behavior by `Id asc` unless Brad chooses a different default.
5. Search/filter fields: `WorkflowId`, `WorkflowTriggerId`, `ServiceIdentifier`, `Status`.
6. Workflow event selection drives service event context.
7. Show `LastError`, `ServiceIdentifier`, `ServiceEventId`, status, workflow/trigger IDs clearly.
8. Preserve current Processing Errors aggregated error display as a summary pane, but do not let it replace the real OxyGen grids.

**Performance acceptance criteria:**

- Workflow events are not loaded until a trigger is selected or an explicit route filter exists.
- Grid loads only requested page/window.
- Filters are server-side.

**Validation:**

```bash
cd /home/administrator/workspace/oxygen_cms
npm --workspace @oxygen-cms/api test -- --run tests/processingRoutes.test.ts
npm --workspace @oxygen-cms/web run typecheck
npm --workspace @oxygen-cms/web run build
```

**Review gate:** Brad reviews trigger-to-workflow drilldown before service event grid.

---

## Milestone 4: Service Event Grid and Child Service Event Expansion

**Objective:** Add OxyGen-equivalent service event grid filtered from selected workflow event/service context, including child event expansion.

**Likely files:**

- Create/modify:
  - `apps/web/src/features/processing-errors/ServiceEventGrid.tsx`
  - `apps/web/src/features/processing-errors/ChildServiceEventGrid.tsx`
  - `apps/web/src/features/processing-errors/api.ts`
  - `apps/api/src/processing/processingRoutes.ts`
  - `apps/api/tests/processingRoutes.test.ts`

**Features:**

1. Use selected workflow event `ServiceIdentifier` to load service schema.
2. Load `/web-api/{ServiceIdentifier}/Events/Grid` through typed CMS API.
3. Parent rows filter `(ParentId is null OR ParentId eq 0)`.
4. Child expansion loads child rows by `ParentId` on demand.
5. Search/filter fields: `WorkflowId`, `WorkflowTriggerId`, `WorkflowEventId`, `JobId`, `Status`.
6. Row selection drives event details panel.
7. Respect service-specific action availability like EMM/WHE wider action column behavior.

**Performance acceptance criteria:**

- Service event grid is not loaded until there is selected service context.
- Service schema can be cached per instance/service briefly.
- Child events are loaded only on expand.
- No all-history service event load.

**Validation:**

```bash
cd /home/administrator/workspace/oxygen_cms
npm --workspace @oxygen-cms/api test -- --run tests/processingRoutes.test.ts
npm --workspace @oxygen-cms/web run typecheck
npm --workspace @oxygen-cms/web run build
```

**Review gate:** Brad reviews trigger → workflow event → service event drilldown flow.

---

## Milestone 5: Event Details Page/Panel, Files, Messages, and Advanced Mode

**Objective:** Port the full OxyGen event details experience into CMS dark styling.

**Likely files:**

- Create:
  - `apps/web/src/features/processing-errors/EventDetailsPanel.tsx`
  - `apps/web/src/features/processing-errors/EventFieldList.tsx`
  - `apps/web/src/features/processing-errors/EventIdAndNameField.tsx`
  - `apps/web/src/features/processing-errors/EventErrorField.tsx`
  - `apps/web/src/features/processing-errors/EventDownloadField.tsx`
  - `apps/web/src/features/processing-errors/EventMessageViewer.tsx`
- Modify:
  - `apps/web/src/features/processing-errors/api.ts`
  - `apps/api/src/processing/processingRoutes.ts`
  - `apps/api/tests/processingRoutes.test.ts`

**Features:**

1. Load details on selected service event only.
2. Render schema-grouped details equivalent to OxyGen:
   - Workflow
   - Module
   - Job
   - Event
   - Triggered
   - Status
   - File
   - Error
   - additional groups as present in schema
3. Add advanced toggle equivalent to OxyGen advanced state.
4. Error fields are prominent, red, and copyable.
5. Support file download through CMS API, not direct OxyGen URL.
6. Support EMM message view if present in OxyGen parity inventory.
7. Support WHE/EMM service-specific details/actions as identified in Milestone 0.
8. Use safe text/JSON rendering; avoid injecting HTML from remote payloads.
9. Do not load files/messages until user opens them.

**Performance acceptance criteria:**

- Details endpoint called only on selection/open.
- File download endpoint streams or returns one file only.
- Message viewer fetches one message/detail only.

**Validation:**

```bash
cd /home/administrator/workspace/oxygen_cms
npm --workspace @oxygen-cms/api test -- --run tests/processingRoutes.test.ts
npm --workspace @oxygen-cms/web run typecheck
npm --workspace @oxygen-cms/web run build
```

**Review gate:** Brad validates SQL/module error detail and file/message display behavior.

---

## Milestone 6: User Actions and RBAC Parity

**Objective:** Port every OxyGen Processing user action exposed by the source frontend, with CMS RBAC, confirmations, scope previews, audit logs, and operational safeguards.

**Likely files:**

- Create/modify:
  - `apps/api/src/processing/processingActions.ts`
  - `apps/api/src/processing/processingRoutes.ts`
  - `apps/api/tests/processingActions.test.ts`
  - `apps/api/tests/permissions.test.ts` or current RBAC test file
  - `apps/web/src/features/processing-errors/TriggerActions.tsx`
  - `apps/web/src/features/processing-errors/WorkflowEventActions.tsx`
  - `apps/web/src/features/processing-errors/ServiceEventActions.tsx`
  - `apps/web/src/features/processing-errors/BulkActionConfirmation.tsx`
  - permission catalog/migration files as needed
  - app log/audit modules as needed

**Actions to port/capture from OxyGen frontend:**

Trigger actions:

```text
POST /web-api/BUS/workflows/triggers/{id}/cancel?isParent={bool}
POST /web-api/BUS/workflows/triggers/cancel?...DataSourceRequest
```

Workflow event actions:

```text
POST /web-api/BUS/workflows/events/{id}/recovery?triggerId={triggerId}
POST /web-api/BUS/workflows/events/{id}/cancel?action={deleteRecoveryFile}
```

Service event actions:

```text
POST /web-api/WHE/events/queue/{eventId}
POST /web-api/WHE/events/queue
```

Details/files/messages actions:

```text
GET /web-api/{ServiceIdentifier}/Events/{eventId}/{fileName}/File
```

Additional message/attachment/receipt/email-error endpoints must be added from Milestone 0 inventory before this milestone is considered complete.

**RBAC permissions:**

```text
processing.triggers.cancel
processing.triggers.cancelBulk
processing.workflowEvents.recover
processing.workflowEvents.cancel
processing.serviceEvents.restore
processing.serviceEvents.restoreBulk
processing.serviceEvents.files.download
processing.serviceEvents.messages.view
```

**Action safety requirements:**

1. Hide disabled actions in UI only after server permissions are enforced.
2. Every action route checks Tenant/instance visibility and permission.
3. Mutating actions require confirmation text/dialog.
4. Bulk actions require a server preview of filter scope and affected count.
5. Bulk action with high affected count should require elevated permission and explicit typed confirmation.
6. Audit every remote mutation in CMS logs.
7. Do not run unbounded action loops synchronously from the browser request if affected count is large; create a bounded batch job or require staged execution if needed.
8. Remote failure returns sanitized message and keeps grid state reloadable.
9. After action success, refresh only affected grid windows/details, not every historical dataset.

**Performance acceptance criteria:**

- Bulk actions do not fetch all rows into CMS/web memory.
- Bulk action scope uses filter preview and bounded remote action semantics. If OxyGen only supports all-filter bulk operations, CMS must guard the operation with count preview and confirmation before forwarding.
- Actions do not trigger all-grid reloads across unrelated panes.

**Validation:**

```bash
cd /home/administrator/workspace/oxygen_cms
npm --workspace @oxygen-cms/api test -- --run tests/processingActions.test.ts tests/processingRoutes.test.ts
npm --workspace @oxygen-cms/web run typecheck
npm --workspace @oxygen-cms/web run build
npm run typecheck
```

**Review gate:** Brad reviews action/RBAC matrix before enabling bulk operations broadly.

---

## Milestone 7: Large-Dataset Optimization and Runtime Hardening

**Objective:** Prove the module remains safe on instances with tens/hundreds of thousands of rows.

**Likely files:**

- Create/modify:
  - `apps/api/tests/processingPerformanceGuards.test.ts`
  - `apps/web/src/features/processing-errors/useServerGridState.ts`
  - `apps/web/src/features/processing-errors/gridDefaults.ts`
  - API observability/logging files as needed

**Tasks:**

1. Add tests for `take` clamping on every grid endpoint.
2. Add tests that omit/invalid `take` defaults to a safe page size.
3. Add tests that child/detail endpoints require explicit parent/event IDs.
4. Add request timeout handling per remote call type.
5. Add cancellation/ignore-stale behavior on frontend filter changes.
6. Add debounce for text search/filter edits.
7. Add grid default filter presets:
   - Active / In Recovery / Error
   - Recent
   - By Workflow Trigger ID
   - By Job ID
   - By Status
8. Add optional virtual scrolling only if it remains server-windowed and reviewable.
9. Add metrics/logging for remote request duration and row totals.
10. Document operational guidance: avoid all-time broad queries on production/local instances.

**Validation:**

```bash
cd /home/administrator/workspace/oxygen_cms
npm --workspace @oxygen-cms/api test -- --run tests/processingPerformanceGuards.test.ts tests/processingRoutes.test.ts
npm --workspace @oxygen-cms/web run typecheck
npm --workspace @oxygen-cms/web run build
```

**Review gate:** Brad reviews large-dataset defaults before broad customer use.

---

## Milestone 8: CMS Shell Iteration for Multi-Grid Processing Workflows

**Objective:** Improve the OxyGen CMS shell enough to comfortably host the Processing Errors parity UI.

**Likely files:**

- Modify:
  - `apps/web/src/app/App.tsx` or current route/layout host
  - `apps/web/src/styles.css`
  - shared grid shell/ManagedGrid files

**Tasks:**

1. Ensure Processing Errors has a dedicated scroll container.
2. Ensure sidebar/header remain fixed without trapping grid scrollbars.
3. Support horizontal grid scrolling for schema-wide OxyGen grids.
4. Support split panes/tabs on desktop.
5. Support step navigation on mobile:
   - Triggers
   - Workflow Events
   - Service Events
   - Details
6. Ensure toolbar controls anchor to visible content area, not internal table width.
7. Ensure bottom nav/mobile clearance does not hide grid rows/actions.
8. Ensure action menus are not clipped by grid overflow.
9. Add loading overlays that do not imply all data has loaded.
10. Add empty/error states specific to remote OxyGen failures.

**Validation:**

```bash
cd /home/administrator/workspace/oxygen_cms
npm --workspace @oxygen-cms/web run typecheck
npm --workspace @oxygen-cms/web run build
```

If browser automation is available, add visual/screenshot checks for desktop and mobile breakpoints before calling UX verified.

**Review gate:** Brad live-reviews shell/grid behavior.

---

## Milestone 9: Full Parity Validation Against OxyGen Frontend

**Objective:** Confirm CMS behavior matches OxyGen frontend functionality before retiring the embedded-grid path.

**Tasks:**

1. Build a parity checklist from Milestone 0 and mark every item:
   - implemented
   - validated
   - intentionally different due to CMS shell/RBAC/security
   - blocked by OxyGen endpoint behavior
2. Compare CMS calls against OxyGen frontend endpoints and query semantics.
3. Verify parent/child trigger expansion.
4. Verify workflow event filters/actions.
5. Verify service event filters/actions/details.
6. Verify files/messages/details behavior.
7. Verify all row actions.
8. Verify all bulk actions with safe low-count filters.
9. Verify RBAC deny/allow cases.
10. Verify large-grid behavior with mock large totals.
11. Verify real dev instance smoke where safe.
12. Remove or hide the failed embedded-grid UX.

**Validation:**

```bash
cd /home/administrator/workspace/oxygen_cms
npm run typecheck
npm run build
npm --workspace @oxygen-cms/api test -- --run tests/processingRoutes.test.ts tests/processingActions.test.ts tests/processingPerformanceGuards.test.ts
```

Run an ad-hoc `/tmp/hermes-verify-*` script for final parity/source/doc checks if the system checker does not recognize the focused commands.

**Review gate:** Brad signs off that CMS Processing Errors provides 100% feature parity for required OxyGen Processing operations.

---

## Milestone 10: Documentation, OpenAPI, Data Dictionary, Roadmap, and Custodian Closeout

**Objective:** Keep docs aligned without blocking the next development stream.

**Main lane tasks:**

1. Update main repo OpenAPI for typed Processing endpoints.
2. Update data dictionary/API contract docs as route shapes stabilize.
3. Commit/push main repo code/docs after validation.
4. Immediately hand off to `oxygen-docs-custodian` asynchronously.

**Custodian handoff must include:**

- commit SHA
- behavior summary
- changed files
- API route list
- RBAC permission list
- validation commands/results
- feature parity checklist state
- what docs/Wiki/OpenAPI/data dictionary/roadmap pages likely need updates

**Custodian-owned docs:**

- Wiki Current Status
- Wiki User Guide
- Wiki OpenAPI Spec
- Wiki Data Dictionary
- Wiki Phase/Roadmap pages
- any Processing Errors parity plan/status page

**Validation:**

Custodian runs:

```bash
cd /home/administrator/workspace/oxygen_cms && git diff --check
cd /home/administrator/workspace/oxygen_cms.wiki && git diff --check
```

If OpenAPI changes:

```bash
cd /home/administrator/workspace/oxygen_cms
python3 - <<'PY'
from pathlib import Path
import yaml
p = Path('docs/openapi.yaml')
yaml.safe_load(p.read_text())
print('OpenAPI YAML parsed:', p)
PY
```

For docs-only changes without canonical docs test, custodian creates a `/tmp/hermes-verify-*` ad-hoc verifier and reports it as ad-hoc verification only.

---

## Suggested Implementation Order

1. Milestone 0: inventory/parity matrix.
2. Milestone 1: typed read-only API foundation.
3. Milestone 2: trigger grid UI.
4. Milestone 3: workflow event grid UI.
5. Milestone 4: service event grid UI.
6. Milestone 5: event details/files/messages.
7. Milestone 6: actions + RBAC.
8. Milestone 7: large-data hardening.
9. Milestone 8: shell UX iteration.
10. Milestone 9: final parity validation.
11. Milestone 10: docs/custodian closeout after each pushed code checkpoint.

Note: Milestones 7 and 8 should not wait until the very end if performance/shell problems appear during Milestones 2-5. Insert mini-hardening checkpoints whenever a grid reveals performance or layout risk.

---

## Open Questions to Resolve During Milestone 0

1. Which OxyGen frontend actions beyond identified cancel/recovery/queue/download/message are present in nested components?
2. Does OxyGen provide a safe count/preview endpoint for bulk actions, or must CMS derive preview from grid totals?
3. Should bulk actions initially be disabled except for SystemAdmin until action audit is proven?
4. What page-size caps are acceptable for local/customer instances?
5. Is virtual scrolling desired immediately, or should initial implementation use classic server paging with strong filters?
6. Do we need short-lived OxyGen session caching per CMS user/instance, or per request login is sufficient for first implementation?
7. Which Processing actions should be audited as security events vs application logs?
8. Should the route remain `/Workflow-Errors/Entity/{instanceId}` internally or migrate to `/Processing-Errors/Entity/{instanceId}` with backward-compatible alias?

---

## Definition of Done for 100% Feature Parity

The Processing Errors parity project is done only when:

- Every OxyGen Processing grid/page/dialog/action from the inventory is represented in CMS, or explicitly marked intentionally different with Brad approval.
- Every remote OxyGen API call is behind a typed CMS endpoint, not a generic browser proxy.
- Every CMS route enforces Tenant visibility and RBAC server-side.
- Every mutating action is audited and confirmed.
- Every grid uses server paging/filtering/sorting/windowing and never loads full historical datasets by default.
- Large-data guardrail tests pass.
- Main repo typecheck/build/API tests pass for touched areas.
- Brad reviews the UI in the CMS shell.
- The failed embedded-grid approach is removed or demoted.
- `oxygen-docs-custodian` has reviewed the final code commits and pushed Wiki/docs/OpenAPI/data dictionary/roadmap updates.
