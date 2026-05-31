# Development Setup

## Prerequisites

- Node.js 22+
- npm 10+
- Docker / Docker Compose for local MySQL

## Local Development

Install dependencies:

```bash
npm install
```

Start the MySQL/API/web development stack:

```bash
docker compose up
```

Or run services directly after starting MySQL:

```bash
npm --workspace @oxygen-cms/api run dev
npm --workspace @oxygen-cms/web run dev
```

Default local URLs:

- API health: <http://localhost:3000/api/health>
- Web app: <http://localhost:5173>

Remote development review:

- API binds to `0.0.0.0` by default via `API_HOST=0.0.0.0`.
- The Vite web server binds to `0.0.0.0` and allows remote host headers for review through IP addresses, DNS names, SSH tunnels, or reverse proxies.
- Replace `<server-host>` with the remote server DNS name or IP:
  - API health: `http://<server-host>:3000/api/health`
  - Web app: `http://<server-host>:5173`

## Validation

```bash
npm test
npm run typecheck
npm run build
```

## Scope Guard

This repository is standalone. Do not modify `oxygen_backend` or `oxygen_frontend` while developing CMS unless Brad explicitly grants per-session permission.
