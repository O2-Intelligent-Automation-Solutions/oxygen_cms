# OpenAPI Spec

The canonical OpenAPI 3.1 specification is maintained in this repository:

```text
docs/openapi.yaml
```

Current API spec version: `0.8.0`.
Current CMS schema version: `0.08`.

This update documents:

- dashboard `poller` status payloads
- background poller system controls:
  - `GET /api/system/poller`
  - `POST /api/system/poller/pause`
  - `POST /api/system/poller/resume`
  - `POST /api/system/poller/run-now`
- persisted application logs:
  - `GET /api/logs`
- application log retention settings:
  - `GET /api/app-settings/log-retention`
  - `PUT /api/app-settings/log-retention`

It is also published in the GitHub Wiki:

- [OpenAPI Spec](https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/wiki/OpenAPI-Spec)
