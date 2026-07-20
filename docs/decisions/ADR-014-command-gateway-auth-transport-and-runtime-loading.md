# ADR-014 — Command gateway authentication, transport and runtime loading

- Status: Accepted
- Date: 2026-07-20
- Owners: Product Architecture / Backend / Engine / Security
- Extends: `ADR-012`, `ADR-013`
- Target project: Supabase `VOYAGE` (`rehfxjlyfojkpascjtmb`)

## Context

`ADR-012` fixes one authenticated Supabase Edge Function, `command-gateway`, as the only external domain-write path. `ADR-013` and Gate 4 provide the server-only atomic persistence boundary `private.process_command(jsonb)`.

The `private` database schema is intentionally absent from the browser-facing Data API schema list. Exposing it so an Edge Function can call an RPC would weaken the accepted boundary. The gateway therefore needs a trusted direct PostgreSQL path without granting browser roles access to internal schemas.

Gate 5 must also establish transport, authentication, canonical validation, actor attribution, idempotency hashing and runtime bundle loading before the first concrete reducer/read-model vertical. It must not fabricate accepted domain outcomes while no executable pinned reducer bundle exists.

## Decision

### External write endpoint

All external domain commands use:

```text
POST /functions/v1/command-gateway
```

The function is deployed with Supabase platform JWT verification enabled. Its code also resolves the bearer token through Supabase Auth before reading any receipt or Expedition state.

The browser never calls `private.process_command(...)`, inserts events, or updates projection documents directly.

### Database access

`command-gateway` connects directly to PostgreSQL through the Edge Function secret `SUPABASE_DB_URL`.

Each gateway database operation runs in a short transaction:

```text
BEGIN
→ SET LOCAL ROLE service_role
→ parameterized query or private function call
→ COMMIT
```

Errors trigger `ROLLBACK`. Connections are returned to a small lazy pool.

`private` remains absent from `[api].schemas`. No PostgREST exposure or browser schema grant is added.

### Authentication before replay

A valid Supabase session is required before any command result is returned, including an exact idempotent replay.

After authentication, replay resolution occurs before current membership and runtime availability checks:

- same `command_id`, same Expedition and same normalized `request_hash` returns the original persisted receipt with `replayed: true`;
- same `command_id` with a different hash or Expedition returns `idempotency_key_reused_with_different_payload` and writes nothing;
- an exact replay remains available after later membership ban/revocation, but never without a valid Auth session.

### Canonical command validation

The request body is the canonical command envelope from `schemas/command.schema.json`.

The gateway validates:

- JSON shape and command-specific payload;
- `idempotency_key == command_id`;
- canonical command vocabulary;
- ISO 8601 fields;
- body size and JSON content type.

Client-supplied `actor_id` and `actor_role` are untrusted claims. They are compared with the authoritative actor resolved by the gateway and cannot change persisted attribution.

### Normalized request hash

The SHA-256 `request_hash` represents client intent, not untrusted authorization claims.

The normalized hash input contains:

```text
command_id
command_type
expedition_id
idempotency_key
issued_at normalized to UTC
optional day_number
optional stage_id
optional device_id
optional day_revision
payload with recursively sorted object keys
```

`actor_id` and `actor_role` are excluded. JSON object keys are recursively sorted; array order is preserved. The result is UTF-8 canonical JSON hashed to lowercase 64-character hexadecimal SHA-256.

This allows a queued command created with stale actor-role claims to retain its idempotency identity while still being rejected for spoofing before new execution.

### Expedition and actor resolution

For a new command, the gateway loads by stable `expedition_key`:

- internal Expedition UUID and status;
- pinned runtime release;
- current stream and projection versions;
- active actor context from `private.resolve_actor_context(auth_user_id, expedition_id)`;
- current internal projection documents required by the reducer.

Authoritative actor identity is:

- Participant membership: stable `participants.participant_key`;
- Captain or Shore Operator without Participant identity: `member_<membership_uuid_without_hyphens>`.

Authoritative actor role begins with the active membership role. `Product Captain` is never inferred from membership or JWT metadata. A Participant claim of `product_captain` requires the pinned runtime bundle to verify the current Day assignment.

### Permission preflight

The command-to-actor matrix is generated from `engine/command-catalog.yaml` and committed as generated TypeScript. It is a build artifact, not a competing source of truth.

Before reducer execution, the gateway rejects:

- actor ID mismatch;
- membership-role spoofing;
- commands not allowed for the authoritative actor;
- Product Captain claims not confirmed by the pinned runtime;
- human attempts to use `system` or `system_clock`.

State-dependent permissions, assignment ownership, guards and Captain Super Admin confirmation remain reducer/runtime responsibilities.

### Runtime bundle registry

The gateway contains an explicit registry of executable TypeScript runtime bundles. A bundle declares exact immutable metadata:

```text
release_key
git_commit_sha
rules_release
content_release
reducer_version
```

A bundle is selected only when all values exactly match the Expedition-pinned `ilka.runtime_releases` row.

A runtime bundle provides:

- authoritative Product Captain resolution;
- command guards and reducer execution;
- ordered canonical events;
- complete projection mutations;
- deterministic rejection metadata.

Gate 5 intentionally registers no production reducer. Therefore a new command for an otherwise valid Expedition returns:

```text
HTTP 503
code: runtime_release_unavailable
retryable: true
```

No receipt, event or projection is written. This avoids permanently persisting a false `unsupported` rejection for a command that may become executable after Gate 6 adds the pinned reducer.

Exact persisted replay does not require the current runtime bundle.

### Atomic persistence call

For an available runtime bundle, the gateway:

1. reduces the command against the loaded authoritative context;
2. validates prepared events against `engine/event.schema.json`;
3. validates the private persistence request contract;
4. calls `private.process_command(jsonb)` through the direct database connection;
5. validates the private result contract;
6. maps the result to the public response envelope.

The gateway does not perform separate receipt, event or projection writes.

### Public outcomes

Transport status mapping:

```text
200 accepted or deterministic rejected receipt
409 stream conflict
400 malformed JSON or canonical validation failure
401 missing/invalid session
403 inactive membership, actor spoofing or permission denial
404 Expedition not found
405 method not allowed
413 request too large
415 unsupported media type
503 pinned runtime unavailable
500 internal contract or persistence failure
```

Public error responses use a stable envelope with `code`, `message`, `retryable` and optional validation details. Internal SQL, stack traces, database URLs and secrets are never returned.

### CORS

The function responds to `OPTIONS` and permits only origins in `ILKA_ALLOWED_ORIGINS`. When the variable is absent, local development origins are allowed. Wildcard credentialed CORS is prohibited.

### Offline behavior

The IndexedDB queue keeps the original `command_id` and command body.

- network failure or `runtime_release_unavailable`: remain `pending/offline`, retry with the same command ID;
- accepted: mark `synced` and refetch the authoritative projection when available;
- deterministic rejected: mark `rejected`;
- stream conflict: mark `conflict`, refetch and require explicit resolution;
- exact replay: use the original authoritative receipt.

Gate 5 does not change the canonical `offline_allowed` command set.

## Consequences

- `private` stays internal while the Edge Function can call the approved transaction boundary;
- all browser mutations have one authenticated transport;
- idempotency survives offline retries and stale actor claims;
- actor attribution is derived from current authoritative membership, not client metadata;
- executable reducer releases are explicit and immutable;
- Gate 5 can deploy safely without pretending domain reducers exist;
- Gate 6 can add the first pinned reducer/read-model vertical without changing transport or persistence contracts.

## Rejected alternatives

- exposing `private` through PostgREST;
- using the service-role REST client for internal schema RPCs;
- returning persisted receipts before validating the caller session;
- hashing client actor claims into command identity;
- trusting JWT user metadata for Expedition role or Product Captain;
- implementing command reducers in the Edge Function handler itself;
- silently using the latest reducer for an Expedition pinned to another release;
- persisting `runtime_release_unavailable` as an immutable rejected receipt;
- accepting every canonical command with placeholder events.

## Gate boundary

Included:

- authenticated `command-gateway` Edge Function;
- direct PostgreSQL service-role adapter;
- canonical JSON Schema validation;
- normalized request hashing;
- exact replay and mismatch transport;
- authoritative Expedition/member/Participant loading;
- generated command actor matrix;
- runtime bundle registry and unavailable behavior;
- prepared-result validation and `private.process_command` invocation;
- CORS, error mapping, Deno unit/integration tests and protected CI.

Excluded:

- first production reducer implementation;
- concrete `TodayView` / `CaptainDayView` generation;
- public read functions;
- seeded Day 1 cloud data;
- frontend network adapter;
- scheduler;
- Realtime;
- evidence Storage;
- pilot or production data.
