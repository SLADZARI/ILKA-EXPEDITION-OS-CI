# ILKA Expedition OS

Configuration-driven, offline-first role-card system for a 12-day team product expedition on a yacht.

## Product layers

1. **Methodology** — stages, roles, cards, required outputs, checklists and Definition of Done.
2. **Engine** — states, transitions, rotation, permissions, validation, synchronization and append-only event log.
3. **Interfaces** — Participant App, Captain Console and AI Shore Team.

## Canonical baseline

- automatic Calendar Day boundary in the Expedition timezone;
- Calendar Day and Product Stage are separate projections;
- canonical `snake_case` command IDs;
- Product Captain manages the product process but has no vessel safety authority;
- Captain is Expedition-scoped Super Admin;
- sequential Captain-confirmed Product Stage progression;
- one floating Recovery Day;
- attributable Product Decision voting;
- Role XP and load-normalized Expedition Ratings;
- final `demo_day` and Captain-only `close_expedition`;
- append-only events and deterministic reducers;
- offline command queue with idempotent synchronization.

## Source-of-truth priority

1. `docs/decisions/ADR-*`
2. `schemas/*.json` and `engine/event.schema.json`
3. `engine/*.yaml`
4. `stages/*.yaml` and `cards/**/*`
5. `app/` contracts and requirements
6. examples and tests
7. frontend implementation
8. Supabase runtime implementation

## Repository structure

```text
app/            UI requirements and read-model contracts
cards/          canonical card content
engine/         state, command, event, permission and rotation rules
frontend/       React/TypeScript PWA
schemas/        canonical JSON Schemas
stages/         product stages
supabase/       migrations, tests and Edge Functions
tests/          validation and executable domain tests
docs/           ADR, architecture and workflows
design-system/  tokens and stable component IDs
```

## Runtime direction

- Frontend hosting: Vercel
- Backend: Supabase
- Offline data: IndexedDB + service worker
- Domain writes: authenticated Supabase `command-gateway`
- Atomic persistence: server-only `private.process_command(...)`
- Runtime history: append-only Expedition-scoped `event_log`
- Reads: schema-valid Participant and Captain projections
- Realtime: invalidation and refetch only
- Cloudflare: not required for the MVP

## Current implementation status

The canonical baseline is protected on `main` and published as `v0.1.0-canonical-baseline`.

Frontend Foundation is complete:

- deterministic `npm ci` through a committed lockfile;
- generated design-system and TypeScript contracts checked against canonical sources;
- protected CI runs repository validation, Python tests, frontend tests, strict TypeScript and both production/preview builds;
- IndexedDB is the primary offline command queue with idempotent enqueue and in-memory fallback;
- Participant UI renders `pending`, `synced`, `conflict`, `rejected` and `offline` delivery state without calculating authoritative outcomes;
- schema-valid Day 1 Participant and Captain preview scenarios are tied to canonical stage, output and assignment sources;
- installable PWA metadata and a projection-safe service worker are present.

`ADR-012` is accepted. The backend runtime is fixed as an event-sourced hybrid with immutable events, rebuildable projections, email OTP identity, Expedition-scoped membership, one authenticated command gateway and one atomic PostgreSQL transaction boundary.

Supabase Foundation is complete locally:

- reproducible Supabase CLI configuration on PostgreSQL 17;
- Data API exposure limited to `api`;
- internal `ilka` and `private` schemas;
- explicit schema, table and default privileges;
- immutable `ilka.runtime_releases` registry;
- pgTAP database tests and database linting in protected CI;
- generated TypeScript types for `api`, `ilka` and `private` checked for deterministic parity.

The reviewed Foundation has also been deployed to the development-only cloud Supabase project `VOYAGE` (`rehfxjlyfojkpascjtmb`) under remote migration version `20260720142526` (`foundation`). The Data API remains limited to `api`; `ilka` and `private` stay internal.

Identity and Expedition Membership are complete locally and deployed to development:

- Auth-linked Profiles preserve domain attribution independently from `auth.users` lifecycle;
- Expeditions pin one immutable runtime release;
- membership roles are Expedition-scoped `captain`, `participant` and `shore_operator`;
- domain Participants remain separate from Profiles and memberships;
- invitation tokens are stored only as expiring SHA-256 hashes;
- trusted server code resolves active actor context through `private.resolve_actor_context(...)`;
- banned and cross-Expedition actors resolve no active context;
- browser roles receive no direct access to identity tables or private helpers.

The reviewed identity migration is deployed to development-only `VOYAGE` as remote migration `20260720162648` (`identity_membership`). All five identity tables use forced RLS, `anon` and `authenticated` have no raw table access, `service_role` has no direct DELETE privilege, and the actor resolver is unavailable to browser roles. The tables remain empty: no ILKA profiles, Expeditions, memberships, Participants or invitations were created.

Immutable History is complete locally and deployed to development:

- each Expedition receives a stream head at position `0`;
- accepted command receipts declare ordered canonical event IDs and resulting stream position;
- `command_id` plus SHA-256 `request_hash` supports new/replay/mismatch detection;
- canonical events append consecutively to an Expedition-scoped `event_log`;
- a deferred constraint prevents accepted receipts from committing with a partial event set;
- correction events reference earlier events in the same Expedition and preserve the original event;
- UPDATE, DELETE and TRUNCATE are blocked for receipts and events;
- persisted replay order is authoritative by `stream_position`, not by timestamps;
- browser roles and direct `service_role` history writes remain denied.

The reviewed history migration is deployed to development-only `VOYAGE` as remote migration `20260720175753` (`immutable_history`). Forced RLS is enabled on `stream_heads`, `command_receipts` and `event_log`; `anon` and `authenticated` have no raw access; `service_role` has SELECT but no direct INSERT, UPDATE or DELETE; only trusted private idempotency and stream-position helpers are executable by `service_role`. Identity and history tables remain empty.

Atomic Command Transaction is complete locally and deployed to development under accepted `ADR-013`:

- `private.process_command(jsonb)` is the only trusted persistence call for prepared Engine results;
- command and Expedition advisory locks serialize idempotency and stream updates;
- exact retries return the original immutable receipt;
- reused command IDs with another request hash write nothing;
- stale stream positions return `conflict` without persistence;
- deterministic `rejected` results may be stored without advancing versions;
- accepted commands atomically insert receipt, ordered events and versioned projection documents;
- one Expedition-wide projection version advances once per projection-writing command;
- projection persistence failure rolls back receipt, events and both heads;
- browser roles and direct `service_role` writes remain denied.

The reviewed atomic transaction migration is deployed to development-only `VOYAGE` as remote migration `20260720185027` (`atomic_command_transaction`). Forced RLS is enabled on `projection_heads` and `projection_documents`; `anon` and `authenticated` cannot read internal projections or execute `private.process_command(jsonb)`; `service_role` can execute only the approved transaction entry point and SELECT internal projection state, with no direct INSERT, UPDATE or DELETE. The projection-head trigger is installed, and all identity, history and projection tables remain empty.

Command Gateway is complete locally under accepted `ADR-014`:

- `POST /functions/v1/command-gateway` is the only external domain-write transport;
- platform JWT verification and code-level Supabase Auth verification are both required;
- `private` remains outside the Data API;
- the Edge Function connects through `SUPABASE_DB_URL` and executes parameterized transactions under `SET LOCAL ROLE service_role`;
- canonical Command Schema validation and normalized SHA-256 request hashing run before execution;
- exact replay requires the original authenticated actor but not current membership or runtime availability;
- current Expedition membership and Participant identity determine authoritative actor attribution;
- Product Captain is verified only by the pinned Engine runtime;
- command actor metadata is generated from `engine/command-catalog.yaml`;
- prepared events and private request/result contracts are validated before and after `private.process_command(jsonb)`;
- CORS, body limits and stable public error envelopes are implemented;
- Deno unit tests and direct local PostgreSQL integration are protected CI gates.

Gate 5 originally shipped with an empty runtime registry. Gate 6 now supplies the first exact pinned runtime bundle; cloud execution still requires the reviewed read-model/runtime migrations and deployment of `command-gateway`.

Gate 6 implementation is complete locally under accepted `ADR-015`:

- `day1_complete_task_v1` is the first pure executable TypeScript Engine reducer;
- `complete_task` produces canonical `task.completed` or `task.completed_late` events;
- Participant and Product Captain ownership is resolved from authoritative `TodayView`; Product Captain is not a membership/JWT role;
- Captain without an explicit Participant assignment target receives deterministic `task_target_ambiguous_for_captain`;
- accepted commands atomically update both `today_view:<participant_key>` and `captain_day_view` documents;
- every prepared event and projection is schema-validated before `private.process_command(jsonb)`;
- `api.get_today_view(...)`, `api.get_captain_day_view(...)` and `api.get_command_receipt(...)` provide authenticated, isolated browser read transport;
- exact replay creates no duplicate receipt, event or projection version;
- protected diagnostics passed 36 Deno unit tests, 246 pgTAP assertions and two direct PostgreSQL integration tests.

The exact `day1_complete_task_v1` runtime bundle is registered against protected reducer commit `edbfc911e9bcfddfb87a4adb6b39d21e1a5f2617`. Development `VOYAGE` now contains remote migrations `20260720223150 day1_read_model_api` and `20260720223210 day1_complete_task_runtime_release`. The three authenticated read functions and immutable runtime metadata are deployed, while all identity/history/projection tables remain empty. Cloud command execution is still blocked because `command-gateway` is not deployed without the `SUPABASE_ACCESS_TOKEN` GitHub secret.

Gate 7 offline synchronization is complete locally under accepted `ADR-016` as one umbrella composed of five bounded subgates:

- **7A — Canonical command contract:** frontend commands now use `idempotency_key == command_id`, retries preserve the exact stored command, and `CommandResult` is generated from the canonical Supabase result schema;
- **7B — Offline queue persistence:** IndexedDB stores attempts, last-attempt/settlement timestamps, stable error metadata and compact immutable receipt snapshots without rewriting the canonical command;
- **7C — Supabase transport:** authenticated HTTP adapters submit commands to `command-gateway`, load `api.get_today_view(...)`, classify auth/network/terminal failures and reject malformed or mismatched responses;
- **7D — Sync Engine:** one single-flight FIFO cycle submits pending commands sequentially and maps accepted/replay, rejected, conflict and retryable outcomes;
- **7E — Participant integration:** app startup, online transition and online enqueue trigger synchronization; domain state changes only after an authoritative TodayView refetch.

Conflict stops later FIFO delivery, retryable/auth failures remain `pending`, settled records remain attributable in IndexedDB, and the service worker remains shell-cache-only. Gate 7 adds no client reducer, no new server reducer, no database migration, no Realtime and no automatic Day 1 bootstrap.

The complete local `complete_task` path is now transport-ready, but live cloud execution still requires deployment of `command-gateway`, authenticated session composition and an actual bootstrapped Expedition/Participant/TodayView.


Gate 8A Expedition bootstrap contract is accepted under `ADR-017`:

- `create_expedition` remains on the single public `command-gateway` transport;
- only this command uses a pre-membership authenticated Profile path;
- the server selects and pins `ILKA_DEFAULT_RUNTIME_RELEASE_KEY`;
- `private.bootstrap_expedition(jsonb)` will atomically create the draft Expedition, active Captain membership, stream/projection heads, accepted receipt and `expedition.created` event;
- accepted bootstrap ends at stream position `1` and projection version `0`;
- no Participant, invitation, rotation, Day, Stage, assignment, Card Bundle or projection document is created by this gate.

Gate 8A established the contract. Gate 8B now implements the local atomic PostgreSQL transaction:

- `private.bootstrap_expedition(jsonb)` validates active Profile ownership, IANA timezone, canonical actor identity and immutable runtime pinning;
- command-ID and Expedition-key advisory locks serialize replay and key collisions;
- the transaction inserts one draft Expedition and one active Captain membership;
- existing triggers initialize stream/projection heads, and existing `private.process_command(jsonb)` persists the accepted receipt plus one prepared `expedition.created` event;
- successful bootstrap ends at stream position `1` and projection version `0`;
- exact replay, idempotency mismatch, duplicate key, disabled Profile, missing runtime and rollback behavior are covered by pgTAP;
- no Participant, invitation or projection document is created.

Gate 8B remains local and undeployed. The bootstrap reducer and `command-gateway` pre-membership branch remain Gate 8C; Auth/UI and live aggregate creation remain later subgates.

Gate 9B2C invitation execution is complete locally under accepted `ADR-019`:

- `invite_participant`, `accept_invitation` and `revoke_invitation` use one specialized `InvitationExecutor` before the generic membership gateway path;
- acceptance verifies confirmed Supabase Auth email and active Profile ownership before preparing the new membership actor;
- raw invitation tokens are SHA-256 hashed and never enter events, projections, receipts or the secret-free nested command payload;
- the pure invitation runtime produces canonical ordered events and one complete `ExpeditionSetupView` replacement;
- atomic writes remain delegated to the three Gate 9B2B PostgreSQL wrappers;
- protected unit and direct PostgreSQL integration tests cover invite, acceptance and revocation.

The production runtime registry remains unchanged. Gate 9E will compose and pin the protected `day1_pilot_v1` runtime before migration application, gateway deployment and pilot smoke.

Gate 9C deterministic initial rotation is complete locally under accepted `ADR-020`:

- `generate_rotation` is Captain-only, online-only and accepts no browser assignment, seed or rules fields;
- active Participants are ordered only by stable `participants.participant_order`;
- the pure runtime assigns the sequential onboard cycle, exactly one compatible Product Captain and `product_support` to Cook;
- SHA-256 seed and `rotation_<32 hex>` identity are server-derived from the pinned policy and authoritative team;
- accepted generation appends `rotation.generated → expedition.ready`, replaces the complete `ExpeditionSetupView` and atomically transitions the Expedition from `draft` to `ready`;
- `private.generate_rotation(jsonb)` delegates receipt, events and projection writes to `private.process_command(jsonb)` and no rotation table is introduced;
- unit, pgTAP and complete gateway/PostgreSQL integration coverage is protected in CI.

Gate 9D2 executable Expedition start is complete locally under accepted `ADR-021`:

- `start_expedition` is Captain-only, online-only, ready-only and accepts an exact empty payload;
- the pure runtime opens `onboarding`, emits `expedition.started → stage.opened` and replaces the complete `ExpeditionSetupView` without creating a Calendar Day;
- `private.start_expedition(jsonb)` atomically persists through `private.process_command(jsonb)` and transitions `ready → active`;
- the existing authenticated `command-gateway` routes the command through `StartExecutor` only after exact replay;
- protected handler and PostgreSQL integration tests prove rollback, ordered events, no premature Day projections and replay after Captain revocation.

Gate 9D3 trusted Day 1 boundary execution is complete locally under accepted `ADR-021`:

- the same `command-gateway` exposes a server-only HMAC branch selected by `x-ilka-system-timestamp` and `x-ilka-system-signature`;
- signature verification over the exact raw body occurs before command parsing, receipt lookup or Expedition data access;
- the pure pinned runtime emits exactly `day.started → role_assignments.activated → card_bundles.published` and uses trusted gateway time for both event timestamps;
- two deterministic assignment instances and one Card Bundle are derived per active Participant from the pinned onboarding methodology;
- `private.process_day_boundary(jsonb)` atomically publishes `N TodayView + 1 CaptainDayView` through `private.process_command(jsonb)`;
- protected tests prove catch-up timing, invalid transport rejection, complete rollback and exact replay without duplicates.

Gate 9D4 Day 1 vertical closure is complete locally:

- Day 1 Participant and Captain fixtures match the deterministic boundary reducer output;
- canonical examples use exact start, boundary and `complete_task` identities and payloads;
- Captain task blockers are Participant-scoped as `<participant_key>:<task_id>`;
- completing a shared methodology task removes only the authenticated Participant blocker;
- after-sync fixtures preserve card, output and other Participant task blockers;
- protected validation covers fixture/example drift and the complete rollback/retry/replay vertical.

Gate 9E1 Day 1 pilot runtime composition is complete locally:

- one immutable bundle delegates all accepted setup, rotation, start, trusted boundary and `complete_task` behavior to protected capability reducers;
- Day 1 methodology policy is generated from canonical engine, Stage, role and Card sources;
- the bundle exposes every specialized executor capability while preserving trusted-only boundary isolation;
- protected tests verify command dispatch and Product Captain role resolution.

Gate 9E1 is protected at `969d4956a9247aa5f28ba18cc6fe587bd38c20f4`. Gate 9E2 now registers `day1_pilot_v1` with rules `engine_v10_permissions_v8_roles_v2_rotation_v2` and content `ilka_mvp_12_day_v5_onboarding_v3`, adds the immutable database row and protects the reviewed development deployment workflow. Cloud migration application, environment configuration and live pilot evidence remain post-merge operations.

## Run the Day 1 prototype

```bash
cd frontend
npm ci
npm run dev
```

Vite development mode opens the scenario launcher. The available canonical scenarios are:

```text
?scenario=day1&mode=participant
?scenario=day1&mode=captain
?scenario=day1&mode=captain&state=after_sync
```

Build and serve the explicit static preview:

```bash
npm run build:preview
npm run preview:static
```

The normal production build does not enable fixtures. It requires an authoritative `window.__ILKA_BOOTSTRAP__` injection from the application composition root.

## Validation

From the repository root:

```bash
python scripts/generate_supabase_command_gateway_contract.py
python scripts/validate_repository.py .
python scripts/validate_frontend_offline_sync.py
python scripts/validate_expedition_bootstrap_contract.py
python scripts/validate_expedition_bootstrap_transaction.py
python scripts/validate_expedition_invitation_execution.py
python scripts/validate_expedition_rotation.py
python scripts/validate_expedition_day1_start_contract.py
python scripts/validate_expedition_start_execution.py
python scripts/validate_expedition_start_gateway.py
python scripts/validate_expedition_day1_boundary.py
python scripts/validate_expedition_day1_vertical_closure.py
pytest -q
cd frontend
npm ci
npm run check
cd ..
deno fmt --check --config supabase/functions/command-gateway/deno.json supabase/functions/command-gateway supabase/functions/_shared/command-gateway supabase/functions/_shared/engine-runtime
deno lint --config supabase/functions/command-gateway/deno.json supabase/functions/command-gateway supabase/functions/_shared/command-gateway supabase/functions/_shared/engine-runtime
deno check --frozen --config supabase/functions/command-gateway/deno.json supabase/functions/command-gateway/index.ts supabase/functions/command-gateway/tests/unit/*.ts supabase/functions/command-gateway/tests/integration/*.ts
deno test --frozen --config supabase/functions/command-gateway/deno.json supabase/functions/command-gateway/tests/unit
supabase start
supabase db reset
supabase test db
supabase db lint --local --level error
SUPABASE_DB_URL="$(supabase status -o json | jq -r '.DB_URL')" deno test --frozen --config supabase/functions/command-gateway/deno.json --allow-env=SUPABASE_DB_URL --allow-net=127.0.0.1:54322 supabase/functions/command-gateway/tests/integration
supabase gen types typescript --local --schema api,ilka,private > supabase/database.types.ts
python scripts/validate_supabase_foundation.py
python scripts/validate_supabase_identity_membership.py
python scripts/validate_supabase_immutable_history.py
python scripts/validate_supabase_atomic_command_transaction.py
python scripts/validate_supabase_command_gateway.py
python scripts/validate_supabase_day1_vertical.py
supabase stop
```

Protected `contracts-and-tests` runs the same repository, frontend, Deno and local Supabase gates and rejects uncommitted generated-source drift.
