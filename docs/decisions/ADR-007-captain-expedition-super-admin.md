# ADR-007 — Captain as Expedition Super Admin

- Status: accepted
- Date: 2026-07-18

## Context

The Captain is already the highest authority for vessel safety and the only actor allowed to perform critical Expedition corrections. The MVP also requires one clearly accountable administrator who can recover the digital scenario when the calendar, team composition, or active assignments no longer match reality.

A Product Captain facilitates the product process but never receives Captain or safety authority.

## Decision

`captain` is the **Super Admin within one Expedition**.

This is not a global platform administrator role. A Captain's authority is scoped to the Expedition where the actor is the current Captain.

Captain:

- inherits Participant and Product Captain capabilities;
- may execute every human-facing Expedition command;
- may force the next Calendar Day transition before the configured boundary;
- may rewind the active Calendar Day to any earlier existing day;
- may ban or unban a Participant from the current Expedition;
- may override roles, day close, Stage progression and program state;
- always retains vessel safety authority.

## Non-negotiable invariants

Super Admin authority does not permit:

- deleting, editing or reordering append-only events;
- impersonating `system_clock` or directly issuing `process_day_boundary`;
- globally banning a user account outside the current Expedition;
- banning the current or only Captain;
- restoring deleted history, because history is never deleted.

Every Super Admin action requires a reason and server confirmation.

## Forced day transition

`force_day_transition` creates the next sequential Calendar Day before the normal boundary or after an operational exception.

It uses the same transition outputs as `process_day_boundary`, but also emits `day.transition_forced` with Captain, reason and expected projection version.

It cannot create two days with the same local date and cannot skip an unresolved concurrent administrative transition.

## Day rewind

`rewind_day` moves the authoritative active-day cursor to an earlier existing `day_number`.

It does not remove events. Instead:

1. current assignments expire;
2. `day.rewind_applied` records the correction;
3. days after the target become `superseded` in the active projection;
4. the target day receives a new `day_revision`;
5. assignments and Card Bundles are published for the new revision;
6. rotation is recalculated;
7. queued commands based on a superseded revision are rejected with `day_revision_conflict`.

Calendar Day rewind does not implicitly change Product Stage. Captain may manage Product Stage separately through the Stage controls.

## Participant ban

`ban_participant` immediately revokes access to the current Expedition after server confirmation.

- historical events, evidence and authorship remain intact;
- active assignments are revoked;
- pending commands issued at or after `effective_at` are rejected;
- rotation is recalculated;
- if the active team falls below the minimum, the Engine appends `program.suspended`;
- the ban does not affect the person's account or other Expeditions.

`unban_participant` restores Expedition access but does not restore historical assignments or completed/waived tasks. The Participant becomes eligible for future rotation after recalculation.

## Offline behavior

Dangerous Super Admin commands are not offline queueable. Captain Console may save a local draft, but the UI must not display the action as applied until the server returns events.

A banned Participant who is still offline may temporarily see stale cached data. On the next authenticated request the server rejects sync, invalidates Expedition access and the app clears the active Expedition projection.

## Consequences

- `engine/permissions.yaml` marks Captain as Expedition Super Admin.
- command and event catalogs gain explicit forced-transition, rewind and ban contracts.
- participant and day projections gain `banned`, `superseded` and `day_revision` semantics.
- Captain Console exposes dangerous actions behind consequence preview and explicit confirmation.
- all actions remain auditable and reversible only by new events.
