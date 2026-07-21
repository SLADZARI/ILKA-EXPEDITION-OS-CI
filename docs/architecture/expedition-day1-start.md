# Expedition start and Day 1 boundary architecture

## Scope

This document applies accepted `ADR-021`. Gate 9D1 is contract-only; runtime and PostgreSQL execution begin in Gate 9D2 and Gate 9D3.

```text
ExpeditionSetupView.ready
→ start_expedition
→ Expedition active + onboarding Stage active
→ trusted process_day_boundary
→ Day 1 active
→ assignments active
→ Card Bundles published
→ TodayView / CaptainDayView readable
```

## Source ownership

| Concern | Source of truth |
| --- | --- |
| Expedition, Day, Stage and assignment states | `engine/game-engine.yaml` |
| Command actors, payload hints and offline policy | `engine/command-catalog.yaml` |
| Permissions | `engine/permissions.yaml` |
| Events | `engine/event-catalog.yaml`, `engine/event.schema.json` |
| Program and first Stage | `engine/pipeline.yaml`, `stages/01_onboarding.yaml` |
| Roles and compatibility | `engine/roles-catalog.yaml`, `engine/role-rotation-rules.yaml` |
| Cards | `cards/`, `schemas/card.schema.json` |
| Read models | `app/contracts/*.schema.json` |
| Atomic persistence | `ADR-013`, `private.process_command(jsonb)` |
| Human transport | `ADR-014`, authenticated `command-gateway` |
| System clock transport | `ADR-021`, implemented in Gate 9D3 |

No SQL table or UI component may become a competing methodology or transition source.

## State sequence

### Before Gate 9D

```text
Expedition: ready
Stage: absent
CalendarDay: absent
Rotation: generated
ExpeditionSetupView: present
TodayView / CaptainDayView: absent
```

### After `start_expedition`

```text
Expedition: active
Stage: onboarding / active
CalendarDay: absent
ExpeditionSetupView: active and non-actionable
TodayView / CaptainDayView: absent
```

### After first `process_day_boundary`

```text
Expedition: active
Stage: onboarding / active
CalendarDay 1: active
RoleAssignment instances: active
Card Bundles: published
TodayView: one per active Participant
CaptainDayView: one
```

Calendar Day and Product Stage remain separate. Starting the Expedition opens the Stage; the boundary creates Day 1.

## Human start command path

```text
Captain Console
→ POST /functions/v1/command-gateway
→ Supabase bearer verification
→ exact receipt replay lookup
→ authoritative Captain context
→ pinned runtime
→ pure start_expedition reducer
→ event/projection validation
→ private.start_expedition(jsonb)
→ private.process_command(jsonb)
→ atomic ready → active update
→ receipt
→ api.get_expedition_setup_view refetch
```

The client sends `payload: {}` and cannot choose Stage, date, assignments, roles or bundles.

### `StartExecutor`

Gate 9D2 adds `createStartExecutor(...)`. It requires an exact pinned runtime, authoritative Captain context and complete setup projection; calls the pure reducer; validates events/projection; and calls only `private.start_expedition(jsonb)`. It must not directly update Expeditions, receipts, events or projections.

## Trusted system clock path

The public human branch continues to reject human `system` and `system_clock` claims.

The same Edge Function receives an internal request with:

```text
Authorization: Bearer <valid platform JWT>
x-ilka-system-timestamp: <unix seconds>
x-ilka-system-signature: <lowercase hex HMAC-SHA256>
```

Signed bytes:

```text
<timestamp>.<exact raw request body bytes>
```

The internal branch is selected only when both headers exist. Partial headers are rejected.

### Verification order

```text
body-size/media-type preflight
→ complete system-header pair
→ timestamp syntax and replay window
→ HMAC constant time comparison
→ canonical Command Schema
→ exact process_day_boundary/system_clock actor
→ deterministic command identity
→ exact receipt replay
→ loadSystemContext
→ pinned runtime
→ pure reducer
→ schema validation
→ private.process_day_boundary(jsonb)
```

Signature verification occurs before returning receipt or Expedition data. Public errors do not reveal whether timestamp, signature length, secret or body was nearly valid.

### `loadSystemContext`

The adapter loads without a human Auth UUID:

- Expedition UUID, status, timezone, boundary and duration;
- pinned runtime metadata;
- stream/projection positions;
- projection documents;
- active Participants in `participant_order`;
- generated Rotation Plan;
- active Stage.

Runtime context has `actor: null`. Persistence context explicitly uses null Auth/Profile/membership/Participant UUIDs and canonical `system_clock` identity.

## Deterministic boundary command

For `local_calendar_date = 2026-07-22`:

```text
command_id: cmd_day_boundary_<expedition_key>_20260722
idempotency_key: cmd_day_boundary_<expedition_key>_20260722
```

The scheduler preserves the exact command body for retry. A fresh ID for the same Expedition/date is forbidden. Reuse with different time/date intent is an idempotency mismatch.

## Day 1 reducer input

```text
canonical command
trusted received_at
Expedition timezone and boundary
Expedition status and active Stage
stream/projection versions
Participants ordered by participant_order
complete Rotation Plan
pinned onboarding Stage, role and Card definitions
```

The pure reducer cannot call PostgreSQL, HTTP, filesystem or browser APIs.

## Day 1 reducer output

### Events

```text
1. day.started
2. role_assignments.activated
3. card_bundles.published
```

All share one command ID.

Temporal contract:

```text
boundary_at = scheduled local boundary instant
occurred_at = trusted gateway received_at
recorded_at = trusted gateway received_at
```

This preserves the planned boundary while ensuring catch-up events never appear before `expedition.started`. Browser `issued_at` is not authoritative for system-event time.

`role_assignments.expired` and `task.overdue` are absent on Day 1 and are conditional on `previous_day_exists` for future reducers.

### Assignment instances

Each Participant receives:

```text
assignment_day_01_<participant_key>_product
assignment_day_01_<participant_key>_onboard
```

The event contains a flat deterministic array ordered by `participant_order`, then product, then onboard.

### Card Bundles

One bundle per Participant:

```text
bundle_day_01_<participant_key>
```

Card order:

1. shared cards from `stages/01_onboarding.yaml`;
2. product-role cards;
3. onboard-role cards.

Duplicate references reject the release. Task IDs derive from task cards; output IDs derive from Stage `required_outputs`.

## Projection construction

### `TodayView`

Key:

```text
today_view:<participant_key>
```

Initial document includes local date, Day 1 active, boundary state `authoritative`, Stage `onboarding` active, next Stage, two active assignments, ordered cards, available tasks, unconfirmed outputs, `sync_status: synced`, `expedition_status: active` and no completion object.

### `CaptainDayView`

Key:

```text
captain_day_view
```

Initial document includes Day revision `1`, transition mode `automatic`, ordered active team, role IDs, unacknowledged-card and incomplete-task state, zero overdue tasks, Stage/output blockers, `normal_start_day: false`, Super Admin unable to impersonate `system_clock`, `sync_status: synced` and resulting projection version.

Participant task blocker identity:

```text
<participant_key>:<task_id>
```

Gate 9D4 updates `complete_task` so only the actor's blocker is removed.

## PostgreSQL transaction wrappers

### `private.start_expedition(jsonb)`

```text
minimum parse
→ command lock
→ Expedition lock
→ replay / mismatch
→ lock Expedition
→ validate ready + Captain
→ validate process request
→ private.process_command(process_request)
→ update status active
→ result
```

### `private.process_day_boundary(jsonb)`

```text
minimum parse
→ command lock
→ Expedition lock
→ replay / mismatch
→ lock Expedition and projection head
→ validate active + system actor + no target Day
→ validate process request
→ private.process_command(process_request)
→ result
```

Wrappers never directly insert receipts, events or projection documents. Any failure rolls back the full call. No Day, assignment or Card Bundle table is added.

## Conflict and replay matrix

| Situation | Result | Writes |
| --- | --- | --- |
| same ID, Expedition and request hash | original receipt, replayed | none |
| same ID with different intent | idempotency mismatch | none |
| stale stream position | conflict | none |
| new start after active | deterministic rejection | rejected receipt only |
| boundary before local time | deterministic rejection | rejected receipt only |
| duplicate boundary with new ID | deterministic rejection | rejected receipt only |
| invalid event/projection | contract failure | complete rollback |
| persistence failure | persistence failure | complete rollback |

Replay is resolved before mutable guards.

## Offline interface behavior

Captain Console exposes `Start Expedition` only from authoritative setup controls and never applies optimistic active state. It never exposes normal `Start Day`.

Participant App never submits the boundary. Offline it may visually mark stale assignments `expired_pending_sync` and new content `awaiting_bundle_sync`; authoritative Day 1 appears only after synchronized projections.

## Validation strategy

Gate 9D1 protected validation checks:

- accepted ADR and architecture;
- Captain-only, ready-only, empty-payload start;
- `system_clock`-only boundary;
- deterministic `command_id == idempotency_key`;
- exact Day 1 event order;
- conditional prior-day events;
- catch-up temporal ordering;
- no Captain boundary permission or UI Start Day;
- no runtime registration, migration or secret;
- CI invocation.

Gate 9D2/9D3 add reducer, executor, pgTAP and PostgreSQL integration coverage. Gate 9D4 closes fixtures, blocker repair and the complete vertical.
