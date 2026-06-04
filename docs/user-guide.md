# OxyGen CMS User Guide

This document starts the user-facing documentation for the Phase 1 CMS application.

## What OxyGen CMS Does

OxyGen CMS centrally tracks enrolled OxyGen BPM/IPaaS OPT Web Services deployments. Phase 1 is read-only from the perspective of remote OxyGen systems: CMS connects outward over HTTPS and collects status/snapshot information.

## First-Time Setup

1. Open the CMS web application.
2. Choose a database setup mode.
3. Apply the CMS schema.
4. Create the first administrator.
5. Sign in.

Current schema target shown by setup:

```text
0.07
```

## Navigation Overview

### Dashboard

Shows high-level operational status. As monitoring collectors are completed, this view will summarize availability, SSL, licensing, processing, and workflow health.

### Organizations

Contains tenant administration. The word shown for tenant can be changed under Settings → General → Labels.

### Instances

Manual enrollment and management of remote OxyGen deployments.

Instance fields:

- Tenant
- Name
- Description
- Protocol
- Host / URL
- Port
- Username
- Password
- Polling enabled
- Polling interval

Notes:

- HTTPS defaults to port `443`.
- HTTP defaults to port `80`.
- Username defaults to `admin`.
- Tenant assignment cannot be changed after an instance is created.
- Launch opens `{protocol}://{host}:{port}/optws/oxygen.aspx` in a new browser tab.

### Security

User, role, and group administration.

- Users can have multiple roles.
- Users can belong to multiple groups.
- Groups and users can be configured for none/all/specific instance access.
- Tenant assignment is locked after creation.

### Settings → General

Current section: **Labels**.

The first configurable label is:

```text
Tenant = Tenant
```

Changing this only updates labels in the CMS UI. It does not rename database tables, API fields, or internal authorization concepts.

Example:

```text
Tenant = Customer
```

The UI will display Customer/Customers where appropriate.

## Managed Grids

Most admin pages use managed grids with persisted preferences.

Supported grid preferences include:

- column visibility,
- column order,
- column width,
- sort state,
- grouping,
- filters visible/hidden.

Preferences are stored per signed-in user.

## Current Limitations

- Remote OxyGen credentials must be encrypted before production use.
- Test Connectivity is still a scaffold and must be replaced with real DNS/HTTPS/SSL/auth/API checks.
- Background polling/history and collectors are planned but not complete.
- Notification configuration is planned for a later phase.
