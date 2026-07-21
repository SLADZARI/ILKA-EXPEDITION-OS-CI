# Expedition setup and Day 1 pilot runtime contract

Status: Gate 9A contract under accepted `ADR-018`  
Environment: local validation first; development-only `VOYAGE` after reviewed implementation gates  
Source of truth: `docs/decisions/ADR-018-expedition-setup-and-day1-pilot-runtime.md`

## Problem and user scenario

The current backend can create a draft Expedition and Captain membership, but the pinned bootstrap runtime cannot build a real team or start Day 1. The persistence layer already requires an Auth Profile, Expedition membership and separate Participant identity. The current `add_participant` payload cannot establish or prove that identity chain.

The Gate 9 setup path is:

```text
authenticated Captain
→ create Expedition pinned to day1_pilot_v1
→ create participant invitations
→ authenticated invitees accept
→ server creates memberships and Participants
→ Captain generates deterministic rotation
→ Expedition becomes ready
→ Captain starts Expedition
→ system clock processes Day 1 boundary
→ Participants receive authoritative cards and tasks
```

## Architecture boundary

Gate 9A owns only:

- accepted setup and pilot-runtime decision in `ADR-018`;
- the `ExpeditionSetupView` JSON Schema;
- the bounded setup/runtime architecture contract;
- protected static validation and tests;
- status documentation.

Gate 9A does not change:

- `engine/command-catalog.yaml`;
- `schemas/command.schema.json`;
- `engine/event-catalog.yaml`;
- `engine/event.schema.json`;
- `engine/game-engine.yaml`;
- `engine/permissions.yaml`;
- `command-gateway` behavior;
- PostgreSQL migrations or private functions;
- runtime registry or immutable release rows;
- cloud data.

Those canonical implementation contracts are synchronized only in Gate 9B and later subgates after the ADR is protected on `main`. This prevents a public command from appearing valid before an executable runtime and atomic persistence path exist.

## Existing entities reused

No parallel identity entity is introduced.

```text
auth.users
→ ilka.profiles
→ ilka.expedition_members(role=participant)
→ ilka.participants
```

Existing `ilka.invitations` remains the invitation aggregate record. Gate 9B may add only fields required for a stable public invitation key or transaction integrity; it must not introduce a second invitation table.

Existing generic projection persistence remains authoritative:

```text
ilka.projection_heads
ilka.projection_documents
private.process_command(jsonb)
```

`ExpeditionSetupView` is a new concrete projection document, not a second projection engine.

## Setup command boundaries

### `invite_participant`

Transport: canonical `command-gateway`  
Actor: active Captain membership  
Expedition state: `draft`  
Offline: false

Command accepts the invitee email and one client-generated 32-byte base64url secret. The gateway normalizes the email and validates the secret but passes no raw secret into events, projections, structured logs or public errors.

Atomic postcondition:

```text
1 pending invitation
1 accepted command receipt
1 invitation.created event
projection version +1
1 complete expedition_setup_view upsert
```

No membership or Participant is created.

### `accept_invitation`

Transport: canonical `command-gateway` pre-membership branch  
Actor before commit: authenticated active Profile  
Actor after preparation: generated participant membership actor  
Expedition state: `draft`  
Offline: false

The gateway verifies Auth/Profile ownership and normalized Auth email. The server hashes the raw token, resolves the invitation and generates internal membership and Participant UUIDs.

Atomic postcondition:

```text
invitation pending → accepted
1 active participant membership
1 active Participant
1 accepted command receipt
2 ordered events:
  invitation.accepted
  participant.added
projection version +1
1 complete expedition_setup_view upsert
```

Any failure rolls back all rows, events, receipt and projection changes.

### `revoke_invitation`

Transport: canonical `command-gateway`  
Actor: active Captain membership  
Expedition state: `draft`  
Offline: false

Atomic postcondition:

```text
invitation pending → revoked
1 accepted command receipt
1 invitation.revoked event
projection version +1
1 complete expedition_setup_view upsert
```

Acceptance and revocation use fixed locking on command identity, Expedition and invitation. Exactly one terminal transition may commit.

## Stable identity rules

- internal PostgreSQL identities remain UUIDs;
- command, event and projection identities remain stable strings;
- Participant public key is generated as `participant_<uuid_without_hyphens>`;
- Participant order is the lowest free integer from 1 through 5 and is never used as identity;
- invitation implementation must expose a stable `invitation_<uuid_without_hyphens>` key or equivalent stored canonical key;
- existing Participant keys are never renumbered when another invitation is accepted;
- event actors use `member_<membership_uuid_without_hyphens>` after membership preparation.

## Invitation secret handling

Expected raw token form:

```text
32 random bytes
→ unpadded base64url
→ 43 ASCII characters
```

Persistence:

```text
raw token: never persisted
token hash: SHA-256, exactly 32 bytes, ilka.invitations.token_hash
request body: not written to command receipt
receipt: normalized request hash only
event/projection: no raw token and no token hash
```

Logging adapters must redact fields named `invitation_token` before structured logging. Public validation errors identify the field but never echo its value.

## Invitation lifecycle

```text
pending → accepted
pending → revoked
pending → expired
```

All terminal states are immutable. Expiration is trusted-server behavior, not a browser command. Gate 9B may initially evaluate expiration during accept/read operations; a scheduler-driven expiration event is a later bounded implementation if needed.

## Team capacity and readiness

Runtime policy:

```text
team_size_min: 3
team_size_max: 5
invitation_ttl_hours: 168
```

Guards:

- active Participants plus pending invitations cannot exceed five;
- one pending invitation per normalized email per Expedition;
- an active member email cannot be invited again;
- rotation generation requires 3–5 active Participants;
- rotation generation requires zero pending invitations;
- onboarding commands are unavailable after Expedition status becomes `ready`.

## State transitions

```text
Expedition:
  draft --generate_rotation--> ready
  ready --start_expedition--> active

Rotation:
  not_generated --generate_rotation--> generated

Invitation:
  pending --accept_invitation--> accepted
  pending --revoke_invitation--> revoked
  pending --trusted expiry--> expired

Membership:
  absent --accept_invitation--> active participant

Participant:
  absent --accept_invitation--> active
```

`start_expedition` must not accept `draft` after Gate 9 canonical synchronization. Ready state proves a complete frozen pilot team and deterministic rotation.

## Rotation transaction

Input comes from authoritative active Participants sorted by `participant_order`. The Captain supplies no assignment list.

The pinned Engine runtime applies:

- sequential onboard cycle;
- exactly one onboard role per Participant per Day;
- exactly one product role per Participant per Day;
- one Product Captain for Day 1;
- Cook low product load;
- stage role availability;
- incompatible-pair rejection;
- deterministic seed derived from Expedition identity, Participant order and rules release.

Accepted initial generation persists, in order:

```text
rotation.generated
expedition.ready
```

and upserts a complete `ExpeditionSetupView` with `rotation.status = generated` and `expedition_status = ready`.

## Expedition start

`start_expedition` is Captain-only, online-only and accepted only from `ready`.

Ordered events:

```text
expedition.started
stage.opened(stage_id=onboarding)
```

The setup projection remains readable and changes to `expedition_status = active`. No Calendar Day or assignment bundle is fabricated by this command.

## Day 1 boundary

`process_day_boundary` remains `system_clock`-only.

Day 1 reads:

- pinned `onboarding` stage;
- active Participants and generated rotation;
- canonical role and card catalogs;
- Expedition timezone and local boundary;
- current stream/projection versions.

Day 1 accepted result:

```text
day.started
role_assignments.activated
card_bundles.published
```

Projection mutations in one atomic command:

```text
today_view:<participant_key> × active Participants
captain_day_view × 1
```

There is no browser-side role, card, task or Definition of Done reducer.

## `ExpeditionSetupView` persistence contract

```text
projection_key: expedition_setup_view
projection_type: expedition_setup_view
subject_id: null
schema_id: https://ilka.local/schemas/expedition-setup-view.schema.json
schema_version: 1
```

The document is always a complete replacement JSON object. Partial JSON patches are prohibited.

Projection consumers:

- Captain Console before and after Expedition start;
- setup synchronization after every accepted/replayed command;
- readiness controls only as authoritative booleans calculated by the Engine runtime.

The browser may render `pending`, `synced`, `conflict` or `rejected` delivery state, but it does not independently calculate `can_generate_rotation` or `can_start_expedition`.

## Planned read transport

```text
api.get_expedition_setup_view(p_expedition_key text) returns jsonb
```

Security:

- `auth.uid()` required;
- active Captain membership required;
- requested Expedition must match membership scope;
- raw `ilka.invitations`, memberships and Participants remain inaccessible;
- return is the schema-valid projection or `null` before projection bootstrap;
- Product Captain assignment grants no access to Captain setup controls.

## Idempotency and conflicts

Every command uses `idempotency_key == command_id`.

- exact replay returns the immutable original receipt;
- invitation secret remains part of normalized request hashing but is never persisted in clear text;
- same command ID with a different hash writes nothing;
- stale stream position returns authoritative conflict without partial persistence;
- setup projection version advances once per accepted projection-writing command;
- concurrent invitation accept/revoke operations serialize on the invitation identity;
- accepted exact replay does not increment projection version.

## UI behavior

### Captain Console

Locally available:

- last authoritative `ExpeditionSetupView`;
- unsent form fields;
- one-time invitation link immediately after successful creation while the raw token remains in client memory.

States:

- submitting: form action pending, no local invitation row created;
- accepted: refetch setup projection;
- replayed: refetch setup projection;
- conflict: show conflict and refetch;
- rejected: show stable error and refetch when membership/state may have changed;
- offline: setup mutations disabled; draft form may remain local.

### Participant acceptance

- invitation link supplies Expedition key and raw token to the acceptance form;
- user must authenticate before acceptance;
- display name is confirmed by the invitee;
- Participant UI is not entered until accepted response and authoritative membership resolution succeed;
- expired, revoked, wrong-email and already-used invitations show distinct stable errors.

## Error and conflict handling

Pre-persistence failures write nothing:

- malformed/low-entropy token;
- Auth/Profile mismatch;
- invitation email mismatch;
- duplicate membership;
- capacity reached;
- Expedition not in `draft`;
- runtime unavailable.

Deterministic reducer rejections may be persisted only after the Expedition and actor context exist and the private transaction contract supports them. Gate 9B must document which setup failures are pre-aggregate errors and which are immutable rejected receipts.

## Runtime composition and registration

Implementation stages:

1. Gate 9B synchronizes canonical setup commands/events/permissions/schemas and implements invitation transactions plus setup read model.
2. Gate 9C adds deterministic rotation and `draft → ready`.
3. Gate 9D adds `start_expedition`, Day 1 boundary and initial Day projections.
4. Gate 9E registers one exact immutable `day1_pilot_v1` bundle against the protected implementation merge SHA, applies reviewed migrations, updates `ILKA_DEFAULT_RUNTIME_RELEASE_KEY`, deploys the gateway and runs a fresh authenticated pilot smoke.

The runtime registry must not compose independent bundles dynamically at request time. One release row and one exact bundled reducer own the full command set for each pinned Expedition.

## Acceptance scenarios

1. Captain creates three invitations; no raw token is persisted.
2. Three matching Auth Profiles accept once each and receive distinct memberships, Participants and orders.
3. Exact acceptance replay creates no duplicate rows or events.
4. Wrong-email acceptance writes nothing.
5. Expired/revoked invitation acceptance writes nothing.
6. Concurrent revoke and accept produces one terminal state.
7. Rotation with fewer than three Participants is rejected.
8. Rotation with pending invitations is rejected.
9. Valid rotation is deterministic and produces `ready`.
10. Setup commands are unavailable in `ready`.
11. Start from `ready` opens `onboarding` and produces `active`.
12. System Day 1 boundary creates all Participant and Captain projections atomically.
13. Existing `complete_task` works in the same pinned runtime.
14. Existing `gate8d_smoke` remains unchanged and bootstrap-only.

## Explicit non-goals

- implementation code or migrations in Gate 9A;
- direct use of `add_participant` for production onboarding;
- automated invitation delivery;
- raw identity-table reads from browsers;
- anonymous Participant placeholders;
- team changes after ready;
- Captain transfer;
- Day 2–12 reducers;
- Recovery Day execution;
- realtime reducers;
- production data.