# Expedition start and Day 1 boundary architecture

## Scope

This document implements the architectural consequences of accepted `ADR-021` for Gate 9D. Gate 9D1 is contract-only. Executable runtime and PostgreSQL work begin in Gate 9D2 and Gate 9D3.

The target vertical is:

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
| Commands and actor/offline metadata | `engine/command-catalog.yaml` |
| Permissions | `engine/permissions.yaml` |
| Event vocabulary | `engine/event-catalog.yaml`, `engine/event.schema.json` |
| 12-day program and first Stage | `engine/pipeline.yaml`, `stages/01_onboarding.yaml` |
| Roles and compatibility | `engine/roles-catalog.yaml`, `engine/role-rotation-rules.yaml` |
| Card content | `cards/`, `schemas/card.schema.json` |
| Read-model structure | `app/contracts/today-view.schema.json`, `app/contracts/captain-day-view.schema.json`, `app/contracts/expedition-setup-view.schema.json` |
| Atomic persistence | `ADR-013`, `private.process_command(jsonb)` |
| Human command transport | `ADR-014`, authenticated `command-gateway` |
| System clock branch | `ADR-021` and Gate 9D3 implementation |

No SQL table or UI component may become a competing source for Stage, role, Card Bundle or Day transition rules.

## Aggregate state sequence

### Before Gate 9D

```text
Expedition: ready
Stage: no active Stage
CalendarDay: absent
Rotation: generated
ExpeditionSetupView: present
TodayView: absent
CaptainDayView: absent
```

### After `start_expedition`

```text
Expedition: active
Stage: onboarding / active
CalendarDay: absent
Rotation: generated
ExpeditionSetupView: active and non-actionable
TodayView: absent
CaptainDayView: absent
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

Calendar Day and Product Stage remain independent. Starting the Expedition opens `onboarding`; the boundary creates Day 1. A later Stage change does not itself create a new Day or publish bundles.

## Human start command path

```text
Captain Console
→ POST /functions/v1/command-gateway
→ Supabase bearer verification
→ exact receipt replay lookup
→ authoritative Captain context
→ pinned runtime lookup
→ start_expedition reducer
→ event/projection validation
→ private.start_expedition(jsonb)
→ private.process_command(jsonb)
→ atomic ready → active status update
→ receipt response
→ api.get_expedition_setup_view refetch
```

The client submits an empty payload. It cannot choose Stage, start date, assignments, roles or Card Bundles.

### `StartExecutor`

Gate 9D2 should add a bounded executor analogous to Invitation and Rotation execution:

```text
createStartExecutor(...)
```

Responsibilities:

- require exact pinned Day 1 pilot runtime support;
- require authoritative Captain membership;
- load complete `ExpeditionSetupView` and current structural team state;
- call the pure `start_expedition` reducer;
- validate prepared events and projection replacement;
- construct the private wrapper request;
- call only `private.start_expedition(jsonb)`;
- map stable wrapper failures without leaking SQL details.

It must not update `ilka.expeditions`, receipts, events or projections directly.

## Trusted system clock path

The public human branch remains unchanged and continues to reject human `system` and `system_clock` claims.

The same Edge Function receives an internal scheduled request with:

```text
Authorization: Bearer <valid platform JWT>
x-ilka-system-timestamp: <unix seconds>
x-ilka-system-signature: <lowercase hex HMAC-SHA256>
```

The signed value is:

```text
<timestamp>.<exact raw request body bytes>
```

The internal branch is selected only when both system headers are present. Partial headers are rejected. The branch verifies the signature before any receipt or Expedition data is returned.

### Verification order

```text
canonical JSON/body size preflight
→ identify complete system header pair
→ verify timestamp syntax and replay window
→ verify HMAC in constant time
→ validate command schema
→ require process_day_boundary/system_clock
→ require deterministic command identity
→ exact receipt replay lookup
→ load system context
→ pinned runtime lookup
→ pure reducer
→ schema validation
→ private.process_day_boundary(jsonb)
```

A failed signature returns a generic non-retryable authentication error. It must not reveal whether the timestamp, secret, signature length or command body was close to valid.

### `loadSystemContext`

The database adapter loads by Expedition key without a human Auth UUID:

- internal Expedition UUID and status;
- timezone, boundary local time and duration;
- pinned runtime metadata;
- current stream/projection positions;
- current projection documents;
- active Participants in `participant_order`;
- generated Rotation Plan from `ExpeditionSetupView`;
- active Stage identity from event/projection state.

The resulting runtime context contains `actor: null`. The persistence actor context is built explicitly as null UUIDs plus `system_clock` identity.

## Deterministic boundary command

For `local_calendar_date = 2026-07-22`:

```text
command_id: cmd_day_boundary_<expedition_key>_20260722
idempotency_key: cmd_day_boundary_<expedition_key>_20260722
```

The exact command body, including `issued_at`, `boundary_at` and local date, is preserved for retries. The scheduler must not generate a fresh command ID for the same Expedition/date.

The request hash continues to exclude actor claims and include canonical command intent. Reuse of the deterministic command ID with different date/time intent is an idempotency mismatch and writes nothing.

## Day 1 reducer input

The pure reducer receives:

```text
command
trusted received_at
Expedition timezone and boundary
Expedition status
active Stage
current stream/projection versions
active Participants ordered by participant_order
complete generated Rotation Plan
pinned onboarding Stage configuration
resolved role metadata
resolved Card definitions
```

Pinned methodology content is compiled into or loaded by the exact runtime release. The reducer must not call PostgreSQL, HTTP, filesystem APIs or browser APIs.

## Day 1 reducer output

### Events

Ordered events:

```text
1. day.started
2. role_assignments.activated
3. card_bundles.published
```

All use one command ID and one recorded time. Domain `occurred_at` is `boundary_at`, including catch-up processing. `recorded_at` is trusted server receipt time.

`role_assignments.expired` and `task.overdue` are absent on Day 1. The Engine catalogs represent them as conditional `previous_day_exists` emissions for future reducers.

### Assignment instances

Each Participant receives two active instances:

```text
assignment_day_01_<participant_key>_product
assignment_day_01_<participant_key>_onboard
```

The `role_assignments.activated` event contains a flat ordered array. Ordering is `participant_order`, then `product`, then `onboard`. This is deterministic and suitable for replay comparisons.

### Card Bundles

One bundle per Participant:

```text
bundle_day_01_<participant_key>
```

Card order is deterministic:

1. shared Stage cards in `stages/01_onboarding.yaml` order;
2. product-role cards in Stage order;
3. onboard-role cards in Stage order.

Duplicate card references are rejected rather than silently de-duplicated because duplicated configuration is a release defect.

Task IDs are derived from cards whose content contract identifies task completion. Output IDs come from Stage `required_outputs`.

## Projection construction

### `TodayView`

Projection key:

```text
today_view:<participant_key>
```

Required initial values:

- local date from the command;
- Day 1 active and boundary state `authoritative`;
- Stage `onboarding`, active, with next Stage from `engine/pipeline.yaml`;
- one active product assignment and one active onboard assignment;
- schema-valid cards in bundle order;
- methodology tasks in `available` state;
- required outputs unconfirmed;
- `sync_status: synced`;
- `expedition_status: active`;
- no Expedition completion object.

### `CaptainDayView`

Projection key:

```text
captain_day_view
```

Required initial values:

- Day 1, revision `1`, transition mode `automatic`;
- complete Participant list in `participant_order`;
- product and onboard role IDs;
- required cards unacknowledged;
- required tasks non-terminal;
- zero overdue tasks;
- Stage and required output blockers;
- `normal_start_day: false`;
- Captain Super Admin cannot impersonate `system_clock`;
- `sync_status: synced`;
- expected projection version equal to the command's resulting version.

Participant task blockers use:

```text
<participant_key>:<task_id>
```

This allows the existing `complete_task` reducer to remove only the actor's blocker after Gate 9D4 repair.

## PostgreSQL transaction wrappers

### `private.start_expedition(jsonb)`

Transaction order:

```text
parse minimum identity
→ command advisory lock
→ Expedition advisory lock
→ exact replay / idempotency mismatch
→ lock Expedition row
→ validate status ready and Captain context
→ validate process request
→ private.process_command(process_request)
→ update Expedition status active
→ return result
```

### `private.process_day_boundary(jsonb)`

Transaction order:

```text
parse minimum identity
→ command advisory lock
→ Expedition advisory lock
→ exact replay / idempotency mismatch
→ lock Expedition row and projection head
→ validate active Expedition and system actor
→ validate no Day exists for target date
→ validate process request
→ private.process_command(process_request)
→ return result
```

The wrapper must not insert into `ilka.command_receipts`, `ilka.event_log` or `ilka.projection_documents` directly. Any status or uniqueness failure rolls back the complete call.

The MVP does not add separate Day, assignment or Card Bundle tables. Duplicate-boundary prevention uses deterministic command identity plus authoritative projection/event guards under the Expedition lock.

## Conflict and replay matrix

| Situation | Result | Writes |
| --- | --- | --- |
| Same command ID, Expedition and request hash | original receipt, `replayed: true` | none |
| Same command ID, different request hash or Expedition | idempotency mismatch | none |
| Stale expected stream position | conflict | none |
| `start_expedition` after active | deterministic rejection for a new command | rejected receipt only |
| Boundary before configured local time | deterministic rejection | rejected receipt only |
| Boundary repeated with a new command ID | deterministic rejection | rejected receipt only |
| Invalid prepared event/projection | internal contract failure | complete rollback |
| Projection persistence failure | persistence failure | complete rollback |

Exact replay is checked before mutable state guards so accepted start/boundary commands remain replayable after the Expedition state changes.

## Offline interface behavior

Captain Console exposes `Start Expedition` only from authoritative `ExpeditionSetupView.controls.start_expedition`. It sends online and refetches setup state after a receipt. There is no optimistic active state.

Captain Console never exposes normal `Start Day`. It displays the last synchronized boundary status and Day projection.

Participant App never submits the boundary. At the local boundary while offline it may visually expire stale assignments, but authoritative Day 1 content appears only after synchronized `TodayView` publication.

## Validation strategy

Gate 9D1 protected validation checks:

- ADR and architecture presence and accepted status;
- Captain-only, ready-only, empty-payload `start_expedition`;
- `system_clock`-only `process_day_boundary`;
- deterministic `command_id == idempotency_key` contract;
- Day 1 base event order;
- conditional prior-day events;
- no Captain `process_day_boundary` permission;
- no public normal-Day start control;
- no runtime registration, migration or production secret in Gate 9D1;
- CI invokes the validator.

Gate 9D2 and 9D3 add pure reducer, Deno executor, pgTAP and direct PostgreSQL integration coverage. Gate 9D4 adds fixture, blocker and complete vertical tests.
