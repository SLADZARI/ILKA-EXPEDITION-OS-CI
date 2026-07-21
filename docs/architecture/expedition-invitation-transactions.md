# Expedition invitation transaction contracts

Status: Gate 9B2A contract-only

Decision authority: `docs/decisions/ADR-018-expedition-setup-and-day1-pilot-runtime.md`

Canonical command and event vocabulary remains owned by:

- `engine/command-catalog.yaml`;
- `engine/event-catalog.yaml`;
- `schemas/command.schema.json`;
- `engine/event.schema.json`.

This document owns only the trusted persistence boundary for the three invitation commands. It does not redefine their business meaning.

## Problem

The generic `private.process_command(jsonb)` transaction persists receipts, append-only events and complete projection documents, but it does not mutate `ilka.invitations`, create Expedition memberships or create Participants.

`accept_invitation` is also a pre-membership command. The caller has an authenticated active Profile but does not yet have an Expedition membership, while the generic public gateway path requires one.

Gate 9B2 therefore needs structural transaction wrappers that perform identity mutations and delegate receipt, event and projection persistence to the existing `private.process_command(jsonb)` function in one database transaction.

## Gate 9B2A boundary

Gate 9B2A publishes contracts only:

- `supabase/contracts/private-invite-participant-request.schema.json`;
- `supabase/contracts/private-accept-invitation-request.schema.json`;
- `supabase/contracts/private-revoke-invitation-request.schema.json`;
- fixed lock order;
- idempotency and race rules;
- authoritative Auth email requirements;
- complete `ExpeditionSetupView` preconditions;
- stable public error mapping;
- protected validation.

Gate 9B2A adds no SQL migration, private function, reducer, gateway branch, read API, runtime bundle, runtime release or cloud data.

## Future private functions

Gate 9B2B may implement exactly these service-role-only wrappers:

```text
private.invite_participant(jsonb)
private.accept_invitation(jsonb)
private.revoke_invitation(jsonb)
```

The wrappers are structural transactions, not a second domain reducer. They must not insert directly into `ilka.command_receipts`, `ilka.event_log` or `ilka.projection_documents`. Those writes remain delegated to `private.process_command(jsonb)`.

No browser role receives execute permission on these functions.

## Atomic transaction boundaries

### `private.invite_participant(jsonb)`

One accepted call must atomically:

1. verify exact replay before domain guards;
2. lock the command and Expedition in the fixed order;
3. verify active Captain context and `draft` status;
4. normalize and validate the email;
5. verify capacity and absence of an active member or pending invitation for that email;
6. insert one pending `ilka.invitations` row with only the SHA-256 token hash;
7. call `private.process_command(process_command_request)`;
8. commit one accepted receipt, one `invitation.created` event and one complete `ExpeditionSetupView` upsert.

Any failure rolls back the invitation insert, receipt, event and projection together.

### `private.accept_invitation(jsonb)`

One accepted call must atomically:

1. verify exact replay by `command_id`, request hash and authenticated user before re-reading the invitation;
2. resolve an authenticated active Profile and authoritative verified Auth email;
3. lock the command and Expedition in the fixed order;
4. resolve the invitation by SHA-256 token hash inside the requested Expedition;
5. lock the invitation row with `FOR UPDATE`;
6. verify `pending`, unexpired, `participant` role and matching normalized Auth email;
7. verify the Profile has no Expedition membership;
8. allocate the lowest free `participant_order` from 1 through 5;
9. insert one active participant membership;
10. insert one active Participant linked to that membership;
11. mark the invitation `accepted`;
12. call `private.process_command(process_command_request)` after the new actor context exists;
13. commit one accepted receipt, ordered `invitation.accepted → participant.added` events and one complete `ExpeditionSetupView` upsert.

The event actor is `member_<membership_uuid_without_hyphens>`. Generated membership and Participant identifiers are structural inputs and are ignored on an exact replay because the stored receipt is authoritative.

Any failure rolls back the invitation transition, membership, Participant, receipt, both events and projection together.

### `private.revoke_invitation(jsonb)`

One accepted call must atomically:

1. verify exact replay before terminal-state guards;
2. lock the command and Expedition in the fixed order;
3. verify active Captain context and `draft` status;
4. lock the target invitation row with `FOR UPDATE`;
5. verify that it is still `pending`;
6. mark it `revoked` with Captain Profile, timestamp and non-empty reason;
7. call `private.process_command(process_command_request)`;
8. commit one accepted receipt, one `invitation.revoked` event and one complete `ExpeditionSetupView` upsert.

Any failure rolls back the terminal transition, receipt, event and projection together.

## Fixed lock order

Every wrapper must use this order and must not acquire the same resources in another order:

```text
1. advisory transaction lock: ilka:command:<command_id>
2. advisory transaction lock: ilka:expedition:<expedition_uuid>
3. invite only: advisory transaction lock: ilka:invitation-email:<expedition_uuid>:<email_normalized>
4. accept/revoke: invitation row SELECT ... FOR UPDATE
5. projection head row FOR UPDATE through private.process_command
```

The Expedition lock serializes team-capacity and `participant_order` allocation. The invitation row lock serializes acceptance against revocation so exactly one terminal transition can commit.

The wrapper functions must not issue `COMMIT` or `ROLLBACK`; PostgreSQL function execution remains inside the caller transaction.

## Idempotency and retry order

`command_id` remains the idempotency key and request hashing remains based on the canonical public command envelope.

Before reading mutable invitation state, each wrapper must inspect the existing receipt:

- same `command_id`, Expedition, request hash and authenticated actor returns the original persisted result;
- a request-hash mismatch returns `idempotency_key_reused_with_different_payload` with no writes;
- an exact replay of `accept_invitation` succeeds even though the invitation is now terminal;
- an exact replay creates no new invitation, membership, Participant, event or projection version;
- generated UUIDs in a newly prepared private request never replace identifiers from the stored result.

A stream or projection version conflict is authoritative. The client must refetch `ExpeditionSetupView` before issuing a new command.

## Authoritative Auth identity contract

`accept_invitation` is the only Gate 9B setup command allowed without an existing Expedition membership.

The gateway adapter must obtain the following from the verified Supabase Auth session and active `ilka.profiles` row:

```text
auth_user_id
profile_id
email_normalized
email_verified = true
profile_status = active
```

Rules:

- email is read from the verified Auth user, never from a command claim;
- normalization is server-owned: trim, Unicode-safe lowercase and one canonical representation used by invitation storage;
- missing or unverified Auth email is rejected before domain writes;
- `auth_identity.email_normalized` must equal `invitation_match.email_normalized` inside the transaction;
- `participant_membership.profile_id` must equal `auth_identity.profile_id`;
- the raw Auth email may exist transiently in the trusted private request and in `ilka.invitations.email_normalized`, but never in events, projections, receipts, structured logs or public errors.

The raw invitation token is accepted only in the public command body. The gateway hashes it before constructing the private request. Private schemas carry only a 64-character lowercase SHA-256 hex digest.

## Private request schemas

### Invite

`PrivateInviteParticipantRequest` contains:

- one pending invitation identity row;
- one accepted `private.process_command` request;
- exactly one `invitation.created` event;
- exactly one complete `expedition_setup_view` upsert.

### Accept

`PrivateAcceptInvitationRequest` contains:

- authoritative Auth identity;
- the locked invitation match and SHA-256 token hash;
- the new active participant membership;
- the new active Participant and allocated order;
- one accepted `private.process_command` request;
- exactly two ordered events: `invitation.accepted`, then `participant.added`;
- exactly one complete `expedition_setup_view` upsert.

### Revoke

`PrivateRevokeInvitationRequest` contains:

- the pending invitation terminal transition;
- Captain Profile and reason;
- one accepted `private.process_command` request;
- exactly one `invitation.revoked` event;
- exactly one complete `expedition_setup_view` upsert.

Cross-field equality that JSON Schema cannot express is enforced by the future SQL wrapper and integration tests.

## `ExpeditionSetupView` preconditions

Every accepted invitation command must provide exactly one complete projection mutation:

```text
operation: upsert
projection_key: expedition_setup_view
projection_type: expedition_setup_view
subject_id: null
schema_id: https://ilka.local/schemas/expedition-setup-view.schema.json
schema_version: 1
```

The projection must:

- validate against `app/contracts/expedition-setup-view.schema.json`;
- be built from locked authoritative state plus the accepted mutation;
- expose only masked `email_hint` values;
- contain no raw email, token or token hash;
- preserve deterministic Participant ordering;
- set `expected_projection_version` to the projection version produced by the accepted command;
- use `sync_status: synced` in the persisted server document.

No UI-side reducer or SQL-only alternative projection shape is allowed.

## Stable public error mapping

The future gateway executor maps trusted transaction failures without returning SQL text or sensitive details:

| Code | HTTP | Retryable | Meaning |
| --- | ---: | --- | --- |
| `active_profile_required` | 403 | false | Authenticated active Profile is missing |
| `profile_actor_mismatch` | 403 | false | Command Profile does not belong to the session |
| `expedition_not_in_setup` | 409 | false | Expedition is not `draft` |
| `team_capacity_reached` | 409 | false | Active Participants plus pending invitations reached five |
| `participant_already_member` | 409 | false | Profile or normalized email already belongs to the Expedition |
| `pending_invitation_already_exists` | 409 | false | A pending invitation already exists for the normalized email |
| `invitation_not_found` | 404 | false | No matching invitation exists in the requested Expedition |
| `invitation_expired` | 410 | false | Matching invitation is expired |
| `invitation_not_pending` | 409 | false | Invitation already reached a terminal state |
| `invitation_email_mismatch` | 403 | false | Verified Auth email does not match the invitation |
| `invitation_token_invalid` | 400 | false | Token format is invalid before lookup |
| `participant_order_unavailable` | 409 | false | No free order from 1 through 5 exists |
| `idempotency_key_reused_with_different_payload` | 409 | false | Command ID was reused for a different canonical request |
| `version_conflict` | 409 | false | Stream or projection version changed |
| `persistence_unavailable` | 503 | true | Trusted transaction could not be completed |

Public errors must not reveal whether another email has an invitation beyond the stable result allowed by ADR-018, and must never contain the raw token, token hash or full invitation email.

## Permissions and transport

- public write transport remains `POST /functions/v1/command-gateway`;
- `invite_participant` and `revoke_invitation` require an active Captain membership;
- `accept_invitation` requires an authenticated active Profile with verified matching Auth email and no prior membership;
- Product Captain receives no invitation authority;
- setup commands remain online-only and server-confirmed;
- direct browser table writes and direct browser execution of `private.*` functions remain forbidden.

## Offline and synchronization behavior

The Participant offline command queue never stores these commands. A client may retain unsent form fields locally, but membership, invitation state and readiness are shown only after a server response and authoritative `ExpeditionSetupView` refetch.

Delivery states remain `pending`, `synced`, `conflict` and `rejected`. They are not domain states and do not alter append-only history.

## Gate 9B2B acceptance handoff

Persistence implementation is acceptable only when pgTAP and integration tests prove:

- every accepted wrapper is atomic;
- exact replay creates no duplicates;
- request-hash reuse creates no writes;
- acceptance and revocation races produce one terminal winner;
- participant order is the lowest free value under concurrency;
- invitation mutation rolls back when `private.process_command` fails;
- `private.process_command` remains the only receipt/event/projection writer;
- browser roles cannot execute the wrappers;
- no secret appears in events, projections, receipts or public errors.

## Explicit non-goals

Gate 9B2A does not implement:

- SQL functions or migrations;
- invitation reducers;
- command-gateway execution branches;
- `api.get_expedition_setup_view`;
- automated invitation delivery;
- invitation expiration processing;
- rotation or Expedition start;
- runtime bundle composition or registration;
- deployment or pilot data.
