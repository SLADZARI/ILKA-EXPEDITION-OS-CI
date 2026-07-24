# Gate 9E4 authenticated live-smoke harness

Status: **implementation complete / live execution environment-blocked**

## Protected implementation

- merged pull request: `#47`;
- merge SHA: `024ab8ecdb2ab6d172ff75d2eba1605e55343397`;
- harness: `scripts/run_day1_pilot_smoke.py`;
- unit coverage: `tests/test_day1_pilot_smoke.py`;
- operator runbook: `docs/deployments/day1-pilot-live-smoke.md`.

The protected repository validation passed before merge, including canonical repository validation, Python tests, frontend tests and builds, Deno formatting/lint/typecheck/unit tests, complete local Supabase rebuild, pgTAP, database lint, command-gateway PostgreSQL integration and generated-source parity.

## Implemented closure path

The harness executes the exact Gate 9E development vertical through the authenticated public gateway:

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

Before the first domain write, preflight verifies one Captain and 3–5 distinct confirmed Participant Auth sessions, exact Participant email matching, unique Profile identifiers and a reached local Day boundary.

The live run then verifies:

- no pending invitation remains;
- deterministic Rotation makes the Expedition ready;
- Expedition start and trusted Day 1 boundary succeed;
- exactly `N TodayView + 1 CaptainDayView` are available;
- Participant identity sets agree across projections;
- task blockers remain Participant-scoped;
- completing one task removes only the authenticated Participant's blocker;
- exact replay returns the original event identities;
- unique receipts have strictly increasing stream positions;
- authoritative event IDs do not repeat;
- all receipts point to one pinned runtime release.

Generated evidence is recursively sanitized. JWTs, HMAC secrets, raw invitation tokens, full emails, Auth user identifiers and Profile identifiers are not emitted.

## Deliberate boundary

This implementation does not:

- configure GitHub or Supabase secrets;
- provision or fabricate Auth identities;
- create memberships or Participants through direct SQL;
- weaken JWT verification or trusted-clock HMAC authentication;
- add browser access to private schemas;
- add a service-role key to the operator harness;
- mutate or repin `gate8d_smoke`.

## Remaining Gate 9E closure

Gate 9E remains open until all of the following pass in development:

1. Configure `SUPABASE_ACCESS_TOKEN`, `ILKA_SYSTEM_CLOCK_HMAC_SECRET` and `ILKA_ALLOWED_ORIGINS` in the GitHub `development` environment.
2. Deploy `command-gateway` from protected `main` through the canonical workflow.
3. Confirm `ILKA_DEFAULT_RUNTIME_RELEASE_KEY=day1_pilot_v1`, allowed origins and trusted-clock HMAC by successful behavior without exposing secret values.
4. Provision or confirm one Captain and 3–5 real confirmed Participant Auth users with active Profiles.
5. Run the authenticated harness and retain sanitized evidence.
6. Independently verify before and after the run that `gate8d_smoke` remains `draft`, pinned to `expedition_bootstrap_v1`, at stream position `1` and projection version `0`.
7. Record the successful live evidence in a dated deployment document.

No environment blocker may be replaced by fake domain data, direct SQL creation or a weakened authentication path.
