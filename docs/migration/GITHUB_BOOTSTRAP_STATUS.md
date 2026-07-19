# GitHub bootstrap status

- Date: 2026-07-19
- Canonical source: `MP | Voyage OS/ilka-expedition-os`
- Target: `SLADZARI/ILKA-EXPEDITION-OS`
- Branch: `chore/bootstrap-canonical-repository`
- Status: in progress — second import batch complete

## Imported

- repository README, instructions, source-of-truth map and ADR-012;
- ADR-004 through ADR-011;
- pipeline, permissions and rotation rules;
- command and event catalogs;
- game engine and reducers;
- roles catalog and gamification rules;
- command, event, stage, card and gamification schemas;
- offline command, TodayView and CaptainDayView schemas;
- repository hygiene files.

## Remaining before full parity

1. remaining app/API descriptions;
2. Stage 01–12 files;
3. cards manifest and 132 cards;
4. app requirements and sync documentation;
5. frontend and design system;
6. examples, scripts and tests;
7. executable validation report.

## Current checks

- command catalog baseline: 36 commands;
- event catalog and schema baseline: 48 event types;
- offline queue baseline: 10 commands;
- JSON schemas use valid minified JSON formatting;
- cross-reference and path validation remains pending.

## Guardrails

- Google Drive remains canonical during migration.
- Archive and quarantine folders are excluded.
- Supabase migrations remain paused while ADR-012 is Proposed.
- The Draft PR stays open until parity and tests pass.
