# Instance CSV Import/Export Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add SystemAdmin-only CSV export and import for OxyGen CMS instances, supporting create-or-update by `instance_guid`.

**Architecture:** Keep the feature narrow and API-driven. Export streams current persisted instance configuration as CSV with `instance_guid` mapped from the existing instance `id`; import accepts CSV text uploaded by the browser, validates every row, and upserts rows by `instance_guid` without exporting stored passwords. Implement reusable CSV parsing/serialization and row mapping in the API, then add compact Import/Export actions to the existing Instances `ManagedGrid` toolbar.

**Tech Stack:** Fastify + TypeScript + Zod + Vitest API tests; React + Kendo buttons + hidden file input for UI; no new CSV dependency unless the hand-rolled parser proves insufficient in tests.

---

## Current Context / Constraints

- Workspace: `/home/administrator/workspace/oxygen_cms`.
- Current branch had existing uncommitted work before this plan was written. Implementation must preserve unrelated local changes.
- Existing instance API lives in:
  - `apps/api/src/instances/registerInstanceRoutes.ts`
  - `apps/api/src/instances/schemas.ts`
  - `apps/api/src/instances/types.ts`
  - `apps/api/src/instances/inMemoryInstanceRepository.ts`
  - `apps/api/src/instances/mysqlInstanceRepository.ts`
- Existing create/update fields:
  - `id`, `name`, `description`, `tenantId`, `protocol`, `host`, `port`, `hostname`, `username`, `password`, `pollingIntervalSeconds`, `isEnabled`
- Existing public instance type uses `id`; CSV should expose it as `instance_guid` to match Brad’s terminology/request.
- Current UI is a single `apps/web/src/app/App.tsx` with the Instances grid at line ~1170 and instance save logic around line ~661.
- No CSV parser/serializer dependency is currently installed.
- Existing auth model: `GET /api/instances` is signed-in scoped; create/update/delete require `SystemAdmin`. Import/export should require `SystemAdmin` to avoid leaking full instance inventory/configuration to scoped non-admin users.
- Tenant terminology must remain “Tenant”. Do not use “partner”.
- Tenant assignment is immutable on edit in the UI. Import updates should not silently move an existing instance between tenants unless Brad explicitly wants that later.

## Product Decisions / Acceptance Criteria

### CSV columns

Use these columns, in this exact order:

```csv
instance_guid,name,description,tenant_guid,protocol,host,port,username,polling_interval_seconds,is_enabled,password
```

Column semantics:

- `instance_guid`: Existing CMS instance GUID. Export writes `instance.id` here. Import uses this as the upsert key.
- `name`: Required.
- `description`: Optional.
- `tenant_guid`: Optional Tenant GUID. Empty means global/unassigned.
- `protocol`: Optional; default `https`; valid `http` or `https`.
- `host`: Required for import; may be hostname, host, or URL accepted by existing `normalizeOxyGenEndpoint`.
- `port`: Optional; defaults from protocol (`443` for HTTPS, `80` for HTTP).
- `username`: Optional; default `admin`.
- `polling_interval_seconds`: Optional; default `300`; valid `60..86400`.
- `is_enabled`: Optional; accepts `true/false`, `yes/no`, `1/0`; default `true`.
- `password`: Never populated by export. Required for create rows. Optional for update rows; blank keeps the existing encrypted password.

### Upsert behavior

- If `instance_guid` is blank: create a new instance with a generated GUID.
- If `instance_guid` is non-blank and matches an existing instance: update that instance.
- If `instance_guid` is non-blank and does not match an existing instance: create a new instance with that GUID, so CSV restores/backfills preserve identifiers.
- On update, if `tenant_guid` differs from the existing `tenantId`, reject the row with a clear error (`Tenant assignment cannot be changed by import for existing instance <guid>.`) to preserve current immutable-tenant behavior.
- On create, `tenant_guid` may be blank/global or must reference an existing Tenant.
- Import should be all-or-nothing by default: validate all rows first; if any row has an error, persist nothing.
- Return a row-level summary with `created`, `updated`, `failed`, and per-row results so the UI can show useful feedback.

### API shape

Add endpoints:

- `GET /api/instances/export.csv`
  - `SystemAdmin` only.
  - Returns `text/csv; charset=utf-8`.
  - Adds `Content-Disposition: attachment; filename="oxygen-instances-YYYY-MM-DD.csv"`.
  - Does not include password values.
- `POST /api/instances/import`
  - `SystemAdmin` only.
  - Request JSON: `{ "csv": "...", "dryRun": false }`.
  - Response JSON:

```ts
type InstanceImportResponse = {
  dryRun: boolean;
  created: number;
  updated: number;
  failed: number;
  rows: Array<{
    rowNumber: number;
    instanceGuid: string | null;
    name: string | null;
    action: 'create' | 'update' | 'skip' | 'error';
    errors: string[];
    warnings: string[];
    instance?: OxyGenInstance;
  }>;
};
```

## Files Likely to Change

### API

- Create: `apps/api/src/instances/csv.ts`
  - CSV parser/serializer helpers.
  - Header validation.
  - Boolean/number/string normalization.
  - `exportInstancesToCsv(instances)`.
  - `parseInstanceImportCsv(csv)`.
- Modify: `apps/api/src/instances/schemas.ts`
  - Add `importInstancesSchema` for `{ csv, dryRun }`.
  - Consider reusable row schemas/types if helpful.
- Modify: `apps/api/src/instances/types.ts`
  - Add `InstanceImportRowResult`, `InstanceImportResult`, maybe `ImportInstanceInput` if needed.
  - Add optional repository method only if route-level orchestration becomes too large. Prefer route-level orchestration using existing `listInstances({ includeAll: true })`, `createInstance`, and `updateInstance` first.
- Modify: `apps/api/src/instances/registerInstanceRoutes.ts`
  - Import CSV helpers/schema.
  - Add export route before `/:instanceId` to avoid route conflicts.
  - Add import route before `/:instanceId` to avoid route conflicts.
  - Use `adminPreHandler`.
  - For import: validate all rows first, then apply in order if no errors and `dryRun !== true`.
  - Append/allow existing CRUD app logging to capture import route, or add explicit app log summary if the automatic route logger is not enough.
- Modify only if needed: `apps/api/src/instances/inMemoryInstanceRepository.ts`
  - Existing `createInstance(input.id)` already supports supplied IDs; likely no change needed.
- Modify only if needed: `apps/api/src/instances/mysqlInstanceRepository.ts`
  - Current `createInstance` ignores `input.id` and always uses `randomUUID()`. Change to `const id = input.id ?? randomUUID();` so import can preserve `instance_guid` on create.

### API Tests

- Modify: `apps/api/tests/instances.test.ts`
  - Add export CSV test.
  - Add dry-run import validation test.
  - Add import create/update by `instance_guid` test.
  - Add all-or-nothing validation failure test.
  - Add SystemAdmin authorization test for import/export.
- Modify or add: `apps/api/tests/mysqlInstanceRepository.test.ts`
  - Add focused test that MySQL `createInstance({ id })` persists the supplied GUID if existing coverage does not already catch it.

### Web

- Modify: `apps/web/src/app/App.tsx`
  - Add import/export icons from `lucide-react` (`Download`, `Upload` or similar).
  - Add hidden file input `useRef<HTMLInputElement | null>` for CSV file selection.
  - Add `exportInstancesCsv()` handler using authenticated `fetch`, blob download, and current auth token.
  - Add `importInstancesCsv(file)` handler reading text with `file.text()`, posting to `/api/instances/import`, showing summary, then reloading dashboard/instances.
  - Add Import/Export buttons to the Instances grid toolbar next to “Enroll Instance”.
  - Keep UI compact/dark and inside the existing ManagedGrid toolbar.
- Modify: `apps/web/src/styles.css`
  - Only if the toolbar needs minor layout spacing for 3 compact buttons.

### Docs / Contract

- Modify: `docs/openapi.yaml`
  - Add `/api/instances/export.csv` and `/api/instances/import`.
  - Add schemas for import request/response/row results.
- Modify: `docs/openapi.md`
  - Keep in sync with `docs/openapi.yaml` conventions.
- Modify: `docs/data-dictionary.md`
  - Document CSV column mapping and password handling.
- Modify: `docs/current-status.md`
  - Note instance CSV import/export as an administrative capability.
- Wiki docs if checked out/available in the workflow:
  - Sync GitHub Wiki OpenAPI spec page without replacing full-spec content with a summary.
  - Sync Wiki data dictionary/user guide pages as applicable.

---

## Detailed Implementation Tasks

### Task 1: Add CSV utility tests first

**Objective:** Define CSV quoting/parsing behavior before implementation.

**Files:**
- Create/modify test: `apps/api/tests/instanceCsv.test.ts`
- Create: `apps/api/src/instances/csv.ts`

**Steps:**

1. Write tests for CSV export escaping:
   - Headers match the accepted column order.
   - Values with commas, quotes, and newlines round-trip.
   - Export password column is always blank.
2. Write tests for CSV import parsing:
   - Accept CRLF and LF.
   - Trim headers and values.
   - Reject missing required headers.
   - Accept boolean variants `true/false`, `yes/no`, `1/0`.
3. Run:

```bash
npm --workspace @oxygen-cms/api test -- --run tests/instanceCsv.test.ts
```

Expected: FAIL because `csv.ts` does not exist yet.

### Task 2: Implement `apps/api/src/instances/csv.ts`

**Objective:** Provide dependency-free CSV helpers for this narrow schema.

**Implementation notes:**

- Implement a small RFC-4180-compatible parser:
  - quoted fields with escaped quotes (`""`)
  - commas/newlines inside quoted values
  - CRLF handling
- Implement serializer with quotes only when necessary.
- Export constants:

```ts
export const instanceCsvHeaders = [
  'instance_guid',
  'name',
  'description',
  'tenant_guid',
  'protocol',
  'host',
  'port',
  'username',
  'polling_interval_seconds',
  'is_enabled',
  'password'
] as const;
```

- `exportInstancesToCsv(instances: OxyGenInstance[]): string` maps fields and leaves `password` blank.
- `parseInstanceImportCsv(csv: string)` returns normalized row objects plus row numbers and parse/header errors.

**Verification:**

```bash
npm --workspace @oxygen-cms/api test -- --run tests/instanceCsv.test.ts
```

Expected: PASS.

### Task 3: Make MySQL create honor supplied `input.id`

**Objective:** Ensure imports can restore/create with a supplied `instance_guid` in MySQL, matching the in-memory repository behavior.

**Files:**
- Modify: `apps/api/src/instances/mysqlInstanceRepository.ts`
- Test: `apps/api/tests/mysqlInstanceRepository.test.ts` if integration test harness is available/active

**Steps:**

1. Change line ~297 from:

```ts
const id = randomUUID();
```

To:

```ts
const id = input.id ?? randomUUID();
```

2. Add/adjust test proving supplied `id` is persisted.
3. Run narrow MySQL test when possible:

```bash
MYSQL_INTEGRATION_TESTS=true npm --workspace @oxygen-cms/api test -- --run tests/mysqlInstanceRepository.test.ts
```

If MySQL integration is not available locally, document the skip/blocker and rely on API in-memory tests plus typecheck.

### Task 4: Add import/export API schemas and types

**Objective:** Define contract types for import/export.

**Files:**
- Modify: `apps/api/src/instances/schemas.ts`
- Modify: `apps/api/src/instances/types.ts`

**Steps:**

1. Add:

```ts
export const importInstancesSchema = z.object({
  csv: z.string().min(1),
  dryRun: z.boolean().optional().default(false)
});
```

2. Add response/result types to `types.ts` if useful for route readability.
3. Keep existing `createInstanceSchema` and `updateInstanceSchema` as the final source of input validation after CSV normalization.

**Verification:**

```bash
npm --workspace @oxygen-cms/api typecheck
```

Expected: PASS after route implementation; may fail temporarily if types are unused/incomplete during this task.

### Task 5: Add `GET /api/instances/export.csv`

**Objective:** Let SystemAdmins download instance configuration CSV.

**Files:**
- Modify: `apps/api/src/instances/registerInstanceRoutes.ts`
- Test: `apps/api/tests/instances.test.ts`

**Route details:**

- Register before `app.get('/api/instances/:instanceId', ...)`.
- Use `adminPreHandler`.
- Fetch `await instanceRepository.listInstances({ includeAll: true })`.
- Return sorted order from repository; no extra sorting needed unless output tests need deterministic ordering.
- Headers:

```ts
reply
  .header('content-type', 'text/csv; charset=utf-8')
  .header('content-disposition', `attachment; filename="oxygen-instances-${new Date().toISOString().slice(0, 10)}.csv"`)
  .send(exportInstancesToCsv(instances));
```

**Tests:**

- SystemAdmin export returns 200, `text/csv`, and `Content-Disposition`.
- Export includes `instance_guid` equal to created instance `id`.
- Export does not include the remote password value.
- Non-admin signed-in user gets 403.

**Verification:**

```bash
npm --workspace @oxygen-cms/api test -- --run tests/instances.test.ts
```

Expected: PASS for export-related tests after implementation.

### Task 6: Add import validation/orchestration service

**Objective:** Keep the import route readable and enforce all-or-nothing validation.

**Files:**
- Prefer create: `apps/api/src/instances/importInstances.ts`
- Modify: `apps/api/src/instances/registerInstanceRoutes.ts`
- Test: `apps/api/tests/instances.test.ts`

**Implementation outline:**

```ts
export async function importInstancesFromCsv(repository: InstanceRepository, csv: string, options: { dryRun: boolean }) {
  const parsed = parseInstanceImportCsv(csv);
  const existing = await repository.listInstances({ includeAll: true });
  const byId = new Map(existing.map((instance) => [instance.id, instance]));

  // First pass: normalize, decide action, validate with create/update schemas.
  // Collect row results. Do not persist yet.

  if (hasErrors || options.dryRun) return summary;

  // Second pass: apply sequentially.
  // create: repository.createInstance({ id: row.instanceGuid || undefined, ... })
  // update: repository.updateInstance(row.instanceGuid, { ... password only if nonblank })
}
```

**Validation rules:**

- Empty lines are skipped with `action: 'skip'` and no error.
- Duplicate `instance_guid` within the same CSV should be an error for all duplicated rows to avoid ambiguous updates.
- Create row requires `password`.
- Update row with blank `password` preserves existing password.
- Update row with `tenant_guid` different from existing `tenantId` is an error.
- `tenant_guid` existence is already enforced by MySQL repository; however in-memory repository does not check Tenant existence, so route/service should call `authRepository` only if needed. Prefer keeping tenant existence validation in existing repository where possible; for in-memory tests, create with existing tenant IDs and assert update immutability.
- If one row fails repository persistence unexpectedly after validation, return HTTP 400/500 with clear message. All-or-nothing is only guaranteed for validation failures unless a DB transaction wrapper is added. If true DB all-or-nothing is required, add repository transaction support in a later enhancement.

**Important tradeoff:** Existing `InstanceRepository` has no transaction API. The first implementation can guarantee “validate all before write” but not rollback if row N fails during persistence. Document this in code/docs. If Brad requires strict DB transaction atomicity, add a repository-level `importInstances` method using MySQL transaction and an in-memory equivalent.

### Task 7: Add `POST /api/instances/import`

**Objective:** Expose CSV import to the web UI.

**Files:**
- Modify: `apps/api/src/instances/registerInstanceRoutes.ts`
- Test: `apps/api/tests/instances.test.ts`

**Route details:**

- Register before `/:instanceId` routes.
- Use `adminPreHandler`.
- Parse request body with `importInstancesSchema`.
- Call `importInstancesFromCsv(instanceRepository, input.csv, { dryRun: input.dryRun })`.
- Return 200 for successful/dry-run imports, even if row errors are present in dry-run.
- Return 400 for non-dry-run imports with validation errors and include the row results.

**Tests:**

1. Dry run returns `created`/`updated` counts and does not persist.
2. Create row with blank `instance_guid` creates a new instance.
3. Create row with unknown `instance_guid` creates with that GUID.
4. Update row with known `instance_guid` updates name/host/polling/enabled and keeps password when blank.
5. Invalid row prevents all persistence.
6. Duplicate `instance_guid` in one CSV fails validation.
7. Non-admin signed-in user gets 403.

**Verification:**

```bash
npm --workspace @oxygen-cms/api test -- --run tests/instances.test.ts
npm --workspace @oxygen-cms/api typecheck
```

Expected: PASS.

### Task 8: Add web export/import handlers

**Objective:** Add compact Instances toolbar actions without disrupting the current grid layout.

**Files:**
- Modify: `apps/web/src/app/App.tsx`

**Implementation outline:**

1. Add imports from `lucide-react`:

```ts
Download, Upload
```

2. Add state/ref near existing hooks:

```ts
const importInstancesInputRef = useRef<HTMLInputElement | null>(null);
```

3. Add export function:

```ts
async function exportInstancesCsv() {
  clearStatus();
  try {
    const response = await fetch('/api/instances/export.csv', {
      headers: { authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(await response.text() || 'Instance export failed.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `oxygen-instances-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMessage('Exported instances CSV.');
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Instance export failed.');
  }
}
```

4. Add import file handler:

```ts
async function importInstancesCsv(file: File | null) {
  if (!file) return;
  clearStatus();
  try {
    const csv = await file.text();
    const result = await api<InstanceImportResponse>('/api/instances/import', {
      method: 'POST',
      token,
      body: JSON.stringify({ csv })
    });
    setMessage(`Imported instances: ${result.created} created, ${result.updated} updated${result.failed ? `, ${result.failed} failed` : ''}.`);
    await loadDashboard();
    await loadInstances();
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Instance import failed.');
  } finally {
    if (importInstancesInputRef.current) importInstancesInputRef.current.value = '';
  }
}
```

5. Add `InstanceImportResponse` type near other UI types.
6. Replace the single toolbar button with a compact fragment:

```tsx
toolbar={isSystemAdmin ? <div className="grid-toolbar-actions">
  <Button className="compact-button" onClick={exportInstancesCsv} type="button"><Download /> Export CSV</Button>
  <Button className="compact-button" onClick={() => importInstancesInputRef.current?.click()} type="button"><Upload /> Import CSV</Button>
  <input ref={importInstancesInputRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => void importInstancesCsv(event.currentTarget.files?.[0] ?? null)} />
  <Button className="btn-create" onClick={openCreateInstanceModal} type="button" themeColor="primary"><Plus /> Enroll Instance</Button>
</div> : null}
```

7. If `grid-toolbar-actions` does not exist, add minimal CSS to keep buttons wrapped on small screens.

**Verification:**

```bash
npm --workspace @oxygen-cms/web typecheck
npm --workspace @oxygen-cms/web build
```

Expected: PASS.

### Task 9: Add contract/docs updates

**Objective:** Keep OpenAPI, data dictionary, and status docs synchronized with new API/UI behavior.

**Files:**
- Modify: `docs/openapi.yaml`
- Modify: `docs/openapi.md`
- Modify: `docs/data-dictionary.md`
- Modify: `docs/current-status.md`
- Wiki docs if checked out during implementation

**OpenAPI additions:**

- `GET /api/instances/export.csv` with `text/csv` response.
- `POST /api/instances/import` with JSON request/response schemas.
- New schemas:
  - `ImportInstancesRequest`
  - `InstanceImportResponse`
  - `InstanceImportRowResult`

**Data dictionary:**

Add an “Instance CSV” section mapping CSV column names to `oxygen_instances`/API fields and explicitly noting:

- `password` is import-only and never exported.
- `instance_guid` maps to `oxygen_instances.id` / API `OxyGenInstance.id`.
- Computed/monitoring fields (`status`, `sslValid`, `licenseJson`, etc.) are intentionally excluded.

**Verification:**

```bash
git diff --check -- docs/openapi.yaml docs/openapi.md docs/data-dictionary.md docs/current-status.md
```

Expected: no whitespace errors.

### Task 10: Full validation checkpoint

**Objective:** Prove the implementation works without overstating browser/manual verification.

Run:

```bash
npm --workspace @oxygen-cms/api test -- --run tests/instanceCsv.test.ts tests/instances.test.ts
npm --workspace @oxygen-cms/api typecheck
npm --workspace @oxygen-cms/web typecheck
npm --workspace @oxygen-cms/web build
git diff --check
```

Optional if environment supports MySQL integration:

```bash
MYSQL_INTEGRATION_TESTS=true npm --workspace @oxygen-cms/api test -- --run tests/mysqlInstanceRepository.test.ts
```

Expected final handoff should include:

- Files changed.
- Tests/commands run with actual results.
- Whether MySQL integration tests were run or skipped and why.
- Confirmation no password value is exported.
- Confirmation import creates/updates by `instance_guid`.
- Confirmation tenant update immutability behavior.
- Confirmation no commit/push unless Brad explicitly requested it.

---

## Risks / Tradeoffs / Open Questions

1. **Strict transactionality:** The route-level implementation can validate all rows before writing, but cannot guarantee rollback if a later repository write fails unexpectedly. For strict DB all-or-nothing, add a repository-level transactional import method.
2. **Tenant updates:** This plan rejects tenant changes for existing instances to preserve current immutable-tenant behavior. If Brad wants import to move instances between Tenants, decide explicitly before implementation.
3. **Password restore:** Export cannot include encrypted/decrypted passwords. A freshly exported CSV cannot recreate deleted instances unless the admin fills `password` for create rows before importing.
4. **CSV parser scope:** A small local CSV parser is enough for this schema if tests cover quoted commas/newlines. If broader spreadsheet quirks appear, switch to a vetted library such as `csv-parse`/`csv-stringify` in a separate dependency decision.
5. **User feedback for row errors:** Initial UI can show summary/error text. A later enhancement could add a modal with downloadable row-level error report if imports are large.
6. **Audit logging detail:** Existing CRUD route logging may log the import endpoint as a generic instance CRUD operation. If Brad wants row-level audit history, add explicit app log entries per row or one detailed summary entry.

## Recommended Review Gate

After Tasks 1-7, pause for API review with the actual import/export response examples from tests before polishing the UI. This keeps the data contract reviewable before browser behavior depends on it.
