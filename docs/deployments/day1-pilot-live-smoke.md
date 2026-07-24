# Gate 9E authenticated Day 1 live smoke

Status: operator harness ready; Gate 9E remains environment-blocked until this smoke passes in development.

## Purpose

`scripts/run_day1_pilot_smoke.py` executes the exact authenticated Gate 9E vertical against the deployed Supabase `command-gateway`:

```text
create_expedition
→ invite_participant × N
→ accept_invitation × N
→ generate_rotation
→ start_expedition
→ trusted process_day_boundary
→ complete_task
→ exact replay
```

The harness uses only Python's standard library. It does not create Auth users, Profiles, memberships or Participants through SQL. It reads JWTs and the trusted-clock HMAC secret only from the process environment and emits sanitized JSON evidence.

## Preconditions

1. Configure the GitHub `development` environment secrets required by `.github/workflows/deploy-command-gateway.yml`: `SUPABASE_ACCESS_TOKEN`, `ILKA_SYSTEM_CLOCK_HMAC_SECRET` and `ILKA_ALLOWED_ORIGINS`.
2. Run the canonical deployment workflow from protected `main`.
3. Confirm the deployed function still uses `verify_jwt: true` and `ILKA_DEFAULT_RUNTIME_RELEASE_KEY=day1_pilot_v1`.
4. Provision one Captain and 3–5 confirmed Participant Auth users through the accepted Supabase Auth flow.
5. Resolve the active `ilka.profiles.id` UUID for the Captain and every Participant. Reading these identifiers is permitted; creating identities or domain records directly is not.
6. Use a local calendar date whose configured Day boundary has already occurred.

The trusted-clock bearer defaults to the Captain JWT. `ILKA_SYSTEM_CLOCK_BEARER_TOKEN` may be set separately when another valid Supabase JWT is required. The HMAC remains the independent trusted-system credential.

## Environment

```bash
export ILKA_SUPABASE_URL='https://<project-ref>.supabase.co'
export ILKA_SUPABASE_PUBLIC_KEY='<publishable-or-anon-public-key>'
export ILKA_CAPTAIN_ACCESS_TOKEN='<captain-jwt>'
export ILKA_CAPTAIN_PROFILE_ID='<captain-profile-uuid>'
export ILKA_SYSTEM_CLOCK_HMAC_SECRET='<same-secret-configured-in-command-gateway>'

export ILKA_PARTICIPANTS_JSON='[
  {
    "display_name": "Participant One",
    "email": "participant.one@example.test",
    "access_token": "<participant-1-jwt>",
    "profile_id": "<participant-1-profile-uuid>"
  },
  {
    "display_name": "Participant Two",
    "email": "participant.two@example.test",
    "access_token": "<participant-2-jwt>",
    "profile_id": "<participant-2-profile-uuid>"
  },
  {
    "display_name": "Participant Three",
    "email": "participant.three@example.test",
    "access_token": "<participant-3-jwt>",
    "profile_id": "<participant-3-profile-uuid>"
  }
]'
```

Do not put these values in shell history, repository files, issue comments, workflow logs or the evidence document. Prefer a temporary environment file outside the repository with restricted filesystem permissions.

## Preflight without domain writes

```bash
python scripts/run_day1_pilot_smoke.py \
  --preflight-only \
  --timezone Europe/Warsaw \
  --day-boundary-local-time 06:00 \
  --local-date 2026-07-24
```

Preflight calls Supabase Auth for all JWTs before the first domain mutation. It verifies distinct users, confirmed Participant emails, exact invitation-email matching, unique emails and Profile IDs, and a reached Day boundary.

A successful preflight does not prove that a supplied Profile ID belongs to its JWT. The gateway remains authoritative and rejects a mismatch before accepting that command.

## Full live smoke

```bash
python scripts/run_day1_pilot_smoke.py \
  --name 'ILKA Gate 9E Day 1 Pilot' \
  --timezone Europe/Warsaw \
  --day-boundary-local-time 06:00 \
  --local-date 2026-07-24 \
  --output .tmp/gate9e-day1-pilot-evidence.json
```

Omit `--expedition-key` to generate a fresh collision-resistant key. A failed run must not be retried with changed payloads under the same generated command IDs. Investigate the failure and use a new Expedition key unless the retry is the exact same request.

## Automatic acceptance checks

The run fails unless:

- all commands are accepted through the canonical gateway;
- 3–5 invitations become accepted and none remains pending;
- Rotation becomes authoritative and the Expedition transitions through `ready` to active Day 1;
- exactly `N TodayView + 1 CaptainDayView` are available for the same Expedition;
- Participant identities agree across Participant and Captain projections;
- Day 1 task blockers are participant-scoped;
- completing one Participant task removes only that Participant's blocker;
- exact `complete_task` replay returns the same event IDs and reports `replayed: true`;
- unique receipts have strictly increasing stream positions;
- canonical event IDs do not repeat across unique commands;
- all receipts point to one pinned runtime release;
- emitted evidence contains no raw invitation token, full Participant email, Auth/Profile identifier, JWT or HMAC secret.

The expected unique command receipt count is `2 × N + 5`. The evidence includes a second snapshot of the `complete_task` receipt only to prove replay; it does not represent another stored receipt.

## Required manual invariant

The public authenticated harness intentionally cannot inspect private aggregate metadata for an unrelated Expedition. Before and after the smoke, independently verify that `gate8d_smoke` remains:

```text
status: draft
runtime release: expedition_bootstrap_v1
stream position: 1
projection version: 0
```

Record only the non-secret result in the final Gate 9E evidence document. Do not add a service-role key or direct database mutation capability to this harness merely to automate the check.

## Evidence handling

The output file is a generated operational artifact, not a canonical contract or fixture. Do not commit live evidence automatically. After review, copy only verified non-secret conclusions into a dated document under `docs/deployments/`. Gate 9E remains open if any automatic or manual invariant is missing.
