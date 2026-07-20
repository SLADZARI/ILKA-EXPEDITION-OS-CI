# Supabase Atomic Command Transaction Contract

Status: implementation contract under accepted `ADR-012` and `ADR-013`  
Environment: local Supabase and development-only `VOYAGE`  
Primary sources:

- `docs/decisions/ADR-012-supabase-persistence-command-gateway-and-projection-model.md`;
- `docs/decisions/ADR-013-atomic-command-transaction-and-projection-document-store.md`;
- `schemas/command.schema.json`;
- `engine/event.schema.json`;
- `supabase/contracts/private-process-command-request.schema.json`;
- `supabase/contracts/private-process-command-result.schema.json`.

## Problem

Gate 3 protects immutable history, but a trusted server still cannot safely perform a real command. Separate calls for receipt, events and projections could commit partially or race another command for the same Expedition.

Gate 4 adds one PostgreSQL transaction kernel that persists an already validated and reduced Engine result.

## User and server scenario

```text
command-gateway
→ validates JWT and canonical command
→ resolves authoritative actor context
→ loads projection at stream N
→ applies Engine permissions, guards and reducer
→ computes request_hash
→ prepares canonical events and complete projection documents
→ calls private.process_command(...)
```

The database then returns one of:

```text
accepted
rejected
conflict
```

An exact retry returns the original persisted result with `replayed: true`.

## Included files and entities

```text
docs/decisions/ADR-013-atomic-command-transaction-and-projection-document-store.md
supabase/contracts/private-process-command-request.schema.json
supabase/contracts/private-process-command-result.schema.json
supabase/migrations/20260720190000_atomic_command_transaction.sql
supabase/tests/atomic_command_transaction.test.sql
scripts/validate_supabase_atomic_command_transaction.py
ilka.projection_heads
ilka.projection_documents
private.process_command(jsonb)
```

Existing entities reused without duplication:

```text
ilka.expeditions
ilka.runtime_releases
ilka.stream_heads
ilka.command_receipts
ilka.event_log
private.resolve_actor_context(...)
private.assert_expected_stream_position(...)
```

## Request contract

`private.process_command(p_request jsonb)` accepts one internal request object containing:

- internal Expedition UUID;
- validated canonical command envelope;
- authoritative actor context;
- lowercase 64-character SHA-256 request hash;
- expected event stream position;
- prepared result status `accepted` or `rejected`;
- ordered canonical events;
- ordered projection upserts;
- pinned runtime release and reducer version;
- received and processed timestamps;
- rejection metadata when status is `rejected`.

The gateway must validate the JSON Schema before RPC. PostgreSQL repeats persistence-critical checks and rejects malformed internal requests.

## Transaction and lock order

One RPC invocation runs as one PostgreSQL transaction. The function does not issue nested application commits.

Fixed advisory lock order:

```text
hash(command_id)
→ hash(expedition_id)
```

The command lock protects the globally unique idempotency key. The Expedition lock protects stream and projection ordering.

## Processing states

### Exact replay

Condition:

```text
existing command_id
+ same Expedition
+ same request_hash
```

Result:

- original receipt;
- `replayed: true`;
- no actor revalidation;
- no new receipt, event or projection;
- no version changes.

This preserves the original accepted or rejected result after later membership or Expedition changes.

### Idempotency mismatch

Condition:

```text
existing command_id
+ different hash or Expedition
```

Result:

```text
outcome: rejected
rejection_code: idempotency_key_reused_with_different_payload
persisted: false
```

No state is written.

### Conflict

Condition:

```text
current_stream_position != expected_stream_position
```

Result:

```text
outcome: conflict
conflict_code: stream_position_conflict
persisted: false
```

No receipt, event, projection or version update is written.

### Accepted

Requirements:

- active authoritative actor context or valid system actor;
- pinned runtime release and reducer version match;
- at least one canonical event;
- unique ordered event IDs;
- valid projection upserts;
- current stream position equals expected position.

Atomic effects:

1. insert immutable accepted receipt;
2. append events at consecutive positions;
3. upsert complete projection documents;
4. advance the projection head once when at least one projection is written;
5. return the persisted receipt and projection update metadata.

### Rejected

A deterministic rejection prepared by trusted Engine code may be persisted when the expected stream is still current.

Requirements:

- rejection code is present;
- no events;
- no projection mutations.

Effects:

- immutable rejected receipt is inserted;
- current stream and projection versions are recorded;
- neither head advances.

## Projection head

`ilka.projection_heads` contains one row per Expedition:

```text
expedition_id
current_projection_version
created_at
updated_at
```

A new Expedition starts at projection version `0`.

One accepted command with one or more projection mutations increments the version exactly once. Every projection document written by that command receives the same version.

## Projection document

`ilka.projection_documents` is keyed by:

```text
(expedition_id, projection_key)
```

Required metadata:

```text
projection_type
subject_id
schema_id
schema_version
projection_json
projection_version
source_stream_position
runtime_release_id
reducer_version
generated_at
```

Example future keys:

```text
captain_day_view
today_view:participant_01
task_status:task_01
card_state:participant_01
role_assignments:day_01
sync_status:participant_01
```

Gate 4 does not create those concrete documents or their public read APIs. Gate 6 owns their schema-valid content and query surface.

## Projection mutation rules

Only full-document `upsert` is accepted.

The function rejects:

- duplicate projection keys in one request;
- invalid key/type format;
- non-object projection JSON;
- cross-Expedition `projection.expedition_id`;
- silent changes to existing projection type, subject or schema ID.

An existing document may change:

- schema version;
- complete projection JSON;
- projection version;
- source stream position;
- runtime release/reducer metadata;
- timestamps.

Projection rows are mutable and rebuildable. Event rows remain append-only and authoritative.

## Actor integrity

Authenticated human actors must match `private.resolve_actor_context(auth_user_id, expedition_id)`.

The database compares:

```text
profile_id
membership_id
participant_id
```

When `participant_id` exists, canonical `actor_id` must match `participants.participant_key`.

System actors require null identity UUIDs and actor role `system` or `system_clock`.

This prevents forged persistence attribution. Engine permissions are not duplicated in SQL.

## Runtime release integrity

The request must use:

```text
expedition.runtime_release_id
runtime_releases.reducer_version
```

The same metadata is persisted on receipt, events and projection documents.

## Permissions

- `anon` cannot read or write projection tables or call transaction helpers;
- `authenticated` cannot read or write projection tables or call `process_command`;
- `service_role` may SELECT internal projections;
- `service_role` cannot directly INSERT, UPDATE or DELETE projections, receipts or events;
- `service_role` may execute only `private.process_command(jsonb)` and previously approved private entry points;
- the internal receipt serializer is not executable by `service_role`;
- all tables use enabled and forced RLS;
- all security-definer functions use an empty `search_path`.

## Offline behavior

The client queue preserves the original canonical `command_id`.

```text
pending/offline
→ command-gateway
→ process_command
```

Results:

- accepted: mark synced and refetch authoritative projection;
- rejected: retain rejection and refetch when required;
- conflict: retain conflict, refetch current projection and require explicit retry/resolution;
- network retry: resend the same command ID and normalized request hash;
- exact replay: receive the original persisted receipt.

No browser code directly updates a projection document or event.

## Errors

Persistence request errors:

```text
invalid_process_command_request
invalid_process_command_request_shape
invalid_expedition_id
invalid_command_id
invalid_command_type
invalid_actor_id
invalid_actor_role
invalid_request_hash
invalid_expected_stream_position
invalid_runtime_release_id
invalid_reducer_version
invalid_process_command_status
invalid_processing_timestamps
accepted_command_requires_events
accepted_command_cannot_include_rejection
rejected_command_cannot_mutate_state
rejected_command_requires_rejection
rejected_command_requires_code
```

Integrity errors:

```text
expedition_not_found
runtime_release_mismatch
reducer_version_mismatch
command_expedition_mismatch
command_actor_context_mismatch
system_actor_context_mismatch
human_actor_context_incomplete
actor_context_mismatch
participant_actor_id_mismatch
projection_head_not_found
prepared_event_metadata_mismatch
prepared_event_ids_must_be_unique
prepared_event_id_invalid
invalid_projection_mutation
duplicate_projection_mutation_key
projection_identity_mismatch
```

Authoritative non-exception outcomes:

```text
idempotency_key_reused_with_different_payload
stream_position_conflict
```

Existing Gate 3 event/receipt constraints remain active as a second persistence backstop.

## Acceptance criteria

- migration rebuilds from an empty PostgreSQL 17 database;
- new Expeditions initialize stream and projection heads at `0`;
- `service_role` can call `process_command` but cannot directly write protected tables;
- browser roles cannot execute the transaction;
- accepted command persists one receipt, ordered events and projection documents atomically;
- multiple events receive consecutive stream positions;
- one command increments projection version once;
- every written projection records the command's final stream position;
- exact retry returns the original receipt without current actor validation;
- different hash for the same command ID writes nothing;
- stale expected position returns conflict and writes nothing;
- deterministic rejection stores a receipt without advancing heads;
- invalid actor context writes nothing;
- projection failure rolls back receipt, events and both heads;
- generated TypeScript types match the migrated database;
- repository validator, pgTAP, database lint and protected CI are green.

## Explicit non-goals

- Edge Function implementation;
- TypeScript reducer implementation;
- Engine permission evaluation in SQL;
- concrete Participant/Captain read documents;
- public `api` functions;
- seeded Expedition or task data;
- frontend adapters;
- Realtime;
- scheduler;
- Storage;
- production or pilot deployment.

## Development deployment record

The reviewed Gate 4 implementation was merged through PR `#19` at commit `448fb6e9fac0521f9c9660c4d1ae5400ed16d186` after protected CI run `29768781004` passed 221 pgTAP assertions and all repository gates.

It was applied to development-only `VOYAGE` as remote migration `20260720185027 atomic_command_transaction`. Full remote verification is recorded in `docs/deployments/2026-07-20-supabase-atomic-command-transaction.md`.

The deployment contains no Expedition, actor, command, event or projection data. The next gate remains Command Gateway.

