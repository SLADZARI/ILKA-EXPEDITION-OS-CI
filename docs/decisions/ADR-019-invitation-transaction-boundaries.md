# ADR-019 — Invitation transaction boundaries

- Status: Accepted
- Date: 2026-07-21
- Owners: Product Architecture / Engine / Backend / Security
- Extends: `ADR-013`, `ADR-014`, `ADR-018`
- Gate: 9B2A contract, 9B2B persistence, 9B2C execution

## Context

`ADR-018` requires authenticated invitation onboarding through the canonical `command-gateway`. The existing `private.process_command(jsonb)` function is authoritative for immutable command receipts, append-only events and complete projection-document writes, but it does not mutate invitation identity, create memberships or create Participants.

`accept_invitation` is a pre-membership command. A generic human command requires an existing Expedition membership, while successful invitation acceptance must create that membership and its Participant before authoritative actor resolution can succeed.

Implementing invitation mutation, actor creation and immutable command persistence in unrelated calls would permit partial state and would violate the atomicity required by `ADR-018`.

## Decision

### Gate split

Gate 9B2 is split into three protected increments:

```text
9B2A — transaction contracts only
9B2B — PostgreSQL wrappers and Captain read API
9B2C — gateway executors and reducers
```

Gate 9B2A publishes three private request schemas, transaction and lock semantics, Auth email requirements, projection preconditions, error mapping and protected validation. It adds no SQL migration, reducer, gateway execution branch or read API.

### Structural wrappers

Gate 9B2B may implement exactly these service-role-only functions:

```text
private.invite_participant(jsonb)
private.accept_invitation(jsonb)
private.revoke_invitation(jsonb)
```

They are structural transaction wrappers, not a second reducer. They may mutate `ilka.invitations`, `ilka.expedition_members` and `ilka.participants`, then must delegate receipts, events and projection documents to `private.process_command(jsonb)`.

The wrappers must not insert directly into `ilka.command_receipts`, `ilka.event_log` or `ilka.projection_documents`.

### Fixed lock order

Every wrapper uses the same order:

```text
1. command advisory transaction lock
2. Expedition advisory transaction lock
3. invite only: normalized invitation-email advisory transaction lock
4. accept/revoke: invitation row FOR UPDATE
5. projection head row through private.process_command
```

The Expedition lock serializes capacity checks and lowest-free `participant_order` allocation. The invitation row lock serializes acceptance against revocation so only one terminal transition commits.

### Replay before mutable guards

Each wrapper checks an existing receipt before reading terminal invitation state:

- exact `command_id`, Expedition, request hash and authenticated actor returns the stored result;
- request-hash mismatch creates no domain writes;
- exact acceptance replay succeeds after the invitation has become terminal;
- generated structural UUIDs from a retry do not replace stored identities.

### Auth identity

`accept_invitation` requires a verified Supabase Auth session and active Profile, but no existing Expedition membership.

The trusted adapter supplies `auth_user_id`, `profile_id`, normalized verified Auth email and active Profile status. The command payload cannot claim an authoritative email. The raw token is hashed before the private request is constructed, and private schemas carry only lowercase SHA-256 hex.

### Atomic acceptance

One accepted `accept_invitation` transaction must either commit all of the following or none:

- invitation `pending → accepted`;
- one active participant membership;
- one active Participant with the lowest free order from 1 through 5;
- one accepted receipt;
- ordered `invitation.accepted → participant.added` events;
- one complete `ExpeditionSetupView` upsert.

The new membership exists before `private.process_command` resolves the actor. The canonical event actor is `member_<membership_uuid_without_hyphens>`.

### Projection requirement

Every accepted invitation command writes exactly one complete projection mutation with:

```text
projection_key: expedition_setup_view
projection_type: expedition_setup_view
subject_id: null
schema_id: https://ilka.local/schemas/expedition-setup-view.schema.json
schema_version: 1
```

The document validates against the canonical app schema, contains masked invitation identity only and sets `expected_projection_version` to the version produced by the accepted command.

### Failure mapping

The future public gateway maps trusted failures to the stable vocabulary already reserved by `ADR-018`, including active Profile, setup-state, capacity, duplicate invitation, terminal invitation, email mismatch, invalid token, unavailable participant order, idempotency mismatch and version conflict.

SQL text, raw tokens, token hashes and full invitation email are never returned in public errors or structured logs.

## Consequences

- Invitation identity mutations and immutable command persistence have one atomic boundary.
- `private.process_command(jsonb)` remains the only receipt/event/projection writer.
- Exact replay is independent of current invitation terminal state.
- Acceptance and revocation races have one terminal winner.
- Browser roles retain no direct table writes or private-function execution.
- Gate 9B2B can be reviewed as persistence-only, and Gate 9B2C as execution-only.

## Rejected alternatives

### Direct browser CRUD

Rejected because it bypasses permissions, append-only events, receipts and atomic projection updates.

### Generic `private.process_command` only

Rejected because pre-membership acceptance requires membership and Participant creation inside the same transaction.

### Separate membership and event calls

Rejected because either call could commit without the other.

### SQL as a second reducer

Rejected because domain decisions and projection shape must remain runtime- and schema-owned.

## Acceptance criteria

Gate 9B2A is accepted when:

- all three private request schemas are valid Draft 2020-12 schemas;
- the schemas constrain canonical commands, event order and one complete setup projection;
- private schemas contain token hashes but no raw token field;
- fixed lock and replay order are explicit;
- authoritative verified Auth email is required for acceptance;
- public error mapping and privacy rules are explicit;
- protected CI runs the Gate 9B2A validator;
- no SQL migration, reducer, gateway branch, read API, runtime release or cloud data is added.
