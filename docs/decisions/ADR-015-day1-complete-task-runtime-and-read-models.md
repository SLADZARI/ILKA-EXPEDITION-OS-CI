# ADR-015 — Day 1 `complete_task` runtime and authoritative read models

- Status: Accepted
- Date: 2026-07-20
- Owners: Product Architecture / Engine / Backend / Interfaces
- Extends: `ADR-012`, `ADR-013`, `ADR-014`
- First executable command: `complete_task`

## Context

Gates 1–5 provide identity, immutable history, atomic command persistence and an authenticated `command-gateway`, but no production Engine bundle is registered. A valid new command therefore cannot produce an authoritative event or projection.

The first real vertical must prove the complete path:

```text
canonical command
→ authenticated actor
→ pinned Engine reducer
→ canonical event
→ atomic receipt/event/projection transaction
→ Participant/Captain read APIs
```

The slice must stay narrow. It must not silently implement Expedition creation, Day start, role rotation, card acknowledgement, output confirmation or Day close before those business rules are separately accepted.

## Decision

### Gate boundary

Gate 6 implements one executable Day 1 command:

```text
complete_task
```

The slice assumes an already bootstrapped active Day 1 Expedition containing schema-valid internal projection documents. Bootstrap remains admin/test-only until the next gate implements the real creation, invitation, rotation and Day-start flow.

### Runtime source and release registration

The reducer implementation and the immutable release registration are separated:

1. merge the pure reducer/read-model implementation;
2. use that protected `main` commit as `runtime_releases.git_commit_sha`;
3. add a release-registration commit that registers the bundle and immutable database release row.

`git_commit_sha` identifies the protected commit containing the reducer logic. The later registration commit may add only metadata, registry wiring, migration data and documentation; it must not change reducer behavior.

### Runtime identity

The first release uses stable identifiers:

```text
release_key: day1_complete_task_v1
rules_release: engine_v8_permissions_v7_onboarding_v3
content_release: day1_content_v1
reducer_version: day1_complete_task_v1
```

The exact `git_commit_sha` is filled only after the implementation commit is merged.

### Projection documents

The runtime reads and writes the existing generic projection store.

Participant document:

```text
projection_key: today_view:<participant_key>
projection_type: today_view
subject_id: <participant_key>
schema_id: https://ilka.local/schemas/today-view.schema.json
schema_version: 1
```

Captain document:

```text
projection_key: captain_day_view
projection_type: captain_day_view
subject_id: null
schema_id: https://ilka.local/schemas/captain-day-view.schema.json
schema_version: 1
```

Both documents are complete JSON objects. The runtime never writes partial JSON patches.

### `complete_task` actor and ownership rules

The canonical command payload remains:

```json
{
  "task_id": "task_team_agreement"
}
```

For this first slice:

- the authenticated actor must have a domain Participant identity;
- the Participant or Product Captain may complete only a task present in their own `TodayView`;
- Product Captain status is confirmed from the authoritative `TodayView.product_role.role_id == product_captain`;
- Captain membership without a Participant identity is rejected with `task_target_ambiguous_for_captain` because the current command payload has no target Participant/assignment ID;
- Shore Operator and system actors remain unavailable through the public gateway;
- the Expedition must be `active`;
- the Day must be `active` or `review`;
- the task must exist;
- terminal statuses `completed`, `completed_late` and `waived` cannot be completed again.

The Captain limitation is explicit rather than silently selecting a Participant task. A later command-schema decision may add an assignment target.

### Event selection

The reducer emits exactly one canonical event.

If:

```text
current_day_number <= due_day_number
```

emit:

```text
task.completed
```

Otherwise emit:

```text
task.completed_late
```

`occurred_at` is the canonical command `issued_at`, preserving the offline action time. `recorded_at` is the gateway `received_at`.

Additional payload attribution is allowed by the canonical event schema:

```text
task_id
participant_id
previous_status
completed_on_day_number
optional due_day_number
```

The event ID is deterministic from `command_id` and event ordinal so an exact replay produces the same prepared event identity.

### Projection reduction

The Participant `TodayView` update:

- changes only the matching task status;
- clears `pending_sync` for the task;
- keeps all cards, outputs, roles, Stage and Expedition fields unchanged;
- sets top-level `sync_status` to `synced`.

The Captain `CaptainDayView` update:

- updates the matching Participant `required_tasks_terminal` from all tasks in that Participant `TodayView`;
- removes only the completing Participant blocker `<participant_key>:<task_id>` when all required tasks in that Participant `TodayView` are terminal, as refined by `ADR-021`;
- leaves unrelated card/output blockers untouched;
- recalculates `can_close_day` from the remaining blockers;
- increments `day.revision` by one;
- sets `completion_readiness.expected_projection_version` to the command's next projection version;
- keeps roles, outputs, controls, Stage and Expedition completion fields unchanged.

One accepted command writes both projection documents in one `private.process_command(jsonb)` call. The database advances the Expedition projection version once.

### Schema validation

Before persistence, `command-gateway` validates every projection mutation by `schema_id`:

```text
TodayView → app/contracts/today-view.schema.json
CaptainDayView → app/contracts/captain-day-view.schema.json
```

Unknown projection schemas are rejected as an internal runtime contract violation. SQL still validates only persistence-critical metadata and does not duplicate JSON read-model business logic.

### Deterministic rejection

Reducer guard failures are persisted as immutable rejected receipts with no event or projection mutation.

Codes include:

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

A concurrent stream change remains an unpersisted authoritative `conflict` from `private.process_command(...)`.

### Read APIs

The exposed `api` schema adds:

```text
api.get_today_view(p_expedition_key text) returns jsonb
api.get_captain_day_view(p_expedition_key text) returns jsonb
api.get_command_receipt(p_command_id text) returns jsonb
```

All functions are `SECURITY DEFINER` with an empty `search_path` and explicit grants.

#### `get_today_view`

- requires `auth.uid()`;
- requires an active membership and Participant identity in the requested Expedition;
- resolves the projection by authoritative `participant_key`;
- returns the raw schema-valid `TodayView` JSON or `null` when not yet bootstrapped.

#### `get_captain_day_view`

- requires `auth.uid()`;
- requires active Captain membership in the requested Expedition;
- returns the raw schema-valid `CaptainDayView` JSON or `null` when not yet bootstrapped.

#### `get_command_receipt`

- requires `auth.uid()`;
- returns only receipts whose `actor_auth_user_id` equals the current Auth user;
- returns the same authoritative result shape as command replay with `replayed: true`;
- returns `null` for another actor or an unknown command, preventing receipt enumeration.

Browser roles still receive no direct access to `ilka.projection_documents`, `ilka.command_receipts` or `private` helpers.

### Offline behavior

```text
local complete_task
→ IndexedDB pending overlay
→ command-gateway retry with same command_id
→ accepted/rejected/conflict receipt
→ get_command_receipt polling when needed
→ refetch get_today_view
```

Realtime remains invalidation-only and is not part of this gate.

### Local test bootstrap

Tests may insert schema-valid Day 1 projection fixtures directly as privileged local setup. No SQL function containing Day 1 methodology is introduced.

Cloud `VOYAGE` receives only reviewed schema/functions and immutable runtime release metadata. It receives no Auth users, Expeditions, memberships, Participants, tasks, events or projection documents in Gate 6.

## Consequences

- the backend has its first executable domain command;
- accepted commands produce an immutable event and two authoritative projections atomically;
- Participant and Captain clients can read their own server state through the exposed `api` schema;
- Product Captain remains a Day assignment rather than membership/JWT data;
- the current `complete_task` payload cannot be used by a Captain without a Participant identity;
- the next gate can add real bootstrap/start-day commands without changing the persistence or read contracts.

## Rejected alternatives

- implementing all 36 commands in the first runtime;
- calculating task completion only in the frontend;
- updating projections directly from the Edge Function;
- storing a task table as a second source of truth beside projections/events;
- returning fixture JSON from public API functions;
- allowing Captain to complete an ambiguous shared task without a target assignment;
- deriving Product Captain from membership or JWT metadata;
- deploying a runtime release before its reducer source commit exists on protected `main`;
- embedding Day 1 methodology in SQL triggers.

## Explicit non-goals

- Expedition creation and Captain bootstrap;
- invitations and invitation acceptance;
- rotation generation;
- Day start and initial projection generation;
- `acknowledge_card`, `start_task`, `confirm_output` or Day close reducers;
- frontend Supabase/Auth adapters;
- Realtime subscriptions;
- cloud seed data;
- pilot or production data.
