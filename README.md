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

## Repository structure

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

The canonical baseline is protected on `main` and published as `v0.1.0-canonical-baseline`.

Frontend Foundation is complete:

- deterministic `npm ci` through a committed lockfile;
- generated design-system and TypeScript contracts checked against canonical sources;
- protected CI runs repository validation, Python tests, frontend tests, strict TypeScript and both production/preview builds;
- IndexedDB is the primary offline command queue with idempotent enqueue and in-memory fallback;
- Participant UI renders `pending`, `synced`, `conflict`, `rejected` and `offline` delivery state without calculating authoritative outcomes;
- schema-valid Day 1 Participant and Captain preview scenarios are tied to canonical stage, output and assignment sources;
- installable PWA metadata and a projection-safe service worker are present.

Production authentication, remote projection loading, server command transport and multi-device synchronization are not implemented. Supabase migrations must not be applied until ADR-012 is accepted.

## Run the Day 1 prototype

```bash
cd frontend
npm ci
npm run dev
```

Vite development mode opens the scenario launcher. The available canonical scenarios are:

```text
?scenario=day1&mode=participant
?scenario=day1&mode=captain
?scenario=day1&mode=captain&state=after_sync
```

Build and serve the explicit static preview:

```bash
npm run build:preview
npm run preview:static
```

The normal production build does not enable fixtures. It requires an authoritative `window.__ILKA_BOOTSTRAP__` injection from the application composition root.

## Validation

From the repository root:

```bash
python scripts/validate_repository.py .
pytest -q
cd frontend
npm ci
npm run check
```

`npm run check` generates canonical frontend sources, validates source parity, runs frontend tests, performs strict TypeScript checking and builds both production and static preview outputs.
