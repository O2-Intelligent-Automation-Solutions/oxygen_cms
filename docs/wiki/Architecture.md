# Architecture

OxyGen CMS is a standalone React/Node/MySQL application.

## Layers

- **React Web UI** — Kendo UI grids/forms, setup wizard, admin pages.
- **Fastify API** — auth, setup, CRUD, settings, and future collectors.
- **MySQL** — durable CMS storage.
- **Remote OxyGen deployments** — queried by CMS over HTTPS in Phase 1.

## Current Persistence

Schema version `0.07` persists:

- setup/schema state,
- tenants,
- roles,
- users,
- user groups,
- sessions,
- instances,
- instance status/check history shell,
- grid preferences,
- application settings.

## Next Architecture Work

- encrypted credential service,
- OxyGen API client,
- background scheduler,
- monitor history repositories,
- collector services.
