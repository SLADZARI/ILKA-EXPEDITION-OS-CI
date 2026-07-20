# Supabase Immutable History Contract

Status: implementation contract under accepted `ADR-012`  
Environment: local Supabase and development-only `VOYAGE`  
Source of truth: `docs/decisions/ADR-012-supabase-persistence-command-gateway-and-projection-model.md`

## Problem and user scenario

The backend needs one attributable, ordered and immutable Expedition history before any real command can be accepted safely.

Minimum persistence scenario:

1. an Expedition exists and is pinned to one immutable runtime release;
2. the Expedition owns one stream head starting at position `0`;
3. trusted server code normalizes a command and computes a SHA-256 `request_hash`;
4. the command declares its final ordered event IDs and resulting stream position;
5. canonical events append consecutively to the Expedition stream;
6. an identical retry resolves to the existing command receipt;
7. a reused `command_id` with another payload hash is rejected;
8. a stale expected stream position is detected before writes;
9. a correction appends a new event that references an earlier event;
10. no user, Captain, browser role or service process can edit or delete committed history.

## Architecture boundary

This gate owns persistence integrity only:

- `ilka.stream_heads`;
- `ilka.command_receipts`;
- `ilka.event_log`;
- stream-head initialization for new Expeditions;
- request-hash idempotency lookup;
- expected stream-position validation;
- consecutive event-position enforcement;
- command-to-event-set consistency;
- immutable UPDATE, DELETE and TRUNCATE protection;
- correction-event target validation;
- forced RLS, explicit grants, pgTAP tests and generated database types.

This gate does **not** implement:

- `private.process_command(...)`;
- the Expedition-scoped advisory lock required by the final transaction boundary;
- Engine permissions or reducers;
- projection mutations;
- `command-gateway`;
- API read functions;
- frontend transport;
- Auth or invitation delivery;
- Realtime, scheduler or Storage.

Gate 4 must compose these primitives inside one atomic `private.process_command(...)` transaction.

## Source-of-truth reconciliation

`ADR-012` is higher priority than `engine/event-catalog.yaml` and defines persisted runtime order by `(expedition_id, stream_position)`.

The previous event-catalog replay statement based on `recorded_at` and `event_id` is replaced with:

- persisted runtime replay uses ascending `stream_position`;
- canonical fixture arrays without persistence metadata preserve their explicit array order;
- `recorded_at` and `event_id` remain metadata and tie-breakers for diagnostics, not authoritative runtime ordering.

The canonical event envelope in `engine/event.schema.json` is not changed. `stream_position` remains database persistence metadata.

## Identifier mapping

The database and canonical envelope deliberately use different Expedition identifiers:

```text
ilka.event_log.expedition_id
→ internal UUID referencing ilka.expeditions.id

ilka.event_log.event_json.expedition_id
→ canonical stable ilka.expeditions.expedition_key
```

The event insert guard verifies this mapping and also verifies that `event_id`, `event_type` and `command_id` match their canonical JSON values.

Canonical IDs remain text:

```text
command_id: ^cmd_[A-Za-z0-9_-]+$
event_id:   ^evt_[A-Za-z0-9_-]+$
```

They are not converted into database-generated UUIDs.

## Stream head

`ilka.stream_heads` stores one row per Expedition:

```text
expedition_id
current_stream_position
created_at
updated_at
```

Rules:

- a new Expedition receives position `0` automatically;
- every committed event advances the head by exactly one;
- committed positions are positive, unique and gap-free per Expedition;
- a failed statement or transaction does not advance the head;
- the stream head may be mutated only by trusted database functions;
- browser roles and direct `service_role` writes are denied.

## Command receipt

`ilka.command_receipts` stores the immutable authoritative result identified by `command_id`.

Required fields include:

```text
command_id
expedition_id
command_type
authoritative actor identifiers
actor_role
request_hash
status
received_at
processed_at
event_ids
stream_position
projection_version
runtime_release_id
reducer_version
rejection_code
rejection_message
conflict_code
```

### Request hash

`request_hash` is stored as exactly 32 bytes representing normalized SHA-256 output.

Hash normalization itself belongs to the future server Engine runtime. The database never hashes arbitrary client JSON independently because differing JSON serialization would create competing idempotency rules.

### Statuses

```text
accepted
rejected
conflict
```

Rules:

- `accepted` requires at least one ordered event ID and a resulting stream position;
- `rejected` requires `rejection_code` and has no events;
- `conflict` requires `conflict_code` and has no events;
- stale optimistic-concurrency conflict remains an ephemeral response in Gate 4 and must not partially persist a receipt or events;
- the table supports the complete receipt contract but does not itself authorize a command.

### Idempotency

`private.check_command_idempotency(command_id, request_hash)` returns:

```text
new
replay
```

A different hash for an existing `command_id` raises:

```text
idempotency_key_reused_with_different_payload
```

The unique primary key remains the final concurrency backstop. Gate 4 must call the helper while holding the Expedition transaction boundary and must return the original event IDs and versions for `replay`.

## Event log

`ilka.event_log` wraps each canonical event with persistence metadata:

```text
event_id
expedition_id
stream_position
command_id
event_type
occurred_at
recorded_at
authoritative actor identifiers
actor_role
causation_id
correlation_id
event_json
correction_of_event_id
runtime_release_id
reducer_version
```

Required guarantees:

- unique `event_id`;
- unique `(expedition_id, stream_position)`;
- command receipt and event belong to the same Expedition;
- receipt status is `accepted`;
- event ID appears exactly once in the receipt event list;
- event position matches its ordered index inside that receipt;
- runtime release and reducer version match the receipt;
- canonical JSON identity metadata matches persistence metadata;
- event positions append consecutively;
- UPDATE, DELETE and TRUNCATE always fail.

## Complete event-set guarantee

An accepted receipt declares the complete ordered event set before append.

A deferred constraint trigger verifies at transaction completion that:

- every declared event exists;
- no undeclared event exists for the command;
- persisted order equals `event_ids` order;
- the final event position equals the receipt stream position.

This prevents a committed accepted receipt with only a partial event set. Gate 4 will add projection atomicity to the same transaction.

## Correction events

Past events are never edited.

A correction is a new canonical event containing top-level `correction_of`, persisted as `correction_of_event_id`.

Rules:

- the referenced event must exist;
- it must belong to the same Expedition;
- its stream position must be lower than the correcting event;
- canonical JSON and persistence metadata must reference the same target;
- the original event remains unchanged and replayable.

This mechanism supports explicit correcting events such as `role_xp.adjusted` without creating a generic mutable audit record.

## Conflict detection

`private.assert_expected_stream_position(expedition_id, expected_stream_position)` locks and reads the current stream-head row.

Results:

- matching position returns the current position;
- missing stream head returns `stream_head_not_found`;
- negative or null expected position returns `invalid_expected_stream_position`;
- stale position raises SQLSTATE `40001` with `stream_position_conflict`.

Gate 4 must call this after acquiring the Expedition advisory lock and convert the stale result into an authoritative `conflict` response with no writes.

## Permissions

- `anon` receives no history schema, table or function access;
- `authenticated` receives no raw history access;
- Data API exposure remains limited to `api`;
- `service_role` may SELECT internal history for trusted server processing;
- `service_role` cannot directly INSERT, UPDATE, DELETE or TRUNCATE history tables;
- only private trusted helpers are executable by `service_role`;
- all history tables use enabled and forced RLS;
- all trusted functions use an explicit empty `search_path` and fully qualified names;
- Captain authority never permits event editing or deletion.

The future `private.process_command(...)` function will be `SECURITY DEFINER`, private, explicitly granted only to trusted server runtime and responsible for all history writes.

## Offline behavior

No client writes history directly.

For a queued offline command:

```text
pending command with stable command_id
→ reconnect
→ command-gateway
→ same normalized request_hash
→ replay original receipt or process as new
```

A retry always preserves its original `command_id`.

A stale expected position returns `conflict`; the client retains the local queued record, refetches the authoritative projection and waits for explicit retry or resolution. The client never modifies events or stream heads locally as authoritative state.

## Errors

```text
invalid_command_id
invalid_request_hash
idempotency_key_reused_with_different_payload
invalid_expected_stream_position
stream_head_not_found
stream_position_conflict
receipt_runtime_release_mismatch
receipt_event_ids_must_be_unique
receipt_event_id_format_invalid
accepted_receipt_requires_events
receipt_stream_position_out_of_sequence
event_stream_position_out_of_sequence
event_command_receipt_not_found
event_requires_accepted_receipt
event_not_declared_by_receipt
event_receipt_position_mismatch
event_runtime_release_mismatch
event_reducer_version_mismatch
event_json_metadata_mismatch
event_correction_metadata_mismatch
correction_target_not_found
correction_target_cross_expedition
correction_target_must_precede_event
accepted_receipt_event_set_incomplete
command_receipts_is_append_only
event_log_is_append_only
```

## Acceptance criteria

- migrations rebuild from an empty PostgreSQL 17 database;
- every Expedition automatically has one stream head at position `0`;
- matching expected position succeeds and stale position conflicts;
- same `command_id` and hash resolves to replay;
- same `command_id` and another hash is rejected;
- accepted receipt declares unique ordered canonical event IDs;
- event inserts are consecutive and update the stream head atomically;
- command receipt and event set cannot commit partially;
- persisted replay order is ascending `stream_position`;
- correction targets must be earlier events in the same Expedition;
- original corrected events remain unchanged;
- receipts and events reject UPDATE, DELETE and TRUNCATE;
- browser roles have no raw access;
- service role has no direct write access;
- generated TypeScript database types match the migrated schema;
- repository validator, pgTAP tests, database lint and protected CI are green.

## Explicit non-goals

- independent SQL business reducers;
- direct browser or service-role event insertion;
- `private.process_command(...)` in this gate;
- advisory transaction lock in this gate;
- projection tables or mutations;
- API receipt reads;
- Event Schema duplication inside SQL;
- changing prior canonical events;
- production or pilot data;
- remote deployment before reviewed PR and green CI.

## Development deployment record

The reviewed Immutable History gate was merged through PR `#17` at commit `8937b746fbbb53007a36f63dd99a115ffefb3307` after protected run `29765160272` passed. It was then applied to development-only `VOYAGE` (`rehfxjlyfojkpascjtmb`) as remote migration version `20260720175753` with migration name `immutable_history`.

Remote verification confirmed:

- `ilka.stream_heads`, `ilka.command_receipts` and `ilka.event_log` exist;
- all three tables have enabled and forced RLS;
- `anon` and `authenticated` have no raw SELECT access;
- `service_role` has internal SELECT access but no direct INSERT, UPDATE or DELETE privilege;
- `service_role` can execute `private.check_command_idempotency(...)` and `private.assert_expected_stream_position(...)`;
- `authenticated` cannot execute those private helpers;
- Profiles, Expeditions, memberships, Participants, invitations, stream heads, command receipts and events all contain zero rows.

The deployment does not add `private.process_command(...)`, advisory command locking, projections, API read functions, Edge Functions, command transport, scheduler jobs, Storage buckets, pilot data or production data. The next backend gate remains the atomic command transaction.
