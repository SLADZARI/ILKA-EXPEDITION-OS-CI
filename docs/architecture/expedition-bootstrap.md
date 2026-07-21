# Expedition bootstrap architecture

Status: Gate 8C implementation under accepted `ADR-017`; runtime registration and deployment remain Gate 8D.

## Purpose

Create the first Expedition aggregate without introducing a second public write endpoint or direct browser table access.

## Existing canonical entities

```text
command: create_expedition
event: expedition.created
aggregate state: null → draft
membership role: captain
public write transport: command-gateway
history: command_receipts + event_log
```

No parallel bootstrap command, event or public endpoint is introduced.

## Gateway branch

After canonical schema validation, request hashing, Supabase Auth verification and exact receipt replay:

```text
if command_type == create_expedition:
  pre-membership bootstrap path
else:
  existing active-membership command path
```

The bootstrap path:

1. resolves the authenticated active Profile;
2. verifies `command.actor_id` is that Profile ID and `actor_role` is `captain`;
3. resolves `ILKA_DEFAULT_RUNTIME_RELEASE_KEY`;
4. requires an exact runtime-registry match;
5. derives release-owned program configuration;
6. generates internal Expedition and Captain membership UUIDs;
7. replaces client actor claims with the canonical membership actor ID;
8. runs the pure `create_expedition` reducer;
9. validates the single prepared `expedition.created` event;
10. validates the nested private process request;
11. validates `private-bootstrap-expedition-request.schema.json`;
12. calls `private.bootstrap_expedition(jsonb)`;
13. validates the authoritative result;
14. returns the standard command result or a stable public error.

All non-bootstrap commands continue through the existing membership/runtime path unchanged.

## Identity model

Before creation:

```text
auth.users.id
└── ilka.profiles.id
```

After successful creation:

```text
auth.users.id
└── ilka.profiles.id
    └── ilka.expedition_members.id [role=captain, status=active]
        └── ilka.expeditions.id / expedition_key
```

Captain is not inserted into `ilka.participants`. Participant identity remains a later invitation/acceptance flow.

## Canonical actor conversion

Incoming bootstrap command:

```text
actor_id = authenticated profile UUID
actor_role = captain
```

Persisted command/event:

```text
actor_id = member_<membership_uuid_without_hyphens>
actor_role = captain
actor_auth_user_id = authenticated Auth user
actor_profile_id = resolved Profile
actor_membership_id = created Captain membership
actor_participant_id = null
```

The client cannot choose the persisted membership actor identity.

## Runtime and program policy

The gateway, not the browser, selects the approved runtime release.

Runtime bundle bootstrap policy contains at least:

```text
release_key
runtime metadata
duration_days
recovery_days_available
```

The current configured program resolves to 12 days and one floating Recovery Day. SQL receives derived values but does not decide methodology.

The Captain supplies:

```text
expedition_key
name
timezone
day_boundary_local_time
```

The command keeps `duration_days` for canonical compatibility, but the reducer requires equality with release-owned configuration.

The Gate 8C implementation adds a pure runtime factory, but does not register it in the production static registry. This is intentional: immutable registry metadata must reference a protected merge SHA containing the implementation. Gate 8D owns that exact registration.

## Private request

`private.bootstrap_expedition(jsonb)` receives:

```text
expedition
captain_membership
process_command_request
```

The nested process request is already canonical and contains:

```text
expected_stream_position = 0
status = accepted
one expedition.created event
zero projection mutations
captain actor context
pinned runtime release
```

Cross-field equality not expressible in JSON Schema is enforced by the private function:

- Expedition UUID and runtime release match the nested process request;
- Expedition key matches command and event `expedition_id`;
- created-by Profile matches Captain membership Profile and actor context;
- Captain membership ID matches actor context and canonical actor ID;
- payload fields match inserted Expedition fields;
- event command ID and request hash match the request.

## Lock order

The private function uses a fixed lock order:

```text
1. command lock: ilka:command:<command_id>
2. Expedition-key lock: ilka:expedition-key:<expedition_key>
3. existing private.process_command Expedition UUID lock
```

This serializes exact retries, command-ID misuse and competing creation attempts for the same key.

## Transaction sequence

```text
BEGIN
  validate request
  acquire command/key locks
  check existing receipt
  check Expedition key uniqueness
  validate active Profile and runtime release
  insert ilka.expeditions(status=draft)
    → existing trigger inserts stream_head(position=0)
    → existing trigger inserts projection_head(version=0)
  insert active Captain membership
  call private.process_command(process_command_request)
    → accepted receipt
    → expedition.created at stream_position=1
  return standard result
COMMIT
```

No independent SQL event construction is allowed.

## Replay and errors

### Exact replay

If `command_id`, request hash and original authenticated actor match an existing receipt, the common gateway replay path returns the persisted result before current Profile, membership or runtime checks.

A concurrent retry that passes the first lookup is serialized inside `private.bootstrap_expedition(jsonb)` and returns the same persisted result.

### Command-ID mismatch

Same `command_id` with another request hash returns:

```text
idempotency_key_reused_with_different_payload
```

### Expedition-key collision

Another command for an existing key returns:

```text
expedition_key_already_exists
```

No rejected receipt is persisted before an aggregate exists. Pre-aggregate validation, profile, runtime and key-collision failures are public gateway errors and write nothing.

### Retryable failures

Authentication service, runtime availability or persistence outages return retryable public errors. The browser may retry the same command ID and body.

## Postconditions

Accepted bootstrap guarantees:

```text
1 Expedition row
1 active Captain membership
1 stream head at position 1
1 projection head at version 0
1 accepted receipt
1 expedition.created event
0 Participants
0 invitations
0 projection documents
```

## Security

- `anon` cannot execute bootstrap;
- `authenticated` cannot execute `private.bootstrap_expedition` directly;
- browser roles retain no INSERT/UPDATE/DELETE grants on internal tables;
- only trusted `service_role` runtime may execute the private function;
- `search_path` is empty inside the security-definer function;
- Profile and Auth ownership are checked by the gateway and rechecked inside PostgreSQL;
- runtime release pinning is checked by the exact registry and rechecked inside PostgreSQL;
- a human cannot submit `system` or `system_clock` bootstrap claims;
- Product Captain has no role in Expedition creation.

## Offline and UI

The operation is online-only. A create form can save draft input locally, but it cannot add a local Expedition aggregate or use `OfflineCommandQueue`.

UI states for this gate are transport-only:

```text
idle
submitting
accepted
retryable_error
rejected
```

The next UI/Auth gate owns the actual screen composition.

## Gate 8C implementation map

```text
supabase/functions/_shared/engine-runtime/expedition-bootstrap-v1.ts
  pure reducer and release-owned bootstrap policy

supabase/functions/_shared/command-gateway/bootstrap.ts
  Profile/runtime resolution, actor conversion, contract validation and execution

supabase/functions/_shared/command-gateway/bootstrap-database.ts
  service-role reads and private.bootstrap_expedition(jsonb) call

supabase/functions/_shared/command-gateway/bootstrap-schema-validation.ts
  outer private request schema validation

supabase/functions/_shared/command-gateway/handler.ts
  explicit pre-membership branch after auth and exact replay

supabase/functions/command-gateway/index.ts
  environment and executor wiring
```

The implementation keeps the existing `PostgresGatewayDatabase`, normal command path and registered Day 1 runtime unchanged.

## Gate 8D boundary

Gate 8D begins only after Gate 8C is merged and its protected merge SHA is known. It must:

- register an immutable bootstrap-capable runtime release pinned to that protected SHA;
- add the bundle to `commandGatewayRuntimeRegistry` with exact metadata;
- set `ILKA_DEFAULT_RUNTIME_RELEASE_KEY`;
- deploy the reviewed Edge Function and runtime metadata;
- run an authenticated development smoke test;
- verify one Expedition, one Captain membership, one receipt and one event;
- avoid creating Participants, invitations, Day 1 data or pilot fixtures.

## Tests required by implementation gates

- valid reducer output;
- active Profile ownership and Profile actor mismatch;
- exact runtime metadata match and unavailable runtime;
- invalid timezone and duration mismatch;
- gateway branch before membership lookup;
- valid private bootstrap request construction;
- accepted transaction result;
- exact replay;
- concurrent exact replay;
- command-ID payload mismatch;
- Expedition-key collision;
- transaction rollback after Expedition insert;
- no direct browser/private access;
- zero Participant/invitation/projection-document side effects;
- event schema validity and stream position `1`;
- projection head remains `0`.
