# ADR-012 — Supabase persistence, command gateway and projection model

- Status: Proposed
- Date: 2026-07-19
- Owners: Product Architecture / Backend / Engine / Security
- Target project: Supabase `VOYAGE` (`rehfxjlyfojkpascjtmb`)

## Context

ILKA Expedition OS already defines canonical commands, events, state transitions, permissions, reducers, offline synchronization and Participant/Captain read models. Production persistence, authentication, remote command transport, scheduler and evidence storage are not implemented.

Direct browser CRUD would duplicate Engine rules, weaken authorization and break deterministic audit. Supabase must therefore implement runtime persistence without becoming a competing source of business logic.

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

### Database schemas

- `ilka` — internal domain tables and projections;
- `api` — explicitly exposed read views/functions;
- `private` — scheduler, authorization and maintenance helpers.

`public` is not the default application schema. Implicit grants are revoked. `anon` has no access to Expedition domain data.

### Event-sourced hybrid model

- append-only `event_log` is authoritative runtime history;
- mutable projection tables provide fast reads;
- projections are rebuildable from ordered events and canonical reducers;
- every projection records source stream position, reducer version and rules/content release.

### Command gateway

All domain mutations pass through one server-side `command-gateway` Edge Function.

The gateway:

1. validates the Supabase session;
2. resolves active Expedition membership;
3. derives authoritative actor permissions;
4. rejects actor-role spoofing;
5. validates the canonical Command Envelope and payload;
6. applies Engine guards;
7. enforces `command_id` idempotency;
8. appends canonical events;
9. applies reducers transactionally;
10. returns the authoritative command receipt and projection version.

Frontend must not directly insert events or update Expedition, Day, Stage, assignments, tasks, outputs, votes, XP, ratings or completion state.

### Idempotency

`command_id` is the idempotency key. Repeating the same command returns the original result and creates no duplicate events or side effects.

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

Participant-facing sync states remain `pending`, `synced`, `conflict`, `rejected`.

### Authentication and membership

Supabase Auth provides identity. Authorization is Expedition-scoped in database membership records.

Membership roles are `captain`, `participant`, `shore_operator`.

`Product Captain` is not a global membership role; it is an active product-role assignment for a specific Expedition Day.

Authorization must not rely on user-editable metadata.

### RLS

- every exposed object has RLS;
- `anon` receives no domain rows;
- authenticated users see only permitted Expedition rows;
- direct domain writes are denied;
- Captain authority remains Expedition-scoped and never allows event editing/deletion;
- banned Participants lose active Expedition access while historical attribution remains.

### Read models

Backend exposes schema-valid `TodayView` and `CaptainDayView` projections. Frontend does not derive Stage completion, role compatibility, Product Decision winner, XP, rating rank, completion readiness or terminal Expedition state.

### Calendar Day scheduler

Supabase Cron invokes a server-only `scheduled-engine` function. It evaluates Expedition timezone/boundary and submits idempotent `process_day_boundary` execution.

A successful transition atomically expires prior assignments, marks overdue tasks, starts the next Calendar Day, activates roles, publishes Card Bundles, appends events and updates projections.

Product Stage never advances automatically.

### Storage

Private Storage is used for task/output evidence and Shore Packages. Uploading a file alone does not make evidence authoritative; the related canonical command must be accepted.

Audio recording and transcription remain excluded until consent, retention, deletion and visibility rules are approved.

### Realtime

Realtime is an invalidation signal only. Clients refetch and validate authoritative projections after notification.

### Current domain coverage

The persistence model must support Product Decision voting, Recovery Day, Captain Super Admin, Role XP, Expedition Ratings and final `close_expedition`.

`close_expedition` remains Captain-only, online, server-confirmed and excluded from the offline queue.

### Migrations

All database changes are version-controlled under `supabase/migrations/`. Manual-only production changes through Supabase Studio are prohibited.

Every schema change requires migration, RLS/grant review, tests, advisor review, regenerated database types and documentation updates.

## Initial implementation sequence

1. schemas and default privileges;
2. Auth profiles, memberships and invitations;
3. command receipts and append-only event log;
4. command gateway and schema validation;
5. Expedition/Day/Stage projections;
6. Participant and Captain read models;
7. RLS tests;
8. automatic Day 1 boundary;
9. assignments and Card Bundles;
10. offline synchronization;
11. private evidence Storage;
12. remaining accepted domain subsystems.

## First executable vertical

`create Expedition → add 3–5 Participants → calculate Rotation Plan → start Expedition → automatic Day 1 → activate roles → publish Card Bundles → complete a task → synchronize event → update Captain projection`.

## Consequences

- Engine rules stay centralized in canonical repository contracts.
- Every mutation is attributable and replayable.
- Offline retries are safe.
- Projection corruption can be repaired by replay.
- Implementation complexity increases because command processing, reducer versioning, RLS tests and rebuild tooling become mandatory.

## Rejected alternatives

- direct frontend CRUD;
- database tables as methodology source of truth;
- event log without projections;
- projections without immutable events;
- Product Captain stored as a global JWT/profile role;
- Realtime as authoritative synchronization;
- public evidence buckets.

## Acceptance criteria

ADR implementation is complete when migrations build from an empty project, internal schemas are not exposed, `anon` has no domain access, cross-Expedition isolation is tested, all writes pass through `command-gateway`, duplicates create no events, events are immutable, projections validate, Day 1 is idempotent/timezone-aware, offline outcomes are stable, Storage is private, replay reproduces state, generated types exist and critical advisor findings are resolved.

## Status transition

This ADR remains `Proposed` until the Product Owner accepts the event-sourced hybrid model, schema boundary, command gateway, development-only status of `VOYAGE`, private Storage and deferred recordings. No Supabase migration should be applied before acceptance.
