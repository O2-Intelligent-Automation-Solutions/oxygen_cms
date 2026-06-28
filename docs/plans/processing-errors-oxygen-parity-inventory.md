# Processing Errors OxyGen Parity Inventory

Generated for Milestone 0 of `.hermes/plans/2026-06-28_030632-processing-errors-oxygen-parity.md`.

Scope:

- OxyGen frontend reference repo: `/home/administrator/oxygen_frontend` (read-only)
- Source root inventoried: `/home/administrator/oxygen_frontend/apps/oxygen/src`
- OxyGen CMS implementation repo: `/home/administrator/workspace/oxygen_cms`
- User-facing CMS module label: **Processing Errors**
- Approved architecture: typed, instance-aware CMS endpoints. The browser must not call arbitrary OxyGen instance URLs and must not receive stored OxyGen credentials or OxyGen session cookies.

## Executive summary

The OxyGen frontend Processing area is not one grid. Full parity requires these connected surfaces:

1. Workflow trigger grid with child trigger expansion, row cancel, row workflow-event drilldown, and filter-scoped bulk cancel.
2. Workflow event grid with recovery, three-mode cancel dialog, and service/job-event drilldown.
3. Service/job event grid with service-specific schema, child event expansion, event details, EMM message view, WHE restore, WHE restore-all, and delayed-processing queue entry points.
4. Event details dialog with schema-grouped fields, advanced-mode toggle, file download, payload diff, error rendering, and EMM message launcher.
5. Queue/message dialogs for services with delayed processing, including queue grid, queue entry reset/cancel, bulk reset/cancel, queue entry detail, editable EMM message, original-message display, receipt controls, and attachment download.
6. Processing state controls/labels used in trigger and queue toolbars.

Milestone 1+ should keep these as typed CMS API routes under an instance path, enforce Tenant visibility/RBAC server-side, preserve OxyGen Kendo `DataSourceRequest` semantics, and clamp/default all page/window sizes.

## Source inventory

### Workflow triggers

| Area | Exact source file | Purpose |
| --- | --- | --- |
| Trigger grid | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/Triggers/Triggers.tsx` | Main workflow trigger `PaginationTable`; schema-driven parent columns; parent row styling; child expansion; processing state toolbar; Cancel All toolbar action. |
| Trigger grid props | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/Triggers/Triggers.types.ts` | Dialog/page params input. |
| Trigger schema hook | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/Triggers/api/getTriggersSchema.ts` | Fetches trigger schema. |
| Trigger toolbar actions | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/Triggers/Actions/Actions.tsx` | Filter-scoped `Cancel All` action. |
| Trigger row actions | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/Triggers/ActionsCell/ActionsCell.tsx` | Row `View Trigger Events` and `Cancel Trigger`. |
| Child triggers | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/Triggers/ChildTriggers/ChildTriggers.tsx` | Child trigger detail grid filtered by parent trigger group. |
| Trigger processing toolbar | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/Triggers/Processing/Processing.tsx` | Trigger processing state indicator/control. |
| Trigger dialog launcher | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/Trigger/Trigger.tsx` | Dialog wrapper for workflow triggers with route/filter params. |
| Trigger dialog types | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/Trigger/Trigger.types.ts` | Trigger dialog params. |
| Trigger API | `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/Trigger/Trigger.api.ts` | Trigger grid/schema/cancel operations. |
| Trigger interface | `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/Trigger/Trigger.interface.ts` | `ITrigger` shape. |

Observed trigger behavior:

- Grid title: `Workflow Triggers` in OxyGen; CMS module label remains **Processing Errors**.
- Schema endpoint drives columns and dynamic id fields.
- Parent grid columns are filtered to `schema.Grids.Parent`.
- Parent grid filter adds `IsChild neq true`.
- Child grid filter adds `IsChild eq true` and `TriggerGroupId eq parentId`.
- Parent rows get special styling when `IsParent` is true.
- Details/expand affordance is available only when `IsParent && ChildTriggers`.
- `dataItemKey` defaults to `schema.IdColumns.IdField ?? "Id"`.
- Search keys: `WorkflowId`, `WorkflowTriggerId`, `ServiceIdentifier`, `JobId`, `Status`.
- Search param field mapping uses `schema.IdColumns` fallbacks:
  - `WorkflowId` -> `WorkflowId`
  - `WorkflowTriggerId` -> `Id`
  - `JobId` -> `JobId`
  - `Status` -> `Status`
  - `ServiceIdentifier` -> `SourceIdentifier`
- Row height: `66`.
- Row actions:
  - `View Trigger Events`: opens workflow-event dialog with `triggerId: dataItem.Id`; disabled for parent triggers.
  - `Cancel Trigger`: confirmation title `Cancel Trigger`; disabled when status is `Canceled` or `Completed`, or license is invalid.
- Bulk toolbar action:
  - `Cancel All`: confirmation says it cancels all pending parent/initial triggers including child triggers; disabled when license invalid or total is zero.
  - OxyGen frontend forwards the current table state with `skip: 0` and `take: total`; CMS must not forward unbounded huge totals without preview/confirmation guardrails.

Trigger response/type shape from `ITrigger`:

```text
Id: number
TriggerGroupId: number
IsParent: boolean
WorkflowName: string
ChildTriggers: number
SourceIdentifier: string
SourceEndpointName: string
TriggerDate: string
CompleteDate: string
HasErrors: boolean
Status: string
```

### Workflow events

| Area | Exact source file | Purpose |
| --- | --- | --- |
| Workflow event grid | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/TriggerEvents/TriggerEvents.tsx` | Main workflow event `PaginationTable`; schema-driven columns; row recovery/cancel/service-event drilldown. |
| Workflow event schema hook | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/TriggerEvents/api/getTriggerEventsSchema.ts` | Fetches workflow event schema. |
| Workflow event row actions | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/TriggerEvents/ActionsCell/ActionsCell.tsx` | Recovery, cancel dialog, view service/job events. |
| Workflow event cancel dialog | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/TriggerEvents/CancelEvent/CancelEvent.tsx` | Stop/Reset/Cancel action options. |
| Workflow event cancel types | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/TriggerEvents/CancelEvent/CancelEvent.types.ts` | Cancel dialog input shape. |
| Workflow event dialog launcher | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/TriggerEvent/TriggerEvent.tsx` | Dialog wrapper for workflow events. |
| Workflow event dialog types | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/TriggerEvent/TriggerEvent.types.ts` | Dialog filter params. |
| Workflow event API | `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/TriggerEvent/TriggerEvent.api.ts` | Grid, recovery, cancel operations. |
| Workflow event interface | `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/TriggerEvent/TriggerEvent.interface.ts` | `ITriggerEvent` shape. |

Observed workflow-event behavior:

- Rendered title: `Workflow Trigger (Id: <WorkflowTriggerId>) Events` when filtered by trigger.
- Schema endpoint drives all grid columns.
- `dataItemKey`: `Id`.
- Search keys: `WorkflowId`, `WorkflowTriggerId`, `ServiceIdentifier`, `Status`.
- Search param mapping uses schema id columns with fallbacks.
- API helper appends sort `{ field: "Id", dir: "asc" }` after any existing sort.
- Row height: `56.8`.
- Row actions:
  - `Recovery`: confirmation title `Resend to Event Destination?`; copy says it resumes workflow at `serviceIdentifier` / `jobName`; disabled when status is `Completed`, `Pending`, `Recovery`, `Canceled`, or license invalid; refreshes grid after success.
  - `Cancel Event`: opens three-action dialog; disabled when status is `Completed` or `Canceled`, or license invalid.
  - `View Job Events`: opens service/job event dialog with `jobId`, `triggerId`, `serviceIdentifier`, and `triggerEventId`.
- Cancel Event dialog choices:
  - `Stop`: calls cancel action value `1`; copy: cancels the event; recovery process may be resumed.
  - `Reset`: calls cancel action value `2`; copy: cancels the event and child job events are set to Pending; recovery process may be resumed.
  - `Cancel`: calls cancel action value `3`; copy: cancels parent trigger, event, and child job events unless Completed or Errored; no further recovery.

Workflow event response/type shape from `ITriggerEvent`:

```text
Id: number
CompletedDate: string
EventDate: string
JobId: number
JobName: string
ServiceIdentifier: string
Status: string
ProcessingError: boolean
ProcessState: boolean
LastError: string
RowsTotal: number
RowsCompleted: number
WorkflowTriggerId: number
RecoveryAttempts: number
RowsErrored: number
RowsStatus: string
ServiceEventId: number
WorkflowId: number
WorkflowSequence: number
```

### Service/job events

| Area | Exact source file | Purpose |
| --- | --- | --- |
| Service event grid | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/JobEvents/JobEvents.tsx` | Service-specific event grid with schema columns, parent filter, child expansion, WHE/EMM actions. |
| Service event provider | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/JobEvents/JobEvents.provider.tsx` | Shares grid columns/context. |
| Service event row actions | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/JobEvents/ActionsCell/ActionsCell.tsx` | EMM message, WHE restore, view details. |
| Child service events | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/JobEvents/ChildEvents/ChildEvents.tsx` | Child event expansion filtered by `ParentId`. |
| Service event toolbar action | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/JobEvents/QueueAction/QueueAction.tsx` | WHE restore-all or delayed-processing queue launcher. |
| Restore one WHE event API hook | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/JobEvents/ActionsCell/api/restoreEvent.ts` | Calls WHE queue restore endpoint for one event. |
| Restore all WHE events API hook | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/JobEvents/QueueAction/api/restoreAllEvents.ts` | Calls WHE queue restore-all endpoint. |
| Service event dialog launcher | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEvent/JobEvent.tsx` | Dialog wrapper for service/job events. |
| Service event API | `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/JobEvent/JobEvent.api.ts` | Service event schema/grid/detail operations. |
| Service event interface | `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/JobEvent/interfaces/JobEvent.interface.ts` | Minimal `IJobEvent` shape. |
| Event details interface | `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/JobEvent/interfaces/EventDetails.interface.ts` | `IEventDetails` base shape. |

Observed service-event behavior:

- Grid title: `<SERVICE> Events`, e.g. `WHE Events`, `EMM Events`.
- Service identifier is dynamic and used in OxyGen paths.
- Schema endpoint drives all columns and id fields per service.
- Parent grid filter adds `(ParentId is null OR ParentId eq 0)`.
- Child grid filter adds `ParentId eq parentId`.
- Parent rows get special styling when `!ParentId && HasChild`.
- Details/expand affordance is available only when `!ParentId && HasChild`.
- Search keys: `WorkflowId`, `WorkflowTriggerId`, `WorkflowEventId`, `ServiceIdentifier`, `JobId`, `Status`.
- Param mapping uses schema fields for `WorkflowId`, `WorkflowEventId`, `WorkflowTriggerId`, `JobId`, and `Status`. `ServiceIdentifier` is in search keys but the params map does not explicitly map it in `JobEvents.tsx`; CMS should decide whether to preserve service context outside grid filters or add a mapped filter intentionally.
- `JobName` column is hidden when filtering by JobId.
- Row action width is wider for `EMM` and `WHE` (`90px`) than other services (`58px`).
- Row actions:
  - Always: `View Details` opens event details dialog for `eventId`, current data schema, and service identifier.
  - EMM only: `View Message` envelope action opens message dialog through queue-entry schema.
  - WHE only: `Restore` action is enabled only when status is `Queued` and no `ProcessingLock`; confirmation title `Restore Event`; remote call requeues/restores event.
- Toolbar action:
  - WHE: `Restore All` calls global WHE restore endpoint with confirmation.
  - Other delayed-processing services: if `settings.DelayedProcessing` includes the service identifier, show `<SERVICE> Queue` button that opens queue dialog with current params.

Service event base type shape from `IJobEvent`:

```text
Id: number
ParentId: number | null
HasChild: boolean
```

Service event detail base type from `IEventDetails`:

```text
Source: string
Destination: string
FileName: string
Payload: string
OutgoingPayload: string
WorkflowId: number
WorkflowTriggerId: number
WorkflowEventId: number
ProcessingErorr: boolean
ProcessState: boolean
ErrorMessage: string
```

Note: `IEventDetails` extends `Record<string, any>` because detail shape is schema/service-specific.

### Event details, files, messages, and payloads

| Area | Exact source file | Purpose |
| --- | --- | --- |
| Event details dialog | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventDetails/JobEventDetails.tsx` | Schema-grouped details UI, advanced toggle, download/message/error/payload rendering. |
| Event details hook | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventDetails/useJobEventDetails.ts` | Fetches service event details on demand. |
| Event details helpers | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventDetails/helpers.ts` | Advanced-mode session state helpers. |
| Field list renderer | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventDetails/FieldList/FieldList.tsx` | Generic schema field display. |
| Id/name field renderer | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventDetails/IdAndNameField/IdAndNameField.tsx` | Label/id/name display groups. |
| Detail field renderer | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventDetails/DetailField/DetailField.tsx` | Per-field detail display. |
| Error field renderer | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventDetails/ErrorField/ErrorField.tsx` | Error field treatment/window. |
| Error window | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventDetails/ErrorWindow/ErrorWindow.tsx` | Larger error display. |
| Download field | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventDetails/DownloadField/DownloadField.tsx` | File dropdown grouped by location and direct file download. |
| View message launcher | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventDetails/ViewMessage/ViewMessage.tsx` | Loads queue schema, then opens message dialog. |
| Message dialog | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventMessage/JobEventMessage.tsx` | Queue entry/message details, reset/cancel actions, editable EMM message save, original-message link. |
| Message helpers | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventMessage/helpers.ts` | Email array conversion helpers. |
| EMM message renderer | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventMessage/EMMMessage/EMMMessage.tsx` | Editable/read-only EMM message form. |
| Email errors renderer | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventMessage/EmailErrors/EmailErrors.tsx` | Email validation/error display. |
| Original message dialog | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventMessage/OriginalMessage/OriginalMessage.tsx` | Original message view with editor metadata. |
| Receipt controls | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventMessage/ReceiptControl/ReceiptControl.tsx` | Delivery/read receipt switches and email inputs. |
| Attachment control | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/JobEventMessage/AttachmentControl/AttachmentControl.tsx` | Downloads base64 message attachments from loaded queue-entry payload. |

Observed event details behavior:

- Details load only when the user opens a service event row action.
- Dialog title: `Event Details - <serviceIdentifier>:<eventId>`.
- Advanced state persists in session storage through helpers.
- When advanced mode is off, fields in `dataSchema.Groups.Advanced` are excluded.
- `Groups.Advanced` itself is not rendered as a section.
- Schema groups rendered:
  - `Workflow`
  - `Module`
  - `Job`
  - `Event`
  - optional `Triggered`
  - `Status`
  - `File`
  - `Error`
  - optional `Custom`
  - optional `Payload`
- File group uses a dropdown of files from the schema field, maps locations `Local` and `Payload`, sorts by location label, disables `Download` when the selected file is missing or `IsExists` is false.
- File download currently calls direct OxyGen path `/web-api/{ServiceIdentifier}/Events/{eventId}/{file.FileName}/File`; CMS must wrap this behind a typed download endpoint and sanitize file names.
- EMM details show `View Message` button; action fetches `/web-api/{serviceIdentifier}/Queue/Schema` then opens queue-entry message dialog.
- Payload group with exactly two fields renders an `ObjectsDiff` between `JSON.parse(incomingPayload || "{}")` and `JSON.parse(outgoingPayload || "{}")`; CMS should handle invalid JSON safely rather than crashing the shell.
- Error fields are rendered separately and should stay prominent/red/copyable in CMS.

Observed message behavior:

- Message dialog title: `<SERVICE> Message Details (Id: <entryId>)`.
- It loads queue entry detail by id and service identifier.
- Displays grouped `Workflow`, `Status`, `Job`, `Trigger`, `Queue`, `Retry`, and `Error` fields from queue schema.
- Status group includes `Actions` menu with row `Reset` and `Cancel`; disabled by invalid license and per-entry `IsResetable` / `IsCancelable`.
- EMM messages render editable form controls for email recipients/content/receipts/attachments.
- Save patches the message payload to the queue entry; disabled while saving, when status is `Completed`, `Sent`, `Canceled`, or license invalid.
- `View Original Message` appears when `LastEditUser` and `OriginalMessage` exist; original dialog shows editor user/date plus original EMM message.
- Attachments are already in the loaded message payload as base64 and download client-side; CMS should avoid logging raw attachment content and should consider size limits if exposing this path.

### Queue and processing state surfaces adjacent to Processing Errors

The Milestone 0 plan explicitly lists `QueueEntry` and `ProcessingState` entities. These are adjacent Processing surfaces and must be accounted for when achieving full user-action parity, especially because service-event details and EMM message view use queue endpoints.

| Area | Exact source file | Purpose |
| --- | --- | --- |
| Queue grid | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/Queue/Queue.tsx` | Service queue grid with schema columns, active statuses default filter, row actions, view message, processing state toolbar. |
| Queue data hook | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/Queue/useQueueData.ts` | Loads queue schema/status metadata. |
| Queue toolbar actions | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/Queue/Actions/Actions.tsx` | Bulk reset/cancel queue entries. |
| Queue row actions | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/Queue/ActionsCell/ActionsCell.tsx` | Reset/cancel queue entry. |
| Queue message cell | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/Queue/ViewMessageCell/ViewMessageCell.tsx` | Launches message view from queue row. |
| Queue dialog | `/home/administrator/oxygen_frontend/apps/oxygen/src/features/Processing/ui/dialogs/Queue/Queue.tsx` | Dialog wrapper for queue grid. |
| Queue API | `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/QueueEntry/QueueEntry.api.ts` | Queue schema/grid/status/detail/reset/cancel/message update APIs. |
| Queue actions hook | `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/QueueEntry/hooks/useQueueActions.ts` | Shared queue reset/cancel confirmation behavior. |
| Queue types | `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/QueueEntry/QueueEntry.interface.ts` | Queue entry, detailed entry, message, attachment shapes. |
| Processing state API | `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/ProcessingState/ProcessingState.api.ts` | Fetches processing state map. |
| Processing state constants | `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/ProcessingState/ProcessingState.constants.ts` | Processing status enum and active status list. |
| Processing state UI | `/home/administrator/oxygen_frontend/apps/oxygen/src/entities/ProcessingState/ui/ProcessingState/ProcessingState.tsx` | Pause/resume state UI used by Processing toolbars. |
| Trigger dialog entry points | `/home/administrator/oxygen_frontend/apps/oxygen/src/widgets/Header/ui/NavbarStatus/NavbarStatus.tsx`, `/home/administrator/oxygen_frontend/apps/oxygen/src/widgets/Chart/Module/ModuleToolbar/ModuleTools/JobTriggers/JobTriggers.tsx` | Opens workflow trigger dialog from nav/module tools. |
| Queue dialog entry point | `/home/administrator/oxygen_frontend/apps/oxygen/src/widgets/Chart/Module/ModuleToolbar/ModuleTools/Queue/Queue.tsx` | Opens queue dialog from module tools. |

Observed queue behavior:

- Queue title: `<SERVICE> Processing Queue`.
- Schema endpoint drives all queue columns.
- First column is a View Message cell, then schema columns, then row actions.
- Defaults `Status` filter to `statuses.ActiveStatuses` from `/Queue/Statuses`.
- Search keys: `Status`, `WorkflowTriggerId`, `JobId`, `WorkflowId`.
- `JobName` is hidden when filtering by JobId; `WorkflowName` is hidden when filtering by WorkflowId.
- Queue processing toolbar queries processing state for the selected service.
- Row actions:
  - `Reset`: confirmation warning that workflow continues from that module forward; may reprocess steps; enabled only when `IsResetable` and license valid.
  - `Cancel`: confirmation; enabled only when `IsCancelable` and license valid.
- Bulk actions:
  - `Reset All`: forwards current state with `skip: 0`, `take: total`; dangerous for huge totals.
  - `Cancel All`: forwards current state with `skip: 0`, `take: total`; dangerous for huge totals.
- Message save patches queue entry message payload.

Processing statuses from `ProcessingStatus`:

```text
Pending
Completed
Rejected
Canceled
Errored
Recovery
Active
Failed
Paused
```

Active statuses from `ActiveStatuses`:

```text
Active
Pending
Errored
Recovery
```

## OxyGen endpoint matrix

All paths below are OxyGen frontend remote paths as identified from the read-only source. CMS must expose typed instance-aware routes that server-side authenticate and forward/translate to these paths.

| Domain | Method | OxyGen path | Source file(s) | Request shape | Response shape / use | Side effect |
| --- | --- | --- | --- | --- | --- | --- |
| Trigger schema | GET | `/web-api/BUS/workflows/triggers/schema` | `features/Processing/ui/Triggers/api/getTriggersSchema.ts`, `entities/Trigger/Trigger.api.ts` | none | `IDataSchema` | none |
| Trigger grid | GET | `/web-api/BUS/workflows/triggers/grid?...DataSourceRequest` | `entities/Trigger/Trigger.api.ts` | Kendo `DataSourceRequest` query (`skip`, `take`, `sort`, `filter`); parent adds `IsChild neq true`; child adds `IsChild eq true` + `TriggerGroupId eq parentId` | `{ Data: ITrigger[], Total: number }`, mapped to `{ items, total }` in OxyGen frontend | none |
| Trigger row cancel | POST | `/web-api/BUS/workflows/triggers/{id}/cancel?isParent={bool}` | `entities/Trigger/Trigger.api.ts`, `Triggers/ActionsCell/ActionsCell.tsx` | path id; query `isParent` boolean | remote response not typed; success toast | cancels one trigger and possibly child triggers when parent |
| Trigger bulk cancel | POST | `/web-api/BUS/workflows/triggers/cancel?...DataSourceRequest` | `entities/Trigger/Trigger.api.ts`, `Triggers/Actions/Actions.tsx` | current table state with `skip: 0`, `take: total` | number canceled count | filter-scoped bulk cancel |
| Workflow event schema | GET | `/web-api/BUS/workflows/events/schema` | `features/Processing/ui/TriggerEvents/api/getTriggerEventsSchema.ts` | none | `IDataSchema` | none |
| Workflow event grid | GET | `/web-api/BUS/workflows/events/grid?...DataSourceRequest` | `entities/TriggerEvent/TriggerEvent.api.ts` | Kendo `DataSourceRequest`; helper appends sort `Id asc`; trigger dialog passes `WorkflowTriggerId` filter | `{ Data: ITriggerEvent[], Total: number }`, mapped to `{ items, total }` | none |
| Workflow event recovery | POST | `/web-api/BUS/workflows/events/{id}/recovery?triggerId={triggerId}` | `entities/TriggerEvent/TriggerEvent.api.ts`, `TriggerEvents/ActionsCell/ActionsCell.tsx` | path workflow event id; query workflow trigger id | remote response message in `response.data` | resumes workflow at event destination |
| Workflow event cancel | POST | `/web-api/BUS/workflows/events/{id}/cancel?action={deleteRecoveryFile}` | `entities/TriggerEvent/TriggerEvent.api.ts`, `TriggerEvents/CancelEvent/CancelEvent.tsx` | path workflow event id; query `action=1|2|3` (`Stop`, `Reset`, `Cancel`) | remote response message in `response.data` | cancels/stops/resets event recovery according to action |
| Service event schema | GET | `/web-api/{ServiceIdentifier}/Events/Schema` | `entities/JobEvent/JobEvent.api.ts`, `JobEvents/JobEvents.tsx` | service identifier path segment | `IDataSchema` | none |
| Service event grid | GET | `/web-api/{ServiceIdentifier}/Events/Grid?...DataSourceRequest` | `entities/JobEvent/JobEvent.api.ts`, `JobEvents/JobEvents.tsx`, `JobEvents/ChildEvents/ChildEvents.tsx` | Kendo `DataSourceRequest`; parent adds `(ParentId is null OR ParentId eq 0)`; child adds `ParentId eq parentId` | `{ Data: any[], Total: number }`, mapped to `{ items, total }` | none |
| Service event details | GET | `/web-api/{ServiceIdentifier}/Events/{eventId}` | `entities/JobEvent/JobEvent.api.ts`, `JobEventDetails/useJobEventDetails.ts` | service identifier + event id | `IEventDetails & Record<string, any>` | none |
| Service event file download | GET | `/web-api/{ServiceIdentifier}/Events/{eventId}/{fileName}/File` | `JobEventDetails/DownloadField/DownloadField.tsx` | service identifier + event id + file name | file stream/blob via `downloadFile` | downloads one event file |
| WHE restore one event | POST | `/web-api/WHE/events/queue/{eventId}` | `JobEvents/ActionsCell/api/restoreEvent.ts`, `JobEvents/ActionsCell/ActionsCell.tsx` | path event id | untyped remote data | queues/restores one WHE event |
| WHE restore all events | POST | `/web-api/WHE/events/queue` | `JobEvents/QueueAction/api/restoreAllEvents.ts`, `JobEvents/QueueAction/QueueAction.tsx` | no body in frontend | untyped remote data | restores all WHE queued events |
| Queue schema | GET | `/web-api/{ServiceIdentifier}/Queue/Schema` | `entities/QueueEntry/QueueEntry.api.ts`, `JobEventDetails/ViewMessage/ViewMessage.tsx`, `Queue/useQueueData.ts` | service identifier path segment | `IDataSchema` | none |
| Queue grid | GET | `/web-api/{ServiceIdentifier}/Queue/Grid?...DataSourceRequest` | `entities/QueueEntry/QueueEntry.api.ts`, `Queue/Queue.tsx` | Kendo `DataSourceRequest`; frontend defaults Status to active statuses | `{ Data: IQueueEntry[], Total: number }`, mapped to `{ items, total }` | none |
| Queue statuses | GET | `/web-api/{ServiceIdentifier}/Queue/Statuses` | `entities/QueueEntry/QueueEntry.api.ts`, `Queue/useQueueData.ts` | service identifier path segment | `{ ActiveStatuses: string[] }` | none |
| Queue entry detail/message | GET | `/web-api/{ServiceIdentifier}/Queue/{id}` | `entities/QueueEntry/QueueEntry.api.ts`, `JobEventMessage/JobEventMessage.tsx` | service identifier + queue entry id | `IDetailedQueueEntry` | none |
| Queue row cancel | PUT | `/web-api/{ServiceIdentifier}/Queue/{id}/Cancel` | `entities/QueueEntry/QueueEntry.api.ts`, `entities/QueueEntry/hooks/useQueueActions.ts` | service identifier + queue entry id | untyped response | cancels one queue entry |
| Queue row reset | PUT | `/web-api/{ServiceIdentifier}/Queue/{id}/Reset` | `entities/QueueEntry/QueueEntry.api.ts`, `entities/QueueEntry/hooks/useQueueActions.ts` | service identifier + queue entry id | untyped response | resets one queue entry |
| Queue bulk cancel | PUT | `/web-api/{ServiceIdentifier}/Queue/Cancel?...DataSourceRequest` | `entities/QueueEntry/QueueEntry.api.ts`, `Queue/Actions/Actions.tsx` | current table state with `skip: 0`, `take: total` | number canceled count | filter-scoped bulk cancel |
| Queue bulk reset | PUT | `/web-api/{ServiceIdentifier}/Queue/Reset?...DataSourceRequest` | `entities/QueueEntry/QueueEntry.api.ts`, `Queue/Actions/Actions.tsx` | current table state with `skip: 0`, `take: total` | number reset count | filter-scoped bulk reset |
| Queue message update | PATCH | `/web-api/{ServiceIdentifier}/Queue/{id}` | `entities/QueueEntry/QueueEntry.api.ts`, `JobEventMessage/JobEventMessage.tsx` | `MessageDetails` JSON payload | untyped response | edits/saves queue entry message |
| Processing states | GET | `/api/Bus/Processing/State` | `entities/ProcessingState/ProcessingState.api.ts` | none | `Record<string, boolean>` keyed by service | none |

### CMS typed endpoint plan

Suggested typed CMS endpoints for Milestones 1, 5, and 6. Exact names can evolve, but each route must remain instance-aware and allowlisted.

| CMS route | Method | Forwards to OxyGen | Permission |
| --- | --- | --- | --- |
| `/api/instances/:instanceId/processing/triggers/schema` | GET | `GET /web-api/BUS/workflows/triggers/schema` | `processing.triggers.view` |
| `/api/instances/:instanceId/processing/triggers/grid` | GET | `GET /web-api/BUS/workflows/triggers/grid` | `processing.triggers.view` |
| `/api/instances/:instanceId/processing/triggers/:triggerId/children` | GET | `GET /web-api/BUS/workflows/triggers/grid` with child filters | `processing.triggers.view` |
| `/api/instances/:instanceId/processing/triggers/:triggerId/cancel` | POST | `POST /web-api/BUS/workflows/triggers/{id}/cancel` | `processing.triggers.cancel` |
| `/api/instances/:instanceId/processing/triggers/cancel-preview` | POST | grid total/count preview from bounded state | `processing.triggers.cancelBulk` |
| `/api/instances/:instanceId/processing/triggers/cancel` | POST | `POST /web-api/BUS/workflows/triggers/cancel` after preview/confirmation | `processing.triggers.cancelBulk` |
| `/api/instances/:instanceId/processing/workflow-events/schema` | GET | `GET /web-api/BUS/workflows/events/schema` | `processing.workflowEvents.view` |
| `/api/instances/:instanceId/processing/workflow-events/grid` | GET | `GET /web-api/BUS/workflows/events/grid` | `processing.workflowEvents.view` |
| `/api/instances/:instanceId/processing/workflow-events/:eventId/recovery` | POST | `POST /web-api/BUS/workflows/events/{id}/recovery` | `processing.workflowEvents.recover` |
| `/api/instances/:instanceId/processing/workflow-events/:eventId/cancel` | POST | `POST /web-api/BUS/workflows/events/{id}/cancel` | `processing.workflowEvents.cancel` |
| `/api/instances/:instanceId/processing/service-events/:serviceIdentifier/schema` | GET | `GET /web-api/{ServiceIdentifier}/Events/Schema` | `processing.serviceEvents.view` |
| `/api/instances/:instanceId/processing/service-events/:serviceIdentifier/grid` | GET | `GET /web-api/{ServiceIdentifier}/Events/Grid` | `processing.serviceEvents.view` |
| `/api/instances/:instanceId/processing/service-events/:serviceIdentifier/:eventId/children` | GET | `GET /web-api/{ServiceIdentifier}/Events/Grid` with `ParentId` filter | `processing.serviceEvents.view` |
| `/api/instances/:instanceId/processing/service-events/:serviceIdentifier/:eventId` | GET | `GET /web-api/{ServiceIdentifier}/Events/{eventId}` | `processing.serviceEvents.details.view` |
| `/api/instances/:instanceId/processing/service-events/:serviceIdentifier/:eventId/files/:fileName` | GET | `GET /web-api/{ServiceIdentifier}/Events/{eventId}/{fileName}/File` | `processing.serviceEvents.files.download` |
| `/api/instances/:instanceId/processing/service-events/WHE/:eventId/restore` | POST | `POST /web-api/WHE/events/queue/{eventId}` | `processing.serviceEvents.restore` |
| `/api/instances/:instanceId/processing/service-events/WHE/restore-preview` | POST | bounded preview | `processing.serviceEvents.restoreBulk` |
| `/api/instances/:instanceId/processing/service-events/WHE/restore` | POST | `POST /web-api/WHE/events/queue` after preview/confirmation | `processing.serviceEvents.restoreBulk` |
| `/api/instances/:instanceId/processing/queue/:serviceIdentifier/schema` | GET | `GET /web-api/{ServiceIdentifier}/Queue/Schema` | `processing.queue.view` or `processing.serviceEvents.messages.view` when called for EMM message |
| `/api/instances/:instanceId/processing/queue/:serviceIdentifier/grid` | GET | `GET /web-api/{ServiceIdentifier}/Queue/Grid` | `processing.queue.view` |
| `/api/instances/:instanceId/processing/queue/:serviceIdentifier/statuses` | GET | `GET /web-api/{ServiceIdentifier}/Queue/Statuses` | `processing.queue.view` |
| `/api/instances/:instanceId/processing/queue/:serviceIdentifier/:entryId` | GET | `GET /web-api/{ServiceIdentifier}/Queue/{id}` | `processing.serviceEvents.messages.view` or `processing.queue.view` |
| `/api/instances/:instanceId/processing/queue/:serviceIdentifier/:entryId` | PATCH | `PATCH /web-api/{ServiceIdentifier}/Queue/{id}` | `processing.queue.messages.edit` |
| `/api/instances/:instanceId/processing/queue/:serviceIdentifier/:entryId/reset` | PUT/POST | `PUT /web-api/{ServiceIdentifier}/Queue/{id}/Reset` | `processing.queue.reset` |
| `/api/instances/:instanceId/processing/queue/:serviceIdentifier/:entryId/cancel` | PUT/POST | `PUT /web-api/{ServiceIdentifier}/Queue/{id}/Cancel` | `processing.queue.cancel` |
| `/api/instances/:instanceId/processing/queue/:serviceIdentifier/reset-preview` | POST | grid total/count preview | `processing.queue.resetBulk` |
| `/api/instances/:instanceId/processing/queue/:serviceIdentifier/reset` | PUT/POST | `PUT /web-api/{ServiceIdentifier}/Queue/Reset` after preview/confirmation | `processing.queue.resetBulk` |
| `/api/instances/:instanceId/processing/queue/:serviceIdentifier/cancel-preview` | POST | grid total/count preview | `processing.queue.cancelBulk` |
| `/api/instances/:instanceId/processing/queue/:serviceIdentifier/cancel` | PUT/POST | `PUT /web-api/{ServiceIdentifier}/Queue/Cancel` after preview/confirmation | `processing.queue.cancelBulk` |
| `/api/instances/:instanceId/processing/states` | GET | `GET /api/Bus/Processing/State` | `processing.errors.view` |

CMS implementation notes:

- Route must validate `serviceIdentifier` with an allowlist or strict token pattern such as `^[A-Za-z0-9_-]+$`; prefer known OxyGen service identifiers where available.
- Route must validate numeric IDs and reject unsafe file names/path traversal for file download.
- Route must use instance visibility/Tenant scope before remote authentication.
- Route must not expose remote credentials/cookies.
- Route must log sanitized endpoint family, instance id, bounded take/window, status, duration, and row total; never log raw messages, attachments, credentials, cookies, or large payload bodies.

## Feature parity checklist

Status meanings for this inventory:

- `Identified`: source and endpoint/action located.
- `Needs CMS contract`: typed endpoint and response contract still to implement.
- `Needs UX decision`: CMS shell can intentionally differ, but must preserve the behavior.

| Feature | Source evidence | Parity requirement | Status |
| --- | --- | --- | --- |
| Trigger schema columns | `Triggers.tsx`, `getTriggersSchema.ts` | CMS trigger grid must render schema-driven columns and respect `schema.Grids.Parent`. | Identified; needs CMS contract |
| Trigger parent filtering | `Trigger.api.ts` | Parent grid adds `IsChild neq true`. | Identified; needs CMS contract |
| Trigger child expansion | `ChildTriggers.tsx`, `Trigger.api.ts` | Expand only parent rows with children; fetch child grid server-side using `IsChild eq true` + `TriggerGroupId eq parentId`. | Identified; needs CMS contract |
| Trigger search | `Triggers.tsx` | Search fields: `WorkflowId`, `WorkflowTriggerId`, `ServiceIdentifier`, `JobId`, `Status`; map through schema id fields. | Identified |
| Trigger row view events | `Triggers/ActionsCell.tsx` | Selecting row opens/loads workflow events filtered by trigger id; disabled for parent triggers. | Identified; needs CMS UX |
| Trigger row cancel | `Triggers/ActionsCell.tsx`, `Trigger.api.ts` | Confirmation; disabled on `Canceled`/`Completed`; server RBAC; audit mutation. | Identified; needs CMS action route |
| Trigger bulk cancel | `Triggers/Actions.tsx`, `Trigger.api.ts` | Confirmation + filter-scope preview + hard total guard before forwarding; never unbounded by default. | Identified; needs guardrails |
| Workflow event schema columns | `TriggerEvents.tsx`, `getTriggerEventsSchema.ts` | CMS workflow event grid must render schema-driven columns. | Identified; needs CMS contract |
| Workflow event sort | `TriggerEvent.api.ts` | Preserve/default `Id asc` unless changed intentionally. | Identified |
| Workflow event search | `TriggerEvents.tsx` | Search fields: `WorkflowId`, `WorkflowTriggerId`, `ServiceIdentifier`, `Status`. | Identified |
| Workflow event recovery | `TriggerEvents/ActionsCell.tsx`, `TriggerEvent.api.ts` | Confirmation; disabled for `Completed`/`Pending`/`Recovery`/`Canceled`; server RBAC; audit; refresh affected grid. | Identified; needs CMS action route |
| Workflow event three-mode cancel | `CancelEvent.tsx`, `TriggerEvent.api.ts` | Dialog choices `Stop=1`, `Reset=2`, `Cancel=3` with original explanatory copy or CMS-equivalent; server RBAC; audit. | Identified; needs CMS action route |
| Workflow event service drilldown | `TriggerEvents/ActionsCell.tsx` | Open/load service event grid with `jobId`, `triggerId`, `serviceIdentifier`, `triggerEventId`. | Identified; needs CMS UX |
| Service event schema columns | `JobEvents.tsx`, `JobEvent.api.ts` | Service-specific schema per service identifier; cache schema briefly per instance/service. | Identified; needs CMS contract |
| Service event parent filtering | `JobEvent.api.ts` | Parent grid adds `(ParentId is null OR ParentId eq 0)`. | Identified; needs CMS contract |
| Service event child expansion | `ChildEvents.tsx`, `JobEvent.api.ts` | Expand parent rows only; fetch children server-side with `ParentId eq parentId`. | Identified; needs CMS contract |
| Service event search | `JobEvents.tsx` | Search fields: `WorkflowId`, `WorkflowTriggerId`, `WorkflowEventId`, `ServiceIdentifier`, `JobId`, `Status`; resolve service context carefully. | Identified |
| Service event details | `ActionsCell.tsx`, `JobEventDetails.tsx`, `JobEvent.api.ts` | Load detail on demand; render grouped schema fields; advanced toggle; safe rendering. | Identified; needs CMS contract/UX |
| Event details advanced mode | `JobEventDetails.tsx`, `helpers.ts` | Persist advanced state in session; hide Advanced group fields by default. | Identified |
| Event error display | `ErrorField.tsx`, `ErrorWindow.tsx` | Prominent error section/window; copyable/safe text; red severity. | Identified |
| Event file download | `DownloadField.tsx` | Dropdown grouped by Local/Payload; one-file download through CMS endpoint; sanitize filename and avoid direct OxyGen URL in browser. | Identified; needs CMS file route |
| Event payload diff | `JobEventDetails.tsx` | If two payload fields exist, compare incoming/outgoing JSON; handle invalid JSON safely. | Identified; needs CMS UX hardening |
| EMM message view | `ActionsCell.tsx`, `ViewMessage.tsx`, `JobEventMessage.tsx` | EMM rows/details can open message dialog via queue schema/detail; permission-gated. | Identified; needs CMS queue/message routes |
| EMM message edit/save | `JobEventMessage.tsx`, `QueueEntry.api.ts` | Editable `MessageDetails`; PATCH save disabled for terminal statuses; server RBAC and audit. | Identified; needs CMS action route |
| Original message view | `OriginalMessage.tsx`, `JobEventMessage.tsx` | Show only when original message/editor metadata exists. | Identified |
| Message attachments | `AttachmentControl.tsx` | Attachments download from loaded base64 payload; do not log raw content; consider size/streaming guardrails. | Identified; needs CMS UX/security limit |
| WHE restore row | `JobEvents/ActionsCell.tsx`, `restoreEvent.ts` | Restore one queued WHE event; enabled only status `Queued` and no processing lock; server RBAC/audit. | Identified; needs CMS action route |
| WHE restore all | `QueueAction.tsx`, `restoreAllEvents.ts` | Confirmation + preview/guardrails before global restore-all; server RBAC/audit. | Identified; needs guardrails |
| Delayed-processing queue launcher | `QueueAction.tsx` | Show queue entrypoint for services in `settings.DelayedProcessing`; WHE shows restore-all instead. | Identified; needs CMS UX decision |
| Queue grid | `Queue.tsx`, `QueueEntry.api.ts` | If included in Processing Errors parity, render service queue with schema columns, active status defaults, server paging/filtering. | Identified; likely follow-on slice |
| Queue row reset/cancel | `ActionsCell.tsx`, `useQueueActions.ts` | Confirmation + per-entry enable flags + RBAC/audit. | Identified; needs CMS action routes if queue included |
| Queue bulk reset/cancel | `Queue/Actions.tsx`, `QueueEntry.api.ts` | Preview + guardrails before forwarding `take=total`; never unbounded. | Identified; needs guardrails if queue included |
| Processing state labels | `ProcessingState.api.ts`, `ProcessingState.constants.ts`, `ProcessingState.tsx` | Surface state without blocking grids; poll/refetch safely; map statuses consistently. | Identified; needs CMS UX decision |

## Action and RBAC matrix

The OxyGen frontend mostly relies on UI disabled states and license checks. CMS must enforce all actions server-side with explicit permissions and Tenant/instance visibility. Suggested permission names extend the plan's initial list to cover queue/message actions observed during inventory.

| Action | OxyGen frontend source | OxyGen endpoint | Existing enable/disable logic | CMS permission | Audit required | Large-data guardrail |
| --- | --- | --- | --- | --- | --- | --- |
| View Processing Errors module | all grids | read-only endpoints | available through frontend navigation/dialogs | `processing.errors.view` | no | default filters/page cap |
| View triggers | `Triggers.tsx` | `GET /web-api/BUS/workflows/triggers/schema`, `GET /grid` | none beyond app access | `processing.triggers.view` | no | page cap/default take |
| View child triggers | `ChildTriggers.tsx` | trigger grid with child filters | only for parent with children | `processing.triggers.view` | no | fetch on expand only |
| Cancel trigger row | `Triggers/ActionsCell.tsx` | `POST /web-api/BUS/workflows/triggers/{id}/cancel?isParent={bool}` | disabled if `Canceled`/`Completed` or invalid license | `processing.triggers.cancel` | yes | single id only |
| Cancel all triggers | `Triggers/Actions.tsx` | `POST /web-api/BUS/workflows/triggers/cancel?...` | disabled if invalid license or no total | `processing.triggers.cancelBulk` | yes | required preview, filter scope, hard max/typed confirmation |
| View workflow events | `TriggerEvents.tsx` | workflow schema/grid | opened from trigger row or status nav | `processing.workflowEvents.view` | no | page cap/default take |
| Recover workflow event | `TriggerEvents/ActionsCell.tsx` | `POST /web-api/BUS/workflows/events/{id}/recovery?triggerId={triggerId}` | disabled for `Completed`, `Pending`, `Recovery`, `Canceled`, invalid license | `processing.workflowEvents.recover` | yes | single id only |
| Stop workflow event | `CancelEvent.tsx` | `POST /web-api/BUS/workflows/events/{id}/cancel?action=1` | disabled for `Completed`/`Canceled`, invalid license before dialog | `processing.workflowEvents.cancel` | yes | single id only |
| Reset workflow event | `CancelEvent.tsx` | `POST /web-api/BUS/workflows/events/{id}/cancel?action=2` | same as cancel dialog availability | `processing.workflowEvents.cancel` | yes | single id only; document child event effect |
| Cancel workflow event fully | `CancelEvent.tsx` | `POST /web-api/BUS/workflows/events/{id}/cancel?action=3` | same as cancel dialog availability | `processing.workflowEvents.cancel` | yes | single id only; document parent/child effect |
| View service events | `JobEvents.tsx` | `GET /web-api/{ServiceIdentifier}/Events/Schema`, `GET /Events/Grid` | opened from workflow event row | `processing.serviceEvents.view` | no | page cap/default take |
| View child service events | `ChildEvents.tsx` | service event grid with `ParentId` filter | only for parent with children | `processing.serviceEvents.view` | no | fetch on expand only |
| View service event details | `ActionsCell.tsx`, `JobEventDetails.tsx` | `GET /web-api/{ServiceIdentifier}/Events/{eventId}` | always available | `processing.serviceEvents.details.view` | optional read audit for sensitive payloads | fetch on open only |
| Download event file | `DownloadField.tsx` | `GET /web-api/{ServiceIdentifier}/Events/{eventId}/{fileName}/File` | disabled if no selected existing file | `processing.serviceEvents.files.download` | yes or at least application log | single file only; sanitize file name; stream/size guard |
| View EMM message | `ActionsCell.tsx`, `ViewMessage.tsx`, `JobEventMessage.tsx` | `GET /Queue/Schema`, `GET /Queue/{id}` | EMM service only | `processing.serviceEvents.messages.view` | optional read audit; do not log body | fetch on open only; size guard |
| Save EMM message | `JobEventMessage.tsx` | `PATCH /web-api/{ServiceIdentifier}/Queue/{id}` | disabled while saving, terminal status, invalid license | `processing.queue.messages.edit` | yes | one entry only; sanitize/audit summary not body |
| View original EMM message | `OriginalMessage.tsx` | data included in queue entry detail | only if original data exists | `processing.serviceEvents.messages.view` | optional read audit | do not log body |
| Download EMM attachment | `AttachmentControl.tsx` | base64 from queue entry detail | only when attachment selected | `processing.serviceEvents.messages.view` or `processing.serviceEvents.files.download` | yes if downloaded | size guard; do not log content |
| Restore one WHE event | `JobEvents/ActionsCell.tsx` | `POST /web-api/WHE/events/queue/{eventId}` | WHE only; enabled only `Queued` and no `ProcessingLock` | `processing.serviceEvents.restore` | yes | single id only |
| Restore all WHE events | `QueueAction.tsx` | `POST /web-api/WHE/events/queue` | WHE toolbar action; no count guard in frontend | `processing.serviceEvents.restoreBulk` | yes | required preview, filter/scope/confirmation, optional elevated admin-only initial rollout |
| View queue | `Queue.tsx` | queue schema/status/grid | service must be delayed-processing service | `processing.queue.view` | no | active-status default, page cap |
| Reset queue row | `Queue/ActionsCell.tsx`, `useQueueActions.ts` | `PUT /web-api/{ServiceIdentifier}/Queue/{id}/Reset` | `IsResetable` and valid license | `processing.queue.reset` | yes | single id only |
| Cancel queue row | `Queue/ActionsCell.tsx`, `useQueueActions.ts` | `PUT /web-api/{ServiceIdentifier}/Queue/{id}/Cancel` | `IsCancelable` and valid license | `processing.queue.cancel` | yes | single id only |
| Reset all queue entries | `Queue/Actions.tsx` | `PUT /web-api/{ServiceIdentifier}/Queue/Reset?...` | no total zero; invalid license disabled | `processing.queue.resetBulk` | yes | required preview, filter scope, hard max/typed confirmation |
| Cancel all queue entries | `Queue/Actions.tsx` | `PUT /web-api/{ServiceIdentifier}/Queue/Cancel?...` | no total zero; invalid license disabled | `processing.queue.cancelBulk` | yes | required preview, filter scope, hard max/typed confirmation |
| View processing state | `ProcessingState.api.ts` | `GET /api/Bus/Processing/State` | refetch interval 30s | `processing.errors.view` | no | low-frequency polling |

Initial permission catalog recommendation:

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
processing.queue.view
processing.queue.reset
processing.queue.cancel
processing.queue.resetBulk
processing.queue.cancelBulk
processing.queue.messages.edit
processing.actions.audit.view
```

RBAC rules:

- Every read route checks `processing.errors.view` plus the domain-specific view permission.
- Every route checks Tenant/instance visibility before remote calls.
- Mutating actions require domain action permission and create a CMS audit/application log entry with actor, Tenant, instance, action, target ids, remote endpoint family, result, duration, and sanitized message.
- Bulk permissions are separate from row permissions.
- UI disabled/hidden states are only convenience; server denial is the security boundary.
- A license-invalid remote state may disable UI actions, but CMS permissions still apply and should return clear safe errors.

## Performance and large-data guardrails

These guardrails are mandatory before implementation can be called production-safe for customers with tens/hundreds of thousands of rows.

### API guardrails

1. Never fetch all trigger, workflow-event, service-event, or queue rows by default.
2. Preserve server-side Kendo `DataSourceRequest` semantics (`skip`, `take`, `sort`, `filter`, grouped/nested filters) instead of loading all rows into CMS memory.
3. Default `take` to a safe small page size when absent. Suggested initial default: `50`.
4. Hard clamp `take` for normal paging. Suggested initial max: `250`.
5. Reject or clamp negative `skip`, non-numeric `take`, and malformed filters.
6. Route child grids through explicit parent IDs; never materialize all children and filter in browser memory.
7. Details, messages, files, and attachments load only on demand.
8. File/message routes should have timeout and size limits; do not log raw file/message/attachment content.
9. Schema caching is acceptable per instance/service for a short TTL; massive grid response caching should be avoided unless explicitly designed.
10. Every remote call should have timeout handling and return a CMS-safe error envelope without breaking the shell.
11. Observability should log sanitized endpoint family, instance id, page size, row total, duration, HTTP status, and failure class.
12. Service identifier and file names must be validated before URL construction.

### Bulk-action guardrails

OxyGen frontend uses `take: total` for trigger cancel-all and queue reset/cancel-all. That is not safe as a CMS default.

CMS bulk action requirements:

1. Require a server preview endpoint that returns filter summary and affected total before mutation.
2. Require explicit filter scope; disallow broad all-history/default-empty filters for destructive bulk actions unless SystemAdmin and typed confirmation are present.
3. Require separate RBAC permission for bulk actions.
4. Require typed confirmation for high counts or broad filters.
5. Record audit/application log row before and after mutation with sanitized results.
6. If OxyGen only supports filter-scoped bulk via `DataSourceRequest`, forward only after preview/confirmation and cap/guard totals.
7. If affected count is very large, prefer staged backend batch/job execution over synchronous browser request.
8. Refresh only affected grid windows after success; do not reload all panes/all historical data.

### Frontend/shell guardrails

1. Initial Processing Errors page should request schema plus first safe page/window only.
2. Filters/search should be debounced and stale responses ignored/canceled.
3. Browser state must not retain all historical rows.
4. Virtual scrolling, if used, must remain server-windowed.
5. Wide schema-driven grids need horizontal scroll; toolbars anchor to visible CMS content width, not internal table width.
6. Child grids/details/message panels fetch only when expanded/opened.
7. Remote failures show scoped panel/grid errors and do not lock the full CMS shell.
8. Mobile should use step navigation: Triggers -> Workflow Events -> Service Events -> Details/Message, rather than stacking four huge grids.

## CMS shell and grid recommendations

The OxyGen frontend uses dialog-hosted `PaginationTable` surfaces. CMS should port the behavior into the OxyGen CMS shell rather than embedding the OxyGen app.

Recommended CMS shell:

- Route label: **Processing Errors**.
- Preferred route: `/Processing-Errors/Entity/:instanceId` with a backward-compatible alias from any current `/Workflow-Errors/Entity/:instanceId` route.
- Header context: selected Tenant/Instance, refresh button, last refreshed timestamp, and safe default filter preset.
- Desktop layout:
  - Primary full-width trigger grid at top or left.
  - Workflow Events pane driven by selected trigger.
  - Service Events pane driven by selected workflow event/service context.
  - Details/message drawer or bottom/right panel loaded on row action.
- Mobile layout:
  - Stepper/tab flow: `Triggers`, `Workflow Events`, `Service Events`, `Details`.
  - Avoid four simultaneous grids in one vertical scroll.
- Use shared CMS `ManagedGrid`/grid-section conventions where practical:
  - toolbar filters/actions on the same command row when width allows;
  - right-aligned actions/shared grid controls;
  - horizontal body scroll for wide schema columns;
  - action menus rendered outside overflow-clipped grid cells;
  - dark Kendo styling.
- Keep Processing Errors status/error severity consistent with CMS dashboard conventions: red for failures/actions needed, yellow for warning/skipped/unknown, green for healthy/completed.
- Keep existing aggregated Processing Errors summaries as supporting context only; do not let summaries replace the OxyGen parity grids.

Recommended grid defaults:

| Grid | Initial data load | Default filters | Max page/window |
| --- | --- | --- | --- |
| Triggers | schema + first page only | active/error/recovery/recent; parent only `IsChild neq true` | default 50, max 250 |
| Child triggers | on expand only | `IsChild eq true`, `TriggerGroupId eq parentId` | default 50, max 250 |
| Workflow events | after trigger selection or explicit route filter | selected trigger id, active/error/recovery/recent | default 50, max 250 |
| Service events | after workflow-event selection/service context | selected workflow/trigger/event/job filters; parent only | default 50, max 250 |
| Child service events | on expand only | `ParentId eq parentId` | default 50, max 250 |
| Details/message/file | on action/open only | one event/entry/file | one record/file only |
| Queue | only from delayed-processing action | active statuses from `/Queue/Statuses` | default 50, max 250 |

## Open questions that do not block implementation

These should be resolved during Milestones 1-6, but none block starting the typed read-only API foundation.

1. Should the first CMS UI use classic paging only, or introduce server-windowed virtual scrolling after the base grids are stable?
2. What exact default page size and max `take` should Brad prefer for production customer instances? The inventory recommends default `50`, max `250`.
3. Should high-risk bulk actions initially be SystemAdmin-only even if row actions are delegated to TenantAdmin/support roles?
4. Does OxyGen provide a separate count/preview endpoint for trigger/queue bulk operations, or should CMS use grid totals from a bounded preview request?
5. Should WHE `Restore All` be filter-scoped in CMS even though the OxyGen frontend calls a global endpoint with no request body?
6. Which queue surfaces are required in the first Processing Errors parity milestone versus a follow-on queue/message slice? Message view for EMM details requires at least queue schema/detail routes.
7. Should message attachment downloads use client-side base64 from queue detail as OxyGen does, or should CMS add a streamed/sanitized attachment endpoint if payload sizes are large?
8. Should read access to raw messages/files be audited as security events or normal application logs?
9. Should CMS cache OxyGen form sessions per CMS user/instance for this module, or login per request for the first implementation?
10. Should route naming migrate immediately to `/Processing-Errors/Entity/:instanceId`, or keep an internal alias until all dashboard links are updated?
11. What timeout values are acceptable per grid/schema/detail/file/action call for slow customer OxyGen instances?
12. Should the status/processing state pause/resume controls be implemented in Processing Errors, or kept as read-only labels until RBAC/audit for pause/resume is designed?

## Milestone 0 completion checklist

- [x] Inventory trigger grid/components/actions/endpoints/types.
- [x] Inventory workflow event grid/components/actions/endpoints/types.
- [x] Inventory service event grid/components/actions/endpoints/types.
- [x] Inventory event details/files/message components/endpoints/types.
- [x] Inventory queue/message/processing-state adjacent Processing endpoints and actions.
- [x] Include exact source paths.
- [x] Include endpoint method/path matrix.
- [x] Include action/RBAC matrix.
- [x] Include performance/large-data guardrails.
- [x] Include CMS shell/grid recommendations.
- [x] Include non-blocking open questions.
