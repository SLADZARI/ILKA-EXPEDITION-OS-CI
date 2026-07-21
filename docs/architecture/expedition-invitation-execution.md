# Expedition invitation execution

Status: Gate 9B2C execution implementation under accepted `ADR-018` and `ADR-019`  
Persistence prerequisite: Gate 9B2B  
Public transport: `POST /functions/v1/command-gateway`

## Purpose

Gate 9B2C connects the canonical invitation commands to the atomic PostgreSQL wrappers without adding another state model:

```text
authenticated command
→ command-gateway replay check
→ InvitationExecutor
→ exact pinned invitation-capable RuntimeBundle
→ canonical event(s) + complete ExpeditionSetupView
→ private invite/accept/revoke wrapper
→ private.process_command(jsonb)
```

The Engine runtime remains authoritative for invitation event content, setup readiness and the complete projection. PostgreSQL remains authoritative for locks, identity rows, capacity races, terminal transitions and atomic persistence.

## Scope

Implemented:

```text
invite_participant
accept_invitation
revoke_invitation
```

New execution components:

```text
supabase/functions/_shared/engine-runtime/expedition-invitations-v1.ts
supabase/functions/_shared/command-gateway/invitation.ts
supabase/functions/_shared/command-gateway/invitation-database.ts
supabase/functions/_shared/command-gateway/invitation-schema-validation.ts
```

This gate does not register the runtime in `commandGatewayRuntimeRegistry`. A production Expedition can execute these commands only after Gate 9E protects one composite `day1_pilot_v1` implementation SHA and registers the exact immutable release.

## Existing sources reused

```text
schemas/command.schema.json
engine/event.schema.json
engine/command-catalog.yaml
engine/event-catalog.yaml
engine/game-engine.yaml
engine/permissions.yaml
app/contracts/expedition-setup-view.schema.json
supabase/contracts/private-invitation-process-command-request.schema.json
supabase/contracts/private-invite-participant-request.schema.json
supabase/contracts/private-accept-invitation-request.schema.json
supabase/contracts/private-revoke-invitation-request.schema.json
private.invite_participant(jsonb)
private.accept_invitation(jsonb)
private.revoke_invitation(jsonb)
private.process_command(jsonb)
```

No new invitation, membership, Participant, event or projection table is introduced.

## Gateway routing

The gateway order is fixed:

```text
canonical command validation
→ authenticated Supabase user
→ normalized public request hash
→ existing receipt lookup
→ exact replay / idempotency mismatch
→ create_expedition bootstrap branch
→ invitation branch
→ generic active-membership command branch
```

All three invitation commands are routed before the generic active-membership path. This is required because `accept_invitation` starts with an authenticated active Profile but no Expedition membership.

Exact replay remains earlier than every current-state check. An accepted invitation command therefore remains replayable after the invitation reaches a terminal state or the actor membership later changes.

## Auth identity

The Supabase Auth verifier retains:

```text
id
email
email_verified = email_confirmed_at is present
```

The verified email is used only by the trusted acceptance adapter. It is normalized with trim plus lowercase and is never copied into an event, projection, receipt, structured error or nested process command.

### Captain commands

`invite_participant` and `revoke_invitation` require:

- active Captain membership in the requested Expedition;
- no Participant identity on that Captain membership;
- canonical actor `member_<membership_uuid_without_hyphens>`;
- `actor_role = captain`.

Product Captain receives no invitation authority.

### Pre-membership acceptance

`accept_invitation` requires:

- authenticated Supabase user;
- confirmed Auth email;
- active `ilka.profiles` row;
- command `actor_id` equal to that Profile UUID;
- no existing active Expedition membership;
- invitation token resolving inside the requested Expedition;
- verified Auth email matching the invitation email;
- pending, unexpired Participant invitation;
- one lowest-free Participant order from 1 through 5.

The executor generates the future membership and Participant UUIDs before reduction. The runtime actor is then prepared as:

```text
actor_id: member_<new_membership_uuid_without_hyphens>
actor_role: participant
membership_role: participant
participant_id: null
participant_key: null
```

The SQL wrapper creates the membership before `private.process_command`, then creates the Participant and marks the invitation accepted in the same transaction.

## Secret handling

Public tokens are exactly 43 unpadded base64url characters representing 32 random bytes.

The executor performs:

```text
raw invitation_token
→ UTF-8 bytes
→ SHA-256
→ lowercase 64-character hex
```

Only the outer trusted wrapper request contains `token_hash`. The nested `process_command_request.command.payload` is exactly `{}`.

`invite_participant` email handling:

```text
public email
→ trim + lowercase
→ ilka.invitations.email_normalized
→ masked email_hint for event/projection
```

The runtime receives only `email_hint`, canonical invitation identity and expiry. It never receives the normalized full email or token hash through `invitation_operation`.

## Runtime policy

The pure runtime exposes immutable policy metadata:

```text
team_size_min: 3
team_size_max: 5
invitation_ttl_hours: 168
```

Invitation expiry is calculated from trusted server `received_at`, not client `issued_at`:

```text
expires_at = received_at + 168 hours
```

The runtime performs no network or PostgreSQL query.

## Runtime structural operation

The executor adds one trusted in-memory operation to the runtime context.

### Invite

```text
kind: invite
invitation_id: invitation_<uuid_without_hyphens>
email_hint: masked address
expires_at: server-derived timestamp
```

### Accept

```text
kind: accept
invitation_id: invitation_<uuid_without_hyphens>
participant_id: participant_<uuid_without_hyphens>
display_name: trimmed invitee value
participant_order: lowest free order
```

### Revoke

```text
kind: revoke
invitation_id: invitation_<uuid_without_hyphens>
reason: trimmed Captain reason
```

The structural operation must match the canonical command discriminator. A mismatch is `runtime_contract_invalid` and writes nothing.

## Events

Time semantics:

```text
occurred_at = command.issued_at
recorded_at = gateway received_at
```

Deterministic identities:

```text
evt_<command suffix>_01
evt_<command suffix>_02
```

Produced event order:

```text
invite_participant:
  invitation.created

accept_invitation:
  invitation.accepted
  participant.added

revoke_invitation:
  invitation.revoked
```

No raw email, raw token or token hash appears in event payloads.

## ExpeditionSetupView

Document identity remains:

```text
projection_key: expedition_setup_view
projection_type: expedition_setup_view
subject_id: null
schema_id: https://ilka.local/schemas/expedition-setup-view.schema.json
schema_version: 1
```

The first accepted invite may initialize the setup projection only when:

```text
projection_version = 0
no existing expedition_setup_view document
Expedition status = draft
```

Acceptance and revocation require an existing compatible setup projection. Every accepted command writes one complete replacement document and sets:

```text
expected_projection_version = current projection version + 1
sync_status = synced
```

The runtime recalculates:

- active Participant count;
- pending invitation count;
- remaining slots;
- deterministic Participant ordering;
- `can_generate_rotation`;
- `can_start_expedition`;
- blockers;
- Captain setup controls.

To respect the canonical maximum of five invitation summaries while preserving append-only history, a new invite may evict the oldest `revoked` or `expired` summary from the projection. Pending and accepted summaries are never silently discarded. Full history remains in `ilka.event_log`.

## Readiness

`can_generate_rotation` is true only when:

```text
Expedition status = draft
3–5 active Participants
0 pending invitations
rotation.status = not_generated
```

`can_start_expedition` remains false in this gate because Gate 9C owns deterministic rotation and `draft → ready`.

Stable blockers produced by this runtime include:

```text
team_minimum_not_met
pending_invitation
rotation_not_generated
```

The browser never recalculates these values.

## Persistence requests

The executor validates:

1. every canonical event;
2. the complete `ExpeditionSetupView`;
3. the command-specific private outer request schema;
4. the generic persisted command result.

The nested secret-free command contains explicit null setup context and empty payload. It remains bound to the original public command by the SHA-256 `request_hash` calculated before secret removal.

The executor calls exactly one wrapper:

```text
private.invite_participant(jsonb)
private.accept_invitation(jsonb)
private.revoke_invitation(jsonb)
```

It never calls generic `private.process_command(jsonb)` directly for these commands and never writes a table.

## Errors

Pre-persistence failures create no receipt, event, projection or identity row. Stable public mappings include:

```text
active_profile_required
profile_actor_mismatch
active_captain_membership_required
actor_spoofing_detected
expedition_not_found
expedition_not_in_setup
team_capacity_reached
participant_already_member
pending_invitation_already_exists
invitation_not_found
invitation_expired
invitation_not_pending
invitation_email_mismatch
invitation_token_invalid
participant_order_unavailable
idempotency_key_reused_with_different_payload
receipt_actor_mismatch
version_conflict
runtime_release_unavailable
invitation_persistence_unavailable
```

Unknown SQL text is collapsed to `invitation_persistence_unavailable`. Public responses never echo token, hash or full invitation email.

## Offline and synchronization

Invitation commands remain online-only. They are not placed in the Participant IndexedDB command queue.

The UI may retain unsent form fields locally. After accepted or replayed persistence it must refetch `api.get_expedition_setup_view`. Delivery states remain transport-only:

```text
pending
synced
conflict
rejected
offline
```

## Acceptance criteria

Gate 9B2C is complete when protected CI proves:

- exact replay still precedes invitation current-state checks;
- acceptance bypasses only the generic membership requirement, not authentication or Profile verification;
- raw token is hashed before trusted persistence preparation;
- invitation runtime contains no database/network access;
- all three reducers produce schema-valid ordered events and one complete setup projection;
- Captain actor spoofing is rejected;
- wrong-email, unverified-email, expired and terminal acceptance write nothing;
- accepted acceptance creates one membership and Participant atomically through the Gate 9B2B wrapper;
- executor calls no generic persistence function;
- direct PostgreSQL integration covers invite, accept and revoke;
- production runtime registry remains unchanged;
- no migration, deployment or cloud/pilot data is added.

## Explicit non-goals

Gate 9B2C does not implement:

- deterministic rotation or `draft → ready`;
- `start_expedition`;
- Day 1 boundary or initial Day projections;
- invitation delivery by email or SMS;
- scheduled expiration events;
- frontend setup screens;
- production runtime bundle composition or registration;
- Supabase migration application;
- Edge Function deployment;
- pilot data.
