# Participant App — First Vertical Requirements

## User scenario

Participant opens the installed PWA at sea and sees the current Calendar Day, active Product Stage, product role, onboard role, required cards and tasks. Cached content remains readable offline. User actions are written to a local command queue and later receive `pending`, `synced`, `conflict`, or `rejected` state.

## Day boundary behavior

- Participant never presses `Start Day`.
- Normal day transition is created by `system_clock` through `process_day_boundary`.
- At the configured local boundary, an offline device must stop presenting yesterday's assignments as active.
- Until authoritative synchronization, old assignments are shown as `expired_pending_sync` and new bundles as `awaiting_bundle_sync`.
- Calendar Day and Product Stage are displayed separately.

## Today screen

The first vertical must show:

- local calendar date and `day_number`;
- current `stage_id` and stage title;
- authoritative product role from the active Card Bundle;
- one onboard role;
- required Card Bundle;
- tasks grouped as Current and Overdue;
- sync state for every queued action;
- Captain safety message/hold when present.

## Participant commands

Offline queueable:

- `acknowledge_card`;
- `start_task`;
- `block_task` with a reason;
- `complete_task` with evidence references.

Not permitted:

- `process_day_boundary`;
- Captain overrides;
- role reassignment;
- Recovery Day activation;
- closing Expedition;
- safety decisions.

## Task timing

Task states exposed by the UI:

- `available`;
- `in_progress`;
- `blocked`;
- `completed`;
- `overdue`;
- `completed_late`;
- `waived`.

Late completion must not make a previous day look completed on time.

## Architecture boundaries

- `engine/` owns commands, guards, transitions, permissions and emitted events.
- `stages/` and `cards/` own methodology and content.
- `app/` renders projections and submits commands.
- UI does not infer completion, role compatibility, Product Stage progression or Captain authority.

## MVP exclusions

No chat, public cross-Expedition leaderboard, purchasable XP, arbitrary event editing, visual schedule builder or peer-to-peer mesh sync.


## Product Stage handover

- Product Captain may create `request_stage_advance` after the Stage Definition of Done is satisfied.
- The request may be queued offline and displays `pending`, `synced`, `conflict` or `rejected`.
- A request never changes the active Product Stage and never grants Captain authority.
- After Captain advances the Stage, Participants continue to see the current authoritative bundle until the next `day.started` publishes the new Stage bundles.

## Banned Participant state

After authoritative `participant.banned` synchronization:

- Expedition access is revoked;
- new commands and pending commands issued at or after `effective_at` are rejected;
- active roles and tasks are no longer actionable;
- the app shows an access-revoked screen instead of TodayView;
- cached Expedition projections are cleared or locked;
- historical authorship remains in the team event log.

A device that is fully offline may temporarily show stale cached data. This data is marked non-authoritative and no queued action is accepted by the server after the ban effective time.

After `participant.unbanned`, the Participant regains access but does not regain historical assignments. New roles arrive through a later rotation recalculation and Card Bundle publication.

## Product Decision voting

- Eligible Participants see the decision question, alternatives, criteria and evidence references.
- `vote` is offline queueable and displays `pending / synced / conflict / rejected`.
- A Participant may recast before close; the highest synchronized `ballot_revision` is effective.
- The UI shows whether the actor is eligible and their own current choice, but does not infer the winner locally.
- Ballots from banned actors, closed rounds or stale day revisions are rejected.


## Role XP and ratings

- Participant sees XP separately for each product and onboard role.
- Locally completed work may show `xp_state: provisional`; authoritative XP appears only after synchronized Engine events.
- Participant cannot submit XP values, verify their own role assignment, edit score or calculate rank.
- Role levels are `observer`, `crew`, `practiced`, `lead`, `mentor`.
- Expedition Contribution Rating is shown with rules version, snapshot timestamp and status.
- Ties share rank. Cook and low-load roles are normalized against their expected assignment opportunity.
- Recovery Day, waived work, safety override and offline delay produce no negative XP.


## Prototype Stage

- Stage 07 displays the confirmed `mvp_scope`, `out_of_scope` and `acceptance_criteria` beside the assigned Prototype cards.
- Build Lead and Product Support may cache the Prototype task, attach evidence and synchronize completion through the existing command queue.
- Product Captain may queue `confirm_output` and `request_stage_advance` under the existing permission rules.
- Local drafts may be shown as `pending`, but outputs remain non-authoritative until `output.confirmed` is synchronized.
- UI does not infer Prototype completion, acceptance-criteria coverage or eligibility for Stage advance.


## Build Stage

- Stage 08 displays confirmed `prototype`, `prototype_test_plan`, `open_questions`, `mvp_scope`, `out_of_scope` and `acceptance_criteria` beside the assigned Build cards.
- Build Lead and Product Support may cache the Build task, attach evidence, record acceptance checks and synchronize completion through the existing command queue.
- Product Captain may queue `confirm_output` for `working_increment`, `build_log` and `known_limitations`, then create `request_stage_advance` under the existing permission rules.
- Local Build evidence may be shown as `pending`, but outputs remain non-authoritative until `output.confirmed` is synchronized.
- UI does not infer Build readiness, acceptance-criteria coverage, limitation severity or eligibility for Stage advance.


## Launch Stage

- Stage 09 displays confirmed `working_increment`, `build_log`, `known_limitations`, `mvp_scope`, `out_of_scope` and `acceptance_criteria` beside the assigned Launch cards.
- Demo Lead and Product Support may cache the Launch task, prepare a bounded audience package, record distribution evidence and synchronize completion through the existing command queue.
- Product Captain may queue `confirm_output` for `launch_package`, `distribution_log` and `launch_metrics`, then create `request_stage_advance` under the existing permission rules.
- Local distribution records and metric drafts may be shown as `pending`, but outputs remain non-authoritative until `output.confirmed` is synchronized.
- UI does not infer Launch success, audience consent, metric validity, blocker severity or eligibility for Stage advance.


## User Feedback Stage

- Stage 10 displays confirmed `launch_package`, `distribution_log`, `launch_metrics`, `known_limitations`, `mvp_scope`, `out_of_scope` and `acceptance_criteria` beside the assigned User Feedback cards.
- Validation Lead and Product Support may cache the feedback task, capture consent-aware records, attach evidence and synchronize completion through the existing command queue.
- Raw observation, team interpretation, signal classification and issue priority are displayed as separate fields; locally drafted records remain `pending` until synchronized.
- Product Captain may queue `confirm_output` for `feedback_log`, `signal_summary` and `priority_issues`, then create `request_stage_advance` under the existing permission rules.
- UI does not infer signal validity, consent, frequency, severity, priority, Iteration solution or eligibility for Stage advance.


## Iteration Stage

- Stage 11 displays confirmed `working_increment`, `launch_package`, `launch_metrics`, `known_limitations`, `feedback_log`, `signal_summary`, `priority_issues`, `mvp_scope`, `out_of_scope` and `acceptance_criteria` beside the assigned Iteration cards.
- Build Lead and Product Support may cache the Iteration task, record a bounded decision, attach change and verification evidence and synchronize completion through the existing command queue.
- Product Captain may queue `confirm_output` for `iteration_decision`, `updated_increment` and `change_log`, then create `request_stage_advance` under the existing permission rules.
- Local decision, change-log and verification drafts may be shown as `pending`, but outputs remain non-authoritative until `output.confirmed` is synchronized.
- UI does not infer issue selection, scope compliance, acceptance-check success, regression safety, Demo Day readiness or eligibility for Stage advance.


## Demo Day Stage

- Stage 12 displays confirmed `iteration_decision`, `updated_increment`, `change_log`, `launch_metrics`, `signal_summary`, `known_limitations`, `mvp_scope`, `out_of_scope` and `acceptance_criteria` beside the assigned Demo Day cards.
- Demo Lead and Product Support may cache the Demo task, runbook, source map and Shore Package materials, attach evidence and synchronize completion through the existing command queue.
- Product Captain may queue `confirm_output` for `demo`, `shore_package` and `next_steps`, then queue `request_day_close`; there is no `request_stage_advance` from the final Stage.
- Local Demo, question-log, integrity-manifest and handover drafts may be shown as `pending`, but outputs remain non-authoritative until `output.confirmed` is synchronized.
- UI does not infer Demo validity, Shore Package integrity, final Day readiness or Expedition completion.

## Completed Expedition

- `expedition.completed` changes the authoritative Expedition status to `completed`; `TodayView.expedition_completion` supplies `completed_at`, final Stage/Day, Shore Package ref, summary and final projection version.
- Operational task and Stage commands are disabled after synchronization; historical cards, outputs, events, XP and rating snapshots remain readable.
- A fully offline device may temporarily show stale active state, but queued operational commands recorded after completion are rejected when synchronized.
- Participant and Product Captain never receive a `close_expedition` action.
