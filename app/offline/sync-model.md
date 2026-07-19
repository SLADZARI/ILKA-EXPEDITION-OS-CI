# Offline Command and Synchronization Model

## Local data

Cached locally:

- Expedition identity and timezone;
- latest authoritative Calendar Day and Product Stage projections;
- active and recent assignments;
- Card Bundles and card content;
- task states and evidence metadata;
- Captain safety messages;
- outbound command queue.

## Queueable commands

`acknowledge_card`, `start_task`, `block_task`, `complete_task`, `confirm_output`, `request_day_close`, and `request_stage_advance` may be created offline.

Each command contains a unique `command_id` used as its idempotency key. Retrying the same command returns the original result and must not duplicate events.

## Sync states

- `pending`: stored locally, not yet accepted by server;
- `synced`: accepted and represented in authoritative event log;
- `conflict`: server version or state prevents automatic application;
- `rejected`: permission or validation failure; no automatic retry.

## Calendar boundary while offline

At local boundary the device may derive `expired_pending_sync` for prior assignments. This prevents yesterday's role from appearing active but does not create an authoritative event.

The client waits for server `day.started`, `role_assignments.activated`, and `card_bundles.published` before treating new assignments as authoritative.

## Conflict handling

- Duplicate command ID: return original event set.
- Version conflict: mark command `conflict` and refresh projection.
- Permission/validation failure: mark `rejected` with reason.
- Captain corrective events take precedence in the rebuilt projection.
- Events are never deleted or rewritten.

## Product Stage request while offline

`request_stage_advance` is stored with the active `from_stage_id`, sequential `to_stage_id`, target day and `base_version`. It does not alter the local authoritative Stage.

- same `command_id`: return original event set;
- active Stage already changed: `conflict` and refresh projection;
- Definition of Done no longer passes: `rejected` with reason;
- Captain `advance_stage` or `override_stage_advance`: server-confirmed only;
- new Stage cards become authoritative only after the next server `day.started` and `card_bundles.published` events.
