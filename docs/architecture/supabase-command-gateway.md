# Supabase Command Gateway Contract

Status: implementation contract under accepted `ADR-012`, `ADR-013` and `ADR-014`  
Environment: local Supabase and development-only `VOYAGE`  
External endpoint: `POST /functions/v1/command-gateway`

## Problem

Gate 4 can atomically persist a prepared Engine result, but no authenticated external transport exists. A browser must not call internal schemas, trust client actor claims, duplicate Engine permissions or write receipts/events/projections directly.

Gate 5 provides the authenticated transport and runtime-loading boundary without introducing a placeholder reducer.

## Source of truth

```text
ADR-012 / ADR-013 / ADR-014
→ schemas/command.schema.json
→ engine/command-catalog.yaml
→ engine/permissions.yaml
→ pinned TypeScript runtime bundle
→ private.process_command(jsonb)
```

The generated command actor matrix is derived from `engine/command-catalog.yaml`. It is never edited as a second permission source.

## Request

The body is the canonical Command Envelope:

```json
{
  "command_id": "cmd_...",
  "command_type": "complete_task",
  "issued_at": "2026-07-20T21:00:00Z",
  "actor_id": "participant_01",
  "actor_role": "participant",
  "expedition_id": "expedition_key",
  "idempotency_key": "cmd_...",
  "payload": {}
}
```

Rules:

- method is `POST`;
- content type is `application/json`;
- body is at most 64 KiB;
- command validates against `schemas/command.schema.json`;
- `idempotency_key` equals `command_id`;
- client actor fields are untrusted claims.

## Authentication

Supabase platform JWT verification is enabled in `supabase/config.toml`.

The handler additionally calls the Supabase Auth user endpoint with the bearer token and project public key. No command result, including replay, is returned without a valid Auth session.

Auth identity is only `auth.users.id`. Expedition role is resolved from internal membership records.

## Direct PostgreSQL boundary

The function uses `SUPABASE_DB_URL` and a small lazy `@db/postgres` pool.

Every operation follows:

```text
BEGIN
→ SET LOCAL ROLE service_role
→ parameterized SELECT or private function call
→ COMMIT
```

Failure follows:

```text
ROLLBACK
→ release connection
```

The Data API continues to expose only `api`. `private` is not added to `[api].schemas`.

## Processing order

```text
validate origin/method/media type/body size
→ parse JSON
→ canonical Command Schema validation
→ enforce command_id == idempotency_key
→ compute normalized SHA-256 request hash
→ validate Supabase session
→ look up immutable receipt by command_id
   ├─ exact same Expedition/hash/original Auth actor → replay
   └─ mismatch → 409, no write
→ load Expedition/runtime/heads/projections/active actor
→ reject inactive membership and actor spoofing
→ locate exact pinned runtime bundle
→ resolve Product Captain assignment when claimed
→ generated actor-matrix preflight
→ runtime guards/reducer
→ canonical event validation
→ private process-request validation
→ private.process_command(jsonb)
→ private process-result validation
→ map authoritative HTTP result
```

## Idempotency and replay

The request hash excludes `actor_id` and `actor_role`. It includes normalized command intent with recursively sorted object keys and UTC timestamp normalization.

Exact replay requirements:

```text
same command_id
same expedition_key
same normalized request_hash
same authenticated original actor_auth_user_id
```

Replay occurs before current membership and runtime checks. This preserves the original result after a later ban/revocation while preventing another authenticated user from reading it.

Different payload or Expedition for the same command ID returns:

```text
409 idempotency_key_reused_with_different_payload
```

No new receipt is written.

## Actor resolution

Active database membership is authoritative.

```text
participant membership → participants.participant_key
captain membership     → member_<membership_uuid_without_hyphens>
shore_operator         → member_<membership_uuid_without_hyphens>
```

A human request cannot claim `system` or `system_clock`.

A Participant may claim `product_captain` only when the exact pinned runtime verifies the current Product Captain assignment from authoritative projections.

## Permission preflight

`command-contract.generated.ts` contains only generated `allowedActors` and `offlineAllowed` metadata from `engine/command-catalog.yaml`.

The preflight rejects obvious role/command mismatches. It does not decide:

- assignment ownership;
- task state;
- Stage readiness;
- Product Decision quorum;
- Captain override guards;
- XP/rating rules;
- completion readiness.

Those remain in the pinned runtime reducer.

## Runtime registry

A runtime bundle must exactly match:

```text
release_key
git_commit_sha
rules_release
content_release
reducer_version
```

Gate 5 registers no production bundle. New commands therefore receive:

```json
{
  "error": {
    "code": "runtime_release_unavailable",
    "retryable": true
  }
}
```

No receipt/event/projection is written. Gate 6 will register the first reducer and concrete read-model output.

## Atomic persistence request

For an available runtime, the gateway replaces client actor claims with authoritative values and sends:

```text
internal Expedition UUID
canonical command
actor UUID context
normalized request_hash
expected stream position
accepted/rejected prepared status
ordered canonical events
complete projection upserts
pinned runtime release/reducer
received_at / processed_at
optional deterministic rejection
```

The object validates against `supabase/contracts/private-process-command-request.schema.json` before database execution.

## Responses

Successful transport envelope:

```json
{
  "request_id": "uuid",
  "data": {
    "outcome": "accepted",
    "replayed": false,
    "persisted": true,
    "receipt": {},
    "projection_updates": [],
    "expected_stream_position": 0,
    "current_stream_position": 1
  }
}
```

Error envelope:

```json
{
  "request_id": "uuid",
  "error": {
    "code": "validation_failed",
    "message": "...",
    "retryable": false,
    "details": []
  }
}
```

Status mapping:

```text
200 accepted/rejected/replayed
409 conflict or idempotency mismatch
400 invalid JSON/schema/idempotency envelope
401 invalid session
403 membership/actor/permission failure
404 Expedition not found
405 method failure
413 body too large
415 media type failure
503 Auth/DB/runtime temporarily unavailable
500 runtime or persistence contract violation
```

Stack traces, SQL text and secrets are never returned.

## CORS

Allowed origins come from comma-separated `ILKA_ALLOWED_ORIGINS`.

Default local origins:

```text
http://localhost:5173
http://127.0.0.1:5173
```

`OPTIONS` is supported. Disallowed origins receive `403 origin_not_allowed`. Credentialed wildcard CORS is not used.

## Offline behavior

The client retains the original command ID.

```text
network/503 → pending or offline, retry same command
accepted     → synced, refetch projection when read API exists
rejected     → rejected
conflict     → conflict, refetch and explicitly resolve
replay       → apply original receipt
```

The gateway does not expand the canonical offline command list.

## Tests

### Unit

- canonical JSON ordering and actor-claim exclusion;
- UTC timestamp normalization and SHA-256 stability;
- canonical command and private request validation;
- CORS and transport errors;
- authentication errors;
- exact replay and original-actor restriction;
- idempotency mismatch;
- inactive membership;
- actor and role spoofing;
- Product Captain resolution;
- generated actor matrix;
- missing runtime;
- accepted and conflict mapping;
- invalid runtime event rejection.

### Local database integration

After `supabase db reset`, a synthetic local-only fixture proves:

- direct PostgreSQL connection;
- `SET LOCAL ROLE service_role` read boundary;
- Expedition and actor resolution;
- call to `private.process_command(jsonb)`;
- immutable rejected receipt retrieval and replay shape.

No integration fixture is deployed to cloud `VOYAGE`.

## Acceptance criteria

- `private` remains outside Data API schemas;
- `verify_jwt = true` is explicit for `command-gateway`;
- Deno format, lint, check and unit tests pass with a committed lockfile;
- generated command metadata matches canonical YAML;
- local database integration passes after a clean migration replay;
- exact replay requires the original Auth actor but not current membership/runtime;
- new command requires active membership and exact pinned runtime;
- Product Captain is never derived from membership/JWT metadata;
- handler cannot directly write events or projections;
- all persistence goes through `private.process_command(jsonb)`;
- repository, frontend, pgTAP, database lint and prior Supabase validators remain green.

## Explicit non-goals

- production reducer;
- concrete Participant/Captain projections;
- public read functions;
- frontend network adapter;
- cloud fixtures;
- scheduler;
- Realtime;
- Storage;
- pilot or production data.
