# ADR-006 — Product Stage progression

- Status: accepted
- Date: 2026-07-18
- Scope: Product Stage lifecycle, Captain confirmation, offline request and append-only events

## Context

Calendar Day and Product Stage are separate aggregates. `process_day_boundary` advances the Calendar Day and publishes assignments for the currently active Product Stage, but it must never advance the Product Stage. Existing stage files referenced non-canonical controls such as `open_stage`, `close_stage` and `override_roles`, while the Engine had no explicit Product Stage transition contract.

## Decision

Product Stage progression is sequential and Captain-confirmed.

### Commands

1. `request_stage_advance`
   - actors: `product_captain`, `captain`;
   - may be queued offline;
   - requires `from_stage_id`, `to_stage_id`, `requested_for_day_number`;
   - emits `stage.advance_requested`;
   - a stale request becomes `conflict` after the authoritative Stage changes.

2. `advance_stage`
   - actor: `captain` only;
   - requires server confirmation;
   - requires `from_stage_id`, `to_stage_id`, `effective_from_day_number`;
   - emits `stage.completed`, then `stage.opened`;
   - does not publish Card Bundles immediately. Bundles for the new Stage are published by the next `day.started` transition.

3. `override_stage_advance`
   - actor: `captain` only;
   - requires server confirmation;
   - requires `reason` and `unmet_conditions` in addition to the normal transition payload;
   - emits `stage.advance_overridden`, `stage.completed`, then `stage.opened`.

### Guards

Normal `advance_stage` requires:

- `from_stage_id` is the active Stage;
- `to_stage_id` is the immediate next Stage in `engine/pipeline.yaml`;
- the current Calendar Day is closed;
- the active Stage Definition of Done is satisfied;
- `effective_from_day_number` identifies the next not-started Calendar Day;
- no other Stage transition is being applied.

Override additionally requires that the active Stage allows Captain override, `reason` is non-empty and `unmet_conditions` are recorded.

### State and event rules

- `stage.advance_requested` records intent and never changes the active Stage.
- `stage.completed` closes the current Product Stage in the projection.
- `stage.opened` activates the next Product Stage.
- `stage.advance_overridden` records the Captain decision without rewriting previous events.
- `process_day_boundary`, Recovery Day activation and `day.closed` never advance Product Stage.
- Stage 12 completion is outside the Day 1–3 vertical and requires a separate Expedition completion decision.

### Offline and conflicts

- `request_stage_advance` is stored locally with `command_id`, `base_version` and status `pending`.
- Re-sending the same `command_id` returns the original event set.
- A request for a Stage that is no longer active becomes `conflict`; the client refreshes the projection and does not auto-rewrite the command.
- `advance_stage` and `override_stage_advance` are not executed offline and require authoritative server state.
- UI exposes `pending`, `synced`, `conflict` and `rejected` for the request.

## Consequences

- Product Captain can prepare and submit the handover without acquiring Captain authority.
- Captain remains the only actor who changes the authoritative Product Stage.
- Calendar Day automation remains deterministic and independent.
- Stage files may reference only canonical command IDs.
