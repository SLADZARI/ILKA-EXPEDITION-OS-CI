# ADR-009 — Role XP and Expedition Ratings

- Status: Accepted
- Date: 2026-07-19
- Owners: Product Architecture / Engine / Methodology

## Context

Earlier MVP documents excluded XP, ratings, badges and leaderboards to prevent unvalidated competitive mechanics from blocking the first vertical. The exclusion was a scope guard, not a permanent product principle. The next version requires role-based progression and transparent team ratings without moving business logic into UI or weakening safety, fairness, offline-first behavior or append-only history.

## Decision

ILKA Expedition OS introduces a configurable Gamification subsystem owned by `engine/gamification-rules.yaml`.

The subsystem has two independent capabilities:

1. **Role XP** — append-only mastery points accumulated separately for each `participant_id + role_id` pair.
2. **Expedition Ratings** — deterministic daily snapshots calculated from verified role contributions and normalized against the expected load of each assignment.

The subsystem is enabled per Expedition through explicit configuration. New Expeditions may enable both capabilities by default. Existing Expeditions require migration or an explicit enable event.

## Role XP rules

- XP is never accepted directly from a client as an authoritative value.
- XP is derived only from authoritative Engine events and `engine/gamification-rules.yaml`.
- Every `role_xp.awarded` event references one `source_event_id`, `assignment_id`, `role_id`, `participant_id`, `day_number` and `day_revision`.
- The same source event cannot award XP twice for the same role and participant.
- Participant, Product Captain and UI cannot set or edit XP.
- Captain may correct XP only through `adjust_role_xp` with a reason, evidence references and optional `correction_of`.
- XP is never negative as a punishment. A corrective adjustment may reduce an incorrect award but cannot create a negative role balance.
- `task.completed_late` may award reduced XP according to the rules file.
- `task.waived`, Recovery Day, safety override, illness, ban and offline delay do not generate penalties.
- Safety decisions, emergency actions, navigation authority and Captain authority never receive speed, volume or competitive bonuses.

## Role assignment verification

`verify_role_assignment` confirms the result of one completed or expired product/onboard assignment.

Verification outcomes:

- `completed` — full configured XP;
- `partial` — configured partial multiplier;
- `waived` — zero XP and no penalty.

Product assignments may be auto-verifiable when required tasks and outputs are satisfied. Onboard assignments require Captain verification unless a later ADR defines an authoritative automatic source.

## Role levels

Role level is a projection derived from accumulated XP thresholds. Initial canonical levels:

- `observer` — 0 XP;
- `crew` — 40 XP;
- `practiced` — 100 XP;
- `lead` — 200 XP;
- `mentor` — 350 XP.

A level change appends `role_level.changed`. Levels never grant Captain safety authority or bypass permissions.

## Ratings

Two read models are permitted:

- `role_mastery_rating` — XP and level per role;
- `expedition_contribution_rating` — normalized score from 0 to 100 for the current Expedition.

Contribution rating is based on verified assignment outcome divided by the expected XP opportunity for that assignment. This prevents high-load roles from automatically outranking Cook or Product Support. The score is the average of eligible assignment ratios, capped at 100.

Daily ratings are published through `rating.snapshot_published` after `day.closed` or after a corrective replay. Ties share the same rank. `participant_id` may be used only as a deterministic rendering tie-breaker, not to assign a different rank.

Banned or departed Participants retain historical XP and appear as `inactive` in historical snapshots. They are excluded from current active-team rank calculation.

## Offline and synchronization

- Local completion may show `xp_state: provisional`.
- XP becomes authoritative only after synchronized source events and server-side derivation.
- `verify_role_assignment`, `adjust_role_xp` and `publish_rating_snapshot` require server confirmation.
- Repeated commands use `command_id` idempotency.
- Awards use a second uniqueness key: `xp:<expedition_id>:<source_event_id>:<participant_id>:<role_id>`.
- If a Calendar Day revision is superseded, awards tied to that superseded revision are excluded during deterministic replay. A new rating snapshot is then published.

## Permissions

- Participant: read own XP and permitted rating views.
- Product Captain: read team stage contribution projections; cannot verify onboard roles, edit XP or publish ratings.
- Captain: verify assignments and create corrective XP adjustments.
- System: derive awards, levels and rating snapshots.
- Shore Team: read shared gamification projections only; cannot award or alter XP.

## UI boundary

UI renders Engine projections and never calculates XP balances, levels, normalized scores or ranks. Every visible rating must include the rules version and snapshot timestamp.

## Consequences

- The earlier blanket prohibition on XP and ratings is removed.
- Competitive features are permitted only through this ADR and versioned Engine configuration.
- Badges, public cross-Expedition leaderboards, prizes, penalties, purchasable XP and social comparison outside one Expedition remain out of scope.
- `achievement` remains a reserved card type and is not automatically equivalent to XP or rating.
