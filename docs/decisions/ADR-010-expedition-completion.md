# ADR-010 — Final Stage and Expedition Completion

- Status: Accepted
- Date: 2026-07-19
- Owners: Product Architecture / Engine

## Context

Canonical Engine already declares Expedition state `completed`, and permissions already state that Product Captain cannot close an Expedition. However, prior to this ADR there was no canonical `close_expedition` command, no `expedition.completed` event and no valid way to complete the final `demo_day` Stage because ordinary `advance_stage` requires an immediate next Stage.

Using `advance_stage` with a fabricated Stage, silently treating `day.closed` as Expedition completion or letting UI mark completion would create competing business rules and violate the append-only Engine boundary.

## Decision

1. `demo_day` is the final Product Stage and has no next Stage.
2. Ordinary Stage progression remains `request_stage_advance` → Captain `advance_stage` for Stages 01–11 only.
3. Final completion is a separate Captain-only command: `close_expedition`.
4. `close_expedition` requires online server confirmation and is not offline queueable.
5. The command is valid only when:
   - Expedition is `active`;
   - active Stage is `demo_day`;
   - Day 12 is authoritatively `closed`;
   - Stage 12 Definition of Done is satisfied;
   - `demo`, `shore_package` and `next_steps` are confirmed;
   - no unresolved critical Demo blocker or safety hold exists;
   - the expected projection version matches;
   - completion has not already been applied.
6. The command emits, in order:
   - `role_assignments.expired` for remaining active assignments;
   - `stage.completed` with `next_stage_id: null`;
   - `expedition.completed`.
7. `expedition.completed` moves the Expedition projection to `completed` and makes operational commands read-only. Append-only Gamification correction and derived rating publication remain allowed by their existing contracts.
8. Product Captain confirms outputs and requests final Day close, but never closes the Expedition.
9. No override completion command is introduced in MVP. Unmet conditions remain blockers; Captain may suspend the program or correct evidence through new append-only events.

## Command payload

`close_expedition` requires:

- `final_stage_id`;
- `final_day_number`;
- `shore_package_ref`;
- `completion_summary`;
- `expected_projection_version`.

## Event payload

`expedition.completed` records:

- `final_stage_id`;
- `final_day_number`;
- `shore_package_ref`;
- `completion_summary`;
- `final_projection_version`.

## Offline behavior

A device may cache Demo content and queue card acknowledgements, task completions and output evidence. `close_expedition` may be saved as a local draft in Captain Console, but it is never placed in the offline command queue and is not shown as applied until the authoritative event synchronizes.

Pending Participant commands received after `expedition.completed` are rejected as stale terminal-state commands. The completed Expedition remains readable from cached and synchronized projections.

## Consequences

- Final Stage completion is explicit and cannot accidentally open a thirteenth Stage.
- Expedition completion is logged as a Captain action in the append-only event stream.
- `stage.completed.next_stage_id` becomes nullable only for the final Stage.
- Engine, schemas, permissions, reducers, app projections, examples and tests must remain synchronized.
- The isolated UI migration candidate must not redefine this lifecycle.

## Read-model and delivery amendment

The final command remains server-confirmed and must never enter the offline queue.

- `app/contracts/offline-command.schema.json` contains only commands whose canonical `engine/command-catalog.yaml` entry has `offline_allowed: true`.
- `close_expedition` is excluded from the offline queue schema and may exist only as a local unsent UI draft.
- `TodayView.expedition_completion` exposes the authoritative completed result after synchronization.
- `CaptainDayView.completion_readiness` exposes server-derived readiness, blockers, Shore Package ref and `expected_projection_version` before confirmation.
- `CaptainDayView.expedition_completion` exposes the authoritative completed result after synchronization.
- `stage.completed.next_stage_id: null` is schema-valid only when payload `stage_id` is `demo_day` and `completed_on_day_number` is `12`; all non-final stages require a string next Stage ID.
- UI must not infer readiness, synthesize a Shore Package ref or optimistically set Expedition status to `completed`.
