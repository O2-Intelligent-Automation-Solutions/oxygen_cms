# Phase 2 — OxyGen CMS Roadmap

## Goal

Extend CMS from read-only polling into a bidirectional management plane where remote OxyGen instances can enroll, call back, maintain persistent outbound connections, and receive centrally authorized commands.

## Phase 2 Assumptions

Phase 2 starts after Phase 1 delivers:

- encrypted remote credentials,
- real connectivity testing,
- background monitoring/history,
- license/settings/workflow collectors,
- dashboard and instance detail views,
- hardened deployment packaging.

## Milestone 2A — Remote Instance Enrollment API

Remote OxyGen deployments can initiate enrollment with CMS.

Scope:

- Enrollment token generation in CMS.
- Instance-side registration endpoint.
- Approval workflow in CMS.
- Enrollment audit trail.
- Revocation/rotation of enrollment credentials.

Acceptance criteria:

- Admin can create an enrollment token.
- Remote instance can register using token.
- Admin can approve/reject pending enrollment.
- Approved instance appears in Instances grid.

## Milestone 2B — Instance Callback Webhooks

Remote OxyGen deployments can push events/snapshots to CMS.

Scope:

- Signed webhook endpoint.
- Replay protection.
- Event ingestion queue/table.
- Normalized event status mapping.
- Webhook delivery diagnostics.

## Milestone 2C — Persistent Outbound Instance Connection

Remote OxyGen deployments maintain an outbound persistent connection to CMS.

Scope:

- WebSocket or equivalent persistent channel.
- Instance identity/authentication.
- Heartbeats and reconnect logic.
- Connection status in dashboard.
- Message envelope/versioning.

## Milestone 2D — Reverse Command Channel

CMS can send authorized commands to an instance over the outbound channel.

Scope:

- Command registry.
- Authorization checks.
- Command audit log.
- Request/response correlation.
- Timeout/retry behavior.

Initial commands should remain read-only or low-risk until approvals and audit are mature.

## Milestone 2E — Centralized Account Provisioning

CMS can coordinate user provisioning with remote OxyGen deployments while still respecting local user systems.

Scope:

- Identity mapping between CMS users and remote OxyGen users.
- Provision/deactivate flows.
- Role/profile mapping.
- Conflict handling.
- Audit reports.

## Milestone 2F — Notifications and Escalations

Configurable notifications for monitoring and command events.

Scope:

- Notification channels.
- Rule builder.
- Quiet hours/escalation policy.
- Per-tenant/per-group notification scope.
- Alert history.

## Phase 2 Security Requirements

- Mutual authentication for instance callbacks/channels.
- Key rotation and revocation.
- Least-privilege command authorization.
- Full audit trail for enrollment, callbacks, commands, and account provisioning.
- Strong replay protection for webhooks.
- Secure-by-default tunnel/command behavior.

## Phase 2 Open Design Questions

- WebSocket vs webhook-only vs hybrid channel design.
- Whether reverse commands require an operator approval workflow.
- How remote OxyGen version compatibility is negotiated.
- How centralized user provisioning coexists with remote-local emergency admin accounts.
- Whether tunnels are generic network tunnels or application-command channels only.
