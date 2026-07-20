# ADR-012 — Supabase persistence, command gateway and projection model

- Status: Accepted
- Date: 2026-07-19
- Accepted: 2026-07-20
- Owners: Product Architecture / Backend / Engine / Security
- Target project: Supabase `VOYAGE` (`rehfxjlyfojkpascjtmb`)

## Context

ILKA Expedition OS already defines canonical commands, events, state transitions, permissions, reducers, offline synchronization and Participant/Captain read models. Production persistence, authentication, remote command transport, scheduler and evidence storage are not implemented.

Direct browser CRUD would duplicate Engine rules, weaken authorization and break deterministic audit. Supabase must therefore implement runtime persistence without becoming a competing source of business logic.

The initial Supabase audit confirmed that `VOYAGE` is active and healthy but contains no ILKA application schemas, domain tables, migrations, Edge Functions, Storage buckets or scheduled jobs. It remains a clean development environment.

## Decision

### Supabase role

Supabase is adopted for:

- PostgreSQL persistence;
- Supabase Auth;
- Edge Functions;
- private Storage;
- Realtime invalidation;
- scheduled Engine execution;
- generated database TypeScript types.

Supabase is below ADR, JSON Schema, Engine YAML, Stage/Card content and App contracts in source-of-truth priority.

### Environment boundary

The current `VOYAGE` project is development-only until production environment separation, backup, retention, privacy and monitoring are approved.

No production or pilot data may be placed in `VOYAGE` until those controls are approved.

### Database schemas

- `ilka` — internal domain tables and projections;
- `api` — explicitly exposed read functions and transport views;
- `private` — transaction, scheduler, authorization, replay and maintenance helpers.

`public` is not the default application schema. Implicit grants are revoked. `anon` has no access to Expedition domain data. Raw `ilka` and `private` objects are not exposed through the Data API.

### Event-sourced hybrid model

- append-only `event_log` is authoritative runtime history;
- mutable projection tables provide fast reads;
- projections are rebuildable from ordered events and canonical reducers;
- every projection records source stream position, reducer version and runtime release;
- correcting history creates a new canonical correcting event and never mutates an earlier event.

### Runtime release pinning

Every Expedition is pinned to one immutable `runtime_release_id` containing at least:

- repository commit SHA and optional release tag;
- canonical rules bundle hash;
- card/content bundle hash;
- reducer version;
- schema release version;
- creation timestamp.

The server Engine executes only the release pinned to the Expedition. A normal deployment must not silently change rules, reducers or cards for an active Expedition. In-place release upgrades are outside the first backend vertical and require a separate explicit decision and command.

### Authentication and identity

Supabase Auth provides user identity. The MVP sign-in method is email OTP.

The runtime keeps separate identifiers for:

- `auth.users.id` — authentication identity;
- `profile_id` — user profile;
- `expedition_member_id` — membership in one Expedition;
- `participant_id` — domain Participant represented in the Expedition.

Authorization is Expedition-scoped in database membership records. Membership roles are `captain`, `participant`, `shore_operator`.

`Product Captain` is not a global membership or JWT role; it is an active product-role assignment for one Expedition Day. Authorization never relies on user-editable Auth metadata.

Invitation acceptance is a separate authenticated server flow. Invitation tokens are stored hashed, expire, and cannot grant access without server validation.

### Command gateway

All external domain mutations pass through one authenticated `command-gateway` Edge Function.

The gateway:

1. validates the Supabase session;
2. resolves active Expedition membership and authoritative actor context;
3. rejects actor, membership and role spoofing from the client envelope;
4. validates the canonical Command Envelope and command payload;
5. loads the pinned runtime release and authoritative projection at a known stream position;
6. applies canonical Engine permissions, guards and reducers in the server TypeScript Engine runtime;
7. computes canonical events and projection mutations deterministically;
8. calls one private PostgreSQL transaction boundary;
9. returns the authoritative command receipt and projection metadata.

Frontend must not directly insert events or update Expedition, Day, Stage, assignments, tasks, outputs, votes, XP, ratings or completion state.

### Reducer ownership

Canonical business behavior remains owned by ADR, JSON Schema, Engine YAML, Stage/Card files and reducer specifications in the repository.

The executable server reducer is a versioned TypeScript Engine package bundled with `command-gateway`. Its generated runtime bundle is built from the immutable runtime release. SQL constraints and private functions enforce persistence integrity, ordering and authorization boundaries but do not become a parallel copy of methodology or Engine rules.

Business transitions must not be implemented through independent table triggers that duplicate reducer behavior.

### Atomic transaction boundary

`private.process_command(...)` is the single atomic persistence boundary. It is callable only by the trusted server runtime and is not exposed to browser roles.

The gateway supplies:

- the validated canonical command;
- authoritative actor context;
- `request_hash`;
- `expected_stream_position`;
- prepared canonical events;
- prepared projection mutations;
- pinned runtime release and reducer version.

Inside one PostgreSQL transaction, `private.process_command(...)`:

1. acquires an Expedition-scoped advisory lock;
2. checks for an existing command receipt;
3. verifies idempotency and request hash;
4. verifies that the current stream head equals `expected_stream_position`;
5. allocates consecutive stream positions;
6. inserts the command receipt and canonical events;
7. applies projection mutations;
8. advances stream and projection versions;
9. returns the final receipt.

If the expected stream position is stale, the function writes nothing and returns a conflict. No receipt, event or projection may be partially committed.

### Idempotency

`command_id` is the canonical idempotency key.

- same `command_id` plus the same normalized `request_hash` returns the original receipt and creates no duplicate events or side effects;
- same `command_id` plus a different request hash is rejected with `idempotency_key_reused_with_different_payload`;
- retries preserve the original result, event IDs and projection version.

### Event stream ordering

Each Expedition owns one ordered event stream.

Persistence metadata wraps the canonical event envelope and includes at least:

- `event_id`;
- `expedition_id`;
- `stream_position`;
- `command_id`;
- `event_type`;
- `occurred_at`;
- `recorded_at`;
- authoritative actor identifiers;
- `causation_id` and `correlation_id`;
- canonical event JSON;
- `runtime_release_id`;
- `reducer_version`.

`(expedition_id, stream_position)` is unique and gap-free for committed events. Ordering is assigned only inside `private.process_command(...)` while holding the Expedition lock.

### Command receipt contract

The server receipt contains at least:

- `command_id`;
- `expedition_id`;
- `command_type`;
- authoritative actor identifiers;
- `request_hash`;
- `status`: `accepted`, `rejected` or `conflict`;
- `received_at` and `processed_at`;
- ordered `event_ids`;
- resulting `stream_position` and `projection_version`;
- `runtime_release_id` and `reducer_version`;
- `rejection_code` / `rejection_message` when rejected;
- `conflict_code` when conflicted.

`pending` is a client delivery state before the authoritative receipt exists. Replayed duplicates return the original receipt with transport metadata indicating that the result was replayed.

### Offline command boundary

The persistent IndexedDB queue accepts only canonical commands with `offline_allowed: true`:

- `request_stage_advance`;
- `acknowledge_card`;
- `start_task`;
- `block_task`;
- `complete_task`;
- `confirm_output`;
- `create_decision_draft`;
- `create_vote`;
- `vote`;
- `request_day_close`.

Participant-facing sync states remain `pending`, `synced`, `conflict`, `rejected`. Server-confirmed, Captain Super Admin and system commands are never placed in the offline queue.

### RLS and grants

- every exposed `api` object validates `auth.uid()` and Expedition membership;
- `anon` receives no domain rows or functions;
- authenticated users see only permitted Expedition data;
- direct domain writes are denied;
- `ilka` and `private` schemas are not browser-exposed;
- security-definer functions use an explicit safe `search_path`;
- Captain authority remains Expedition-scoped and never allows event editing or deletion;
- banned Participants lose active Expedition access while historical attribution remains.

RLS is defense-in-depth. Schema exposure, grants and server-only transaction functions remain mandatory boundaries.

### Read models and projection transport

Backend exposes schema-valid `TodayView` and `CaptainDayView` projections and never requires the frontend to calculate Stage completion, role compatibility, Product Decision winner, XP, rating rank, completion readiness or terminal Expedition state.

The initial transport surface is:

- `POST /functions/v1/command-gateway`;
- `api.get_today_view(expedition_id)`;
- `api.get_captain_day_view(expedition_id)`;
- `api.get_command_receipt(command_id)`.

Read functions return a transport envelope containing:

- the projection JSON, validated against its canonical App schema;
- projection schema version;
- source stream position;
- projection version;
- runtime release ID;
- reducer version;
- generated timestamp.

Raw projection tables are not directly exposed. Realtime notifications cause a refetch; they never mutate projection state authoritatively.

### Calendar Day scheduler

Supabase Cron invokes a server-only `scheduled-engine` function. It evaluates Expedition timezone/boundary and submits idempotent `process_day_boundary` execution through the same Engine and transaction boundaries.

The deterministic scheduler command ID is derived from Expedition, local boundary date and day revision. Duplicate Cron invocations therefore return the same receipt.

A successful transition atomically expires prior assignments, marks overdue tasks, starts the next Calendar Day, activates roles, publishes Card Bundles, appends events and updates projections. Product Stage never advances automatically.

Scheduler tests must cover timezone boundaries, DST, suspended Expeditions, duplicate invocation, Recovery Day and Day 12.

### Storage

Private Storage is used for task/output evidence and Shore Packages.

The initial object namespace is:

`expeditions/<expedition_id>/evidence/<evidence_id>/<version>/<filename>`

Historical evidence objects are not overwritten. Replacing evidence creates a new version. Uploading a file alone does not make evidence authoritative; the related canonical command must be accepted.

Audio recording and transcription remain excluded until consent, retention, deletion and visibility rules are approved.

### Realtime

Realtime is an invalidation signal only. Clients refetch and validate authoritative projections after notification.

### Current domain coverage

The persistence model must support Product Decision voting, Recovery Day, Captain Super Admin, Role XP, Expedition Ratings and final `close_expedition`.

`close_expedition` remains Captain-only, online, server-confirmed and excluded from the offline queue.

### Migrations

All database changes are version-controlled under `supabase/migrations/`. Manual-only application changes through Supabase Studio are prohibited.

Every schema change requires migration, RLS/grant review, tests, advisor review, regenerated database types and documentation updates.

The accepted ADR authorizes controlled development migrations in local Supabase and the development-only `VOYAGE` project. It does not authorize production deployment or pilot data.

## Initial implementation sequence

1. Supabase config, schemas, default privileges and runtime release registry;
2. local `db reset` and protected Supabase CI gate;
3. Auth profiles, memberships and invitations;
4. command receipts, stream heads and append-only event log;
5. versioned server Engine runtime and canonical schema validation;
6. atomic `private.process_command(...)` boundary;
7. minimum Expedition/Day/Stage/task projections;
8. schema-valid Participant and Captain read functions;
9. first server-backed `complete_task` flow;
10. offline synchronization and conflict handling;
11. automatic Day 1 boundary, assignments and Card Bundles;
12. private evidence Storage;
13. remaining accepted domain subsystems.

## First executable vertical

`create Expedition → add 3–5 Participants → calculate Rotation Plan → start Expedition → automatic Day 1 → activate roles → publish Card Bundles → complete a task → synchronize event → update Captain projection`.

The first server integration may implement only the `complete_task` segment against seeded Day 1 data before the full creation/start flow is available, provided all data remains development-only and schema-valid.

## Consequences

- Engine rules stay centralized in canonical repository contracts.
- Every mutation is attributable and replayable.
- Offline retries are safe.
- Projection corruption can be repaired by replay.
- Active Expeditions remain pinned to immutable runtime behavior.
- Implementation complexity increases because command processing, optimistic concurrency, reducer versioning, RLS tests and rebuild tooling become mandatory.

## Rejected alternatives

- direct frontend CRUD;
- database tables as methodology source of truth;
- event log without projections;
- projections without immutable events;
- business reducers duplicated across SQL triggers;
- Product Captain stored as a global JWT/profile role;
- Realtime as authoritative synchronization;
- public evidence buckets;
- silent runtime-rule upgrades for active Expeditions;
- multi-call non-transactional event/projection persistence.

## Acceptance criteria

ADR implementation is complete when:

- migrations build from an empty local project;
- internal schemas are not exposed and `anon` has no domain access;
- cross-Expedition isolation is tested;
- all external writes pass through `command-gateway`;
- `private.process_command(...)` proves all-or-nothing persistence under conflict and failure;
- duplicate commands create no events and payload mismatch is rejected;
- events are immutable and ordered per Expedition;
- projections validate against canonical App schemas;
- replay reproduces projection state at a selected stream position;
- Day 1 boundary is idempotent and timezone-aware;
- offline outcomes are stable across retry and reconnect;
- Storage is private and evidence versions are immutable;
- generated database types exist;
- security and performance advisors contain no unresolved critical findings.

## Status transition

The Product Owner accepted the event-sourced hybrid model, `ilka` / `api` / `private` schema boundary, authenticated `command-gateway`, private transactional persistence boundary, development-only status of `VOYAGE`, email OTP MVP authentication, private Storage and deferred recordings on 2026-07-20.

`ADR-012` is therefore `Accepted`. Controlled foundation migrations may now be prepared and tested. Production deployment, production data, recordings and pilot operation remain outside this acceptance.