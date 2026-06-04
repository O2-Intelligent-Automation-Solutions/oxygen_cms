# First-Run Setup Wizard

The setup wizard configures persistent CMS storage before allowing the first administrator to be created.

## Setup Sequence

```text
Database setup → Apply schema → Create first administrator → Sign in
```

## Step 1 — Database Setup

The wizard supports three deployment paths:

1. **Self-contained local MySQL**
   - Available when the deployment advertises `CMS_MANAGED_MYSQL=true`.
   - Uses deployment-provided MySQL values.
   - Does not expose generated secrets in the browser.
2. **Create/configure database on a local MySQL server**
   - Collects local port, database name, privileged credentials, and application runtime credentials.
3. **Connect to an existing local/remote MySQL server**
   - Collects host, port, database name, privileged schema credentials, and application runtime credentials.

Defaults:

```text
Database: O2IAS_CMS
Application DB user: oxygen_cms
```

## Step 2 — Apply Schema

Current target schema:

```text
0.07
```

Schema versions are recorded in `cms_schema_versions`.

## Step 3 — Create First Administrator

The first SystemAdmin account can only be created after database settings exist, the database connection succeeds, and schema version is current.

## Step 4 — Sign In

After bootstrap, the normal sign-in flow is shown. Auth/RBAC, instances, grid preferences, and application settings all use MySQL-backed repositories.

## Self-Contained Development Workflow

```bash
npm run dev:db:reset
npm run dev:managed
```

In another terminal:

```bash
npm run dev:managed:smoke
```

## Safety Notes

- Setup state in `apps/api/data/settings.json` is local-only and ignored by git.
- Do not commit database passwords, runtime credentials, generated setup state, or remote OxyGen credentials.
- Browser setup should redact deployment-managed secrets.
