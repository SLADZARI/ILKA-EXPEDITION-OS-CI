# ADR-008 — Product Decision and voting contracts

- Status: Accepted
- Date: 2026-07-18
- Owners: Product Architecture / Engine

## Context

Stage 05 must convert Stage 04 evidence into one traceable product direction. `engine/permissions.yaml` already referenced `create_decision_draft`, `create_vote` and `vote`, but the authoritative command catalog, event catalog and schemas did not define them. Leaving voting only in permissions or UI would create competing business logic and an unverifiable Product Decision.

## Decision

### 1. Decision model

A `DecisionDraft` contains one question, 2–5 alternatives, decision criteria and evidence references. Option IDs are stable `snake_case` values inside the draft. Only one open `VoteRound` may exist for a decision.

### 2. Canonical commands

- `create_decision_draft` — Product Captain or Captain; offline queueable.
- `create_vote` — Product Captain or Captain; offline queueable, authoritative after sync.
- `vote` — eligible Participant, Product Captain or Captain; offline queueable.
- `finalize_product_decision` — Product Captain or Captain; server-confirmed.
- `override_product_decision` — Captain only; server-confirmed and reason required.

### 3. Voting rules

- MVP supports attributable `single_choice` voting only.
- `eligible_voter_ids` is frozen when the round opens.
- Captain may vote only when included in `eligible_voter_ids`; Super Admin authority does not silently change the electorate.
- Every eligible voter must submit an option or explicit `abstain` before normal finalization.
- A selected option must receive strictly more than 50% of all eligible voters. Abstention counts against reaching the threshold.
- An actor may recast before close. Each `vote.cast` has `ballot_revision`; the highest revision for that actor is effective.
- A tie or missing strict majority cannot be finalized normally. Product Captain may open a new round, or Captain may override with a recorded reason and unresolved objections.

### 4. Canonical events

- `decision.draft_created`
- `vote.opened`
- `vote.cast`
- `vote.closed`
- `product_decision.recorded`
- `product_decision.overridden`

All events are append-only. Recast, override and corrections never edit a prior event.

### 5. Outputs and Stage boundary

Stage 05 outputs remain:

- `product_decision`;
- `decision_rationale`;
- `rejected_alternatives`.

`product_decision.recorded` or `product_decision.overridden` establishes the decision projection. Existing `confirm_output` records acceptance of the three Stage outputs. Finalizing a Product Decision does not close Calendar Day and does not advance Product Stage.

### 6. Offline behavior

Draft, round creation and ballots may be queued locally with `pending / synced / conflict / rejected`. A locally created round is not shared with other devices until synchronized. Finalization and Captain override require an authoritative server projection. Ballots from banned actors, closed rounds, stale round versions or superseded day revisions are rejected.

### 7. Captain Super Admin

Captain can perform every Product Decision command and may apply `override_product_decision`. Captain cannot impersonate another voter, modify an existing ballot event, or delete decision history.

## Consequences

Command/event catalogs, Engine, permissions, schemas, reducers, app projections, examples, Stage 05, cards and tests must use the same IDs and threshold rules.

## Not included

- secret ballots;
- ranked-choice or multi-select voting;
- anonymous proxy voting;
- peer-to-peer offline vote synchronization;
- automatic AI selection of the winning option;
- ratings, XP or competitive scoring.
