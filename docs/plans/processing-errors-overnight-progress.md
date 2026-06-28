# Processing Errors overnight progress

Date: 2026-06-28

## Completed in this stage

- Added the CMS-native Workflow Events grid as the next read-only Processing Errors parity slice.
- Trigger selection now drives a lazy, server-paged workflow-event grid filtered by `WorkflowTriggerId`.
- Workflow event requests use the typed CMS endpoints, preserve the OxyGen `Id asc` default sort, keep page size at the existing 50 default / 250 API cap, and do not introduce mutating recovery/cancel actions.
- Selecting a workflow event now prepares the downstream Service Events context for Milestone 4.

## Still pending

- Milestone 4: Service Event Grid and child service event expansion.
- Milestone 5: Event details/files/messages/advanced-mode panel.
- Milestone 6+: mutating recovery/cancel/restore/download/message actions and granular action RBAC/audit.

## Validation from this stage

- `npm --workspace @oxygen-cms/api test -- --run tests/processingRoutes.test.ts`
- `npm --workspace @oxygen-cms/web run typecheck`
- `npm --workspace @oxygen-cms/web run build`
- `npm run typecheck`
- `git diff --check`
- `node /tmp/hermes-verify-processing-workflow-event.mjs`
