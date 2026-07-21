# ADR-020 — Deterministic initial rotation and `draft → ready`

- Status: Accepted
- Date: 2026-07-21
- Owners: Product Architecture / Engine / Backend / Security
- Extends: `ADR-018`, `ADR-019`
- Gate: 9C

## Context

After Gate 9B2C, an authenticated Captain can create invitations and invitees can become active Participants. The authoritative `ExpeditionSetupView` already contains stable Participant keys, immutable `participant_order`, invitation terminal state and readiness blockers.

Gate 9C must generate the first authoritative Rotation Plan and transition the Expedition from `draft` to `ready` without allowing browser-supplied assignments, client-selected rules or a second persistence model.

Three lower-priority files conflict with `ADR-018`:

- `engine/role-rotation-rules.yaml` names `expedition_membership_order` although the accepted contract requires `participants.participant_order`;
- `schemas/command.schema.json` and `engine/command-catalog.yaml` require client `seed` and `rules_version`, although the accepted contract requires a server-derived deterministic seed and pinned rules release;
- `engine/game-engine.yaml` and `engine/permissions.yaml` allow `system` to submit `generate_rotation`, while the pilot setup flow defines an explicit Captain action.

Under the project source priority, this ADR and `ADR-018` override those lower-level copies. Gate 9C synchronizes them.

## Decision

### Command boundary

Canonical command:

```text
generate_rotation
```

Rules:

```text
actor: active Captain membership
Expedition state: draft
payload: {}
offline: false
```

The public Captain cannot supply:

- assignments;
- seed;
- rules version;
- role ordering;
- a Product Captain identity;
- an Expedition status transition.

Exact replay is checked before all mutable guards.

### Authoritative inputs

The reducer reads only:

- the Expedition key and exact pinned runtime release;
- the complete authoritative `ExpeditionSetupView`;
- active Participants sorted by `participants.participant_order`;
- the pinned rotation policy compiled into the runtime bundle.

The first rotation requires:

```text
3–5 active Participants
0 pending invitations
rotation.status = not_generated
Expedition status = draft
unique participant_order values in 1..5
```

Banned Participants are excluded. Existing Participant keys and orders are never renumbered.

### Initial Rotation Plan scope

Gate 9C creates the initial Day 1 assignment set represented by `ExpeditionSetupView.rotation.assignments`.

It does not pre-materialize Day 2–12 assignment rows. Future Day transitions derive the scheduled assignment for their effective Calendar Day and Product Stage from the same pinned rules and append-only history.

The Gate 9C projection therefore contains at most five assignments and no duplicated day field.

### Onboard role algorithm

The authoritative cycle is:

```text
navigation
mooring
order
cook
product_focus
```

For each active Participant:

```text
onboard_role_index = (participant_order - 1) mod 5
```

Participant order is stable, so the result is deterministic and unique for all active Participants in the initial team.

For teams smaller than five, unassigned cycle roles remain unassigned. Gate 9C does not fabricate additional people or combine multiple onboard roles on one Participant.

### Product role algorithm for `onboarding`

The initial Product Stage is `onboarding`. The only authoritative Day 1 product roles are:

```text
product_captain
product_support
```

Exactly one active Participant receives `product_captain`:

```text
the lowest participant_order whose onboard role is not cook
```

Every other active Participant receives `product_support`.

This guarantees:

- exactly one Product Captain;
- exactly one product role per active Participant;
- Cook always has low product load;
- no incompatible `product_captain + cook` pair;
- deterministic behavior for teams of three, four or five.

### Rules version, seed and identity

The runtime policy pins:

```text
rotation_rules_version: 2
onboard_role_cycle: [navigation, mooring, order, cook, product_focus]
onboarding_product_captain_role: product_captain
onboarding_support_role: product_support
```

The runtime derives a SHA-256 seed from:

```text
expedition_key
rotation_rules_version
ordered participant_id:participant_order pairs
```

The seed is an audit fingerprint, not browser-controlled randomness.

Canonical Rotation identity:

```text
rotation_<first 32 lowercase hex characters of seed>
```

### Events

Accepted generation appends exactly two ordered events:

```text
1. rotation.generated
2. expedition.ready
```

`rotation.generated.payload` contains:

```text
rotation_id
seed
rules_version
assignments
```

`expedition.ready.payload` contains:

```text
rotation_id
```

`occurred_at` is the canonical command `issued_at`; `recorded_at` is trusted gateway receipt time.

### Projection transition

The reducer writes one complete `ExpeditionSetupView` replacement:

```text
expedition_status: ready
rotation.status: generated
rotation.rotation_id: <derived rotation id>
rotation.rules_version: 2
rotation.assignments: <complete active team assignment list>
readiness.can_generate_rotation: false
readiness.can_start_expedition: true
readiness.blockers: []
controls.invite_participant: false
controls.revoke_invitation: false
controls.generate_rotation: false
controls.start_expedition: true
expected_projection_version: previous + 1
sync_status: synced
```

The browser does not recalculate readiness or assignments.

### Atomic PostgreSQL boundary

Gate 9C adds one service-role-only structural wrapper:

```text
private.generate_rotation(jsonb)
```

Fixed transaction order:

```text
1. command advisory transaction lock
2. Expedition advisory transaction lock
3. exact receipt replay check
4. Expedition / runtime / Captain / team / invitation / projection guards
5. private.process_command(process_command_request)
6. update ilka.expeditions.status: draft → ready
7. commit
```

The wrapper does not insert directly into:

```text
ilka.command_receipts
ilka.event_log
ilka.projection_documents
```

`private.process_command(jsonb)` remains their only writer.

No rotation table is introduced. The append-only events and complete authoritative setup projection are the MVP source of truth for the initial plan.

If `private.process_command` conflicts or the Expedition status update fails, PostgreSQL rolls back receipt, events, projection and status together.

### Gateway execution

Gate 9C adds one `RotationExecutor` before the generic membership command path.

It performs only trusted preparation:

- active Captain actor verification;
- exact pinned rotation-capable runtime lookup;
- pure reduction;
- canonical event validation;
- complete setup projection validation;
- private request validation;
- stable public error translation;
- one call to `private.generate_rotation(jsonb)`.

It does not query or write a rotation table and does not calculate assignments outside the Engine runtime.

### Idempotency and conflict behavior

- `idempotency_key` equals `command_id`;
- exact replay returns the original result before reading current `ready` state;
- same command ID with another request hash writes nothing;
- a second new command after generation returns `rotation_already_generated` or `expedition_not_in_setup` without domain writes;
- stale stream or projection state returns `version_conflict` and writes nothing;
- concurrent valid rotation commands have one accepted winner.

### Permissions

For the Gate 9 pilot:

```text
Captain: generate_rotation
Product Captain: denied
Participant: denied
Shore Operator: denied
system: not exposed for generate_rotation
system_clock: denied
```

Captain vessel authority remains separate from Product Captain process authority.

### Offline behavior

`generate_rotation` is online-only and server-confirmed.

The Captain UI may retain an unsent intent locally, but it must not:

- create provisional assignments;
- show `ready` before accepted persistence;
- queue the command in the Participant IndexedDB command queue.

After accepted or replayed persistence, the client refetches `api.get_expedition_setup_view`.

### Production release boundary

Gate 9C does not:

- modify the production `commandGatewayRuntimeRegistry`;
- insert a `runtime_releases` row;
- change an existing Expedition runtime pin;
- apply the migration to cloud;
- deploy the Edge Function;
- create pilot data.

The rotation reducer remains implementation material for the protected composite `day1_pilot_v1` release registered only in Gate 9E.

## Consequences

- Initial assignments are deterministic and auditable.
- Browser input cannot change the rules or assignments.
- `draft → ready` is atomic with immutable history and projection state.
- Participant order remains the stable sequencing source.
- Cook always receives low product load.
- A separate rotation persistence model is avoided.
- Future Day assignment materialization remains a later Engine concern.

## Rejected alternatives

### Client-provided assignment list

Rejected because it moves critical business logic into the UI and bypasses the pinned runtime.

### Client-provided seed or rules version

Rejected because it permits browser-controlled authoritative outcomes and conflicts with `ADR-018`.

### Membership order as sequence source

Rejected because memberships do not contain the canonical stable Participant order.

### Separate rotation table in Gate 9C

Rejected because the accepted MVP contract already uses append-only events and complete projection documents, and no independent mutable rotation aggregate is required for Day 1.

### Product Captain or system initiating pilot rotation

Rejected because setup authority belongs to the active Captain and no automatic Gate 9C trigger is defined.

### Full Day 1 bootstrap in the same command

Rejected because `start_expedition` and `process_day_boundary` belong to Gate 9D.

## Acceptance criteria

Gate 9C is accepted when protected CI proves:

- canonical `generate_rotation` payload is exactly `{}`;
- only active Captain can submit it through the public gateway;
- 2 Participants are rejected;
- 3, 4 and 5 Participant teams produce deterministic schema-valid assignments;
- pending invitations block generation;
- duplicate Participant orders are rejected;
- exactly one Product Captain is assigned;
- Cook receives `product_support`;
- assignments use the sequential onboard cycle and stable Participant order;
- accepted event order is `rotation.generated`, then `expedition.ready`;
- one complete setup projection advances by one version and enables start;
- `ilka.expeditions.status` becomes `ready` in the same transaction;
- exact replay creates no additional events or projection version;
- concurrent new commands have one accepted winner;
- SQL wrappers do not write receipt/event/projection tables directly;
- migration replay, JSON Schema validation, formatting, lint, typecheck, unit tests, pgTAP, database lint and direct PostgreSQL integration are green;
- production runtime registry, cloud deployment and pilot data remain unchanged.
