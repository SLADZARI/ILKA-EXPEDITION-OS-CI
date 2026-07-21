# ADR-018 — Expedition setup and Day 1 pilot runtime

- Status: Accepted
- Date: 2026-07-21
- Owners: Product Architecture / Engine / Backend / Interfaces / Security
- Extends: `ADR-012`, `ADR-014`, `ADR-015`, `ADR-016`, `ADR-017`
- Gates: 9A contract, 9B participant onboarding, 9C rotation, 9D Expedition start and Day 1 bootstrap, 9E immutable composite runtime registration and live pilot smoke

## Context

Gate 8 proved authenticated aggregate creation through the canonical `command-gateway`. The resulting `expedition_bootstrap_v1` release is intentionally bootstrap-only and every Expedition is immutably pinned to its runtime release. It cannot execute invitation, Participant, rotation, Expedition start, Day boundary or `complete_task` commands.

The persistence model already contains `ilka.invitations`, Expedition-scoped memberships and separate domain Participants. The canonical `add_participant` command, however, accepts only `participant_id` and `display_name`; it cannot establish the required Auth Profile → membership → Participant identity chain. Direct Captain creation of an unowned Participant would bypass authenticated identity and invitation acceptance.

A pilot Expedition therefore requires one composite immutable runtime and an explicit authenticated invitation flow before any real team, rotation or Day 1 projection is created.

## Decision

### Gate 9 boundary

Gate 9 delivers one controlled setup-to-Day-1 vertical:

```text
create_expedition
→ invite_participant
→ accept_invitation
→ generate_rotation
→ start_expedition
→ process_day_boundary
→ initial TodayView / CaptainDayView
→ complete_task
```

Gate 9A accepts the business and interface contract only. It adds no executable command, migration, private transaction, runtime bundle, runtime-release row, Edge Function behavior or cloud data. Canonical command/event/schema synchronization begins in Gate 9B after this ADR is protected on `main`.

### Existing `add_participant`

`add_participant` is not the production onboarding path because it cannot prove Auth Profile ownership or invitation acceptance. Gate 9B must mark it as a non-public legacy command or replace its external use without creating a second Participant entity or direct browser CRUD path.

Participant membership is created only by accepted `accept_invitation` inside one trusted atomic transaction.

### Public write transport

All Gate 9 domain writes continue to use:

```text
POST /functions/v1/command-gateway
```

No public setup Edge Function, direct browser insert or Data API table mutation is introduced.

### Invitation creation

Reserved command:

```text
invite_participant
```

Rules:

- actor is the active Expedition Captain;
- Expedition status must be `draft`;
- the invitation role is fixed to `participant` for this gate;
- active Participants plus pending invitations must not exceed the runtime team maximum of five;
- the normalized email must not already belong to an active Expedition member;
- only one pending invitation may exist for the normalized email;
- the operation is online-only and server-confirmed;
- the Captain client generates a cryptographically random 32-byte base64url invitation token;
- the server validates token format and stores only `SHA-256(token)`;
- the raw token is never stored in an event, projection, receipt, database column, structured log or error message;
- the immutable runtime policy derives `expires_at`; the MVP pilot policy is `invitation_ttl_hours = 168`;
- the accepted command creates one pending invitation, one accepted receipt, one `invitation.created` event and one complete `ExpeditionSetupView` upsert.

The raw token may be used once by the Captain UI to construct a manually shareable invitation link. Automated email delivery is outside Gate 9.

### Invitation acceptance

Reserved command:

```text
accept_invitation
```

This is the second explicit pre-membership command-gateway path after `create_expedition`.

Rules:

- the caller must have an authenticated active Profile;
- no existing Expedition membership is required before this command only;
- Expedition status must be `draft`;
- the raw token is hashed server-side and must resolve exactly one pending, unexpired invitation in the requested Expedition;
- the authenticated Auth email, normalized server-side, must match the invitation email;
- the invitation role must be `participant`;
- the Profile must not already have a membership in the Expedition;
- the server allocates the lowest free `participant_order` from 1 through 5;
- the server generates membership and Participant UUIDs and a stable canonical `participant_<uuid_without_hyphens>` key;
- the display name is supplied by the accepting user, trimmed and validated;
- one atomic transaction marks the invitation accepted, creates one active participant membership, creates one active Participant, persists one receipt, appends `invitation.accepted` and `participant.added`, and upserts the complete `ExpeditionSetupView`;
- the authoritative event actor is the newly created participant membership actor `member_<membership_uuid_without_hyphens>`;
- exact replay by the original authenticated user returns the original receipt without re-reading a now-terminal invitation.

### Invitation revocation

Reserved command:

```text
revoke_invitation
```

Rules:

- active Captain only;
- Expedition status must be `draft`;
- target invitation must be pending;
- a non-empty reason is required;
- one atomic command marks the invitation revoked, appends `invitation.revoked` and updates `ExpeditionSetupView`;
- acceptance and revocation races are serialized; exactly one terminal transition wins.

Expired invitations are derived by trusted server processing in a later bounded implementation step. A client cannot declare an invitation expired.

### Reserved events

Gate 9 reserves these canonical events for Gate 9B synchronization:

```text
invitation.created
invitation.accepted
invitation.revoked
participant.added
expedition.ready
```

Privacy rules:

- `invitation.created` contains a stable `invitation_id`, masked `email_hint`, role and `expires_at`;
- no event contains raw email, raw invitation token or token hash;
- `invitation.accepted` links the invitation to the canonical Participant key;
- `participant.added` includes `participant_id`, `display_name` and `participant_order`;
- historical events remain append-only when an invitation is revoked or expires.

### Setup states and transitions

```text
Expedition: draft → ready → active
Invitation: pending → accepted | revoked | expired
Membership: absent → active participant
Participant: absent → active
Rotation: not_generated → generated
```

Rules:

- `invite_participant`, `accept_invitation` and `revoke_invitation` are allowed only in `draft`;
- `generate_rotation` requires 3–5 active Participants and zero pending invitations;
- successful initial `generate_rotation` appends `rotation.generated` and `expedition.ready` atomically and transitions `draft → ready`;
- `ready` freezes Participant onboarding for the MVP pilot;
- `start_expedition` is accepted only from `ready` and appends `expedition.started` plus `stage.opened(onboarding)`;
- changing a ready team requires a future explicit reopen-setup decision and is outside Gate 9.

### Rotation contract

The existing sequential rotation rules remain authoritative:

- participant order source is `participants.participant_order`;
- exactly one product role and one onboard role per Participant per Day;
- onboard cycle is `navigation`, `mooring`, `order`, `cook`, `product_focus`;
- exactly one `product_captain` is assigned for Day 1;
- Cook receives low product load;
- incompatible role pairs are rejected;
- output is deterministic from the pinned runtime policy and Participant order;
- the Captain cannot supply authoritative assignments in the command payload.

### Expedition start and Day 1 boundary

`start_expedition` opens the canonical `onboarding` Product Stage but does not directly create a Calendar Day.

`process_day_boundary` remains `system_clock`-only. For the first Day:

- the target local date boundary must have been reached;
- a start occurring after the local boundary may be processed as a catch-up for the current local date;
- Day 1 emits `day.started`, `role_assignments.activated` and `card_bundles.published`;
- no previous assignment-expiry or overdue-task event is required for Day 1;
- the reducer creates one schema-valid `TodayView` per active Participant and one schema-valid `CaptainDayView` in the same atomic command;
- cards, outputs, roles and tasks come from the pinned `onboarding` stage and card configuration, not SQL or UI code.

### Composite runtime

The implementation target is one immutable release provisionally named:

```text
release_key: day1_pilot_v1
reducer_version: day1_pilot_v1
```

It must contain exact executable support for:

```text
create_expedition
invite_participant
accept_invitation
revoke_invitation
generate_rotation
start_expedition
process_day_boundary
complete_task
```

The protected implementation merge SHA is registered only in Gate 9E. `expedition_bootstrap_v1` and the existing `gate8d_smoke` aggregate remain unchanged. No Expedition runtime pin is mutated or silently upgraded.

### `ExpeditionSetupView`

A new Captain-only read model represents setup before a Calendar Day exists:

```text
projection_key: expedition_setup_view
projection_type: expedition_setup_view
subject_id: null
schema_id: https://ilka.local/schemas/expedition-setup-view.schema.json
schema_version: 1
```

`CaptainDayView` is not reused because it requires Day, Stage, output and completion fields that do not exist in `draft` setup.

The projection contains only masked invitation identity. Raw email and invitation secrets remain outside projections.

Future read transport:

```text
api.get_expedition_setup_view(p_expedition_key text) returns jsonb
```

It requires an active Captain membership and exposes no raw identity table access.

### Permissions

- Captain: invite, revoke, generate rotation and start Expedition;
- authenticated active Profile matching the invitation email: accept invitation;
- Product Captain has no setup membership authority;
- Participant and Shore Operator cannot invite, revoke, generate rotation or start Expedition;
- `process_day_boundary` remains `system_clock`-only;
- all setup writes are server-confirmed;
- Captain vessel and safety authority remains independent from Product Captain.

### Offline-first behavior

Setup commands are never placed in the Participant IndexedDB command queue:

```text
invite_participant: offline false
accept_invitation: offline false
revoke_invitation: offline false
generate_rotation: offline false
start_expedition: offline false
process_day_boundary: server-only
complete_task: offline true
```

The UI may preserve unsent setup form fields locally. It must show membership, rotation, readiness or Expedition status only after authoritative response and `ExpeditionSetupView` refetch.

Retry rules:

- exact retry preserves the original command body and `command_id`;
- accepted exact replay creates no duplicate invitation, membership, Participant, event or projection version;
- request-hash mismatch is rejected without domain writes;
- stream/projection conflicts are authoritative and require refetch;
- pending, synced, conflict and rejected are delivery states, not locally calculated domain outcomes.

### Stable error vocabulary

Gate 9B must provide stable public mappings including:

```text
active_profile_required
profile_actor_mismatch
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
rotation_not_ready
pending_invitations_exist
rotation_already_generated
expedition_not_ready
runtime_release_unavailable
idempotency_key_reused_with_different_payload
version_conflict
```

### Security and privacy

- raw invitation tokens are high-sensitivity secrets;
- token fields must be redacted before structured logging;
- request bodies containing tokens must never be included in public error details;
- only a SHA-256 token hash is persisted;
- events and projections contain only masked `email_hint`;
- browser roles retain no direct `ilka` table or `private` function access;
- Auth email matching is performed server-side and never trusted from command payload claims.

## Acceptance criteria

Gate 9 is complete only when a newly created pilot Expedition can prove:

```text
1 active Captain
3–5 active Participants created through accepted invitations
0 pending invitations before rotation
1 deterministic Rotation Plan
Expedition draft → ready → active
onboarding Stage active
Day 1 active
N schema-valid TodayView projections
1 schema-valid CaptainDayView
complete_task accepted and replayable
```

Additional criteria:

- every meaningful setup action appends immutable canonical events;
- invitation acceptance is atomic across invitation, membership, Participant, receipt, events and setup projection;
- concurrent acceptance/revocation produces one terminal invitation outcome;
- no raw token or full email appears in event/projection/log contracts;
- exact retries create no duplicates;
- `gate8d_smoke` remains pinned to `expedition_bootstrap_v1`;
- no runtime release is registered before the implementation SHA is protected;
- repository validation, JSON Schema validation, Deno tests, pgTAP, database lint and end-to-end integration are green.

## Explicit non-goals

- automated invitation email or SMS delivery;
- offline invitation acceptance;
- social login changes or Auth UI redesign;
- Captain-created anonymous Participants;
- more than five Participants;
- changing the team after `ready`;
- multiple Captains or Captain transfer;
- Shore Operator invitation flow;
- Day 2–12 boundary reducers;
- Recovery Day execution;
- Realtime as an authoritative reducer;
- pilot or production data in Gate 9A;
- migration, reducer or runtime registration in Gate 9A.

## Consequences

The pilot setup path now has one authenticated identity model, one public write transport and one immutable runtime-composition target. Gate 9B can synchronize canonical commands, events, permissions and schemas without inventing Participant identity, while later subgates can implement rotation and Day 1 as separately reviewable transactions.