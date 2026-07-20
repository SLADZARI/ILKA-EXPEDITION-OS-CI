# Supabase Identity and Expedition Membership Contract

Status: implementation contract under accepted `ADR-012`  
Environment: local Supabase and development-only `VOYAGE`  
Source of truth: `docs/decisions/ADR-012-supabase-persistence-command-gateway-and-projection-model.md`

## Problem and user scenario

The backend needs an authoritative mapping from Supabase Auth identity to an Expedition-scoped actor before any command gateway, projection read or offline synchronization can be trusted.

Minimum scenario:

1. a permanent Supabase Auth user exists;
2. the system creates or resolves one internal Profile;
3. a Captain creates an Expedition pinned to one immutable runtime release;
4. the system creates Expedition-scoped memberships;
5. participant memberships receive separate domain Participant identities;
6. an invitation stores only a SHA-256 token hash and expiry;
7. trusted server code resolves the active actor context for one Expedition;
8. banned or cross-Expedition users resolve no active actor context.

## Architecture boundary

This gate implements persistence and integrity only.

It owns:

- `ilka.profiles`;
- `ilka.expeditions`;
- `ilka.expedition_members`;
- `ilka.participants`;
- `ilka.invitations`;
- `private.resolve_actor_context(...)`;
- Auth-to-Profile creation trigger;
- grants, forced RLS and pgTAP security tests.

It does not own methodology, Engine permissions, Product Captain assignment, role rotation, day state, Product Stage, command handling or projections.

## Identity model

The following identifiers remain separate:

```text
auth.users.id
→ ilka.profiles.id
→ ilka.expedition_members.id
→ ilka.participants.id (participant memberships only)
```

Rules:

- one Auth user maps to at most one Profile;
- deleting an Auth user detaches `auth_user_id` but preserves the Profile for historical attribution;
- one Profile may belong to multiple Expeditions;
- one Profile may have at most one membership per Expedition;
- membership roles are `captain`, `participant`, `shore_operator`;
- `Product Captain` is not a membership role;
- one Expedition may have at most one active Captain membership;
- a Participant row may reference only a `participant` membership;
- Shore operators and Captains do not automatically receive a Participant row.

## States and transitions

### Profile

```text
active → disabled
```

Profile reactivation is not prohibited by the persistence layer, but no public or browser mutation path exists in this gate.

### Expedition

The persisted status vocabulary follows `engine/game-engine.yaml`:

```text
draft
ready
active
suspended
completed
cancelled
```

The database does not perform Engine transitions. Future commands and reducers remain authoritative.

### Expedition membership

```text
active → banned
active → revoked
banned → active
banned → revoked
```

Status metadata is mandatory:

- `banned` requires `banned_at` and `ban_reason`;
- `revoked` requires `revoked_at` and `revoke_reason`;
- active rows cannot retain ban or revoke metadata.

The current Captain ban guard remains an Engine/command rule and is not duplicated as an independent SQL transition engine.

### Participant

```text
active → banned
banned → active
```

Membership and Participant status are updated atomically by the future command transaction. This gate stores both states but does not implement the command.

### Invitation

```text
pending → accepted
pending → revoked
pending → expired
```

Accepted, revoked and expired invitations are terminal. Invitation identity fields and token hashes are immutable after creation.

## Data rules

### Profile

- `auth_user_id` references the primary key of `auth.users`;
- authorization never uses Auth `user_metadata`;
- Profile identity survives Auth-user deletion.

### Expedition

- `expedition_key` is stable `snake_case`;
- one immutable `runtime_release_id` is pinned at creation;
- timezone and local day-boundary time are stored separately;
- runtime tables do not replace canonical Methodology or Engine files.

### Membership

- unique `(expedition_id, profile_id)`;
- partial unique index allows at most one active Captain;
- no membership row is physically deleted by application roles.

### Participant

- unique stable `participant_key` within an Expedition;
- unique participant order from 1 to 5;
- one membership maps to at most one Participant.

### Invitation

- raw tokens are never persisted;
- `token_hash` must be exactly 32 bytes, representing SHA-256 output;
- email is stored normalized to lowercase and trimmed;
- only one pending invitation may exist per Expedition and normalized email;
- invitation acceptance remains a separate authenticated server flow.

## Permissions

- `anon` receives no schema, table or function access;
- `authenticated` receives no direct access to `ilka` tables;
- Data API exposure remains limited to `api`;
- `service_role` may `SELECT`, `INSERT` and `UPDATE` identity tables, but not `DELETE` them;
- only `service_role` may execute `private.resolve_actor_context(...)`;
- all tables use enabled and forced RLS as defense in depth;
- all trusted functions use an explicit empty `search_path` and fully qualified object names.

The browser cannot call the actor resolver or query raw membership data. Future API read functions return schema-valid projections instead.

## Offline behavior

Identity creation, invitation acceptance, membership changes and bans require server confirmation and are not offline commands.

Locally cached identity or membership information is a projection only. When connectivity returns:

- the client refreshes the authoritative projection;
- banned or revoked membership produces rejected access rather than a local state mutation;
- queued domain commands retain their original `command_id`, but actor authorization is re-evaluated by the future command gateway;
- a stale cached role never overrides current membership state.

## Events

This gate does not create canonical domain events because `command_receipts`, `event_log` and `private.process_command(...)` belong to the next persistence gates.

Future create, invite, accept, ban, unban and revoke operations must append canonical events through the command transaction. Direct table operations are temporary development/bootstrap mechanisms only.

## Errors and conflicts

- duplicate active Captain: unique-constraint rejection;
- duplicate membership for one Profile and Expedition: unique-constraint rejection;
- Participant linked to Captain or Shore membership: `participant_membership_role_must_be_participant`;
- invalid invitation hash length: check-constraint rejection;
- invitation identity mutation: `invitation_identity_is_immutable`;
- mutation after terminal invitation state: `invitation_is_terminal`;
- banned, disabled or cross-Expedition actor resolution: no active actor context returned.

## Acceptance criteria

- migrations rebuild from an empty local database;
- Auth user creation produces exactly one Profile;
- Auth-user deletion preserves detached Profile identity;
- all five tables have forced RLS and no browser grants;
- service role has no direct delete privilege;
- one active Captain per Expedition is enforced;
- Participant membership role is enforced;
- cross-Expedition actor resolution returns no row;
- banned membership returns no active actor context;
- invitation tokens are hashed, expiring and immutable;
- generated TypeScript database types match the migrated schema;
- repository validator, pgTAP tests, database lint and protected CI are green.

## Explicit non-goals

- Auth UI, email OTP screens or frontend session wiring;
- invitation email delivery;
- invitation acceptance RPC or Edge Function;
- direct browser membership CRUD;
- command gateway;
- command receipts, event log or stream heads;
- projections and Realtime;
- Product Captain assignment;
- production or pilot data;
- remote deployment before reviewed PR and green CI.

## Development deployment record

The reviewed Identity and Expedition Membership gate was merged through PR `#15` after protected run `29759210777` passed. It was then applied to development-only `VOYAGE` (`rehfxjlyfojkpascjtmb`) as remote migration version `20260720162648` with migration name `identity_membership`.

Remote verification confirmed:

- all five identity tables have enabled and forced RLS;
- `anon` and `authenticated` have no raw table access;
- `service_role` has no direct DELETE privilege;
- only `service_role` can execute `private.resolve_actor_context(...)`;
- Profiles, Expeditions, memberships, Participants and invitations all contain zero rows.

The deployment does not add invitation delivery or acceptance transport, command gateway, stream heads, command receipts, event log, projections, Edge Functions, scheduler jobs, Storage buckets, pilot data or production data. The next persistence gate remains immutable history.
