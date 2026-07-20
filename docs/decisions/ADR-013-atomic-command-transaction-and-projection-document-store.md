# ADR-013 — Atomic command transaction and projection document store

- Status: Accepted
- Date: 2026-07-20
- Owners: Product Architecture / Backend / Engine / Security
- Supersedes: none
- Extends: `ADR-012`
- Target project: Supabase `VOYAGE` (`rehfxjlyfojkpascjtmb`)

## Context

`ADR-012` fixes `private.process_command(...)` as the only atomic persistence boundary for accepted Engine results. Gate 3 already provides Expedition stream heads, immutable command receipts, append-only canonical events, request-hash idempotency and correction-event integrity.

The next gate must persist receipt, events and projection changes in one PostgreSQL transaction. Concrete Participant and Captain read models are intentionally deferred to the later Read Models gate, so the transaction cannot yet depend on command-specific or screen-specific SQL tables.

A hidden no-op projection argument would violate the atomicity contract. Creating complete `TodayView`, `CaptainDayView`, task, card and assignment projections in this gate would collapse Gate 4 and Gate 6 and duplicate App semantics prematurely.

## Decision

### Single private function

The only trusted write entry point for prepared Engine results is:

```text
private.process_command(p_request jsonb) -> jsonb
```

The request and result shapes are version-controlled under:

```text
supabase/contracts/private-process-command-request.schema.json
supabase/contracts/private-process-command-result.schema.json
```

The function is `SECURITY DEFINER`, has an empty `search_path`, is executable only by `service_role`, and is not exposed through browser schemas.

### Reducer ownership

The gateway and pinned TypeScript Engine runtime remain responsible for:

- canonical Command Schema validation;
- membership and Engine permissions;
- guards and business transitions;
- canonical event generation;
- schema-valid projection generation;
- normalized SHA-256 request hashing.

PostgreSQL validates identity, release, ordering, idempotency, atomicity and persistence metadata. It does not implement a second reducer.

### Lock order

Every new command acquires transaction-scoped advisory locks in this fixed order:

```text
command_id lock
→ Expedition lock
```

The command lock serializes the globally unique canonical idempotency key, including accidental reuse across Expeditions. The Expedition lock serializes one Expedition event stream and all of its projection changes.

Both locks are released automatically when the PostgreSQL transaction ends.

### Idempotency order

After minimal request parsing and lock acquisition, `process_command` checks the immutable receipt before current actor or projection validation.

Rules:

- same `command_id`, same Expedition and same `request_hash` returns the original receipt with `replayed: true`;
- the replay creates no event, projection or version change;
- same `command_id` with another hash or Expedition returns `rejected` with `idempotency_key_reused_with_different_payload` and writes nothing;
- a valid replay remains retrievable even when membership or current Expedition state changed after the original commit.

### Conflict behavior

For a new command, the function checks the locked stream head against `expected_stream_position`.

A stale position returns:

```text
status: conflict
conflict_code: stream_position_conflict
```

No command receipt, event, projection or version update is written.

Conflict is an authoritative transaction result but is not persisted as a receipt because the supplied reducer result was calculated from stale state.

### Accepted and rejected receipts

`accepted` and deterministic `rejected` requests are persisted as immutable `command_receipts`.

For `accepted`:

- at least one canonical event is required;
- ordered event IDs are derived from the supplied event array;
- consecutive stream positions start at `expected_stream_position + 1`;
- projection mutations may be empty or contain one or more valid upserts.

For `rejected`:

- no events or projection mutations are allowed;
- a non-empty rejection code is required;
- stream and projection versions remain at the locked current values.

### Projection persistence substrate

Gate 4 adds two neutral persistence objects:

```text
ilka.projection_heads
ilka.projection_documents
```

`projection_heads` stores one Expedition-wide monotonic `current_projection_version`.

`projection_documents` stores versioned JSON read documents identified by:

```text
(expedition_id, projection_key)
```

Each document records:

- `projection_type`;
- optional `subject_id`;
- stable `schema_id`;
- `schema_version`;
- `projection_json`;
- Expedition-wide `projection_version`;
- `source_stream_position`;
- pinned `runtime_release_id`;
- `reducer_version`;
- generation and update timestamps.

This store is persistence infrastructure, not a methodology source of truth. Canonical read-model structure remains owned by `app/contracts/*.schema.json`.

### Projection mutation protocol

The MVP transaction accepts only:

```text
operation: upsert
```

Every mutation contains a stable projection key, projection type, optional subject, schema identity/version and complete replacement JSON document.

Rules:

- duplicate keys inside one command are rejected;
- an existing key cannot silently change projection type, subject identity or schema ID;
- a supplied `projection_json.expedition_id`, when present, must equal the canonical Expedition key;
- all writes from one accepted command share one new Expedition projection version;
- every written document records the final event stream position;
- when an accepted command has no projection mutation, projection version does not advance;
- rejected, conflict and replay outcomes do not mutate projections.

Deletion is intentionally excluded. A removed, banned, inactive or superseded entity is represented in a new authoritative projection document or later rebuild, not by deleting runtime history.

### Atomic order

For a new request, one function execution performs:

```text
validate persistence request
→ lock command_id
→ lock Expedition
→ return replay or idempotency mismatch
→ validate pinned runtime release and actor context
→ check expected stream position
→ lock projection head
→ validate complete events and projection mutations
→ insert immutable receipt
→ append ordered events
→ upsert projection documents
→ advance projection head when required
→ return authoritative result
```

Any exception rolls back the complete function call. A receipt, event, stream head, projection document or projection head cannot remain partially committed.

### Actor context integrity

For authenticated human actors, supplied UUID identifiers must match `private.resolve_actor_context(...)` for the Expedition.

For system actors:

- `auth_user_id`, `profile_id`, `membership_id` and `participant_id` are null;
- `actor_role` is `system` or `system_clock`.

When a domain `participant_id` exists, canonical `actor_id` must equal that Participant's stable `participant_key`.

This is an identity-integrity boundary. Command permissions and Product Captain assignment rules remain Engine-owned.

### Runtime release integrity

The request runtime release must equal the Expedition-pinned release. The supplied reducer version must equal the immutable runtime-release registry value. Events and projection documents receive the same release and reducer metadata.

## Consequences

- one database call can safely persist a prepared Engine result;
- offline retries return the original authoritative receipt;
- stream and projection versions cannot diverge through partial writes;
- Gate 6 can build typed read APIs without changing the command transaction contract;
- projection data is replaceable and rebuildable while event history remains authoritative;
- SQL remains independent of specific task, card, role, vote, XP or Stage reducers.

## Rejected alternatives

- separate RPC calls for receipt, events and projections;
- direct `service_role` table writes;
- no-op projection handling until Gate 6;
- command-specific SQL reducers;
- screen-specific tables embedded directly in `process_command`;
- mutable or deletable event history;
- persisting stale conflicts as successful receipts;
- projection deletion as a substitute for domain state.

## Gate boundary

Included:

- projection head and document substrate;
- private request/result contracts;
- advisory locking;
- idempotency replay and mismatch behavior;
- expected stream conflict result;
- accepted/rejected receipt persistence;
- atomic event and projection persistence;
- RLS/grants, pgTAP, generated types and static validation.

Excluded:

- `command-gateway` Edge Function;
- executable TypeScript reducer package;
- permissions implementation;
- concrete `TodayView` and `CaptainDayView` documents;
- public `api` read functions;
- seeded Day 1 Expedition data;
- frontend transport;
- Realtime;
- production or pilot data.
