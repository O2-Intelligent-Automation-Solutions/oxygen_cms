# Processing Errors overnight progress

Date: 2026-06-28

## Completed in this stage

- Added the CMS-native Workflow Events grid as a read-only Processing Errors parity slice.
- Trigger selection now drives a lazy, server-paged workflow-event grid filtered by `WorkflowTriggerId`.
- Workflow event requests use the typed CMS endpoints, preserve the OxyGen `Id asc` default sort, keep page size at the existing 50 default / 250 API cap, and do not introduce mutating recovery/cancel actions.
- Added the CMS-native Service Events grid as a read-only follow-on slice.
- Workflow event selection now drives a lazy, server-paged service-event grid filtered by `WorkflowEventId`, scoped to the selected `ServiceIdentifier`, and defaulted to parent service rows only.
- Parent service-event rows can expand child service events on demand through the typed CMS child route.

## Still pending

- Milestone 5: Event details/files/messages/advanced-mode panel.
- Milestone 6+: mutating recovery/cancel/restore/download/message actions and granular action RBAC/audit.

## Validation from this stage

- `npm --workspace @oxygen-cms/api test -- --run tests/processingRoutes.test.ts`
- `npm --workspace @oxygen-cms/web run typecheck`
- `npm --workspace @oxygen-cms/web run build`
- `npm run typecheck`
- `git diff --check`
- `node /tmp/hermes-verify-processing-workflow-event.mjs`
