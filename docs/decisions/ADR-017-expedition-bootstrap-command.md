# ADR-017 — Expedition bootstrap through the canonical command gateway

- Status: Accepted
- Date: 2026-07-21
- Owners: Product Architecture / Backend / Engine / Security
- Extends: `ADR-012`, `ADR-014`, `ADR-015`, `ADR-016`
- Gate: 8A — Expedition bootstrap contract

## Context

The canonical Engine already defines `create_expedition` and `expedition.created`. The persistence layer already contains Profiles, Expeditions, Expedition memberships, immutable runtime releases, stream heads, projection heads, command receipts and append-only events.

The current public `command-gateway` cannot execute `create_expedition`: it resolves an existing Expedition and active membership before loading a runtime. Before the first command neither the Expedition nor the Captain membership exists.

A separate public bootstrap endpoint would violate the accepted rule that `command-gateway` is the only external domain-write transport. Direct browser inserts would bypass canonical validation, runtime pinning, idempotency and append-only history.

## Decision

### External transport

`create_expedition` remains a canonical online-only command submitted to:

```text
POST /functions/v1/command-gateway
```

No public `expedition-bootstrap` Edge Function or direct browser CRUD is introduced.

The gateway has one explicit pre-membership branch for `command_type == create_expedition`. Every other command keeps the existing active-membership path.

### User scenario

```text
authenticated Profile
→ submit create_expedition
→ validate bootstrap identity and payload
→ resolve approved default runtime release
→ run pure bootstrap reducer
→ private.bootstrap_expedition(...)
→ create draft Expedition and active Captain membership
→ initialize stream/projection heads
→ persist receipt and expedition.created event
→ return authoritative accepted/rejected result
```

### Canonical identifiers

- `command.expedition_id` is the requested stable `expedition_key` in `snake_case`;
- PostgreSQL `ilka.expeditions.id` remains an internal UUID;
- before membership exists, the client supplies its authenticated `profile_id` as `command.actor_id`;
- the gateway verifies that profile claim against the authenticated Supabase user;
- the gateway generates the new Captain membership UUID;
- the persisted command, receipt and event use the canonical Captain actor ID:

```text
member_<captain_membership_uuid_without_hyphens>
```

Client actor claims are never authoritative.

### Runtime release selection

The client does not choose a runtime release.

The gateway resolves one server-configured approved release key:

```text
ILKA_DEFAULT_RUNTIME_RELEASE_KEY
```

The exact release metadata must match a bundled runtime in the immutable runtime registry. A missing or mismatched bundle returns retryable `runtime_release_unavailable` and creates nothing.

The new Expedition is permanently pinned to that immutable release. Silent upgrades remain prohibited.

### Program configuration

The bootstrap reducer derives program constants from the selected release/configuration, not from hard-coded SQL or UI rules.

For the current MVP release:

```text
duration_days: 12
recovery_days_available: 1
```

`command.payload.duration_days` must equal the selected release program duration. This preserves the canonical command field without allowing the browser to redefine the program.

`timezone` and `day_boundary_local_time` are Captain inputs. `06:00` is the UI/default configuration, not a mandatory Engine constant. The server validates the timezone against PostgreSQL timezone names and validates local time format.

### Atomic bootstrap transaction

Add one private server-only entry point:

```text
private.bootstrap_expedition(jsonb)
```

It is a structural aggregate-initialization wrapper around the existing immutable command transaction. It does not contain independent methodology or reducer logic.

Inside one PostgreSQL transaction it:

1. validates request shape and authenticated active Profile;
2. acquires advisory locks in fixed order for `command_id` and `expedition_key`;
3. returns exact replay for the same command/hash/original Auth actor;
4. rejects command ID reuse with another payload;
5. rejects an already-used Expedition key;
6. verifies the immutable runtime release metadata;
7. inserts the draft Expedition with supplied internal UUID;
8. inserts the active Captain membership with supplied internal UUID;
9. relies on existing Expedition triggers to create stream and projection heads at version `0`;
10. invokes the existing command-persistence logic for the prepared `expedition.created` event at expected stream position `0`;
11. returns the standard authoritative command result.

Any failure rolls back the Expedition, membership, heads, receipt and event together.

### Initial state

Successful bootstrap creates exactly:

```text
expedition.status = draft
one active captain membership
stream_head.current_stream_position = 1
projection_head.current_projection_version = 0
one accepted create_expedition receipt
one expedition.created event
```

It creates no Participant rows, invitations, Rotation Plan, Product Stage, Calendar Day, assignments, Card Bundles, TodayView or CaptainDayView.

### Reducer ownership

A pure server TypeScript bootstrap reducer validates canonical Engine rules and produces only `expedition.created`.

It validates:

- authenticated active Profile;
- actor role is `captain`;
- Expedition key format;
- non-empty name;
- IANA timezone;
- selected-release program duration;
- valid local boundary time;
- no Day/Stage context on the creation command.

SQL enforces transactional integrity and uniqueness but does not generate the canonical event independently.

### Idempotency

`command_id` remains the canonical idempotency key.

- exact retry by the original authenticated actor returns the original receipt;
- same command ID with another normalized request hash is rejected;
- another command using an existing Expedition key is rejected as `expedition_key_already_exists`;
- concurrent exact retries create one Expedition, one Captain membership, one receipt and one event.

### Permissions

Any authenticated active Profile may create an Expedition and becomes its Captain.

The operation is online-only and server-confirmed. Disabled Profiles, anonymous users, system claims and attempts to create an Expedition for another Profile are rejected.

Captain authority begins only after the transaction commits the membership. Product Captain is not involved.

### Offline behavior

`create_expedition` is never written to the IndexedDB offline command queue.

The UI may preserve unsent form fields locally, but it must display the Expedition only after an authoritative accepted response. Network/authentication/runtime failures remain retryable form submission errors; they do not create local domain state.

### Public result

The command gateway returns the existing command-result envelope. The accepted receipt includes:

- command and Expedition identity;
- authoritative Auth/Profile/Captain membership identity;
- `event_ids` containing the single `expedition.created` event;
- stream position `1`;
- projection version `0`;
- pinned runtime release and reducer version.

No additional competing bootstrap result contract is introduced.

## Stable errors

```text
authentication_required
active_profile_required
profile_actor_mismatch
validation_failed
invalid_timezone
runtime_release_unavailable
expedition_key_already_exists
idempotency_key_reused_with_different_payload
bootstrap_persistence_unavailable
```

## Acceptance criteria

- `create_expedition` uses the existing public command gateway;
- no active membership is required before this command only;
- active Profile ownership is verified from Auth;
- runtime release is selected server-side and pinned immutably;
- program duration is derived from the selected configuration;
- one private atomic transaction creates Expedition, Captain membership, heads, receipt and event;
- successful stream position is `1` and projection version is `0`;
- exact retries and concurrent retries create no duplicates;
- reused command IDs and Expedition keys are rejected deterministically;
- rollback leaves no partial Expedition or membership;
- browser roles receive no direct table or private-function access;
- no Participant, invitation, rotation, Day, Stage, assignment, card or projection data is created;
- local Supabase reset, pgTAP, database lint, Deno tests and static contract checks pass.

## Explicit non-goals

- Captain Auth UI and OTP screen composition;
- invitation creation or acceptance;
- Participant membership and Participant rows;
- Rotation Plan generation;
- `start_expedition`;
- automatic Day 1 boundary;
- Stage opening, assignments or Card Bundles;
- initial TodayView or CaptainDayView;
- production or pilot data.

## Consequences

The first aggregate command becomes executable without introducing a second public write channel. The result is a valid draft Expedition with immutable creation history and a real Captain security boundary. Later Gates can add invitations, Participants, rotation and Day 1 as separate transactions and PRs.
