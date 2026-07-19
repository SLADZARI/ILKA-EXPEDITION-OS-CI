# ADR-005 — Canonical command IDs, Product Captain and output confirmation

- Status: Accepted
- Date: 2026-07-18

## Context

The repository contained three conflicting command vocabularies: dotted IDs in `schemas/command.schema.json`, snake_case IDs in `engine/command-catalog.yaml`, and legacy names in `engine/game-engine.yaml`. The actor role `product_duty_officer` also remained in schemas, permissions, stages and documents after the product term had changed to Product Captain. Stage Definition of Done referenced confirmed outputs, but no command/event pair existed to record confirmation.

## Decision

1. Canonical command IDs use `snake_case` and are owned by `engine/command-catalog.yaml`.
2. `schemas/command.schema.json` validates exactly the same canonical command ID set and command envelope.
3. Event IDs remain dot-separated (`output.confirmed`, `day.closed`).
4. The canonical actor role is `product_captain`. `product_duty_officer` is retained only in migration alias maps and must never be emitted by active clients or the Engine.
5. Legacy command IDs are converted at the migration/import boundary using `engine/command-catalog.yaml#legacy_aliases`; active schemas do not accept legacy values.
6. Output completion is event-sourced through `confirm_output` -> `output.confirmed`.
7. `request_day_close` may be queued offline, but closing or overriding a day requires server confirmation and Captain authority.
8. Onboard rotation advances from `day.started`; closing a day does not emit a separate rotation-advance event.

## Consequences

- `game-engine.yaml`, `permissions.yaml`, command/event catalogs, schemas, reducers, app transport contracts, examples and tests must remain synchronized.
- Existing stored commands using legacy IDs require a one-time migration through the alias map.
- UI read models expose output confirmation state so CaptainDayView can explain close blockers.
