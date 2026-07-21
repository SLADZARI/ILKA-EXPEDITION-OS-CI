# ADR-019 — Invitation transaction boundaries

- Status: Accepted
- Date: 2026-07-21
- Owners: Product Architecture / Engine / Backend / Security
- Extends: `ADR-013`, `ADR-014`, `ADR-018`
- Gate: 9B2A contract, 9B2B persistence, 9B2C execution

## Context

`ADR-018` requires authenticated invitation onboarding through the canonical `command-gateway`. The existing `private.process_command(jsonb)` function is authoritative for immutable command receipts, append-only events and complete projection-document writes, but it does not mutate invitation identity, create memberships or create Participants.

`accept_invitation` is a pre-membership command. The caller has an authenticated active Profile but no Expedition membership. Successful acceptance must create a new membership, persist membership-attributed history and then create the Participant identity without allowing partial state.

## Decision

### Gate split

```text
9B2A — transaction contracts only
9B2B — PostgreSQL wrappers and Captain read API
9B2C — gateway executors and reducers
```

Gate 9B2A published three private request schemas and added no SQL migration, reducer, gateway execution branch or read API.

Gate 9B2A published private request schemas, lock semantics, identity rules and stable errors. Gate 9B2B does not add reducers; it implemented structural persistence wrappers and the Captain setup read API. Gate 9B2C implements pure reducers, trusted adapters and the public invitation gateway branches without changing SQL persistence or registering a production runtime release.

### Structural wrappers

Gate 9B2B implements exactly these service-role-only functions:

```text
private.invite_participant(jsonb)
private.accept_invitation(jsonb)
private.revoke_invitation(jsonb)
```

They are structural transaction wrappers, not a second reducer. They may mutate `ilka.invitations`, `ilka.expedition_members` and `ilka.participants`, but must delegate receipts, events and projection documents to `private.process_command(jsonb)`.

They must not insert directly into `ilka.command_receipts`, `ilka.event_log` or `ilka.projection_documents`.

### Secret-free nested process request

The private wrapper request carries structural identity and SHA-256 token material. The nested `process_command_request` is intentionally secret-free:

- its command payload is exactly `{}`;
- it contains no raw invitation token;
- it contains no normalized full email;
- it contains no token hash;
- `request_hash` still binds the original canonical public command envelope;
- canonical events and `ExpeditionSetupView` carry only safe derived identity and masked `email_hint`.

The dedicated schema is:

```text
supabase/contracts/private-invitation-process-command-request.schema.json
```

This avoids persisting the public command secret inside event/receipt transaction material while preserving public-command idempotency.

### Fixed lock order

Every wrapper uses the same order:

```text
1. command advisory transaction lock
2. Expedition advisory transaction lock
3. invite only: normalized invitation-email advisory transaction lock
4. accept/revoke: invitation row FOR UPDATE
5. projection head row through private.process_command
```

The Expedition lock serializes team capacity and lowest-free `participant_order` allocation. The invitation row lock serializes acceptance against revocation so one terminal transition wins.

### Replay before mutable guards

The public gateway and every wrapper check the existing receipt before mutable invitation state:

- exact `command_id`, Expedition, request hash and authenticated actor returns the stored result;
- request-hash mismatch creates no domain writes;
- exact acceptance replay succeeds after the invitation becomes terminal;
- generated structural UUIDs from a retry never replace stored identities.

### Authoritative Auth identity

`accept_invitation` requires:

```text
auth_user_id
active profile_id
verified normalized Auth email
no existing Expedition membership
```

The Supabase Auth verifier retains `email` and derives `email_verified` from `email_confirmed_at`. The command payload cannot claim authoritative email. The raw token is hashed before constructing the private request, and private structural fields carry only lowercase SHA-256 hex.

### Atomic acceptance ordering

One accepted `accept_invitation` transaction uses this order:

```text
lock invitation
→ allocate lowest free participant_order
→ insert active participant membership
→ private.process_command(process_command_request)
→ insert active Participant
→ mark invitation accepted
→ commit
```

The new membership must exist before `private.process_command` resolves the actor. The Participant must **not** exist yet during that call, because the canonical event actor is:

```text
member_<membership_uuid_without_hyphens>
```

Therefore the nested actor context uses:

```text
actor_role: participant
membership_id: <new membership UUID>
participant_id: null
```

After `private.process_command` accepts, the wrapper creates the Participant and marks the invitation accepted. If either later write fails, PostgreSQL rolls back the membership, receipt, both events, projection and all invitation changes together. This preserves both membership-attributed history and full transaction atomicity.

### Projection requirement

Every accepted invitation command writes exactly one complete mutation:

```text
projection_key: expedition_setup_view
projection_type: expedition_setup_view
subject_id: null
schema_id: https://ilka.local/schemas/expedition-setup-view.schema.json
schema_version: 1
sync_status: synced
```

`expected_projection_version` equals the projection version produced by the accepted command. The first invite may initialize the projection at version zero; acceptance and revocation require an existing compatible projection. Projection content and readiness are owned by the pinned Engine runtime, not SQL or UI.

### Captain read transport

Gate 9B2B adds:

```text
api.get_expedition_setup_view(p_expedition_key text) returns jsonb
```

It requires `auth.uid()` and an active Captain membership. It returns only the exact `expedition_setup_view` projection document and returns `null` when the Expedition or projection is unavailable. Participant, Product Captain, Shore Operator and anonymous callers receive no setup projection authority.

### Gate 9B2C execution boundary

Gate 9B2C introduces one specialized `InvitationExecutor` and one pure invitation runtime implementation.

The gateway order is:

```text
canonical validation
→ Auth verification
→ request hash
→ receipt replay check
→ Expedition bootstrap branch
→ invitation branch
→ generic membership command branch
```

All three invitation commands use the specialized branch. `accept_invitation` is the only pre-membership gateway path in this gate. It bypasses only the generic active-membership requirement; it does not bypass authentication, active Profile verification, confirmed-email matching, exact runtime loading or canonical validation.

The executor performs trusted preparation only:

- trim/lowercase email normalization;
- 43-character base64url token validation;
- SHA-256 token hashing;
- server-derived `expires_at = received_at + 168 hours`;
- internal invitation, membership and Participant UUID generation;
- lowest-free Participant order lookup;
- exact pinned runtime selection;
- canonical event and projection validation;
- command-specific private request validation;
- stable public error translation.

It calls exactly one structural wrapper and never calls generic `processCommand` directly.

### Pure invitation runtime

The runtime implements only:

```text
invite_participant
accept_invitation
revoke_invitation
```

It receives a trusted secret-free structural operation and emits:

```text
invite_participant:
  invitation.created

accept_invitation:
  invitation.accepted
  participant.added

revoke_invitation:
  invitation.revoked
```

It also produces one complete `ExpeditionSetupView`, recalculating team capacity, deterministic Participant order, blockers, Captain controls and readiness. It performs no database or network access.

The runtime policy is fixed for the pilot contract:

```text
team_size_min: 3
team_size_max: 5
invitation_ttl_hours: 168
```

### Production release boundary

Gate 9B2C intentionally does not modify `commandGatewayRuntimeRegistry`, insert an immutable `runtime_releases` row or deploy the Edge Function. The pure runtime is implementation material for the future composite `day1_pilot_v1` bundle.

The production runtime registry remains unchanged until Gate 9E pins the protected composite implementation SHA. This prevents independently composed reducers from being selected dynamically at request time.

### Conflict and failure behavior

A stale stream position returned by `private.process_command` becomes `version_conflict` in the structural wrapper so any prior identity mutation rolls back. Any failure after `private.process_command` also rolls back its receipt, events and projection because the call remains inside the same PostgreSQL transaction.

Pre-persistence Auth, email, token, actor, runtime, state and projection failures write nothing. Unknown SQL errors collapse to `invitation_persistence_unavailable`. SQL text, raw tokens, token hashes and full invitation emails are never returned in public errors or structured logs.

## Consequences

- Invitation identity mutations and immutable history share one atomic boundary.
- `private.process_command(jsonb)` remains the only receipt/event/projection writer.
- Acceptance history uses the newly created membership actor without pretending the Participant existed earlier.
- Exact replay is independent of current invitation terminal state.
- Acceptance and revocation have one terminal winner.
- Browser roles cannot execute private wrappers or query internal tables.
- Event and projection content remain Engine-owned.
- `accept_invitation` has one explicit authenticated pre-membership route.
- Gate 9B2C adds no migration, runtime registration, deployment or pilot data.

## Rejected alternatives

### Direct browser CRUD

Rejected because it bypasses permissions, receipts, append-only events and atomic projections.

### Generic `private.process_command` only

Rejected because invitation, membership and Participant state must mutate in the same transaction.

### Insert Participant before `private.process_command`

Rejected because `private.resolve_actor_context` would resolve a Participant and require a Participant-key actor, contradicting the accepted membership actor for invitation acceptance.

### Persist the canonical secret-bearing command inside the private request

Rejected because raw invitation tokens must never reach persisted receipt/event/projection transaction material.

### SQL as a second reducer

Rejected because event content and projection shape remain runtime- and schema-owned.

### Route acceptance through the generic active-membership gateway path

Rejected because successful acceptance creates the membership it would require.

### Register the invitation runtime independently

Rejected because `ADR-018` requires one exact composite runtime release for the full Day 1 pilot command set.

## Acceptance criteria

Gate 9B2B persistence is accepted when:

- the three wrappers are `SECURITY DEFINER`, use empty `search_path` and are executable only by `service_role`;
- exact replay creates no duplicate invitation, membership, Participant, event or projection version;
- request-hash reuse creates no writes;
- acceptance and revocation produce one terminal winner;
- the lowest free `participant_order` is enforced under the Expedition lock;
- identity mutations roll back when `private.process_command` rejects or conflicts;
- wrappers never insert directly into receipt, event or projection tables;
- `api.get_expedition_setup_view(text)` is Captain-only;
- no raw token, token hash or full email appears in event or projection persistence.

Gate 9B2C execution is accepted when:

- receipt replay remains before invitation current-state and membership checks;
- the Auth verifier provides confirmed email context without trusting the command payload;
- raw tokens are hashed before private request construction;
- the nested command payload is exactly `{}`;
- the pure runtime produces schema-valid ordered events and one complete setup projection;
- acceptance uses a membership actor with `participant_id = null`;
- wrong-email, unverified-email, expired, terminal and actor-spoofing failures write nothing;
- the executor invokes only the three Gate 9B2B wrappers;
- direct PostgreSQL integration covers invite, accept and revoke;
- protected formatting, lint, typecheck, unit, pgTAP, integration and static validation are green;
- the production runtime registry remains unchanged;
- no migration, deployment, invitation delivery, expiration worker, rotation or pilot data is added.
