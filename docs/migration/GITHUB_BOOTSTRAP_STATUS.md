# GitHub bootstrap status

- Date: 2026-07-19
- Canonical source: `MP | Voyage OS/ilka-expedition-os`
- Target: `SLADZARI/ILKA-EXPEDITION-OS`
- Branch: `chore/bootstrap-canonical-repository`
- Status: in progress

## Imported in this bootstrap

- repository README;
- project instructions;
- source-of-truth map;
- proposed ADR-012;
- 12-stage pipeline;
- permission matrix;
- deterministic role-rotation rules;
- changelog and repository hygiene files.

## Required next import batch

1. accepted ADR-004 through ADR-011;
2. command and event catalogs;
3. command/event/read-model JSON Schemas;
4. game engine and reducers;
5. roles and gamification rules;
6. Stage 01–12 definitions;
7. cards manifest and 132 card files;
8. Participant/Captain app requirements and API contracts;
9. frontend and design-system packages;
10. examples, scripts and tests.

## Guardrails

- Google Drive remains the canonical baseline during migration.
- Archive and quarantine folders are excluded.
- No Supabase migration is applied while ADR-012 is Proposed.
- Imported files must preserve stable IDs and source-of-truth ownership.
- The bootstrap PR must not be merged until file parity and validation are reported.
