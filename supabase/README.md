# Supabase runtime

This directory implements the Supabase runtime accepted by `ADR-012`.

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

It does **not** contain `private.process_command(...)`, projections, Edge Functions, API read functions, scheduler jobs or Storage buckets.

## Local verification

Docker must be running.

```bash
supabase start
supabase db reset
supabase test db
supabase db lint --local --level error
supabase gen types typescript --local --schema api,ilka,private > supabase/database.types.ts
python scripts/validate_supabase_foundation.py
python scripts/validate_supabase_identity_membership.py
python scripts/validate_supabase_immutable_history.py
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
- The next gate must compose history writes and projection mutations inside `private.process_command(...)`.

## Remote safety

The accepted development project is `VOYAGE` (`rehfxjlyfojkpascjtmb`).

The following reviewed migrations are deployed remotely:

- `20260720142526 foundation`;
- `20260720162648 identity_membership`;
- `20260720175753 immutable_history`.

All identity and history tables remain empty. The remote history boundary has forced RLS, no browser access and no direct `service_role` writes. The next migration must not be applied remotely from a feature branch; remote application is allowed only after its implementation PR and protected CI are green. No pilot or production data is authorized.
