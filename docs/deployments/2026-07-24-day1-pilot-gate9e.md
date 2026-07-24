# Gate 9E Day 1 pilot development rollout

## Scope

Development-only Supabase project `VOYAGE` (`rehfxjlyfojkpascjtmb`). This rollout registers and deploys the protected Day 1 pilot runtime without modifying any existing Expedition runtime pin.

## Immutable release

```text
release_key: day1_pilot_v1
git_commit_sha: 969d4956a9247aa5f28ba18cc6fe587bd38c20f4
rules_release: engine_v10_permissions_v8_roles_v2_rotation_v2
content_release: ilka_mvp_12_day_v5_onboarding_v3
reducer_version: day1_pilot_v1
```

`rules_release` is derived from `game-engine` v10, permissions v8, roles catalog v2 and rotation rules v2. `content_release` is derived from pipeline `ilka_mvp_12_day` v5 and onboarding v3. Exact Card definitions are captured by the protected SHA and generated policy.

## Pre-deployment invariant

Before every cloud mutation, verify:

```text
gate8d_smoke
status: draft
runtime_release: expedition_bootstrap_v1
stream_position: 1
projection_version: 0
```

No `UPDATE` of `ilka.expeditions.runtime_release_id` is permitted.

## Migration order

Apply only reviewed repository migrations missing from cloud history, in this order:

1. `20260721170000_invite_participant_transaction.sql`
2. `20260721171000_accept_invitation_transaction.sql`
3. `20260721172000_revoke_invitation_transaction.sql`
4. `20260721173000_expedition_setup_read_api.sql`
5. `20260721210000_generate_rotation_transaction.sql`
6. `20260722010000_start_expedition_transaction.sql`
7. `20260723010000_process_day_boundary_transaction.sql`
8. `20260724010000_day1_pilot_runtime_release.sql`

Re-read cloud migration history and the immutable release row after every applied migration.

## Gateway environment

The reviewed deployment workflow requires development environment secrets:

- `SUPABASE_ACCESS_TOKEN`;
- `ILKA_SYSTEM_CLOCK_HMAC_SECRET`;
- `ILKA_ALLOWED_ORIGINS`.

The cloud project must already contain `SUPABASE_DB_URL`. The workflow sets `ILKA_DEFAULT_RUNTIME_RELEASE_KEY=day1_pilot_v1`, preserves JWT verification and deploys only reviewed `main`. Secret values must never enter repository files, logs, events, receipts or projections.

## Pilot smoke

Create a fresh Expedition; do not reuse `gate8d_smoke`. The accepted flow is:

```text
create_expedition
→ 3–5 × invite_participant
→ 3–5 × accept_invitation
→ generate_rotation
→ start_expedition
→ trusted process_day_boundary
→ complete_task
→ exact replay
```

Verify one immutable receipt per command, ordered append-only events, `N TodayView + 1 CaptainDayView`, participant-scoped task blockers and unchanged replay results.

## Environment-dependent closure

The code/release rollout can complete without creating pilot identities. The full authenticated pilot requires 3–5 confirmed Supabase Auth users and the HMAC secret. If those are unavailable, Gate 9E remains open and the missing environment prerequisites must be recorded explicitly rather than bypassed through direct SQL data creation or a weakened system-clock path.
