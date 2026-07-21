# Changelog

## 2026-07-21 — Gate 8D Expedition bootstrap release registration

- Registered `expedition_bootstrap_v1` in the exact-match Engine runtime registry.
- Pinned the release to protected Gate 8C merge commit `6175902f32a73a08476111befcb9e9be36e219bf`.
- Pinned rules release `engine_v8_permissions_v7`, content release `ilka_mvp_12_day_v5` and reducer version `expedition_bootstrap_v1`.
- Preserved release-owned program policy at 12 days and one floating Recovery Day.
- Added an immutable `ilka.runtime_releases` migration, exact registry-match tests, pgTAP immutability checks and a protected Gate 8D validator.
- Added a deployment runbook requiring `ILKA_DEFAULT_RUNTIME_RELEASE_KEY=expedition_bootstrap_v1`, JWT verification and an authenticated development smoke bootstrap.

`expedition_bootstrap_v1` is bootstrap-only and is not a pilot runtime. A runtime-composition gate is required before invitations, Participants, rotation, Expedition start or Day commands can be used by a real Expedition. Remote migration, environment configuration, Edge Function deployment and smoke verification remain separate post-merge actions.

## 2026-07-21 — Gate 8C executable Expedition bootstrap

- Added a pure TypeScript `create_expedition` reducer that derives duration and Recovery Day policy from the selected immutable runtime bundle and emits exactly one canonical `expedition.created` event.
- Added the explicit `command-gateway` pre-membership branch after authentication and exact replay but before existing Expedition membership resolution.
- Added active Profile ownership checks, server-selected `ILKA_DEFAULT_RUNTIME_RELEASE_KEY`, exact runtime matching and canonical Captain membership actor conversion.
- Added validation for the prepared event, nested `private.process_command` request and outer `private.bootstrap_expedition` request before persistence.
- Added a service-role PostgreSQL adapter that resolves Profile/runtime metadata and calls only `private.bootstrap_expedition(jsonb)` without direct domain writes.
- Added stable public mappings for Profile, runtime, idempotency, Expedition-key, timezone and persistence failures.
- Added reducer, executor, gateway-branch and local PostgreSQL integration tests plus a protected static Gate 8C validator.
- Updated `ADR-017` and the bootstrap architecture with the implementation boundary and the next immutable registration/deployment step.

Gate 8C intentionally does not register the new bootstrap runtime in `commandGatewayRuntimeRegistry`, add an immutable runtime-release row or deploy the Edge Function. Gate 8D must pin the protected Gate 8C merge SHA, configure `ILKA_DEFAULT_RUNTIME_RELEASE_KEY`, deploy and run the first authenticated development smoke bootstrap. This gate adds no Auth UI, invitation, Participant, rotation, Day 1, projection document or pilot data.

## 2026-07-21 — Gate 8B Expedition bootstrap transaction

- Added server-only `private.bootstrap_expedition(jsonb)` as the atomic aggregate-initialization wrapper accepted by `ADR-017`.
- Added fixed command-ID and Expedition-key advisory locking before reusing the existing Expedition lock inside `private.process_command(jsonb)`.
- Added exact replay for the original authenticated actor and deterministic command-ID/request-hash and Expedition-key collision errors.
- Added active Profile, IANA timezone, Captain identity, immutable runtime-release and prepared event/request consistency checks.
- Reused existing Expedition triggers for stream/projection head creation and delegated receipt/event persistence to `private.process_command(jsonb)`.
- Fixed the accepted postcondition at one draft Expedition, one active Captain membership, stream position `1`, projection version `0`, one receipt and one `expedition.created` event.
- Added pgTAP coverage for accepted bootstrap, exact replay, idempotency mismatch, duplicate key, disabled Profile, invalid timezone, missing runtime and full rollback after a process-command failure.
- Added generated database types and a protected Gate 8B transaction validator.

This subgate adds no reducer, public gateway behavior, runtime registration change, Auth/UI, invitation, Participant, rotation, Day 1, projection document, cloud migration or pilot data.

## 2026-07-21 — Gate 8A Expedition bootstrap contract

- Accepted `ADR-017` for executing canonical `create_expedition` through the existing authenticated `command-gateway` rather than a second public bootstrap endpoint.
- Defined the one pre-membership path: authenticated active Profile becomes the new Expedition Captain only after atomic commit.
- Fixed server-side runtime selection through `ILKA_DEFAULT_RUNTIME_RELEASE_KEY`; the browser cannot select or silently upgrade the Expedition runtime.
- Defined `private.bootstrap_expedition(jsonb)` as a structural wrapper around existing immutable command persistence.
- Defined exact initial state: draft Expedition, one active Captain membership, stream position `1`, projection version `0`, one accepted receipt and one `expedition.created` event.
- Added the private bootstrap request JSON Schema, architecture contract, API transport projection and protected Gate 8A validator.
- Explicitly excluded Participants, invitations, rotation, Expedition start, Day 1, Stage opening, assignments, Card Bundles and read projections.

This subgate changes contracts and architecture only. It adds no migration, reducer implementation, Edge Function behavior, runtime release row, cloud Expedition or pilot data.

## 2026-07-21 — Gate 7 offline synchronization and reconciliation

- Accepted `ADR-016` for canonical offline command delivery and authoritative projection reconciliation.
- Split the umbrella implementation into bounded subgates 7A command contract, 7B queue persistence, 7C Supabase transport, 7D Sync Engine and 7E Participant integration.
- Corrected frontend idempotency so every generated command uses `idempotency_key == command_id`.
- Extended IndexedDB queue records with attempt, settlement, stable error and compact receipt metadata while preserving the original command body.
- Added authenticated `command-gateway` HTTP transport and authoritative `api.get_today_view(...)` loader with response and identity guards.
- Added sequential FIFO, single-flight synchronization with accepted/replay, rejected, conflict, retryable and authentication outcome mapping.
- Required authoritative TodayView refetch before accepted commands become `synced`; rejected/conflict results never apply domain state optimistically.
- Added Participant startup, online-event and online-enqueue synchronization triggers.
- Kept stream conflicts terminal for the current FIFO cycle and retained pending commands after retryable/auth failures.
- Kept the service worker free of background command submission and retained settled queue records until a separate retention decision.
- Added generated CommandResult types, transport/queue/synchronizer tests and a protected Gate 7 static contract validator.

Gate 7 adds no database migration, new server reducer, Auth UI, Realtime, Background Sync API, automatic Day 1 or cloud seed data. Live execution still requires deployment of `command-gateway`, authenticated session composition and a bootstrapped Expedition with authoritative projections.

## 2026-07-20 — Gate 6 development deployment

- Applied reviewed read-model API migration `20260720223150 day1_read_model_api` to development-only `VOYAGE`.
- Applied immutable runtime registration migration `20260720223210 day1_complete_task_runtime_release`.
- Verified authenticated execution and anonymous denial for `api.get_today_view(...)`, `api.get_captain_day_view(...)` and `api.get_command_receipt(...)`.
- Verified no raw authenticated SELECT access to internal projections or command receipts.
- Verified exact runtime metadata pinned to protected reducer commit `edbfc911e9bcfddfb87a4adb6b39d21e1a5f2617`.
- Confirmed zero Profiles, Expeditions, memberships, Participants, invitations, stream heads, receipts, events and projection documents.
- Reviewed Supabase advisors: intentional deny-by-default RLS and authenticated `SECURITY DEFINER` read functions are accepted by ADR-015; informational index/FK notices are deferred to deployment readiness.

`command-gateway` remains undeployed because `SUPABASE_ACCESS_TOKEN` is not configured, so the cloud database is ready for Gate 6 but cannot yet receive real commands. No pilot or production data was created.

## 2026-07-20 — Day 1 runtime release registration

- Registered `day1_complete_task_v1` in the exact-match Engine runtime registry.
- Pinned the runtime to protected reducer implementation commit `edbfc911e9bcfddfb87a4adb6b39d21e1a5f2617`.
- Pinned rules release `engine_v8_permissions_v7_onboarding_v3`, content release `day1_content_v1` and reducer version `day1_complete_task_v1`.
- Added immutable `ilka.runtime_releases` migration metadata without changing reducer behavior.
- Added exact registry-match/mismatch tests and database release immutability tests.

This registration creates no Auth user, Expedition, membership, Participant, command, event or projection. Remote migration application and Edge Function deployment remain separate reviewed operations.

## 2026-07-20 — Day 1 `complete_task` vertical

- Accepted `ADR-015` for the first executable Day 1 reducer and authoritative read-model transport.
- Added pure TypeScript runtime `day1_complete_task_v1` implementing only canonical `complete_task`.
- Added deterministic `task.completed` and `task.completed_late` event generation with offline `occurred_at` and server `recorded_at` semantics.
- Added assignment ownership, active Expedition/Day, terminal-task and Captain ambiguity guards.
- Preserved Product Captain as an authoritative Day role assignment derived from `TodayView`, never membership or JWT metadata.
- Added complete atomic upserts for Participant `TodayView` and `CaptainDayView` with one projection-version increment.
- Added gateway validation for canonical Participant/Captain projection schemas before persistence.
- Added authenticated `api.get_today_view(...)`, Captain-only `api.get_captain_day_view(...)` and actor-owned `api.get_command_receipt(...)`.
- Preserved browser denial of raw identity, history and projection tables and prevented command-receipt enumeration.
- Added 12 new reducer/projection unit scenarios within a 36-test Deno suite, 25 new pgTAP assertions for a total of 246, and a full gateway-to-PostgreSQL vertical integration test alongside the existing adapter integration.
- Added generated database types and a protected Gate 6 static contract validator.

The implementation PR intentionally keeps the production runtime registry empty until its protected merge SHA can be pinned in an immutable `runtime_releases` row. No remote migration, runtime release, Auth user, Expedition, command, event or projection is created from this feature branch. Expedition bootstrap, invitations, rotation, Day start, initial projection generation, additional command reducers and frontend Supabase adapters remain outside this gate.

## 2026-07-20 — Supabase Command Gateway

- Accepted `ADR-014` for authenticated command transport, direct PostgreSQL access and exact pinned runtime loading.
- Added `POST /functions/v1/command-gateway` with explicit platform JWT verification and code-level Supabase Auth session verification.
- Kept `private` outside the Data API and connected through the default `SUPABASE_DB_URL` using short parameterized transactions under `SET LOCAL ROLE service_role`.
- Added canonical Command Schema validation, request-size/media-type checks, controlled CORS and stable public success/error envelopes.
- Added normalized SHA-256 request hashing that excludes client actor claims, sorts object keys recursively, preserves arrays and normalizes command timestamps to UTC.
- Added authenticated exact replay before current membership/runtime checks, restricted to the original persisted Auth actor.
- Added request-hash/Expedition mismatch rejection without persistence.
- Added authoritative Expedition membership and Participant actor resolution; human `system`/`system_clock` claims are denied.
- Kept Product Captain as a runtime-verified Day assignment rather than a JWT or membership role.
- Added generated command actor metadata from `engine/command-catalog.yaml` without creating a competing permission source.
- Added exact runtime-bundle registry matching release key, Git commit, rules release, content release and reducer version.
- Added canonical event, private transaction-request and private transaction-result validation around `private.process_command(jsonb)`.
- Added a committed Deno lockfile, formatting, lint, strict typecheck, 24 unit tests and direct local PostgreSQL integration to protected CI.
- Added a static Command Gateway contract validator while preserving all earlier repository, frontend, pgTAP, database lint and Supabase contract gates.

Gate 5 intentionally registers no production reducer bundle. New valid commands return retryable `runtime_release_unavailable` without creating a receipt, event or projection. This gate does not add concrete Participant/Captain read models, public read functions, a frontend network adapter, cloud fixtures, scheduler, Realtime, Storage, pilot data or production data. Remote Edge Function deployment remains blocked until the implementation PR and protected CI are green. The next gate is the first vertical Engine runtime and read-model slice.

## 2026-07-20 — Supabase Atomic Command Transaction deployment

- Applied the reviewed Atomic Command Transaction migration to development-only `VOYAGE` (`rehfxjlyfojkpascjtmb`).
- Recorded remote migration version `20260720185027` with migration name `atomic_command_transaction`.
- Deployed `ilka.projection_heads`, `ilka.projection_documents`, `private.process_command(jsonb)` and the internal projection-head/receipt-result helpers.
- Verified forced RLS, browser denial, SELECT-only projection access for `service_role`, no direct projection writes and no `service_role` access to the internal serializer.
- Verified the Expedition projection-head initialization trigger.
- Confirmed that all identity, history and projection tables remain empty.

This development deployment does not add `command-gateway`, TypeScript reducers, concrete read models, public API functions, frontend transport, Realtime, scheduler, Storage, pilot data or production data. The next gate is Command Gateway.

## 2026-07-20 — Supabase Atomic Command Transaction

- Accepted `ADR-013` for one private command transaction and a neutral projection-document persistence substrate.
- Added version-controlled request and result JSON Schemas for `private.process_command(jsonb)`.
- Added one `ilka.projection_heads` row per Expedition with a monotonic Expedition-wide projection version.
- Added versioned `ilka.projection_documents` for complete rebuildable JSON read documents.
- Added transaction-scoped command and Expedition advisory locks in a fixed order.
- Added exact replay before current actor validation, preserving the original accepted or rejected receipt.
- Added unpersisted request-hash mismatch rejection and stale stream-position conflict results.
- Added persisted deterministic rejected receipts without event or projection version changes.
- Added atomic accepted-command persistence for receipt, consecutive canonical events and projection upserts.
- Added actor-context and pinned runtime-release integrity checks without duplicating Engine permissions or reducers.
- Added complete rollback coverage when projection persistence fails after receipt and event insertion.
- Denied browser execution and direct `service_role` projection writes while granting only the private transaction entry point.
- Added pgTAP coverage, generated database type validation, architecture documentation and a protected static contract gate.

This gate does not add `command-gateway`, TypeScript reducers, concrete Participant/Captain read models, public API functions, frontend transport, Realtime, scheduler, Storage, pilot data or production data. Remote migration application remains blocked until protected CI is green. The next gate is Command Gateway.

## 2026-07-20 — Supabase Immutable History deployment

- Applied the reviewed Immutable History migration to development-only `VOYAGE` (`rehfxjlyfojkpascjtmb`).
- Recorded remote migration version `20260720175753` with migration name `immutable_history`.
- Deployed `ilka.stream_heads`, `ilka.command_receipts`, `ilka.event_log` and the private integrity helpers for idempotency, expected stream position, ordered event sets and immutable corrections.
- Verified enabled and forced RLS on all three history tables.
- Verified no raw history access for `anon` or `authenticated`.
- Verified that `service_role` has internal SELECT access but no direct INSERT, UPDATE or DELETE privilege on history tables.
- Verified that only `service_role` can execute the private idempotency and stream-position helpers.
- Confirmed that all Profile, Expedition, membership, Participant, invitation, stream-head, command-receipt and event-log tables remain empty.

This development deployment does not add `private.process_command(...)`, projections, Edge Functions, command transport, pilot data or production data. The next backend gate is the atomic command transaction.

## 2026-07-20 — Supabase Immutable History

- Added one `ilka.stream_heads` row per Expedition with automatic initialization at stream position `0`.
- Added immutable `ilka.command_receipts` keyed by canonical `command_id` and 32-byte SHA-256 `request_hash`.
- Added append-only `ilka.event_log` with unique, gap-free `(expedition_id, stream_position)` ordering.
- Added reusable private helpers for command idempotency and expected stream-position conflict detection.
- Added ordered receipt-to-event-set validation, including a deferred constraint that prevents partial accepted command persistence.
- Added same-Expedition correction-event references that preserve the original event unchanged.
- Added UPDATE, DELETE and TRUNCATE protection for command receipts and events.
- Denied raw browser access and direct `service_role` history writes while retaining trusted internal SELECT access.
- Reconciled `engine/event-catalog.yaml` with accepted `ADR-012`: persisted replay now uses `stream_position`; canonical fixture arrays preserve explicit array order.
- Added pgTAP coverage, generated-type validation, architecture documentation and a protected static contract gate.

At completion of the implementation PR, remote application remained blocked until protected CI was green. The later reviewed development deployment is recorded above. This gate does not add `private.process_command(...)`, advisory command locking, projections, Edge Functions, API read functions or production data.

## 2026-07-20 — Supabase Identity and Expedition Membership deployment

- Applied the reviewed Identity and Expedition Membership migration to development-only `VOYAGE` (`rehfxjlyfojkpascjtmb`).
- Recorded remote migration version `20260720162648` with migration name `identity_membership`.
- Deployed `ilka.profiles`, `ilka.expeditions`, `ilka.expedition_members`, `ilka.participants` and `ilka.invitations` plus server-only actor-resolution helpers and Auth/Profile triggers.
- Verified forced RLS on all five tables, no raw table access for `anon` or `authenticated`, no direct DELETE privilege for `service_role`, and no browser execution privilege on `private.resolve_actor_context(...)`.
- Confirmed that all five identity tables remain empty and that no ILKA pilot data, command gateway, command receipts, event log, projections, Edge Functions, scheduler jobs or Storage buckets were introduced.

This development deployment does not authorize production or pilot operation. The next persistence gate remains immutable history: stream heads, command receipts and append-only event log.

## 2026-07-20 — Supabase Identity and Expedition Membership

- Added Auth-linked `ilka.profiles` while preserving Profile identity after Auth-user deletion.
- Added runtime-release-pinned `ilka.expeditions` using canonical Expedition status vocabulary.
- Added Expedition-scoped `ilka.expedition_members` with `captain`, `participant` and `shore_operator` roles.
- Enforced at most one active Captain per Expedition and one membership per Profile and Expedition.
- Added separate domain `ilka.participants` identities restricted to participant memberships and order positions 1–5.
- Added expiring `ilka.invitations` that persist only normalized email and 32-byte SHA-256 token hashes.
- Added terminal invitation transitions and immutable invitation identity fields.
- Added server-only `private.resolve_actor_context(...)` for active, Expedition-scoped actor resolution.
- Added forced RLS, explicit no-delete service grants and pgTAP coverage for Auth/Profile lifecycle, cross-Expedition isolation, bans, Captain uniqueness and invitation security.
- Added a dedicated static contract validator and protected CI gate.

At completion of the implementation PR, remote application remained blocked until protected CI was green. The later reviewed development deployment is recorded above.

## 2026-07-20 — Supabase Foundation deployment

- Applied the reviewed Supabase Foundation to the development-only cloud project `VOYAGE` (`rehfxjlyfojkpascjtmb`).
- Recorded remote migration version `20260720142526` with migration name `foundation`.
- Preserved Data API exposure limited to `api`; internal schemas `ilka` and `private` remain unavailable to browser roles.
- Deployed only the Foundation boundary: schemas, explicit grants and immutable `ilka.runtime_releases`.
- Confirmed that no ILKA pilot data, Auth membership model, command gateway, command receipts, event log, projections, Edge Functions, scheduler jobs or Storage buckets were introduced.

This development deployment does not authorize production or pilot operation. The next backend gate remains identity and Expedition membership.

## 2026-07-20 — Supabase Foundation

- Added reproducible local Supabase CLI configuration on PostgreSQL 17.
- Limited the Data API exposed schema list to `api`.
- Added internal `ilka` and `private` schemas with explicit grants and revoked implicit domain access.
- Added immutable `ilka.runtime_releases` with rules, content, reducer and exact Git commit pinning.
- Added 25 pgTAP foundation assertions for schema boundaries, privileges and release immutability.
- Added database linting, migration replay and generated database type parity to protected `contracts-and-tests` CI.
- Added generated TypeScript database contracts for `api`, `ilka` and `private`.
- Added a static Supabase Foundation contract validator and local runtime documentation.

At completion of the implementation PR, no Supabase migration had been applied to the cloud `VOYAGE` project. The later reviewed development deployment is recorded above.

## 2026-07-20 — Supabase runtime architecture

- Audited the development-only Supabase `VOYAGE` project and confirmed that no ILKA application schemas, domain tables, migrations, Edge Functions, Storage buckets or scheduled jobs have been applied.
- Accepted `ADR-012` for the event-sourced hybrid Supabase runtime.
- Fixed `command-gateway` as the only external domain write path.
- Fixed `private.process_command(...)` as the single atomic PostgreSQL persistence boundary.
- Assigned canonical reducer execution to a versioned server TypeScript Engine runtime rather than SQL business triggers.
- Formalized Expedition stream ordering, command receipts, request-hash idempotency, conflict behavior and immutable runtime release pinning.
- Selected email OTP as the MVP authentication flow.
- Formalized schema-valid Participant/Captain projection transport, Realtime invalidation-only behavior and private versioned evidence storage.
- Added `docs/architecture/supabase-runtime.md` with the implementation sequence and Supabase Foundation gate.

No Supabase migrations had been applied. `VOYAGE` remained development-only and contained no domain data.

## 2026-07-20 — Frontend Foundation

- Added the Frontend Foundation audit and acceptance gate.
- Added deterministic frontend dependency installation through `frontend/package-lock.json`.
- Extended protected `contracts-and-tests` CI with design/contract generation, source validation, frontend tests, strict TypeScript, production build, static preview build and generated-source parity.
- Repaired the malformed `xp_summary_card.states` entry in the canonical component catalog.
- Replaced `localStorage` queue persistence with an idempotent IndexedDB command queue and memory fallback.
- Added Participant command delivery overlays for `pending`, `synced`, `conflict`, `rejected` and `offline` without changing authoritative task/card state.
- Added schema-valid Day 1 Participant, Captain initial and Captain after-sync preview projections.
- Bound Day 1 cards, outputs and role assignments to canonical stage and sample-event sources in validation.
- Added an installable PWA manifest, projection-safe service worker and offline fallback.
- Completed the Frontend Foundation gate on protected `main`.

No Supabase migrations had been applied. ADR-012 was Proposed at completion of this gate.

## 2026-07-20 — Canonical baseline

- Completed the controlled canonical repository bootstrap.
- Restored and validated the canonical `examples/sample-events.json` event stream.
- Aligned Participant role projection requirements with canonical contracts.
- Added manual `workflow_dispatch` support to the repository validation workflow.
- Passed the canonical repository validator and the complete pytest suite in GitHub Actions.
- Created `main` from the verified canonical baseline commit.

Canonical baseline commit before this changelog entry: `98a545b36fe62d5f08b0c00b3042cc3d87e4ba1a`.

No Supabase migrations had been applied. ADR-012 was Proposed at completion of this gate.

## 2026-07-19

- Initialized the GitHub repository.
- Added project instructions and source-of-truth map.
- Added proposed ADR-012 for Supabase runtime architecture.
- Added the canonical pipeline, permissions and role-rotation rules.
- Started controlled migration from the canonical Google Drive project folder.

No Supabase migrations had been applied. ADR-012 was Proposed.
