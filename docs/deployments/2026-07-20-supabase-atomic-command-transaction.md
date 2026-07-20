# Supabase Atomic Command Transaction deployment

- Date: 2026-07-20
- Environment: development-only `VOYAGE`
- Supabase project ID: `rehfxjlyfojkpascjtmb`
- Implementation PR: `#19`
- Implementation merge commit: `448fb6e9fac0521f9c9660c4d1ae5400ed16d186`
- Protected CI run: `29768781004`
- Remote migration: `20260720185027 atomic_command_transaction`

## Deployed boundary

```text
ilka.projection_heads
ilka.projection_documents
private.initialize_projection_head()
private.build_persisted_command_result(...)
private.process_command(jsonb)
expeditions_initialize_projection_head trigger
```

## Verification

Remote verification confirmed:

- `projection_heads` and `projection_documents` have enabled and forced RLS;
- `anon` and `authenticated` have no raw SELECT access to internal projection tables;
- `anon` and `authenticated` cannot execute `private.process_command(jsonb)`;
- `service_role` can execute `private.process_command(jsonb)`;
- `service_role` can SELECT internal projection state;
- `service_role` cannot directly INSERT, UPDATE or DELETE projection rows;
- `service_role` cannot execute `private.build_persisted_command_result(...)`;
- the Expedition projection-head initialization trigger exists;
- Profiles, Expeditions, memberships, Participants, invitations, stream heads, command receipts, events, projection heads and projection documents all contain zero rows.

## Safety boundary

No test command was executed against the remote database because no Expedition or actor data exists. The deployment introduced no:

- `command-gateway` Edge Function;
- TypeScript reducer runtime;
- concrete `TodayView` or `CaptainDayView` documents;
- public `api` read functions;
- Auth users or invitations;
- seeded Expedition data;
- frontend integration;
- Realtime, scheduler or Storage configuration;
- pilot or production data.

The next gate is Command Gateway.
