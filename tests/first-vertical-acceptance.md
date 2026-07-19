# First Vertical Acceptance Tests

## A1 Create Expedition

Given a valid Captain, when `create_expedition` is accepted, exactly one `expedition.created` event is appended and Expedition state becomes `draft`.

## A2 Add Participants

The Engine accepts 3–5 unique Participants, rejects duplicate participant IDs and does not start an Expedition with an invalid team size.

## A3 Deterministic Rotation

The same Participants, order, seed and rules version produce the same Rotation Plan. Each Participant receives exactly one product role and one onboard role per day.

## A4 Cook Compatibility

A Participant assigned `cook` receives only a `low` product load unless Captain creates a reasoned override event.

## A5 Automatic Boundary Idempotency

Repeated `process_day_boundary` attempts for the same Expedition and local date use the same idempotency key and create only one Day, assignment set and Card Bundle publication.

## A6 Offline Task Completion

A queueable command created offline remains `pending`, later becomes `synced`, and retry with the same `command_id` does not create duplicate events.

## A7 Local Boundary Projection

An offline device crossing the local boundary shows previous assignments as `expired_pending_sync` and never presents them as authoritative current roles.

## A8 Close Blockers

Normal `close_day` is rejected while required outputs, acknowledgements or tasks remain incomplete and not waived.

## A9 Captain Override

Captain may override day close or role assignment only with a reason. A new correcting event is appended and prior history remains unchanged.

## A10 Transition Recovery

A failed boundary appends `day.transition_failed`. Recovery requires a reason and appends `day.transition_recovered` before missing canonical transition events.

## A11 Event Replay

Replaying the append-only event log restores the same Expedition, Calendar Day, Product Stage, assignments, Card Bundles and task projection.

## A12 Permission Boundary

Product Captain cannot run `process_day_boundary`, apply safety override, change Captain, activate Recovery Day, override roles or close Expedition.

## Product Stage progression

- Product Captain may queue `request_stage_advance` offline.
- Only Captain may execute `advance_stage` or `override_stage_advance`.
- Calendar boundary and Recovery Day never advance Product Stage.
- New Stage bundles publish on the next authoritative `day.started`.
- Final Stage uses `close_expedition`, not `advance_stage`.
