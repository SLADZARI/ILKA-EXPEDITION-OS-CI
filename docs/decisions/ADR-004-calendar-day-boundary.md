# ADR-004 — Automatic Calendar Day Boundary

- Status: Accepted
- Date: 2026-07-18
- Owners: Product Architecture / Engine

## Context

ILKA Expedition OS is a time-driven offline-first expedition system. A calendar day must change without requiring Captain to press `Start Day`. Product work may be incomplete, a Product Stage may continue, and a device may be offline, but yesterday's assignments must not remain active indefinitely.

Earlier bootstrap files exposed `start_day` as a Captain command and advanced rotation on `day.closed`. That conflicts with the accepted product model and creates a single-device operational dependency.

## Decision

### 1. Calendar Day and Product Stage are separate entities

- `CalendarDay` advances according to the expedition timezone and configured local boundary.
- `ProductStage` advances only through pipeline rules and Captain confirmation/override.
- For the first vertical, Day 1 resolves to stage `onboarding`, but `day_number` and `stage_id` are always stored separately.

### 2. Boundary configuration

```yaml
day_boundary:
  local_time: "06:00"
  timezone_source: expedition.timezone
```

### 3. Canonical transition command

The internal command is `process_day_boundary`.

- actor role: `system_clock`;
- deterministic idempotency key: `day_boundary:<expedition_id>:<local_calendar_date>`;
- duplicate execution returns the original event set;
- Captain does not issue this command from the UI;
- legacy external `start_day` is deprecated and must not appear in new API contracts.

### 4. Boundary event sequence

A successful transition emits, as applicable:

1. `role_assignments.expired`;
2. one or more `task.overdue` events for incomplete prior-day tasks;
3. `day.started`;
4. `role_assignments.activated`;
5. `card_bundles.published`.

A failure emits `day.transition_failed`. Recovery emits `day.transition_recovered` and then the missing canonical transition events. Recovery never edits or deletes earlier events.

### 5. Rotation

Rotation advances on `day.started`, never on `day.closed`.

Captain role overrides:

- require a reason;
- emit `role_assignment.overridden`;
- preserve completed history;
- recalculate only future assignments.

### 6. Task timing

Incomplete prior-day tasks become `overdue`. Later completion emits `task.completed_late`; it does not reactivate the old role or alter the historical state of the previous day.

Minimum task statuses:

- `available`;
- `in_progress`;
- `blocked`;
- `completed`;
- `overdue`;
- `completed_late`;
- `waived`.

### 7. Offline behavior

At the local boundary an offline device may derive `expired_pending_sync` for yesterday's assignments so it does not display them as active. This is a local UI projection only.

The server append-only event log remains the source of truth. New bundles become authoritative after synchronization. Queueable user commands expose `pending`, `synced`, `conflict`, or `rejected`.

### 8. Captain controls

Captain may:

- activate Recovery Day;
- suspend/resume the product program;
- override role assignments;
- waive a task with a reason;
- override day close with a reason;
- recover a failed day transition;
- apply safety/emergency controls.

Captain does not manually perform the normal daily boundary transition.

## Consequences

- `engine/game-engine.yaml`, command/event catalogs, permissions, reducers, schemas, examples, tests, and app requirements must use the same model.
- UI must not contain a normal `Start Day` action.
- A scheduler/server function is required during implementation.
- A missed scheduler run can be safely retried or recovered because the boundary key is deterministic.

## Not included

- peer-to-peer mesh synchronization;
- automatic penalties;
- XP, ratings, or competitive mechanics;
- automatic Product Stage advancement without explicit pipeline rules.
