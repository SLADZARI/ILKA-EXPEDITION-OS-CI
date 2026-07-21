# Offline command synchronization

Status: implementation contract under accepted `ADR-016`.

## Runtime composition

```text
Participant App
├── IndexedDbCommandQueue
├── OfflineCommandSynchronizer
├── CommandGatewayTransport
└── ParticipantProjectionLoader
```

The queue stores canonical commands. The synchronizer owns delivery order and receipt classification. The gateway transport owns HTTP only. The projection loader owns authenticated read transport only. React owns composition and presentation, not domain reduction.

## Queue record

```ts
QueuedCommand {
  local_id
  command
  status
  attempts
  created_at
  last_attempt_at?
  settled_at?
  last_error?
  receipt?
}
```

`command` is immutable after enqueue. Queue patches may update delivery metadata only.

Compact receipt metadata:

```ts
QueueReceipt {
  outcome
  replayed
  event_ids
  stream_position
  projection_version
  rejection_code
  rejection_message
  conflict_code
  expected_stream_position
  current_stream_position
}
```

## Synchronization algorithm

```text
sync()
  if another cycle exists: return it
  if offline or token unavailable: return
  list queue
  for each pending item in FIFO order:
    increment attempt metadata
    send exact stored command
    classify response
    persist queue state
    if accepted/rejected/conflict:
      refetch TodayView
      validate identity and minimum structure
      publish authoritative projection
    if conflict/retryable/auth failure/invalid projection:
      stop cycle
```

A successful `accepted` receipt is not sufficient to mutate task/card/output state. The authoritative projection refetch is mandatory.

## HTTP contracts

Command endpoint:

```text
POST /functions/v1/command-gateway
Authorization: Bearer <access token>
apikey: <public key>
Content-Type: application/json
```

Read endpoint:

```text
POST /rest/v1/rpc/get_today_view
body: { "p_expedition_key": "<expedition_key>" }
```

Both transports use injected configuration and access-token providers. No secrets are hard-coded.

## Response classification

| Response | Queue state | Continue FIFO | Refetch |
|---|---|---:|---:|
| accepted/replay | synced | yes | yes |
| persisted rejected | rejected | yes | yes |
| stream conflict | conflict | no | yes |
| retryable public error | pending | no | no |
| auth unavailable | pending | no | no |
| terminal public error | rejected | yes | no |
| malformed gateway response | pending | no | no |
| invalid/mismatched TodayView | receipt state retained | no | no replacement |

## Single-flight behavior

`OfflineCommandSynchronizer` keeps one active promise. Startup, `online`, enqueue and explicit retry call the same method. Concurrent calls receive the same promise and cannot submit duplicates concurrently.

## Reconciliation identity

A fetched TodayView may replace state only when:

```text
view.expedition_id == queued command expedition_id
view.participant_id == current Participant actor_id
```

Day and Stage may legitimately advance while the command was offline, so they are validated structurally but are not required to equal the stale command context.

## Offline visibility

- local immutable projection remains visible;
- relevant pending commands set `pending_sync` only;
- browser offline state renders top-level `offline`;
- conflict/rejected records remain visible after projection refetch;
- synced records no longer produce pending overlays.

## Retry

Automatic retry is allowed only for records still `pending`. Conflict and rejected records require an explicit application decision. Gate 7 provides `retryPending()` and does not silently reset terminal states.

## Security

- the browser never receives `service_role` credentials;
- bearer token and public API key are injected by the composition root;
- direct `ilka`/`private` access remains impossible;
- queue accepts only generated offline command union values;
- public error bodies are treated as untrusted transport data and structurally checked.

## Tests

Required unit scenarios:

- canonical command idempotency;
- accepted and replayed delivery;
- persisted rejection;
- stream conflict and FIFO stop;
- retryable network/503 behavior;
- authentication unavailable;
- terminal public error;
- malformed gateway response;
- projection identity mismatch;
- single-flight synchronization;
- IndexedDB persistence of receipt metadata;
- application trigger wiring without authoritative client reduction.
