# Expedition initial rotation execution

Status: Gate 9C implementation contract under accepted `ADR-018`, `ADR-019` and `ADR-020`  
Public transport: `POST /functions/v1/command-gateway`  
Persistence: `private.generate_rotation(jsonb)` → `private.process_command(jsonb)`

## User scenario

An authenticated Captain has a draft Expedition with three to five active Participants created through accepted invitations. No invitation remains pending. The Captain selects **Generate Rotation** once.

The server must calculate the initial Day 1 role assignment deterministically, append immutable history, replace the complete `ExpeditionSetupView` and atomically transition the Expedition to `ready`.

## Existing entities reused

```text
ilka.expeditions
ilka.expedition_members
ilka.participants
ilka.invitations
ilka.command_receipts
ilka.event_log
ilka.projection_heads
ilka.projection_documents
```

No `rotation_plans` or `role_assignments` table is introduced in Gate 9C.

## Canonical command

```json
{
  "command_id": "cmd_generate_rotation_01",
  "command_type": "generate_rotation",
  "issued_at": "2026-07-21T21:30:00Z",
  "actor_id": "member_<captain_membership_uuid_without_hyphens>",
  "actor_role": "captain",
  "expedition_id": "pilot_expedition",
  "idempotency_key": "cmd_generate_rotation_01",
  "day_number": null,
  "stage_id": null,
  "day_revision": null,
  "payload": {}
}
```

`payload` has `additionalProperties: false`.

## Gateway order

```text
canonical validation
→ authenticated Supabase user
→ normalized request hash
→ existing receipt replay check
→ create_expedition branch
→ invitation branch
→ generate_rotation branch
→ generic active-membership branch
```

Replay remains before current Expedition state and rotation checks.

## Trusted context

`RotationExecutor` loads the standard authoritative `GatewayExecutionContext`:

```text
Expedition UUID/key/status
stream position
projection version
exact pinned runtime release
active Captain actor context
complete ExpeditionSetupView projection
```

The executor does not read assignment input from the command and does not issue separate Participant or invitation queries.

## Runtime policy

```text
team_size_min: 3
team_size_max: 5
rotation_rules_version: 2
onboard_role_cycle:
  - navigation
  - mooring
  - order
  - cook
  - product_focus
onboarding_product_captain_role: product_captain
onboarding_support_role: product_support
```

The policy is immutable inside the runtime bundle.

## Pure reducer

The reducer performs no PostgreSQL or network access.

### Preconditions

```text
command_type = generate_rotation
actor = active Captain membership
Expedition status = draft
setup projection exists and matches current projection version
setup projection expedition_status = draft
rotation.status = not_generated
3–5 active Participants
0 pending invitations
participant_order values unique and within 1..5
command Day/Stage/revision context = null
command payload = {}
```

### Assignment calculation

Participants are sorted by `participant_order`.

Onboard role:

```text
cycle[(participant_order - 1) mod 5]
```

Product Captain:

```text
first sorted active Participant whose onboard role != cook
```

All other Participants receive `product_support`.

Output assignment shape:

```json
{
  "participant_id": "participant_<uuid_without_hyphens>",
  "product_role_id": "product_captain | product_support",
  "onboard_role_id": "navigation | mooring | order | cook | product_focus"
}
```

### Deterministic seed

Seed material:

```text
expedition_key
rotation_rules_version
participant_id:participant_order for each sorted active Participant
```

The UTF-8 material is SHA-256 hashed to lowercase hex.

```text
rotation_id = rotation_<seed[0:32]>
```

### Events

```text
rotation.generated
expedition.ready
```

No Day or Stage context is attached.

### Projection

One complete `expedition_setup_view` replacement is emitted. The reducer preserves Participant and invitation history already present in the projection and changes only authoritative rotation/readiness/setup fields.

## Trusted persistence request

Outer contract:

```text
supabase/contracts/private-generate-rotation-request.schema.json
```

Shape:

```json
{
  "expedition_transition": {
    "expedition_id": "<uuid>",
    "expected_status": "draft",
    "next_status": "ready",
    "rotation_id": "rotation_<32 lowercase hex>",
    "rules_version": 2
  },
  "process_command_request": {
    "...": "private-process-command-request.schema.json"
  }
}
```

The nested canonical command still has payload `{}`.

## PostgreSQL wrapper

`private.generate_rotation(jsonb)` is `SECURITY DEFINER`, has empty `search_path`, and is executable only by `service_role`.

It validates:

- identifiers and command/request hash;
- exact replay identity;
- pinned runtime release and reducer version;
- active Captain actor context;
- Expedition status `draft`;
- active Participant count from three through five;
- unique valid Participant orders;
- zero pending invitations;
- no prior `rotation.generated` event;
- exact two-event order and payload binding;
- complete setup projection identity/version/status/rotation binding;
- accepted result from `private.process_command`.

It then updates:

```text
ilka.expeditions.status = ready
```

The update occurs inside the same PostgreSQL transaction after accepted process persistence. Any later failure rolls everything back.

## Public errors

Stable errors:

```text
active_captain_membership_required
actor_spoofing_detected
expedition_not_found
expedition_not_in_setup
rotation_not_ready
pending_invitations_exist
participant_order_unavailable
rotation_already_generated
runtime_release_unavailable
idempotency_key_reused_with_different_payload
receipt_actor_mismatch
version_conflict
rotation_persistence_unavailable
```

Unknown SQL text is collapsed to `rotation_persistence_unavailable`.

## Offline and synchronization

The command is not placed in the Participant IndexedDB queue.

Captain UI states:

```text
submitting
synced
conflict
rejected
offline
```

`ready` and assignments are rendered only after accepted/replayed response and authoritative setup-view refetch.

## Acceptance scenarios

1. Two active Participants: rejected, no receipt/event/projection/status change.
2. Three active Participants and no pending invitations: accepted.
3. Four active Participants: deterministic unique onboard roles.
4. Five active Participants: full onboard cycle assigned once each.
5. Pending invitation exists: rejected.
6. Cook receives `product_support`.
7. Exactly one Product Captain exists.
8. Exact retry returns original receipt and does not increment versions.
9. New command after ready is rejected.
10. Two concurrent commands have one accepted winner.
11. Failure after `private.process_command` rolls back status and immutable writes.
12. Production runtime registry remains unchanged.

## Non-goals

- `start_expedition`;
- Day 1 `process_day_boundary`;
- Day 2–12 role materialization;
- Captain role override;
- rotation recalculation after ban/unban;
- Recovery Day;
- frontend screens;
- cloud migration/deployment;
- pilot data;
- immutable composite runtime registration.
