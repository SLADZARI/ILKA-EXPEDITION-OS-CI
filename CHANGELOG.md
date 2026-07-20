# Changelog

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

This gate does not add `command-gateway`, TypeScript reducers, concrete Participant/Captain read models, public API functions, frontend transport, Realtime, scheduler, Storage, pilot data or production data. Remote migration application remains blocked until the implementation PR and protected CI are green. The next gate is Command Gateway.

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
