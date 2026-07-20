# Supabase runtime

This directory implements the Supabase runtime accepted by `ADR-012`.

## Current scope

The Foundation milestone contains only:

- local Supabase CLI configuration;
- internal schemas `ilka`, `api` and `private`;
- explicit schema and object privileges;
- immutable `ilka.runtime_releases` registry;
- pgTAP foundation tests;
- generated local database TypeScript types.

It does **not** contain Auth profiles, Expedition memberships, command receipts, event log, projections, Edge Functions, scheduler jobs or Storage buckets.

## Local verification

Docker must be running.

```bash
supabase start
supabase db reset
supabase test db
supabase db lint --local --level error
supabase gen types typescript --local --schema api,ilka,private > supabase/database.types.ts
python scripts/validate_supabase_foundation.py
```

Stop the local stack when finished:

```bash
supabase stop
```

## Schema boundaries

- The Data API exposes only `api`.
- Generated server types explicitly include `api`, `ilka` and `private`.
- Browser code must not query `ilka` or `private` directly.
- `public` is not an ILKA application schema.

## Remote safety

The accepted development project is `VOYAGE` (`rehfxjlyfojkpascjtmb`).

Do not run `supabase db push`, `supabase db reset --linked` or deploy functions from a feature branch. Remote migration application is a separate reviewed step after the local Foundation gate is green.
