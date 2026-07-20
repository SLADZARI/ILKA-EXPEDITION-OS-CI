# Day 1 `complete_task` Runtime and Read Models

Status: implementation contract under accepted `ADR-015`  
Runtime slice: `day1_complete_task_v1`  
Command: `complete_task`

## Purpose

This gate is the first server-backed ILKA domain vertical. It proves one complete write/read cycle without expanding into Expedition bootstrap, rotation or Day lifecycle commands.

```text
Participant command
→ command-gateway
→ exact pinned TypeScript runtime
→ task.completed | task.completed_late
→ private.process_command(jsonb)
→ immutable receipt + event
→ TodayView + CaptainDayView
→ api read functions
```

## Existing sources reused

```text
schemas/command.schema.json
engine/event.schema.json
engine/game-engine.yaml
engine/permissions.yaml
engine/event-catalog.yaml
stages/01_onboarding.yaml
app/contracts/today-view.schema.json
app/contracts/captain-day-view.schema.json
ilka.projection_documents
private.process_command(jsonb)
```

No task table, card table or competing Day state model is introduced.

## Runtime input

The gateway supplies:

- authoritative Expedition status and internal UUID;
- current stream/projection versions;
- active Profile, membership and Participant context;
- the exact pinned runtime release metadata;
- all internal projection documents for the Expedition;
- canonical command and gateway receipt time.

The reducer does not query PostgreSQL directly.

## Supported command

Only `complete_task` is implemented.

All other canonical commands return a deterministic persisted rejection:

```text
command_not_implemented_in_runtime
```

This is intentional. The runtime does not pretend to implement Day start, card acknowledgement, output confirmation or Day close.

## Actor and assignment rules

### Participant

A Participant can complete a task only when:

- active membership resolves a Participant identity;
- `today_view:<participant_key>` exists;
- the task is present in that document;
- the task is non-terminal;
- Expedition status is `active`;
- Day status is `active` or `review`.

### Product Captain

Product Captain is resolved from:

```text
TodayView.product_role.role_id == product_captain
```

It is not taken from membership, JWT metadata or a client claim.

### Captain

The current command payload contains only `task_id`. It has no Participant or assignment target. A Captain membership without a Participant identity therefore receives:

```text
task_target_ambiguous_for_captain
```

This avoids silently completing another participant's task. A future schema decision may add an explicit assignment target.

## Event generation

On-time completion:

```text
task.completed
```

Late completion:

```text
task.completed_late
```

Selection rule:

```text
current day number > due day number → completed_late
otherwise                            → completed
```

Time semantics:

```text
occurred_at = command.issued_at
recorded_at = gateway.received_at
```

This preserves offline action time while recording server receipt time separately.

Event identity is deterministic from the canonical `command_id` and event ordinal:

```text
evt_<command suffix>_01
```

The event payload includes task/Participant attribution and previous task status. Canonical schemas remain authoritative.

## Participant projection

Document identity:

```text
projection_key: today_view:<participant_key>
projection_type: today_view
subject_id: <participant_key>
schema_id: https://ilka.local/schemas/today-view.schema.json
schema_version: 1
```

Mutation:

- matching task status becomes `completed` or `completed_late`;
- task `pending_sync` becomes `false`;
- top-level `sync_status` becomes `synced`;
- all unrelated cards, outputs, assignments, Stage and Expedition fields remain unchanged.

## Captain projection

Document identity:

```text
projection_key: captain_day_view
projection_type: captain_day_view
subject_id: null
schema_id: https://ilka.local/schemas/captain-day-view.schema.json
schema_version: 1
```

Mutation:

- matching Participant `required_tasks_terminal` is recalculated from that Participant TodayView;
- Participant `sync_status` becomes `synced`;
- relevant `required_task_incomplete` blockers are removed only when all that Participant's tasks are terminal;
- unrelated card/output blockers remain;
- `can_close_day` is recalculated from remaining blockers;
- `day.revision` increments once;
- `completion_readiness.expected_projection_version` becomes the next Expedition projection version;
- top-level `sync_status` becomes `synced`.

Both documents are written as complete JSON objects in the same atomic command transaction. The projection head increments once.

## Runtime schema enforcement

The gateway validates:

- canonical event schema;
- every projection by `schema_id`;
- private process-command request schema;
- private process-command result schema.

Supported projection schemas are explicitly registered:

```text
TodayView
CaptainDayView
```

An unknown or invalid projection schema produces `runtime_contract_invalid` and persistence is not called.

## Deterministic reducer rejections

```text
command_not_implemented_in_runtime
expedition_not_active
participant_context_required
task_target_ambiguous_for_captain
participant_projection_missing
captain_projection_missing
projection_contract_mismatch
day_not_mutable
task_not_found
task_already_terminal
actor_cannot_complete_assignment
```

These are persisted rejected receipts with no events or projection mutations. Stream-position races remain unpersisted `conflict` results from Gate 4.

## Public read functions

### `api.get_today_view(p_expedition_key text)`

- requires `auth.uid()`;
- resolves active Expedition membership;
- requires active Participant identity;
- derives authoritative `participant_key` server-side;
- returns only `today_view:<participant_key>`;
- returns `null` if that actor's projection is not bootstrapped.

### `api.get_captain_day_view(p_expedition_key text)`

- requires `auth.uid()`;
- requires active Captain membership;
- returns `captain_day_view`;
- returns `null` before projection bootstrap.

### `api.get_command_receipt(p_command_id text)`

- requires `auth.uid()`;
- filters by `actor_auth_user_id`;
- returns replay-shaped authoritative result with `replayed: true`;
- returns `null` for unknown commands or another actor;
- remains available to the original actor after a later membership ban, preserving access to their own command history.

All functions are `SECURITY DEFINER`, have empty `search_path`, and expose no raw internal tables.

## Offline flow

```text
1. UI creates canonical complete_task with stable command_id.
2. IndexedDB stores pending command.
3. Reconnect sends the same body and command_id.
4. command-gateway returns accepted/rejected/conflict/replay.
5. Client may poll api.get_command_receipt(command_id).
6. Accepted client refetches api.get_today_view(expedition_key).
7. Captain refetches api.get_captain_day_view(expedition_key).
```

Realtime is invalidation-only and remains outside this gate.

## Release registration

The pure reducer is merged first. Its protected merge SHA becomes the immutable runtime release `git_commit_sha`.

A second reviewed registration change may add only:

- runtime registry wiring;
- immutable `ilka.runtime_releases` row;
- exact metadata tests;
- deployment documentation.

It must not modify reducer behavior. This removes circular self-reference between the code commit and the runtime release metadata.

## Local tests

### Unit

- Product Captain resolution;
- accepted on-time completion;
- late completion;
- terminal/unassigned/Captain/missing-projection rejections;
- event schema validity;
- TodayView/CaptainDayView schema validity;
- invalid prepared projections never reach persistence.

### PostgreSQL integration

A local-only fixture proves:

```text
handler
→ runtime
→ private.process_command
→ one receipt
→ one event
→ stream 1
→ projection version 2
→ updated TodayView
→ updated CaptainDayView
→ exact replay without duplicate writes
```

### pgTAP

The read API suite proves authentication, Participant/Captain isolation, receipt ownership, ban behavior and absence of raw internal access.

## Acceptance criteria

- migration replays from empty PostgreSQL 17;
- all prior pgTAP suites remain green;
- new API functions are exposed only through `api`;
- `anon` cannot execute read functions;
- Participant cannot read Captain projection or another Participant projection;
- Captain-only read function checks active Captain membership;
- receipt lookup prevents enumeration;
- pure reducer emits one canonical event;
- accepted command updates both projections atomically;
- exact replay creates no duplicate receipt/event/version;
- invalid projection JSON never reaches PostgreSQL;
- generated database types include all three API functions;
- Deno format/lint/check/unit/integration gates pass;
- no runtime release is registered until reducer source is merged to protected `main`.

## Explicit non-goals

- cloud seed data;
- Expedition/Captain creation;
- invitation acceptance;
- rotation;
- Day start;
- initial projection generation;
- additional command reducers;
- frontend Supabase adapter;
- Realtime;
- pilot or production data.
