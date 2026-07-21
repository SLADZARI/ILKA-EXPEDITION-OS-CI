# ADR-016 — Offline command synchronization and authoritative reconciliation

- Status: Accepted
- Date: 2026-07-21
- Owners: Product Architecture / Frontend / Engine / Backend
- Extends: `ADR-011`, `ADR-012`, `ADR-014`, `ADR-015`

## Context

Frontend Foundation persists canonical offline commands in IndexedDB and renders delivery overlays. Gate 6 provides `command-gateway`, immutable receipts and authoritative `TodayView` projections. The missing boundary is delivery and reconciliation: queued commands currently remain local forever.

The synchronization layer may transport commands, classify receipts and refetch projections. It must not calculate task completion, card acknowledgement, permissions, Definition of Done or any other Engine result.

## Decision

### Gate boundary

Gate 7 implements synchronization for commands already declared `offline_allowed: true`. The first executable scenario is:

```text
queue complete_task offline
→ reconnect
→ send the unchanged canonical command
→ receive accepted/rejected/conflict/replay
→ persist queue delivery state
→ refetch authenticated TodayView
→ replace the authoritative frontend projection
```

No new server reducer is added.

### Canonical idempotency

`command_id` is the canonical idempotency key. Frontend commands must satisfy:

```text
idempotency_key == command_id
```

Every retry sends the original stored command unchanged, including `command_id`, `issued_at`, actor, Expedition/Day/Stage context and payload.

### Queue state

The existing `QueuedCommand` remains the local delivery aggregate. Only delivery metadata is added:

```text
last_attempt_at?
settled_at?
last_error?
receipt?
```

The stored canonical command body is immutable. Settled records are retained until a later retention decision.

### Ordering

- FIFO by `created_at`, then `local_id`;
- one active sync cycle per application runtime;
- commands sent sequentially;
- only `pending` records are submitted automatically;
- duplicate startup/online/enqueue triggers join the active cycle.

### Triggers

Synchronization runs when an authenticated runtime is available:

1. Participant app starts online;
2. an offline command is enqueued online;
3. the browser fires `online`;
4. the user explicitly retries a pending command.

The service worker remains an application-shell cache and does not send commands.

### Outcome mapping

**Accepted or exact replay**

- queue → `synced`;
- store compact receipt metadata;
- refetch `api.get_today_view(...)`;
- replace authoritative frontend state only with the refetched projection.

**Persisted rejection**

- queue → `rejected`;
- preserve `rejection_code` and message;
- refetch TodayView;
- do not retry automatically.

**Stream conflict**

- queue → `conflict`;
- preserve conflict and stream-position metadata;
- refetch TodayView;
- stop the current FIFO cycle before later commands.

**Retryable failure**

Network errors, HTTP 429/502/503/504 and gateway errors with `retryable: true` keep the command `pending`, increment attempts and stop the cycle.

**Authentication failure**

The command remains `pending`; the application waits for a valid token and retries the same command later.

**Terminal transport error**

Validation, actor mismatch, permission denial, missing membership and idempotency-body mismatch become `rejected`.

### Projection reconciliation

`ParticipantProjectionLoader` fetches `api.get_today_view(p_expedition_key)`. A runtime transport guard verifies projection identity and minimum structure before replacement. This guard detects corrupt transport data; it is not a duplicate Engine validator.

A projection identity mismatch never overwrites the current authoritative state.

### UI

The existing overlay may change only `pending_sync` and top-level `sync_status`. Domain fields remain authoritative server projection data.

Visible states remain:

```text
pending
synced
conflict
rejected
offline
```

### Permissions

- only canonical offline commands enter the queue;
- Captain/system/server-confirmed commands are rejected by type and runtime guard;
- Captain precedence is expressed by server state and subsequent projection refetch;
- banned/revoked actors receive authoritative rejection; local command history remains attributable.

## Acceptance criteria

- frontend commands use `idempotency_key == command_id`;
- retries send byte-equivalent command data;
- FIFO synchronization is sequential and single-flight;
- accepted/replayed `complete_task` becomes `synced` and refetches TodayView;
- rejected becomes `rejected` without optimistic domain mutation;
- conflict becomes `conflict`, refetches and stops later submissions;
- retryable failures remain `pending` with incremented attempts;
- authentication failures preserve pending commands;
- invalid projection responses never replace authoritative state;
- startup, enqueue and browser `online` trigger sync;
- queue metadata persists in IndexedDB;
- protected frontend tests, strict TypeScript and builds pass.

## Explicit non-goals

- Auth UI or email OTP;
- Expedition creation/invitations;
- rotation or automatic Day 1;
- new reducers;
- Realtime;
- Background Sync API;
- evidence Storage;
- settled-record pruning;
- pilot or production data.

## Consequences

The IndexedDB queue becomes a real delivery mechanism. Receipts and refetched projections, never optimistic frontend logic, determine domain outcomes. Gate 8 can implement Expedition bootstrap and automatic Day 1 using the same transport boundary.
