# Supabase Runtime Contract

Status: architecture contract for accepted `ADR-012`  
Environment: development-only Supabase `VOYAGE` (`rehfxjlyfojkpascjtmb`)  
Source of truth: `docs/decisions/ADR-012-supabase-persistence-command-gateway-and-projection-model.md`

## Purpose

This document translates `ADR-012` into implementation boundaries for the first Supabase backend vertical. It does not define methodology, permissions, transitions, role rotation, Definition of Done or projection semantics. Those remain owned by ADR, JSON Schema, Engine YAML, Stage/Card files and App contracts.

## Runtime topology

```text
Participant / Captain PWA
  ├─ Supabase Auth: email OTP
  ├─ api.get_today_view(...)
  ├─ api.get_captain_day_view(...)
  ├─ api.get_command_receipt(...)
  └─ POST command-gateway
        ├─ session and membership resolution
        ├─ canonical command validation
        ├─ server Engine guards and reducers
        └─ private.process_command(...)
              ├─ advisory lock by Expedition
              ├─ idempotency and request-hash check
              ├─ expected stream-position check
              ├─ append canonical events
              ├─ update projections
              └─ return authoritative receipt

Supabase Cron
  └─ scheduled-engine
        └─ same Engine and private.process_command(...) boundary
```

Realtime is used only to invalidate a client projection. The client refetches the complete authoritative read model after notification.

## Source-of-truth boundary

| Concern | Owner |
| --- | --- |
| Architecture and accepted decisions | `docs/decisions/ADR-*` |
| Command and event envelopes | `schemas/command.schema.json`, `engine/event.schema.json` |
| Command/event vocabulary | `engine/command-catalog.yaml`, `engine/event-catalog.yaml` |
| States, transitions and reducers | `engine/` canonical files |
| Permissions | `engine/permissions.yaml` |
| Roles and rotation | `engine/roles-catalog.yaml`, `engine/role-rotation-rules.yaml` |
| Stages and content | `stages/`, `cards/` |
| Read models | `app/contracts/*.schema.json` |
| Persistence, grants and transport | `supabase/` |

SQL functions may enforce integrity, ordering and access boundaries. They must not become a second methodology or Engine implementation.

## Environment policy

`VOYAGE` is development-only.

Allowed:

- synthetic users and fixtures;
- local and development migrations;
- development Edge Functions;
- automated security, RLS and replay tests.

Not allowed until a later decision:

- production or pilot Participant data;
- recordings or transcripts;
- production evidence;
- production secrets copied into development;
- manual application schema changes in Supabase Studio.

## Schema boundary

### `ilka`

Internal domain persistence and projections. Browser roles receive no direct schema usage or table grants.

Initial entities are expected to include:

- `runtime_releases`;
- `profiles`;
- `expeditions`;
- `expedition_members`;
- `participants`;
- `invitations`;
- `stream_heads`;
- `command_receipts`;
- `event_log`;
- minimum projection tables required by the first vertical.

### `api`

Explicit authenticated read surface only.

Initial functions:

- `api.get_today_view(p_expedition_id uuid)`;
- `api.get_captain_day_view(p_expedition_id uuid)`;
- `api.get_command_receipt(p_command_id uuid)`.

Functions return a transport envelope containing a schema-valid projection plus projection metadata. Raw projection tables are not exposed.

### `private`

Trusted runtime helpers only:

- `private.process_command(...)`;
- membership and authorization helpers;
- replay and projection rebuild helpers;
- scheduler helpers;
- maintenance functions.

`private` is never included in browser-exposed schemas. Security-definer functions use an explicit safe `search_path` and minimal grants.

## Identity model

The following identifiers are distinct:

```text
auth_user_id
profile_id
expedition_member_id
participant_id
```

A user may hold membership in multiple Expeditions. A Participant is a domain entity within one Expedition and is not a global alias for `auth.uid()`.

Membership roles:

```text
captain
participant
shore_operator
```

`Product Captain` is an active Day assignment, not a membership or JWT role.

## Command processing contract

### External request

The browser sends a canonical command envelope to `command-gateway`. Client-supplied actor role or membership claims are treated as untrusted.

### Gateway preparation

The Edge Function:

1. verifies JWT/session;
2. resolves `auth.uid()` to active Expedition membership and Participant identity;
3. validates the command against canonical schemas;
4. loads the Expedition runtime release and current projection at stream position `N`;
5. applies canonical permissions and Engine guards;
6. runs the pinned TypeScript reducer;
7. produces ordered canonical events and projection mutations;
8. computes a normalized request hash;
9. calls `private.process_command(...)` with `expected_stream_position = N`.

### Atomic persistence

`private.process_command(...)` executes one PostgreSQL transaction:

```text
lock Expedition stream
→ return prior receipt when command_id/request_hash already exists
→ reject command_id reuse with a different request hash
→ reject stale expected stream position without writes
→ allocate consecutive stream positions
→ insert receipt and events
→ update projections
→ advance stream/projection versions
→ commit and return receipt
```

No multi-call sequence from the Edge Function may separately insert the receipt, events and projections.

### Conflict behavior

A stale stream position returns an authoritative `conflict` receipt/result and performs no write. The client:

1. keeps the queued command record;
2. refetches the projection;
3. renders `conflict`;
4. waits for an explicit retry or user/Captain resolution according to command semantics.

The browser never converts a conflict into a successful domain outcome locally.

## Command receipt

Required receipt fields:

```text
command_id
expedition_id
command_type
actor_user_id
actor_participant_id
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

Server statuses:

```text
accepted
rejected
conflict
```

`pending` and `offline` are local delivery states before a server result exists. A duplicate with the same hash returns the original receipt. A duplicate ID with a different hash is rejected as `idempotency_key_reused_with_different_payload`.

## Event log

The database row contains persistence metadata plus the canonical event JSON.

Minimum persistence columns:

```text
event_id
expedition_id
stream_position
command_id
event_type
occurred_at
recorded_at
actor_user_id
actor_participant_id
causation_id
correlation_id
event_json
runtime_release_id
reducer_version
```

Required guarantees:

- unique `(expedition_id, stream_position)`;
- append-only inserts;
- no update/delete for application roles or Captain;
- positions allocated while holding the Expedition transaction lock;
- deterministic replay in ascending stream position;
- corrections represented by new events.

## Runtime release

`ilka.runtime_releases` is immutable after insertion.

A release identifies:

```text
runtime_release_id
repository_commit_sha
release_tag
rules_bundle_hash
content_bundle_hash
schema_release_version
reducer_version
created_at
```

Every Expedition pins one release. The gateway rejects processing when the pinned runtime bundle is unavailable or its hash does not match the registered release.

## Projection transport

Read functions return:

```json
{
  "projection": {},
  "metadata": {
    "projection_schema_version": "...",
    "source_stream_position": 0,
    "projection_version": 0,
    "runtime_release_id": "...",
    "reducer_version": "...",
    "generated_at": "ISO-8601-with-timezone"
  }
}
```

`projection` must validate against the canonical `TodayView` or `CaptainDayView` schema. Metadata belongs to the transport envelope and does not silently change those canonical projection contracts.

## RLS and grants

Required tests include:

- `anon` cannot read or write ILKA domain objects;
- authenticated users cannot directly write domain tables;
- Participant A cannot read Expedition B;
- Participant cannot read Captain projection;
- Captain authority is limited to their Expedition;
- banned membership cannot read active projections or submit commands;
- historical event attribution survives membership ban/removal;
- service functions cannot be called by browser roles;
- security-definer functions use a fixed safe `search_path`.

## Offline synchronization

Queueable commands remain exactly those marked `offline_allowed: true` by the canonical command catalog and offline schema.

```text
IndexedDB pending command
→ command-gateway
→ accepted receipt: mark synced and replace with authoritative projection
→ rejected receipt: retain rejection and replace projection when supplied
→ conflict result: retain command as conflict and refetch
→ network failure: retain pending/offline and retry with same command_id
```

A retry never creates a new command ID.

## Scheduler

`scheduled-engine` submits canonical system execution through the same Engine and transaction boundary.

Day-boundary command identity is deterministic from:

```text
expedition_id
local_boundary_date
day_revision
```

Required scheduler tests:

- duplicate invocation;
- Expedition timezone;
- DST transition;
- paused/suspended Expedition;
- prior failure and retry;
- floating Recovery Day;
- Day 12 and terminal Expedition behavior.

Product Stage never advances automatically.

## Storage

Evidence uses private buckets and versioned immutable paths:

```text
expeditions/<expedition_id>/evidence/<evidence_id>/<version>/<filename>
```

Upload completion does not confirm evidence. A canonical command must reference the uploaded object and be accepted. Replacing evidence creates a new version rather than overwriting history.

Audio recording and transcription are out of scope.

## Migration sequence

### PR 1 — foundation

- `supabase/config.toml`;
- schemas `ilka`, `api`, `private`;
- extensions and explicit default privileges;
- runtime release registry;
- local reset/test harness;
- protected CI for Supabase validation.

### PR 2 — identity and membership

- profiles;
- Expeditions;
- memberships;
- Participants;
- hashed invitations;
- isolation and ban tests.

### PR 3 — immutable history

- stream heads;
- command receipts;
- append-only event log;
- idempotency and ordering tests.

### PR 4 — first command transaction

- versioned TypeScript Engine runtime boundary;
- `command-gateway`;
- `private.process_command(...)`;
- seeded Day 1 task projection;
- server-backed `complete_task` flow;
- Participant and Captain read functions.

### Later

- full Expedition creation/start flow;
- automatic Day 1 and Card Bundles;
- remaining commands and projections;
- Realtime invalidation;
- evidence Storage;
- replay/rebuild tooling;
- production environment decision.

## Foundation gate

The first Supabase implementation PR is complete only when:

```text
supabase db reset
→ succeeds from an empty local database

repository CI
→ validates migrations and SQL tests

anon
→ has no ILKA domain access

browser authenticated roles
→ have no direct domain writes

advisors
→ no unresolved critical security finding
```

No production project, production data or pilot operation is authorized by this gate.

## Explicit non-goals

- direct browser CRUD;
- business reducers implemented as SQL triggers;
- Supabase tables as methodology source of truth;
- Product Captain as JWT/global role;
- Realtime as authoritative state;
- public evidence buckets;
- multi-device sync before the first server-backed command works;
- recordings/transcription;
- applying the full 12-day domain in the foundation migration.