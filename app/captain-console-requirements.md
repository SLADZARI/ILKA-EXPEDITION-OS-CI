# Captain Console — First Vertical Requirements

## User scenario

Captain creates the Expedition, adds 3–5 Participants, confirms the Rotation Plan and starts the Expedition. Calendar days then start automatically at the configured local boundary. Captain monitors the resulting transition, manages exceptions and closes the product day when Engine guards pass.

## Day boundary behavior

- Captain Console has no normal `Start Day` control.
- The console shows boundary time, target local date and transition status.
- Successful transition shows `day.started`, active assignments and published Card Bundles.
- Failed transition shows `transition_failed`, reason and a `recover_day_transition` action.
- Recovery requires a reason and appends corrective events; prior events are never edited.

## Required controls

Captain may:

- create Expedition and manage members;
- generate and preview Rotation Plan;
- start Expedition;
- inspect a Product Captain stage-advance request;
- advance Product Stage after the current day is closed and Stage guards pass;
- override Product Stage advance with reason and recorded unmet conditions;
- recover failed day transition;
- override role assignment with reason;
- activate Recovery Day with reason;
- suspend/resume product program;
- waive a task with reason;
- close day when guards pass;
- override day close with reason and recorded unmet conditions;
- apply safety/emergency controls.

## Day overview

The first vertical must show:

- Calendar Day separately from Product Stage;
- current boundary and server transition state;
- every Participant's product and onboard assignment;
- Cook compatibility result;
- required card acknowledgements;
- terminal/non-terminal tasks and overdue count;
- sync state per Participant;
- close blockers;
- append-only history of Captain actions.

## Permission boundary

Product Captain may facilitate the product process and request close, but may not:

- apply safety override;
- change Captain;
- change vessel route or navigation authority;
- activate Recovery Day;
- override assignments;
- close Expedition.

## Offline behavior

Captain can inspect the last synchronized state offline. Commands that can change shared authority or day state require server confirmation. UI must distinguish `pending`, `synced`, `conflict`, and `rejected`.

## MVP exclusions

No manual normal day start, arbitrary event editing, public cross-Expedition leaderboard, purchasable XP, visual methodology editor or mesh synchronization.

## Product Stage progression

- Calendar Day and Product Stage are shown as separate authoritative projections.
- `request_stage_advance` records intent only.
- `advance_stage` and `override_stage_advance` require online server confirmation and Captain authority.
- The console displays the next sequential Stage, Definition of Done blockers and request sync status.
- Advancing Stage does not publish cards immediately; the next `day.started` publishes new Stage Card Bundles.

## Expedition Super Admin

Captain is the Super Admin of the current Expedition and inherits Participant and Product Captain capabilities.

The console must expose a separate **Super Admin** section with consequence preview, required reason and explicit confirmation for:

- `force_day_transition` — create the next sequential Calendar Day before the normal boundary;
- `rewind_day` — restore an earlier existing Calendar Day as a new revision;
- `ban_participant` — revoke a Participant's access to this Expedition;
- `unban_participant` — restore Expedition access without restoring historical assignments.

These actions require online server confirmation. A locally saved draft is not displayed as applied.

### Day rewind UI

Before confirmation the console shows:

- current and target `day_number`;
- Product Stage, which is not changed by rewind;
- days that will become `superseded`;
- assignments and Card Bundles that will be republished;
- queued commands that may become `day_revision_conflict`;
- the new `day_revision` after server confirmation.

The event history remains visible and cannot be deleted.

### Participant ban UI

Before confirmation the console shows:

- Participant identity and active roles;
- assignments that will be revoked;
- effect on minimum active team size;
- whether the program will be suspended;
- warning that ban is scoped to this Expedition only.

Captain cannot ban the current Captain. Ban/unban actions are shown in the append-only admin audit log.

### Authority boundary

Captain Super Admin may perform every human-facing Expedition command, but may not:

- delete or edit past events;
- impersonate `system_clock` or issue `process_day_boundary` directly;
- globally ban a user account;
- remove the only/current Captain.

## Product Decision controls

- Captain can create or inspect a decision draft and vote round.
- Captain sees frozen eligible voters, effective ballot count, abstentions, threshold and blockers.
- `finalize_product_decision` is available only when every eligible voter has an effective ballot and one option has strict majority of all eligible voters.
- `override_product_decision` requires online server confirmation, a reason and unresolved objections.
- Captain cannot cast a ballot for another actor or edit prior vote events.

## Role verification and Gamification controls

Captain Console must show pending product/onboard assignment verifications, expected XP opportunity, current role XP balance and latest rating snapshot.

Captain may:

- `verify_role_assignment` as `completed`, `partial` or `waived`;
- attach evidence and a reason where required;
- `adjust_role_xp` only as an append-only correction with reason, evidence and expected balance version;
- inspect rating normalization for Cook and low-load roles.

Captain may not directly set participant rank, delete XP events, award XP for safety decisions or impersonate System publishing. `publish_rating_snapshot` is System-only and server-confirmed.

## Expedition completion

Captain Console exposes `close_expedition` only when the authoritative projection shows:

- active Stage `demo_day`;
- Day 12 in `closed` state;
- confirmed `demo`, `shore_package` and `next_steps`;
- satisfied Stage 12 Definition of Done;
- no unresolved critical Demo blocker or safety hold;
- a current expected projection version.

Before confirmation `CaptainDayView.completion_readiness` supplies server-derived final Stage, final Day, Shore Package ref, expected projection version and blockers. Captain enters the completion summary; the console also shows remaining active assignments and the consequence that operational commands become read-only. `close_expedition` is Captain-only, online, server-confirmed and append-only. A local draft is never displayed as applied.

On success the console renders `expedition_status: completed` and authoritative `expedition_completion.completed_at`, `final_stage_id`, `final_day_number`, `shore_package_ref`, `completion_summary` and `final_projection_version`. Completion does not delete history, reset Role XP or create a thirteenth Stage.
