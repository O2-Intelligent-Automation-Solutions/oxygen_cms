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

Default URLs:

- API health: <http://localhost:3000/api/health>
- Web app: <http://localhost:5173>

## Validation

```bash
npm test
npm run typecheck
npm run build
```

## Scope Guard

This repository is standalone. Do not modify `oxygen_backend` or `oxygen_frontend` while developing CMS unless Brad explicitly grants per-session permission.
