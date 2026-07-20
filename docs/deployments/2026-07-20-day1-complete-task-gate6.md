# Gate 6 — Day 1 `complete_task` development deployment

- Date: 2026-07-20
- Environment: development-only Supabase `VOYAGE`
- Project ID: `rehfxjlyfojkpascjtmb`
- Reducer implementation PR: `#23`
- Reducer implementation commit: `edbfc911e9bcfddfb87a4adb6b39d21e1a5f2617`
- Runtime registration PR: `#24`
- Runtime registration commit: `72081bc3caaa41d1d3f212ca8fce410e718d17dd`
- Implementation CI run: `29782265509`
- Registration CI run: `29783863073`
- Remote read API migration: `20260720223150 day1_read_model_api`
- Remote runtime release migration: `20260720223210 day1_complete_task_runtime_release`

## Deployed database boundary

```text
api.get_today_view(text)
api.get_captain_day_view(text)
api.get_command_receipt(text)
ilka.runtime_releases: day1_complete_task_v1
```

Exact runtime metadata:

```text
release_key: day1_complete_task_v1
git_commit_sha: edbfc911e9bcfddfb87a4adb6b39d21e1a5f2617
rules_release: engine_v8_permissions_v7_onboarding_v3
content_release: day1_content_v1
reducer_version: day1_complete_task_v1
```

## Verification

Remote verification confirmed:

- all three API functions are `SECURITY DEFINER` with empty `search_path`;
- `authenticated` may execute the three read functions;
- `anon` may execute none of them;
- `authenticated` still has no raw SELECT privilege on `ilka.projection_documents` or `ilka.command_receipts`;
- the immutable runtime release row exactly matches the protected reducer commit and accepted rules/content/reducer metadata;
- Profiles, Expeditions, memberships, Participants, invitations, stream heads, command receipts, events, projection heads and projection documents all contain zero rows;
- `ilka.runtime_releases` contains exactly one metadata row;
- no Edge Function is currently deployed.

## Advisor review

Supabase security advisor reports two intentional patterns:

1. internal `ilka` tables use enabled/forced RLS with no policies because browser roles have no direct table grants and access is deny-by-default;
2. the three exposed `api` read functions are executable `SECURITY DEFINER` functions by design and enforce `auth.uid()`, active membership and receipt ownership internally.

These warnings are accepted by `ADR-015` and covered by pgTAP isolation tests.

Performance advisor reports informational unindexed foreign-key and unused-index notices on currently empty internal tables. They are recorded as deployment-readiness debt and are not changed inside Gate 6 without workload evidence.

## Current execution limitation

The database now contains the read API and immutable runtime release metadata, but `command-gateway` remains undeployed because GitHub environment secret `SUPABASE_ACCESS_TOKEN` is not configured.

Therefore the cloud environment cannot yet execute `complete_task`. The local protected integration proves the full flow, while cloud activation still requires:

```text
configure SUPABASE_ACCESS_TOKEN
→ run Deploy command gateway to development
→ verify JWT-protected function registration
```

No cloud Auth users, Expeditions, commands or projection fixtures were created.
