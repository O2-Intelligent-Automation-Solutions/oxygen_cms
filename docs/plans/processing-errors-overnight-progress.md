# Processing Errors overnight progress

Date: 2026-06-28

## Brad decisions applied

- Classic server paging remains the baseline; no server-windowed virtual scrolling was introduced in this run.
- Processing grid requests keep the approved default page size of 50 and API `take` cap of 250.
- Mutating row actions use granular `processing.errors.*` permissions and explicit confirmation instead of SystemAdmin-only gating.
- Bulk operations still need scoped preview/confirmation; they were not implemented in this run.
- Processing state pause/resume remains future read-only/status work until RBAC/audit is reviewed.
- Queue/message parity remains a fast follow after trigger, workflow-event, service-event, and event-detail surfaces.

## Completed in this overnight run

- Commit `af39a0f` / `e18f2e6`: captured the OxyGen Processing parity inventory and expanded the approved typed-CMS parity plan after the embedded-grid approach was rejected.
- Commit `054b2a8`: added the typed, instance-aware Processing API foundation. The API authenticates to the selected OxyGen instance server-side, forwards only allowlisted schema/grid/detail routes, preserves Kendo DataSourceRequest paging/sorting/filtering, defaults `take` to 50, clamps `take` to 250, validates service identifiers, enforces CMS instance/Tenant visibility, and keeps OxyGen credentials/cookies out of the browser.
- Commit `656b90e`: added the CMS-native Processing Errors shell and read-only Workflow Triggers grid with schema-driven columns, classic paging, active/error/recovery defaults, child trigger expansion, selected-row context, and dark shell layout.
- Commit `66f3424`: added the read-only Workflow Events grid. Trigger selection lazy-loads workflow-event schema/data filtered server-side by `WorkflowTriggerId`, keeps OxyGen default `Id asc` ordering, and resets downstream context on trigger change.
- Commit `0b1c247`: added the read-only Service Events grid. Workflow-event selection with a `ServiceIdentifier` lazy-loads service-event schema/data filtered server-side by `WorkflowEventId`, defaults to parent service rows, and expands child service-event rows on demand.
- Commit `13ea029`: added the read-only Event Details panel. Details load only after service-event selection, present common fields and prominent/copyable error text, and keep advanced/remaining fields behind an explicit toggle.
- Commit `d1accf3`: added confirmed row actions for trigger cancel, workflow-event recovery, workflow-event cancel, and service-event restore. These actions are routed through typed CMS endpoints, require granular Processing permissions and confirmation, use the server-side OxyGen form session, and log API activity through the app activity hook.
- Final docs closeout in progress updates OpenAPI/docs/Wiki status so the committed contracts match the row-action API surface.

## Validation completed during the run

- `npm --workspace @oxygen-cms/api test -- --run tests/processingRoutes.test.ts`
- `npm --workspace @oxygen-cms/web run typecheck`
- `npm --workspace @oxygen-cms/web run build`
- `npm run typecheck`
- `git diff --check`
- focused `/tmp/hermes-verify-*` ad-hoc verifiers for trigger grid, workflow-event grid, service-event grid, and event details checkpoints

## Final validation for closeout

To be refreshed immediately before final commit/push:

- API focused tests: `npm --workspace @oxygen-cms/api test -- --run tests/processingRoutes.test.ts`
- Web typecheck/build because the Processing Errors UI was touched: `npm --workspace @oxygen-cms/web run typecheck`; `npm --workspace @oxygen-cms/web run build`
- Workspace typecheck if practical: `npm run typecheck`
- Diff hygiene: `git diff --check` in the main repo and Wiki repo
- OpenAPI parse after row-action contract updates
- Fresh tempfile-backed `/tmp/hermes-verify-*` ad-hoc verifier for current claims

## Still pending / not claimed as complete parity

Do not treat this as 100% parity yet. The following inventory areas remain open:

- File-download routes and UI.
- EMM/WHE message viewers and raw-message/file audit logging.
- Bulk cancel/restore/reset actions with grid-total previews, scoped confirmations, and large-dataset guardrails.
- Queue/message parity fast-follow surfaces.
- Processing state/status pause/resume controls; Brad directed these to stay out of the current mutating-action slice until RBAC/audit is reviewed.
- Live OxyGen runtime validation and browser UX review against customer-scale datasets.
- Final 100% parity validation against every inventory item in `docs/plans/processing-errors-oxygen-parity-inventory.md`.

## Next steps

1. Complete file/download and message/detail parity through typed CMS endpoints without exposing OxyGen credentials or session cookies to the browser.
2. Add bulk-action preview/confirmation flows using grid totals, with explicit scoped confirmation and no unbounded all-history operations.
3. Validate the full Processing Errors workflow in a browser against a live OxyGen instance.
4. Reconcile every remaining inventory item before claiming 100% feature parity.
