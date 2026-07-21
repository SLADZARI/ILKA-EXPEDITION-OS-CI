# Expedition invitation transaction contracts

Status: Gate 9B2B persistence implementation

Decision authority: `docs/decisions/ADR-018-expedition-setup-and-day1-pilot-runtime.md`  
Transaction boundary decision: `docs/decisions/ADR-019-invitation-transaction-boundaries.md`

Canonical command and event vocabulary remains owned by:

- `engine/command-catalog.yaml`;
- `engine/event-catalog.yaml`;
- `schemas/command.schema.json`;
- `engine/event.schema.json`.

This document owns only the trusted persistence boundary. It does not redefine invitation business rules or projection content.

## Problem

`private.process_command(jsonb)` persists immutable receipts, append-only events and complete projection documents, but it does not mutate `ilka.invitations`, create Expedition memberships or create Participants.

`accept_invitation` is a pre-membership command. A structural wrapper must create the new membership before authoritative actor resolution and still commit the Participant and terminal invitation state in the same transaction.

## Gate boundaries

Gate 9B2A published contracts only:

- three private request schemas;
- fixed lock order;
- replay and race semantics;
- authoritative verified Auth email requirements;
- `ExpeditionSetupView` preconditions;
- stable error vocabulary.

Gate 9B2A adds no SQL migration, reducer, gateway execution branch or read API.

Gate 9B2B implements:

```text
private.invite_participant(jsonb)
private.accept_invitation(jsonb)
private.revoke_invitation(jsonb)
api.get_expedition_setup_view(text)
```

Gate 9B2C later adds reducers, executor adapters and the public command-gateway branches.

## Secret-free nested persistence request

The public command body may contain raw email or invitation token. Those values are validated and transformed by the trusted executor before persistence.

The outer private wrapper request contains structural identity and, where required, a 64-character lowercase SHA-256 token hash. Its nested request uses:

```text
supabase/contracts/private-invitation-process-command-request.schema.json
```

The nested command has an empty payload:

```json
{"payload": {}}
```

The original public command remains bound by `request_hash`. The nested request contains no raw email, no raw token and no token hash. Events and projections contain only canonical IDs and masked `email_hint`.

## Fixed lock order

Every wrapper must use this order:

```text
1. advisory transaction lock: ilka:command:<command_id>
2. advisory transaction lock: ilka:expedition:<expedition_uuid>
3. invite only: advisory transaction lock: ilka:invitation-email:<expedition_uuid>:<email_normalized>
4. accept/revoke: invitation row SELECT ... FOR UPDATE
5. projection head row FOR UPDATE through private.process_command
```

The Expedition lock serializes capacity and lowest-free `participant_order`. The invitation row lock serializes acceptance against revocation so exactly one terminal transition wins.

The wrapper functions issue no `COMMIT` or `ROLLBACK`. Any raised error rolls back all work performed by the caller transaction.

## Idempotency order

Before reading mutable invitation state, each wrapper inspects `ilka.command_receipts` after taking command and Expedition locks:

- same command ID, Expedition, request hash and authenticated actor returns `private.build_persisted_command_result(...)`;
- actor mismatch returns `receipt_actor_mismatch`;
- another request hash returns `idempotency_key_reused_with_different_payload`;
- exact acceptance replay succeeds after invitation acceptance;
- regenerated structural UUIDs are ignored on exact replay;
- no replay creates another event or projection version.

## `private.invite_participant(jsonb)`

Accepted sequence:

```text
validate secret-free process request
→ command lock
→ Expedition lock
→ invitation-email lock
→ exact replay lookup
→ active Captain and draft Expedition checks
→ team capacity and duplicate checks
→ insert pending invitation with SHA-256 token hash
→ private.process_command(process_command_request)
→ commit
```

The prepared command produces exactly:

```text
invitation.created
expedition_setup_view upsert
```

A stale stream result is converted to `version_conflict`, which rolls back the pending invitation row.

## `private.accept_invitation(jsonb)`

The wrapper resolves:

```text
auth_user_id
active profile_id
verified normalized Auth email
pending invitation by UUID + Expedition + SHA-256 hash
lowest free participant_order from 1 through 5
```

Accepted sequence:

```text
command lock
→ Expedition lock
→ exact replay lookup before invitation state
→ verified Auth/Profile checks
→ invitation row SELECT ... FOR UPDATE
→ pending, unexpired, role and email checks
→ allocate lowest free order
→ insert active participant membership
→ private.process_command(process_command_request)
→ insert active Participant
→ update invitation pending → accepted
→ commit
```

The process request actor is membership-attributed:

```text
actor_id: member_<membership_uuid_without_hyphens>
actor_role: participant
participant_id: null
```

`private.process_command` can therefore resolve the new membership while no Participant exists yet. It appends exactly:

```text
invitation.accepted
participant.added
```

Only after accepted persistence does the wrapper create the Participant. If Participant insertion or invitation transition fails, the membership, receipt, events and projection roll back with it.

## `private.revoke_invitation(jsonb)`

Accepted sequence:

```text
command lock
→ Expedition lock
→ exact replay lookup
→ active Captain and draft Expedition checks
→ invitation row SELECT ... FOR UPDATE
→ pending and unexpired checks
→ update invitation pending → revoked
→ private.process_command(process_command_request)
→ commit
```

The prepared command produces exactly one `invitation.revoked` event and one complete setup projection.

## `ExpeditionSetupView` preconditions

Each accepted wrapper requires exactly one mutation:

```text
operation: upsert
projection_key: expedition_setup_view
projection_type: expedition_setup_view
subject_id: null
schema_id: https://ilka.local/schemas/expedition-setup-view.schema.json
schema_version: 1
```

The projection must:

- use the canonical app schema;
- match the Expedition key;
- set `expected_projection_version` to current version plus one;
- use `sync_status: synced`;
- preserve deterministic Participant order;
- expose only masked invitation identity;
- contain no raw email, raw token or token hash.

SQL validates identity, version and privacy invariants. It does not construct a competing projection shape.

## Captain read API

`api.get_expedition_setup_view(p_expedition_key text)`:

- requires `auth.uid()`;
- resolves active Expedition membership;
- requires membership role `captain`;
- returns only `projection_key = expedition_setup_view` with the exact type/schema identity;
- returns `null` before projection bootstrap or for an unknown Expedition;
- grants execute to `authenticated` and `service_role` only;
- does not grant raw `ilka.projection_documents` access.

## Stable transaction errors

Gate 9B2B raises stable internal codes for Gate 9B2C mapping:

```text
active_profile_required
profile_actor_mismatch
active_captain_membership_required
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
version_conflict
```

SQL error detail never includes a raw token, token hash or full invitation email.

## Permissions

- `service_role` can execute the three private wrappers;
- `anon` and `authenticated` cannot execute private wrappers;
- `authenticated` Captain can execute the setup read function;
- Product Captain has no membership-management authority;
- browser roles retain no direct write access to identity/history/projection tables.

## Offline behavior

Invitation commands remain online-only and server-confirmed. They are never written to the Participant IndexedDB command queue. The UI may retain unsent form fields locally but must refetch `ExpeditionSetupView` after accepted persistence.

## Gate 9B2B acceptance

Persistence implementation is complete only when pgTAP and protected CI prove:

- every wrapper is atomic;
- exact replay creates no duplicates;
- request-hash reuse creates no writes;
- acceptance and revocation race has one terminal winner;
- lowest-free participant order is enforced under the Expedition lock;
- invitation mutation rolls back when `private.process_command` fails or conflicts;
- `private.process_command` remains the only receipt/event/projection writer;
- browser roles cannot execute the wrappers;
- Captain-only setup reads are isolated;
- no secret appears in event or projection persistence;
- generated database types match clean migration replay.

## Explicit non-goals

Gate 9B2B does not implement:

- invitation reducers or gateway executors;
- public write routes other than the existing future `command-gateway` path;
- automated invitation email/SMS delivery;
- invitation expiration processing;
- rotation or Expedition start;
- runtime bundle registration;
- deployment, pilot or production data.
