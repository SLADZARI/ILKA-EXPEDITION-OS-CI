# Gate 8D Expedition bootstrap release

Status: registration candidate under accepted `ADR-017`; development deployment is performed only after protected CI and merge.

## Purpose

Register the already-merged Gate 8C `create_expedition` implementation as one exact immutable runtime release, deploy the existing `command-gateway` and prove the authenticated bootstrap path against development Supabase.

Gate 8D introduces no new command, event, aggregate, public endpoint or browser permission.

## Protected implementation source

The release pins the protected Gate 8C merge commit:

```text
6175902f32a73a08476111befcb9e9be36e219bf
```

That commit contains:

- the pure `create_expedition` reducer;
- the pre-membership gateway branch;
- active Profile and Auth ownership validation;
- canonical Captain membership actor conversion;
- private bootstrap request validation;
- `private.bootstrap_expedition(jsonb)` execution coverage.

## Immutable release metadata

```text
release_key: expedition_bootstrap_v1
git_commit_sha: 6175902f32a73a08476111befcb9e9be36e219bf
rules_release: engine_v8_permissions_v7
content_release: ilka_mvp_12_day_v5
reducer_version: expedition_bootstrap_v1
duration_days: 12
recovery_days_available: 1
```

The metadata is represented identically in:

- `supabase/functions/_shared/command-gateway/runtime-registry.ts`;
- `supabase/migrations/20260721133000_expedition_bootstrap_runtime_release.sql`;
- protected unit, pgTAP and static contract tests.

Any metadata mismatch must resolve to `runtime_release_unavailable`; fallback matching is prohibited.

## Environment selection

The development Edge Function must receive:

```text
ILKA_DEFAULT_RUNTIME_RELEASE_KEY=expedition_bootstrap_v1
```

The browser never sends this key and cannot select another release. `command-gateway` keeps the environment variable mandatory; code-level fallback and silent release substitution are prohibited.

## Deployment order

```text
1. merge reviewed Gate 8D registration PR
2. apply immutable runtime release migration to development VOYAGE
3. set ILKA_DEFAULT_RUNTIME_RELEASE_KEY
4. deploy command-gateway with JWT verification enabled
5. create one temporary authenticated smoke Profile
6. submit create_expedition through the live gateway
7. repeat the exact command and verify replay
8. verify database postconditions and absence of unrelated rows
9. record the deployment result in CHANGELOG.md
```

Migration and function deployment must not run from an unmerged feature branch.

## Smoke postconditions

One accepted live command must produce:

```text
1 draft Expedition
1 active Captain membership
1 stream head at position 1
1 projection head at version 0
1 accepted create_expedition receipt
1 expedition.created event
0 Participants
0 invitations
0 projection documents
```

The exact retry must return the persisted result with `replayed = true` and create no duplicate rows.

## Bootstrap-only limitation

`expedition_bootstrap_v1` is intentionally **bootstrap-only**. It proves aggregate creation but does not implement invitation, Participant, rotation, `start_expedition`, Day transition or Day 1 task commands.

Therefore:

- it is permitted only for the Gate 8D development smoke Expedition;
- it is not a pilot or production runtime;
- a runtime-composition gate must create and register a release containing bootstrap plus the next executable command set before any real Expedition is created;
- the smoke Expedition must never be presented as a usable pilot Expedition.

This limitation is explicit because an Expedition is immutably pinned to its selected runtime release.

## Security

- Edge Function JWT verification remains enabled;
- Supabase Auth is verified again inside the function;
- `ILKA_DEFAULT_RUNTIME_RELEASE_KEY` is server configuration;
- `private.bootstrap_expedition(jsonb)` remains unavailable to browser roles;
- the service-role database connection is used only inside the trusted function;
- no raw internal table grants are added;
- publishable keys may be used by the smoke client, but secret/service-role keys must never enter browser or repository files.

## Gate completion

Gate 8D is complete only when:

- protected CI is green;
- the registration PR is merged;
- the exact migration is present remotely;
- the Edge Function is deployed with JWT verification;
- the required environment variable is configured;
- authenticated accepted and replay smoke calls succeed;
- database postconditions are verified;
- security and performance advisors are reviewed;
- the deployment record is committed.

If platform tooling cannot configure the required environment variable or obtain an authenticated smoke session, deployment remains explicitly blocked rather than embedding configuration in code or weakening authentication.
