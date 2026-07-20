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

It does **not** contain invitation delivery or acceptance transport, command receipts, event log, projections, Edge Functions, scheduler jobs or Storage buckets.

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
```

Stop the local stack when finished:

```bash
supabase stop
```

## Schema boundaries

- The Data API exposes only `api`.
- Generated server types explicitly include `api`, `ilka` and `private`.
- Browser code must not query `ilka` or `private` directly.
- `anon` and `authenticated` have no raw identity-table grants.
- Trusted server runtime resolves actor context through `private.resolve_actor_context(...)`.
- `public` is not an ILKA application schema.

## Identity boundary

- `auth.users.id`, `profile_id`, `expedition_member_id` and `participant_id` are distinct.
- Membership roles are `captain`, `participant` and `shore_operator`.
- `Product Captain` remains a Day role assignment, not a membership/JWT role.
- Raw invitation tokens are never stored.
- Identity and membership mutations require server confirmation and are not offline commands.

## Remote safety

The accepted development project is `VOYAGE` (`rehfxjlyfojkpascjtmb`).

The following reviewed migrations are deployed remotely:

- `20260720142526 foundation`;
- `20260720162648 identity_membership`.

Identity tables remain empty. No command/event/projection runtime, Edge Functions, scheduler, Storage or pilot data exists. Further migrations must not be applied from a feature branch; immutable history is the next reviewed gate.
