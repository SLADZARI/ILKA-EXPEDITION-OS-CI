# ADR-021 — Expedition start and Day 1 boundary

- Status: Accepted
- Date: 2026-07-22
- Owners: Product Architecture / Engine / Backend / Interfaces / Security
- Extends: `ADR-004`, `ADR-012`, `ADR-013`, `ADR-014`, `ADR-018`, `ADR-020`
- Gates: 9D1 contract, 9D2 Expedition start, 9D3 Day 1 boundary, 9D4 integration closure

## Context

Gate 9C ends with a deterministic Rotation Plan, a complete `ExpeditionSetupView` and an atomic `draft → ready` transition. The remaining pilot path is:

```text
start_expedition
→ process_day_boundary
→ assignments activated
→ Card Bundles published
→ TodayView / CaptainDayView available
```

The existing sources agree that `start_expedition` is Captain-only and that normal Day start is `system_clock`-only, but three contradictions remained:

1. the public gateway rejects every `system_clock` claim and no trusted execution path existed;
2. older boundary examples used an idempotency key different from `command_id`;
3. Engine listed prior-day expiry and overdue events as unconditional although Day 1 has no previous Day.

Gate 9D resolves these contradictions without adding a second public write API, Captain Day-start authority, client-side reducers or SQL-owned methodology.

## Decision

### Gate sequence

Gate 9D is delivered as four bounded subgates:

1. **9D1 — canonical contract reconciliation**;
2. **9D2 — executable `start_expedition`**;
3. **9D3 — trusted `system_clock` Day 1 boundary**;
4. **9D4 — examples, fixtures, blocker repair and full vertical closure**.

Gate 9D1 adds no executable runtime, SQL migration, runtime registration, secret, scheduler, deployment or pilot data.

## `start_expedition`

Canonical command:

```text
command_type: start_expedition
actor_role: captain
payload: {}
offline_allowed: false
```

Guards:

- active authenticated Captain membership;
- Expedition status exactly `ready`;
- frozen team of 3–5 active Participants;
- zero pending invitations;
- generated Rotation Plan covering every active Participant exactly once;
- exactly one `product_captain`;
- Cook assigned `product_support`;
- first pipeline Stage resolves to `onboarding`;
- no Calendar Day exists.

Accepted event order:

```text
expedition.started
stage.opened
```

`stage.opened.payload.stage_id` is `onboarding`.

The command atomically transitions `ilka.expeditions.status` from `ready` to `active` and replaces the complete `ExpeditionSetupView` with an active, non-actionable document. It does not create a Calendar Day, assignment instance, Card Bundle, `TodayView` or `CaptainDayView`.

## First `process_day_boundary`

Canonical command:

```text
command_type: process_day_boundary
actor_id: system_clock
actor_role: system_clock
payload:
  local_calendar_date: YYYY-MM-DD
  boundary_at: ISO 8601 with timezone
```

Guards:

- Expedition status `active`;
- active Product Stage `onboarding`;
- no existing Calendar Day;
- configured local boundary reached according to trusted server time;
- `local_calendar_date` equals the date of `boundary_at` in `expedition.timezone`;
- Rotation Plan and active Participants form one complete compatible Day 1 team;
- Stage, role and card references resolve from the pinned release.

A start after the local boundary may be processed as a catch-up for the current local date.

Day 1 emits exactly:

```text
day.started
role_assignments.activated
card_bundles.published
```

Day 1 does not emit `role_assignments.expired` or `task.overdue`. Those events are conditional on `previous_day_exists` and belong to Day 2+ reducers.

### Temporal semantics

`boundary_at` is the scheduled local boundary instant and remains in `day.started.payload` and the Day projection.

For all accepted system-clock events:

```text
occurred_at = trusted gateway received_at
recorded_at = trusted gateway received_at
```

This is required for catch-up processing: a Day 1 event cannot appear to have occurred before the accepted `expedition.started` event merely because the scheduled boundary was earlier that morning. Browser `issued_at` and device clocks are never authoritative for system-event time.

## Deterministic identity and replay

The global invariant remains:

```text
idempotency_key == command_id
```

For a boundary:

```text
command_id = idempotency_key =
cmd_day_boundary_<expedition_key>_<YYYYMMDD>
```

The date is authoritative `local_calendar_date` without separators. Exact retry preserves the original command body and returns the original receipt without creating a duplicate Day, event, assignment, bundle or projection version. Reuse with different intent returns `idempotency_key_reused_with_different_payload` and writes nothing.

## Trusted `system_clock` transport

Human commands continue through the authenticated branch of the single `command-gateway`. Browser callers remain forbidden from submitting `system` or `system_clock` commands.

Gate 9D3 adds a trusted internal branch to the same Edge Function using:

```text
x-ilka-system-timestamp
x-ilka-system-signature
```

Signature:

```text
HMAC-SHA256(secret, timestamp + "." + raw_request_body)
```

Rules:

- server-only secret;
- lowercase hexadecimal signature;
- constant-time comparison;
- bounded timestamp replay window;
- exact actor `system_clock` and command `process_day_boundary`;
- signature verification before returning receipt or Expedition data;
- platform JWT verification remains enabled;
- Captain cannot use the branch or credentials.

Trusted actor context is:

```json
{
  "auth_user_id": null,
  "profile_id": null,
  "membership_id": null,
  "participant_id": null,
  "actor_id": "system_clock",
  "actor_role": "system_clock"
}
```

Secret configuration and scheduled invocation are Gate 9E deployment responsibilities.

## Assignment instances

The Rotation Plan remains the scheduling source. Day activation derives two stable instances per Participant:

```text
assignment_day_01_<participant_key>_product
assignment_day_01_<participant_key>_onboard
```

Each contains `assignment_id`, stable Participant key, `role_type`, `role_id`, `state: active`, `day_number: 1` and `stage_id: onboarding`. Ordering is `participant_order`, then product, then onboard. The browser cannot supply roles, assignments or compatibility decisions.

## Card Bundles and methodology ownership

One deterministic bundle is created per active Participant:

```text
bundle_day_01_<participant_key>
```

Content resolves only from:

```text
engine/pipeline.yaml
stages/01_onboarding.yaml
engine/roles-catalog.yaml
engine/role-rotation-rules.yaml
cards/
```

Card order is shared Stage cards, product-role cards, then onboard-role cards. Duplicate references are a release defect and are rejected. SQL persists prepared events/projections but does not resolve cards, tasks, outputs, Stage logic or role compatibility.

## Projection publication

One atomic boundary command creates:

```text
N × today_view:<participant_key>
1 × captain_day_view
```

All documents share one new Expedition projection version and final stream position.

`TodayView` contains Day 1 active, Stage `onboarding` active, two active assignments, schema-valid cards/tasks/outputs, `sync_status: synced` and `expedition_status: active`.

`CaptainDayView` contains the ordered team, assignments, blockers, Day revision `1`, transition mode `automatic`, controls and `expedition_status: active`.

## Task blocker ownership

The same methodology task can appear in several Participant bundles. Captain blockers therefore identify a Participant-scoped task instance:

```text
<participant_key>:<task_id>
```

Completing a task removes only that Participant's blocker. Gate 9D4 repairs the existing reducer and fixtures to this rule.

## Persistence boundaries

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
- resolve exact replay before mutable guards;
- delegate receipt/event/projection writes only to `private.process_command(jsonb)`;
- keep structural status changes in the same transaction;
- roll back receipt, events, projections, heads and status changes together.

No Day, assignment or Card Bundle table is introduced. Authoritative state remains append-only events plus rebuildable projection documents.

## Permissions and offline behavior

- Captain may execute `start_expedition` but not `process_day_boundary`.
- Product Captain gains no setup, vessel or system authority.
- Participant and Shore Operator cannot start the Expedition.
- only trusted `system_clock` may execute the normal boundary;
- Captain cannot impersonate `system_clock`;
- manual recovery/force commands remain separate, reasoned and append-only.

`start_expedition` is online-only and never enters the Participant queue. Captain UI shows `active` only after authoritative receipt and setup-view refetch.

`process_day_boundary` is server-only. An offline device may visually mark stale assignments `expired_pending_sync` and new content `awaiting_bundle_sync`, but it cannot create Day 1 locally. `pending`, `synced`, `conflict`, `rejected` and `offline` are delivery states, not domain outcomes.

## Stable errors

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

Secrets, signatures and SQL details never appear in public errors or request logs.

## Acceptance criteria

Gate 9D1 is complete when:

- this ADR and architecture contract are protected;
- `start_expedition` remains Captain-only, ready-only, empty-payload and online-only;
- Day 1 event order is exactly `day.started → role_assignments.activated → card_bundles.published`;
- prior-day events are conditional;
- deterministic `command_id == idempotency_key` is protected;
- trusted HMAC system transport and null actor context are specified without weakening the public branch;
- catch-up event time cannot precede `expedition.started`;
- assignment, bundle, projection and Participant-scoped blocker identities are fixed;
- protected validation prevents drift;
- no runtime, migration, secret, deployment or pilot data is added.

Gate 9D completes after 9D2–9D4 additionally prove `ready → active`, exact replay, wrong-Captain and version conflicts, first boundary catch-up, no duplicates, N valid `TodayView` documents, one valid `CaptainDayView`, complete rollback and green Python/Deno/pgTAP/PostgreSQL integration CI.

## Explicit non-goals

- Day 2–12 reducers;
- Recovery Day execution;
- Captain normal-Day start button;
- runtime registration;
- cloud migration application;
- scheduler deployment;
- production secret configuration;
- frontend setup implementation;
- Realtime authority;
- pilot or production data;
- mutable Day, assignment or Card Bundle SQL tables.
