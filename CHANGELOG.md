# Changelog

## 2026-07-20 — Frontend Foundation

- Added the Frontend Foundation audit and acceptance gate.
- Added deterministic frontend dependency installation through `frontend/package-lock.json`.
- Extended protected `contracts-and-tests` CI with design/contract generation, source validation, frontend tests, strict TypeScript, production build, static preview build and generated-source parity.
- Repaired the malformed `xp_summary_card.states` entry in the canonical component catalog.
- Replaced `localStorage` queue persistence with an idempotent IndexedDB command queue and memory fallback.
- Added Participant command delivery overlays for `pending`, `synced`, `conflict`, `rejected` and `offline` without changing authoritative task/card state.
- Added schema-valid Day 1 Participant, Captain initial and Captain after-sync preview projections.
- Bound Day 1 cards, outputs and role assignments to canonical stage and sample-event sources in validation.
- Added an installable PWA manifest, projection-safe service worker and offline fallback.
- Completed the Frontend Foundation gate on protected `main`.

No Supabase migrations have been applied. ADR-012 remains Proposed.

## 2026-07-20 — Canonical baseline

- Completed the controlled canonical repository bootstrap.
- Restored and validated the canonical `examples/sample-events.json` event stream.
- Aligned Participant role projection requirements with canonical contracts.
- Added manual `workflow_dispatch` support to the repository validation workflow.
- Passed the canonical repository validator and the complete pytest suite in GitHub Actions.
- Created `main` from the verified canonical baseline commit.

Canonical baseline commit before this changelog entry: `98a545b36fe62d5f08b0c00b3042cc3d87e4ba1a`.

No Supabase migrations have been applied. ADR-012 remains Proposed.

## 2026-07-19

- Initialized the GitHub repository.
- Added project instructions and source-of-truth map.
- Added proposed ADR-012 for Supabase runtime architecture.
- Added the canonical pipeline, permissions and role-rotation rules.
- Started controlled migration from the canonical Google Drive project folder.

No Supabase migrations have been applied. ADR-012 remains Proposed.
