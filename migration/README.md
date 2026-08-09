# Fractal 2 migration preparation

Source snapshot: `SLADZARI/ILKA-EXPEDITION-OS-CI@f508121bf06f47f703e6ccc7c93da944b98608db`

This branch is a preparation layer only. It does not change the current ILKA runtime. The purpose is to freeze the source vocabulary and define a controlled migration into a separate Fractal 2 / project-collaboration repository.

## Decision fixed for the first MVP

- Keep **Day** as the daily game cycle.
- Keep daily **role rotation**.
- Keep current Day boundary and processing-time model.
- Keep tasks, stages, outputs, decisions, votes, invitations, memberships, event sourcing, offline sync and Supabase architecture.
- Add **Session** inside Day. MVP uses one primary session per day, while the schema must allow multiple sessions later.
- Roles define daily responsibility. They do not define contribution attribution.
- Session processing creates project value (`generated spores`). The following day can confirm/correct participant attribution while the new session generates new spores.
- Spores are contribution accounting only; they do not represent equity, IP ownership or payment rights.

## Source architecture being preserved

ILKA already separates methodology, engine and interfaces. The existing engine contains state transitions, permissions, role assignment, task lifecycle, voting, append-only events, deterministic projections, command idempotency and offline synchronization. The migration should reuse that foundation instead of rewriting it.

## Target product loop

```text
DAY START
  -> daily role assignments
  -> participant role cards / tasks
  -> primary project call
  -> transcript or source attached to Session
  -> evening AI processing
  -> speaker mapping + project delta + contributions
  -> generated spores
  -> NEXT DAY
  -> previous attribution review / settlement
  -> new daily roles and new work
```

## Migration strategy

### KEEP

Do not rewrite in the first pass:

- Supabase project and connection
- command gateway
- immutable event history
- command receipts and projection versioning
- memberships and invitations
- offline queue and synchronization
- task commands and task states
- day boundary
- stage progression
- decision and voting engine
- output/evidence flow
- recovery-day mechanics

### ADAPT

Adapt presentation and project semantics while keeping backend compatibility where possible:

- `Expedition` -> UI: **Project**
- `Captain` -> UI: **Project Owner**
- `Participant` -> UI: **Contributor**
- `Product Captain` -> UI: **Product Lead**
- `Product Stage` -> UI: **Project Stage**
- `Product Role` -> UI: **Project Role**
- gamification XP UI -> **Spores / Contribution**, initially through an adapter

Do not perform a mass database rename in the first product pass.

### REPLACE CONTENT

Replace the maritime methodology rather than the underlying role engine.

Initial role groups:

**Project roles**
- Host / Facilitator
- Analyst
- Product Lead
- Researcher
- Critic / Challenger
- Designer
- Developer
- QA / Tester
- Marketer
- Synthesizer

**Team / social roles**
- Connector
- Observer
- Moderator
- Storyteller
- Scout

The exact list must be reconciled with existing role schemas and rotation constraints before implementation.

### ADD

Core new domain layer:

1. Session
2. Session Analysis
3. Speaker Identity Mapping
4. Contribution
5. Spore Allocation / Settlement
6. Session ingestion + processing command path
7. Session Review UI

Machine-readable details are in `migration/fractal2-migration-map.yaml`.

## Existing component treatment

### Keep as-is or nearly as-is

`app_shell`, `screen_header`, `section_header`, `icon_button`, `card_shell`, `action_card`, `knowledge_card`, `team_card`, `decision_card`, `card_hand`, `mini_card`, `status_badge`, `sync_status`, `progress_bar`, `primary_button`, `action_list`, `completion_checklist`, `task_row`, `output_row`, `blocker_panel`, `bottom_sheet`, `empty_state`, `role_mastery_card`, `contribution_rating_card`, `vote_card`, `ballot_option`, `vote_result_banner`, `recovery_day_card`, `recovery_day_activation`, `rating_indicator`, `stage_path`.

### Adapt / rename in target UI

- `product_role_card` -> `project_role_card`
- `onboard_role_card` -> `team_role_card`
- `mission_card` -> `session_mission_card`
- `participant_assignment_row` -> `contributor_assignment_row`
- `captain_alert` -> `project_owner_alert`
- `captain_control_panel` -> `project_control_panel`
- `xp_badge` -> `spore_badge`
- `xp_entry_row` -> `spore_entry_row`
- `xp_summary_card` -> `spore_summary_card`
- `stage_card` -> `project_stage_card`
- `participant_card` -> `contributor_card`

### New components

- `session_card`
- `session_source_uploader`
- `speaker_mapping_card`
- `speaker_mapping_row`
- `session_summary_card`
- `project_delta_card`
- `contribution_card`
- `spore_allocation_card`
- `session_review_panel`
- `previous_day_settlement_card`

## Speaker identification rule

Speaker diarization and person identification are separate.

1. Source is diarized into `Speaker 1..N`.
2. Known project roster and today's roles are supplied only as context hints.
3. AI proposes `speaker -> participant` mapping with confidence.
4. Human review confirms/corrects mapping when needed.
5. Contribution is always attached to participant identity, never inferred solely from a daily role.

Persistent voice biometrics and an embedded call recorder are explicitly out of scope for the first MVP.

## Spores rule

The ledger has three useful states:

- **generated** — the session created estimated project value;
- **proposed** — AI proposed participant attribution;
- **settled** — attribution was confirmed/corrected.

The total generated amount is not silently changed merely because speaker attribution is corrected. Corrections alter attribution/provenance. Any later change to value must be represented explicitly rather than rewriting history.

## First technical pilot

Run a real project with 3–5 people for 3–5 days:

1. Create project / invite team.
2. Daily roles rotate normally.
3. Each participant sees role card and responsibilities.
4. One daily call is attached as transcript/source.
5. AI processes it in the existing evening window.
6. Team reviews speaker mapping and project delta.
7. Generated spores appear.
8. Following day attribution is settled.
9. Existing tasks / voting / stages continue to work.

The MVP succeeds only if the team trusts the reconstructed conversation and contribution attribution enough to keep using it.

## Repository-copy sequence

1. Freeze source at the commit above.
2. Create a separate target GitHub repository.
3. Copy the full source snapshot into that repository.
4. Keep the existing Supabase architecture and connection for the first migration pass.
5. Make all Fractal 2 changes only in the target repository.
6. Preserve the original ILKA repository as the reference implementation / archive.

No production ILKA files should be rewritten from this preparation branch.
