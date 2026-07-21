# Gate 8D development deployment status

Date: 2026-07-21

Target: development-only Supabase project `VOYAGE` (`rehfxjlyfojkpascjtmb`).

## Completed

- Gate 8D registration PR #30 passed protected CI and was squash-merged into `main` as `10eceffcf9a564cb31278168ca7fe106aaf0a39a`.
- Immutable migration `expedition_bootstrap_runtime_release` was applied remotely as version `20260721124455`.
- Remote release `expedition_bootstrap_v1` exists exactly once and pins:
  - Gate 8C implementation SHA `6175902f32a73a08476111befcb9e9be36e219bf`;
  - rules release `engine_v8_permissions_v7`;
  - content release `ilka_mvp_12_day_v5`;
  - reducer version `expedition_bootstrap_v1`.
- Remote domain counts remain zero for Profiles, Expeditions, memberships, Participants, invitations, receipts, events and projection documents.
- Supabase security and performance advisors were reviewed after migration.

## Deployment blocker

`command-gateway` requires server environment value:

```text
ILKA_DEFAULT_RUNTIME_RELEASE_KEY=expedition_bootstrap_v1
```

The connected Supabase management capability can deploy Edge Functions but cannot create or update Edge Function secrets. The repository intentionally provides no code fallback for this value.

Therefore the Edge Function was not deployed in a knowingly non-bootable state. JWT verification was not weakened, no default release was hard-coded, and no direct SQL smoke bootstrap was substituted for the public gateway.

## Remaining completion actions

1. Configure `ILKA_DEFAULT_RUNTIME_RELEASE_KEY=expedition_bootstrap_v1` in Supabase Edge Function secrets.
2. Deploy `command-gateway` from protected `main` with JWT verification enabled.
3. Execute the authenticated accepted bootstrap and exact replay from `gate-8d-development-smoke.md`.
4. Verify the stated database postconditions.
5. Record the completed smoke result.

Until these actions are complete, Gate 8D status is **runtime registered / migration deployed / Edge Function and live smoke blocked by environment configuration**.

`expedition_bootstrap_v1` remains bootstrap-only and must not be used as a pilot runtime.
