# Source of truth map

## Priority

1. `docs/decisions/ADR-*`
2. JSON Schema in `schemas/` and `engine/event.schema.json`
3. Engine configuration in `engine/*.yaml`
4. Stage and card content in `stages/` and `cards/`
5. App contracts and requirements in `app/`
6. examples and tests
7. UI implementation
8. Supabase runtime implementation

## Entity ownership

- Expedition lifecycle: accepted ADR and `engine/game-engine.yaml`
- Commands: `engine/command-catalog.yaml`
- Command envelope/payload validation: `schemas/command.schema.json`
- Events: `engine/event-catalog.yaml` and `engine/event.schema.json`
- Reducers: `engine/reducers.yaml`
- Permissions: `engine/permissions.yaml`
- Pipeline: `engine/pipeline.yaml`
- Roles: `engine/roles-catalog.yaml`
- Rotation: `engine/role-rotation-rules.yaml`
- Gamification: ADR-009, `engine/gamification-rules.yaml`, `schemas/gamification.schema.json`
- Stage definitions: `stages/*.yaml`
- Cards: `cards/manifest.yaml`, `cards/**/*.md`
- Participant/Captain read models: `app/contracts/*.schema.json`
- Offline queue vocabulary: `app/contracts/offline-command.schema.json`
- Production frontend: ADR-011 and `frontend/`
- Design tokens and stable component IDs: `design-system/`
- Supabase persistence and transport: ADR-012 and `supabase/` after acceptance

## Conflict handling

When sources conflict:

1. name the conflicting files and rules;
2. do not make a hidden decision;
3. select the active source by priority;
4. recommend the resolution;
5. identify the file that must own the rule;
6. list all files that need synchronization.

No runtime table, UI type or generated artifact may become a competing copy of a canonical rule.
