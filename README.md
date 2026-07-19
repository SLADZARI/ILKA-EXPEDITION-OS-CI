# ILKA Expedition OS

Configuration-driven, offline-first role-card system for a 12-day team product expedition on a yacht.

## Product layers

1. **Methodology** — stages, roles, cards, required outputs, checklists and Definition of Done.
2. **Engine** — states, transitions, rotation, permissions, validation, synchronization and append-only event log.
3. **Interfaces** — Participant App, Captain Console and AI Shore Team.

## Canonical baseline

- automatic Calendar Day boundary in the Expedition timezone;
- Calendar Day and Product Stage are separate projections;
- canonical `snake_case` command IDs;
- Product Captain manages the product process but has no vessel safety authority;
- Captain is Expedition-scoped Super Admin;
- sequential Captain-confirmed Product Stage progression;
- one floating Recovery Day;
- attributable Product Decision voting;
- Role XP and load-normalized Expedition Ratings;
- final `demo_day` and Captain-only `close_expedition`;
- append-only events and deterministic reducers;
- offline command queue with idempotent synchronization.

## Source-of-truth priority

1. `docs/decisions/ADR-*`
2. `schemas/*.json` and `engine/event.schema.json`
3. `engine/*.yaml`
4. `stages/*.yaml` and `cards/**/*`
5. `app/` contracts and requirements
6. examples and tests
7. frontend implementation
8. Supabase runtime implementation

## Target repository structure

```text
app/            UI requirements and read-model contracts
cards/          canonical card content
engine/         state, command, event, permission and rotation rules
frontend/       React/TypeScript PWA
schemas/        canonical JSON Schemas
stages/         product stages
supabase/       migrations and Edge Functions
tests/          validation and executable domain tests
docs/           ADR, architecture and workflows
design-system/  tokens and stable component IDs
```

## Runtime direction

- Frontend hosting: Vercel
- Backend: Supabase
- Offline data: IndexedDB + service worker
- Domain writes: Supabase `command-gateway`
- Runtime history: append-only `event_log`
- Reads: schema-valid Participant and Captain projections
- Cloudflare: not required for the MVP

## Current implementation status

Canonical domain contracts and the frontend/design-system boundary are defined on Google Drive. This GitHub repository is being populated through a controlled bootstrap Pull Request. Supabase schema migrations must not be applied until ADR-012 is accepted.
