# ADR-021 — Expedition start and Day 1 boundary

- Status: Accepted
- Date: 2026-07-22
- Owners: Product Architecture / Engine / Backend / Interfaces / Security
- Extends: `ADR-004`, `ADR-012`, `ADR-013`, `ADR-014`, `ADR-018`, `ADR-020`
- Gates: 9D1 canonical contract, 9D2 Expedition start execution, 9D3 Day 1 boundary execution, 9D4 integration closure

## Context

Gate 9C ends with a deterministic Rotation Plan, a complete `ExpeditionSetupView` and an atomic Expedition transition from `draft` to `ready`. The remaining Day 1 pilot path is:

```text
start_expedition
→ process_day_boundary
→ role assignments active
→ Card Bundles published
→ TodayView / CaptainDayView available
```

The accepted sources already agree that `start_expedition` is Captain-only and that the normal Calendar Day boundary is `system_clock`-only. They do not yet define one executable trusted `system_clock` transport, and older files disagree with the global `idempotency_key == command_id` rule and with the Day 1 event sequence.

Gate 9D must resolve those contradictions before runtime or SQL implementation. It must not let Captain impersonate `system_clock`, calculate Day 1 in the UI, or hard-code methodology content in PostgreSQL.

## Decision

### Gate 9D delivery sequence

Gate 9D is implemented as four bounded subgates:

1. **9D1 — canonical contract reconciliation:** this ADR, architecture contract, Engine synchronization and protected validation;
2. **9D2 — Expedition start:** pure reducer, trusted Captain executor and atomic `ready → active` wrapper;
3. **9D3 — Day 1 boundary:** trusted `system_clock` branch, pure Day 1 reducer, atomic boundary wrapper and read-model publication;
4. **9D4 — integration closure:** examples, fixtures, blocker ownership repair, full CI, review and merge.

Gate 9D1 adds no executable runtime, SQL migration, runtime release, secret, scheduler, cloud deployment or pilot data.

### `start_expedition`

Canonical command:

```text
command_type: start_expedition
actor_role: captain
payload: {}
offline_allowed: false
```

Guards:

- the authenticated actor is the active Expedition Captain;
- Expedition status is exactly `ready`;
- the frozen team contains 3–5 active Participants;
- there are zero pending invitations;
- one generated Rotation Plan covers every active Participant exactly once;
- the Rotation Plan contains exactly one `product_captain`;
- Cook is assigned `product_support`;
- the first pipeline Stage resolves to `onboarding`;
- no Calendar Day exists yet.

Accepted event order:

```text
expedition.started
stage.opened
```

`stage.opened.payload.stage_id` is `onboarding`.

The command atomically transitions `ilka.expeditions.status` from `ready` to `active` and replaces the complete `ExpeditionSetupView` with an active, non-actionable setup projection. It does not create a Calendar Day, assignment instance, Card Bundle, `TodayView` or `CaptainDayView`.

### First `process_day_boundary`

Canonical command:

```text
command_type: process_day_boundary
actor_id: system_clock
actor_role: system_clock
payload:
  local_calendar_date: YYYY-MM-DD
  boundary_at: ISO 8601 with timezone
```

The first Day is allowed only when:

- Expedition status is `active`;
- the active Product Stage is `onboarding`;
- no Calendar Day exists;
- the configured local boundary has been reached;
- `local_calendar_date` equals the date of `boundary_at` in `expedition.timezone`;
- the Rotation Plan and active Participants still form one complete compatible Day 1 team;
- all Stage, role and card references resolve from the pinned release.

A start after the local boundary may be processed as a catch-up for the current local date. Trusted server time determines whether the boundary has been reached; browser time is never authoritative.

Day 1 emits exactly:

```text
day.started
role_assignments.activated
card_bundles.published
```

Day 1 does not emit `role_assignments.expired` or `task.overdue` because there is no previous Calendar Day. For Day 2 and later those events are conditional on prior-day state and remain outside Gate 9D.

### Deterministic system command identity

The global canonical invariant remains:

```text
idempotency_key == command_id
```

For a Day boundary:

```text
command_id = idempotency_key =
cmd_day_boundary_<expedition_key>_<YYYYMMDD>
```

The normalized date is the authoritative `local_calendar_date` without separators. Exact retries return the original immutable receipt and create no duplicate Day, event, assignment, Card Bundle or projection version.

### Trusted `system_clock` transport

Human Supabase sessions continue through the authenticated branch of the single `command-gateway`. Browser callers remain forbidden from submitting `system` or `system_clock` commands.

Gate 9D3 adds a separate trusted internal branch to the same Edge Function. It verifies:

```text
x-ilka-system-timestamp
x-ilka-system-signature
```

The signature is lowercase hexadecimal:

```text
HMAC-SHA256(secret, timestamp + "." + raw_request_body)
```

Rules:

- the secret is server-only;
- constant-time signature comparison is required;
- timestamp must be within the configured replay window;
- command actor must be exactly `system_clock`;
- command type must be `process_day_boundary`;
- the branch does not resolve or fabricate a human membership;
- platform JWT verification remains enabled;
- Captain cannot use this branch or its credentials.

Trusted `system_clock` actor context contains null Auth, Profile, membership and Participant UUIDs, with canonical `actor_id` and `actor_role` both set to `system_clock`.

Secret configuration and the scheduled invocation are deployment responsibilities of Gate 9E.

### Assignment instances

The Rotation Plan remains the schedule source. Day activation derives two stable assignment instances per active Participant:

```text
assignment_day_01_<participant_key>_product
assignment_day_01_<participant_key>_onboard
```

Each assignment records:

- `assignment_id`;
- `participant_id` as the stable Participant key;
- `role_type`: `product` or `onboard`;
- `role_id`;
- `state: active`;
- `day_number: 1`;
- `stage_id: onboarding`.

The browser cannot submit assignment IDs, roles or compatibility decisions.

### Card Bundles and methodology ownership

One Card Bundle is created per active Participant. Bundle identity is deterministic from Day and Participant:

```text
bundle_day_01_<participant_key>
```

Bundle content is resolved from:

```text
engine/pipeline.yaml
stages/01_onboarding.yaml
engine/roles-catalog.yaml
cards/
```

The shared Stage cards are combined with the Participant's product-role and onboard-role cards. Card and task IDs remain methodology IDs; runtime assignment and blocker identities may add Participant scope but do not duplicate methodology definitions.

SQL stores prepared events and projections but does not resolve cards, tasks, Stage outputs or role compatibility.

### Read-model publication

The accepted Day 1 boundary creates, in one atomic command:

```text
N × today_view:<participant_key>
1 × captain_day_view
```

All projection replacements share one new Expedition-wide projection version and the final event stream position.

`TodayView` contains the active Day, active `onboarding` Stage, two active role assignments, the schema-valid Card Bundle, tasks, outputs and `expedition_status: active`.

`CaptainDayView` contains the complete active team, active assignments, required-card/task/output blockers, controls, Day revision `1`, transition mode `automatic` and `expedition_status: active`.

### Task blocker ownership

A methodology task ID can appear in multiple Participant bundles. Captain blockers therefore identify a Participant-scoped task instance:

```text
<participant_key>:<task_id>
```

Completing a task removes only that Participant's blocker. It must not clear another Participant's blocker that references the same methodology task ID. Gate 9D4 updates the existing Day 1 reducer and fixtures to this rule.

### Persistence boundaries

Gate 9D2 introduces:

```text
private.start_expedition(jsonb)
```

Gate 9D3 introduces:

```text
private.process_day_boundary(jsonb)
```

Both wrappers:

- are `SECURITY DEFINER` with empty `search_path`;
- are executable only by `service_role`;
- acquire command lock before Expedition lock;
- resolve exact replay before mutable state guards;
- delegate receipt, event and projection persistence only to `private.process_command(jsonb)`;
- update structural Expedition state only inside the same PostgreSQL transaction;
- roll back receipt, events, projections, stream/projection heads and status changes together.

No Day, assignment or Card Bundle table is introduced for the MVP. Authoritative Day state remains event history plus rebuildable projection documents.

### Permissions

- Captain may execute `start_expedition` only.
- Product Captain receives no Expedition start, membership or vessel authority.
- Participant and Shore Operator cannot start an Expedition.
- Only trusted `system_clock` may execute `process_day_boundary`.
- Captain cannot impersonate `system_clock` or perform the normal Day start.
- Manual Captain recovery and force transition remain separate commands with required reasons and append-only events.

### Offline-first behavior

`start_expedition` is online-only and is never placed in the Participant command queue. Captain UI may preserve an unsent form state, but it displays `active` only after the authoritative receipt and `ExpeditionSetupView` refetch.

`process_day_boundary` is server-only. At the local boundary, an offline Participant device may mark yesterday's assignments `expired_pending_sync` and show new content as `awaiting_bundle_sync`; this is not an authoritative Day transition.

Exact retry uses the original command body and deterministic command ID. A stream conflict creates no receipt or domain write and requires authoritative refetch. Delivery states `pending`, `synced`, `conflict`, `rejected` and `offline` never replace domain states.

### Stable errors

Gate 9D implementations use stable errors including:

```text
expedition_not_ready
expedition_already_started
team_not_frozen
rotation_not_ready
first_stage_unresolvable
calendar_day_already_exists
system_clock_authentication_required
system_clock_signature_invalid
system_clock_timestamp_invalid
system_actor_not_allowed
expedition_not_active
stage_not_open
local_boundary_not_reached
boundary_date_mismatch
boundary_already_processed
active_day_already_exists
scheduled_assignments_unresolvable
card_bundle_unresolvable
idempotency_key_reused_with_different_payload
version_conflict
```

Signature, secret and internal SQL details never appear in public error details or structured request logs.

## Acceptance criteria

Gate 9D1 is complete when:

- this ADR and the architecture contract are protected;
- `start_expedition` remains Captain-only, ready-only, empty-payload and online-only;
- the first Day event order is exactly `day.started → role_assignments.activated → card_bundles.published`;
- prior-day expiration and overdue events are conditional rather than unconditional;
- `process_day_boundary` uses deterministic `command_id == idempotency_key`;
- the trusted HMAC `system_clock` branch and null actor context are specified without weakening the public gateway;
- assignment, Card Bundle, projection and Participant-scoped blocker identities are fixed;
- protected validation prevents the contracts from drifting;
- no runtime, migration, secret, deployment or pilot data is added.

Gate 9D is complete only after 9D2–9D4 additionally prove:

- `ready → active` start and exact replay;
- wrong Captain and stale-version rejection;
- first boundary catch-up and exact replay;
- no duplicate Day or bundle on repeated invocation;
- N schema-valid `TodayView` documents and one schema-valid `CaptainDayView`;
- complete rollback when any event or projection is invalid;
- Captain cannot call the normal Day boundary;
- full Python, Deno, pgTAP and PostgreSQL integration CI is green.

## Explicit non-goals

- Day 2–12 reducers;
- Recovery Day execution;
- Captain normal-Day start button;
- runtime release registration;
- cloud migration application;
- scheduler deployment;
- production secret configuration;
- frontend setup implementation;
- Realtime authority;
- pilot or production data;
- a mutable Day, assignment or Card Bundle SQL table.
