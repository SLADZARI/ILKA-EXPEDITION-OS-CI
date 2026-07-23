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

## Gate 9D3 executable implementation

Gate 9D3 implements the trusted path described above without changing the accepted domain contract.

### Runtime and composition

- `day1-boundary-v1.ts` is a pure pinned runtime capability. It receives immutable Stage, role, Card and output definitions from the future composite release; it does not read files, PostgreSQL or network services.
- `DayBoundaryExecutor` loads system context without a human identity, requires an exact runtime with the Day 1 capability, validates three events and `N + 1` projections, then calls only `private.process_day_boundary(jsonb)`.
- `PostgresDayBoundaryDatabase` loads timezone, boundary, start time, active Stage, setup projection and release metadata under `service_role`.
- `command-gateway/index.ts` composes the verifier and executor, but the production runtime registry remains unchanged until Gate 9E.

### Trusted request isolation

The branch is selected by the presence of either system header. A partial pair is rejected. HMAC verification over the exact raw body occurs before JSON parsing, receipt lookup or Expedition context loading. The branch does not call the human `/auth/v1/user` verifier; platform JWT enforcement remains enabled for the Edge Function itself.

A verified request still must satisfy canonical Command Schema, exact `system_clock` identity, deterministic command ID and an exact two-field payload. Exact replay requires a null human identity receipt with `actor_role: system_clock`.

### Transaction proof

`private.process_day_boundary(jsonb)` validates:

1. command lock before Expedition lock;
2. exact replay before mutable state checks;
3. active Expedition and pinned runtime;
4. null system actor context;
5. deterministic date/command identity;
6. configured local boundary and catch-up date;
7. active onboarding Stage and no previous `day.started`;
8. active Participant order and generated Rotation Plan;
9. exactly three ordered events, `2N` assignment instances and `N` bundles;
10. exactly `N TodayView + 1 CaptainDayView` mutations;
11. final stream `+3` and projection version `+1`.

The wrapper delegates all immutable writes to `private.process_command(jsonb)`. A failure on any projection rolls back the receipt, all three events, every TodayView, CaptainDayView and both heads.

### Gate 9D3 completion boundary

Gate 9D3 includes local migration, runtime/executor/transport code, pgTAP, unit tests and full gateway-to-PostgreSQL proof. It intentionally excludes production secret configuration, scheduler invocation, runtime registration, cloud migration application, Edge deployment and pilot data. Those remain Gate 9E. Gate 9D4 remains responsible for fixture/example closure and the existing Participant-scoped task-blocker completion repair.


## Gate 9D4 vertical closure

Gate 9D4 closes the local Day 1 vertical without adding a new domain transition or persistence boundary.

- Day 1 Participant and Captain fixtures now mirror the deterministic assignment instances, Card Bundles, blockers and projection versions produced by `day1-boundary-v1`.
- The canonical sample command/event stream uses deterministic boundary identity, exact `command_id == idempotency_key`, one trusted event timestamp, ten flat assignment instances and five complete Card Bundles.
- `complete_task` removes only `<participant_key>:<task_id>` for the authenticated Participant after that Participant's required tasks become terminal.
- A shared methodology `task_id` in another Participant bundle remains blocked and cannot be removed by another Participant's completion.
- The after-sync Captain fixture represents one authoritative `complete_task` result: Day revision and projection version advance once, card/output blockers remain, and only the actor's task blocker is absent.
- Protected Gate 9D4 validation rejects fixture, example or blocker-ownership drift.

Gate 9D4 adds no new command, event, permission, state, SQL function, runtime registration, secret, scheduler, deployment or pilot data. Gate 9E remains responsible for composing and pinning `day1_pilot_v1`, applying reviewed cloud migrations, deploying the gateway, configuring trusted invocation and running pilot smoke.
