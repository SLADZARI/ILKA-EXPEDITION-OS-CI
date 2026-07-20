# Supabase runtime

This directory implements the Supabase runtime accepted by `ADR-012`, `ADR-013` and `ADR-014`.

## Current scope

The completed Foundation milestone contains:

- local Supabase CLI configuration on PostgreSQL 17;
- internal schemas `ilka`, `api` and `private`;
- explicit schema and object privileges;
- immutable `ilka.runtime_releases` registry;
- pgTAP foundation tests;
- generated local database TypeScript types.

The Identity and Expedition Membership gate adds:

- Auth-linked `ilka.profiles` with preserved historical identity;
- runtime-release-pinned `ilka.expeditions`;
- Expedition-scoped `ilka.expedition_members` roles and status;
- separate domain `ilka.participants` identities;
- expiring SHA-256-hashed `ilka.invitations`;
- server-only `private.resolve_actor_context(...)`;
- forced RLS, explicit grants and cross-Expedition/ban tests.

The Immutable History gate adds:

- one `ilka.stream_heads` row per Expedition;
- immutable `ilka.command_receipts` keyed by canonical `command_id`;
- append-only `ilka.event_log` ordered by Expedition `stream_position`;
- SHA-256 request-hash idempotency helpers;
- expected stream-position conflict detection;
- ordered command-to-event-set validation;
- same-Expedition correction-event references;
- UPDATE, DELETE and TRUNCATE protection;
- forced RLS and no direct browser or `service_role` history writes.

The Atomic Command Transaction gate adds:

- accepted `ADR-013` for one transaction kernel and neutral projection documents;
- private request/result JSON Schemas;
- one `ilka.projection_heads` row per Expedition;
- versioned `ilka.projection_documents`;
- `private.process_command(jsonb)` as the only prepared-result write boundary;
- command and Expedition advisory locks;
- exact replay and request-hash mismatch handling;
- stale stream conflict without writes;
- persisted deterministic rejections;
- atomic receipt, event and projection persistence;
- complete rollback on projection failure;
- forced RLS and no direct projection writes.

The Command Gateway gate adds:

- accepted `ADR-014` for authenticated transport and pinned runtime loading;
- `POST /functions/v1/command-gateway` with platform JWT verification;
- code-level Supabase Auth session verification;
- direct PostgreSQL access through `SUPABASE_DB_URL` without exposing `private` through the Data API;
- `SET LOCAL ROLE service_role` for short parameterized transactions;
- canonical Command Schema validation and normalized SHA-256 request hashing;
- exact replay restricted to the original authenticated actor;
- authoritative membership/Participant actor resolution;
- Product Captain verification delegated to the pinned runtime;
- generated command actor metadata from `engine/command-catalog.yaml`;
- exact immutable runtime-bundle matching;
- canonical event and private request/result validation;
- all writes routed through `private.process_command(jsonb)`;
- CORS, request-size limits and stable response/error envelopes;
- Deno unit tests and direct local PostgreSQL integration.

Gate 5 originally contained no production reducer bundle. Gate 6 now registers the first exact pinned runtime release for `complete_task`.

Gate 6 adds the first executable Day 1 vertical:

- accepted `ADR-015` for the `complete_task` reducer and authoritative read transport;
- pure `day1_complete_task_v1` runtime producing `task.completed` or `task.completed_late`;
- Product Captain resolution from the authoritative Day role assignment;
- complete `TodayView` and `CaptainDayView` projection upserts in one atomic transaction;
- projection JSON Schema validation in the gateway before persistence;
- authenticated `api.get_today_view(...)`, Captain-only `api.get_captain_day_view(...)` and actor-owned `api.get_command_receipt(...)`;
- 36 Deno unit tests, 246 pgTAP assertions and two direct PostgreSQL integration tests.

The runtime registry now contains only `day1_complete_task_v1`, pinned to protected reducer commit `edbfc911e9bcfddfb87a4adb6b39d21e1a5f2617`. Registration changes no reducer behavior. Gate 6 still does **not** include Expedition bootstrap, invitation acceptance, rotation, Day start, initial projection generation, additional reducers, frontend adapters, scheduler jobs, Realtime or Storage.

## Local verification

Docker must be running for database integration.

```bash
python scripts/generate_supabase_command_gateway_contract.py
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
```

Stop the local stack when finished:

```bash
supabase stop
```

## Schema boundaries

- The Data API exposes only `api`.
- Generated server types explicitly include `api`, `ilka` and `private`.
- Browser code must not query `ilka` or `private` directly.
- `anon` and `authenticated` have no raw domain-table grants.
- Trusted server runtime resolves actor context through `private.resolve_actor_context(...)`.
- `public` is not an ILKA application schema.

## Identity boundary

- `auth.users.id`, `profile_id`, `expedition_member_id` and `participant_id` are distinct.
- Membership roles are `captain`, `participant` and `shore_operator`.
- `Product Captain` remains a Day role assignment, not a membership/JWT role.
- Raw invitation tokens are never stored.
- Identity and membership mutations require server confirmation and are not offline commands.

## History boundary

- Database `expedition_id` is an internal UUID; canonical `event_json.expedition_id` is the stable `expedition_key`.
- `stream_position` is persistence metadata and does not change `engine/event.schema.json`.
- Persisted runtime replay uses ascending `stream_position`.
- Canonical fixture arrays without persistence metadata preserve explicit array order.
- A retry preserves the original `command_id` and normalized request hash.
- Corrections append a new event with `correction_of_event_id`; prior events remain immutable.

## Transaction boundary

- Browser roles cannot call `private.process_command(jsonb)`.
- `service_role` may call the function but cannot directly write receipts, events or projections.
- Exact replay returns the original persisted receipt before current actor validation.
- Stale expected stream position returns an unpersisted conflict.
- Accepted and deterministic rejected results may persist immutable receipts.
- One accepted command allocates consecutive event positions and at most one new Expedition projection version.
- Projection documents store complete rebuildable JSON and final source stream position.
- Concrete read-model semantics remain owned by `app/contracts/*.schema.json`; Gate 6 now exposes the first schema-valid TodayView and CaptainDayView read transport.

## Gateway boundary

- `command-gateway` is the only external domain-write path.
- A valid Auth session is required before replay or new execution.
- Client actor claims never define persisted attribution.
- Exact replay is available only to the original authenticated actor.
- A new command requires active Expedition membership and the exact pinned runtime bundle.
- Human requests cannot claim `system` or `system_clock`.
- Product Captain is verified by the runtime, not JWT metadata or membership.
- The generated actor matrix is derived from canonical YAML and handles only role-level preflight.
- SQL events, projections and receipts are never written separately by the handler.

## Remote safety

The accepted development project is `VOYAGE` (`rehfxjlyfojkpascjtmb`).

The following reviewed migrations are deployed remotely:

- `20260720142526 foundation`;
- `20260720162648 identity_membership`;
- `20260720175753 immutable_history`;
- `20260720185027 atomic_command_transaction`.

All identity, history and projection tables remain empty. The remote transaction boundary has forced RLS, no browser access, no direct `service_role` writes and only the approved `private.process_command(jsonb)` execution grant. `command-gateway` is not deployed remotely because the required `SUPABASE_ACCESS_TOKEN` GitHub secret is not configured. The Gate 6 read-model migration and runtime release are also not deployed from the implementation feature branch. No pilot or production data is authorized.
