# OpenAPI Spec

The canonical OpenAPI 3.1 specification is maintained in this repository:

```text
docs/openapi.yaml
```

Current API spec version: `0.8.0`.
Current CMS schema version: `0.10`.

This update documents:

- instance CSV import/export endpoints:
  - `GET /api/instances/export.csv` exports visible instances as CSV. Global users receive a `tenant` column populated by Tenant name; tenant-scoped users receive only their Tenant's instances and the `tenant` column is omitted. The export includes `check_license`, `archived`, `metadata`, and `notes`; the `password` column is always blank.
  - `POST /api/instances/import` imports CSV text with `{ csv, dryRun? }`, upserting by `instance_guid` / instance `id`. Global users assign Tenants by Tenant name or leave `tenant` blank for global instances. Tenant-scoped users import only into their assigned Tenant. `metadata` must be valid JSON when provided; notes can be HTML/Markdown/RTF/text. Blank update passwords preserve stored credentials; create rows require a password.
- `GET /api/instances?includeArchived=true` archive visibility for retained servers
- dashboard `poller` status payloads
- background poller system controls:
  - `GET /api/system/poller`
  - `POST /api/system/poller/pause`
  - `POST /api/system/poller/resume`
  - `POST /api/system/poller/run-now`
- persisted application logs:
  - `GET /api/logs` lists persisted Audit, Service, CRUD, Connection, Security, and UI logs after enforcing the configured retention window. CRUD is reserved for user-initiated entity create/update/delete operations; settings/grid preference saves log as UI. `type` and `severity` accept one or more values via repeated or comma-separated query parameters, `entityGuid` filters logs for a specific instance/entity, and `tenantId` filters tenant-associated logs. Tenant-scoped users are automatically limited to their tenant. API activity details include friendly `message`, `apiCall` with `{Entity_Guid}` route tokens, `responseCode`, nullable `entityGuid`, nullable `tenantId`, and failed response error text when available. Manual connectivity checks log Warning/Error based on the connectivity result even when the test endpoint itself returns HTTP 200.
  - `DELETE /api/logs` clears all persisted application logs and returns `{ deleted }`; this endpoint is excluded from automatic application log capture so clearing logs does not recreate a log row.
- application log retention settings:
  - `GET /api/app-settings/log-retention`
  - `PUT /api/app-settings/log-retention`

It is also published in the GitHub Wiki:

- [OpenAPI Spec](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/OpenAPI-Spec)
