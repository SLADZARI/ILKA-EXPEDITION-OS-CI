# Gate 9E3 development rollout evidence

Status: **blocked after partial rollout**

This document records the controlled deployment and remaining live-pilot prerequisites for `day1_pilot_v1` in development project `VOYAGE` (`rehfxjlyfojkpascjtmb`). Gate 9E is not closed by this record.

## Protected source

- repository merge SHA: `f2f88cd39c102dcdf46916dfc782a91f503beaaa`;
- runtime implementation SHA: `969d4956a9247aa5f28ba18cc6fe587bd38c20f4`;
- release key: `day1_pilot_v1`;
- rules release: `engine_v10_permissions_v8_roles_v2_rotation_v2`;
- content release: `ilka_mvp_12_day_v5_onboarding_v3`;
- reducer version: `day1_pilot_v1`.

The repository remains the source of truth. No runtime rule or release metadata is duplicated in this evidence record as an executable configuration.

## Database rollout verified

Cloud migration history contains the reviewed invitation, setup read API, rotation, Expedition start, Day 1 boundary and pilot-release migrations. The immutable `ilka.runtime_releases` row matches the protected Gate 9E1 implementation SHA and exact release metadata above.

No existing Expedition runtime pin was changed.

## Gateway deployment verified

At `2026-07-24T10:50:22.245Z`, Supabase reported:

- function: `command-gateway`;
- active version: `2`;
- status: `ACTIVE`;
- `verify_jwt: true`;
- deployment source pinned to repository merge SHA `f2f88cd39c102dcdf46916dfc782a91f503beaaa`.

The connected Supabase deployment capability was used because the canonical GitHub workflow could not authenticate. The deployed entrypoint is an immutable wrapper importing the reviewed `main` entrypoint at the exact SHA. It is deployment transport only and does not become a competing source of truth. Once GitHub environment credentials are configured, the canonical `.github/workflows/deploy-command-gateway.yml` must replace this transport with the normal reviewed-source deployment.

The deployed source includes the merged invitation, rotation, Expedition start, trusted Day 1 boundary and `day1_pilot_v1` registry code through the pinned dependency graph.

## Existing Expedition invariant verified after deployment

`gate8d_smoke` remains:

- status: `draft`;
- runtime release: `expedition_bootstrap_v1`;
- stream position: `1`;
- projection version: `0`.

This confirms that the rollout did not repin or mutate the existing Expedition aggregate.

## Environment preflight result

Independent GitHub Actions jobs verified that the protected source is correct and that all three required `development` environment secrets are absent:

- `SUPABASE_ACCESS_TOKEN` — missing;
- `ILKA_SYSTEM_CLOCK_HMAC_SECRET` — missing;
- `ILKA_ALLOWED_ORIGINS` — missing.

Secret values were never printed or committed.

Because the connected Supabase capability does not expose Edge Function secret management, the following cloud configuration remains unverified and must not be inferred from an `ACTIVE` function status:

- `ILKA_DEFAULT_RUNTIME_RELEASE_KEY=day1_pilot_v1`;
- `ILKA_SYSTEM_CLOCK_HMAC_SECRET` configured in the Edge Function environment;
- approved `ILKA_ALLOWED_ORIGINS` configured in the Edge Function environment.

No fallback value was hardcoded into runtime code, and trusted system-clock authentication was not weakened.

## Pilot identity readiness

The development project currently contains:

- Auth users: `1`;
- active Profiles: `1`;
- domain Participants: `0`;
- active Expedition memberships: `1`.

A fresh authenticated 3–5 Participant pilot therefore cannot be executed yet without approved Auth identities. No identities, memberships or Participants were fabricated through direct SQL.

## Remaining closure sequence

1. Configure the three GitHub `development` environment secrets.
2. Run the canonical `Deploy command gateway to development` workflow from protected `main`.
3. Verify cloud `ILKA_DEFAULT_RUNTIME_RELEASE_KEY=day1_pilot_v1`, HMAC authentication and allowed origins through a successful gateway smoke rather than by exposing secret values.
4. Provision or confirm 3–5 real pilot Auth users through the accepted Auth flow.
5. Create a fresh Expedition and execute:

   `create_expedition → invite_participant × N → accept_invitation × N → generate_rotation → start_expedition → trusted process_day_boundary → complete_task → exact replay`.

6. Verify append-only events, one receipt per command, `N TodayView + 1 CaptainDayView`, participant-scoped blockers, deterministic replay and unchanged `gate8d_smoke`.

Until these steps pass, Gate 9E remains **OPEN / environment-blocked**.
