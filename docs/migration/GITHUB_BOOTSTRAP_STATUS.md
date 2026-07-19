# GitHub bootstrap status

- Date: 2026-07-19
- Canonical source: `MP | Voyage OS/ilka-expedition-os`
- Target: `SLADZARI/ILKA-EXPEDITION-OS`
- Branch: `chore/bootstrap-canonical-repository`
- Status: in progress — second import batch applied

## Imported

- repository README, instructions, source-of-truth map and ADR-012;
- ADR-004 through ADR-011;
- pipeline, permissions and rotation rules;
- command and event catalogs;
- game engine and reducers;
- roles catalog and gamification rules;
- command, stage, card and gamification schemas;
- offline command, TodayView and CaptainDayView schemas;
- repository hygiene files.

## Remaining before parity

1. `engine/event.schema.json`;
2. remaining app/API descriptions;
3. Stage 01–12 files;
4. cards manifest and 132 cards;
5. app requirements and sync documentation;
6. frontend and design system;
7. examples, scripts and tests;
8. executable validation report.

## Current checks

- command catalog baseline: 36 commands;
- event catalog baseline: 48 event types;
- offline queue baseline: 10 commands;
- JSON schemas are stored in valid minified JSON form;
- semantic and path parity validation remains pending.

## Guardrails

- Google Drive remains canonical during migration.
- Archive and quarantine folders are excluded.
- Supabase migrations remain blocked while ADR-012 is Proposed.
- The Draft PR is not ready to merge until parity and tests pass.
