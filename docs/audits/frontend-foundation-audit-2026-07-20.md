# Frontend Foundation Audit — 2026-07-20

## Status

- Audit scope: current canonical `main` after `v0.1.0-canonical-baseline`.
- Mode: repository audit and delivery planning.
- No domain rule is introduced by this document.
- Source-of-truth priority remains ADR → JSON Schema → Engine YAML → stages/cards → app contracts → UI implementation.

## Executive result

The repository already contains a substantial production-oriented frontend and design-system migration. The next milestone is **not** to create a new frontend shell. The correct next milestone is to reconcile, validate and complete the existing `frontend/` runtime as the first offline-first vertical slice.

Existing assets that must be preserved:

- accepted frontend boundary in `ADR-011`;
- canonical `design-system/` token and component-ID catalogs;
- generated TypeScript contracts;
- Participant and Captain screens;
- command factories and command transport boundary;
- schema-valid preview fixtures;
- reference-only Figma Make source under `design-system/reference/`.

## Current sources of truth

| Concern | Current owner |
| --- | --- |
| Frontend root and generated-code policy | `docs/decisions/ADR-011-frontend-root-generated-contracts-and-command-transport.md` |
| Participant projection | `app/contracts/today-view.schema.json` |
| Captain projection | `app/contracts/captain-day-view.schema.json` |
| Offline command vocabulary | `app/contracts/offline-command.schema.json` |
| Commands | `engine/command-catalog.yaml`, `schemas/command.schema.json` |
| Events | `engine/event-catalog.yaml`, `engine/event.schema.json` |
| Permissions | `engine/permissions.yaml` |
| Visual tokens | `design-system/tokens/design-tokens.with-ids.json` |
| Stable UI IDs and compositions | `design-system/components/component-catalog.with-ids.json` |
| Runtime implementation | `frontend/` |
| Figma Make provenance | `design-system/reference/` — reference only |

## Existing implementation inventory

### Reuse as-is

- `frontend/src/layout/AppShell.tsx` and the established `frontend/` root.
- Generated contract boundary under `frontend/src/contracts/generated/`.
- Design token generation and stable `data-ui-id` catalog.
- Presentational primitives and `CardShell`-based card composition.
- Projection-driven Participant Today and Captain Day Overview rendering.
- Explicit separation of offline-queueable commands from server-confirmed commands.
- Production behavior that refuses to invent a projection when `window.__ILKA_BOOTSTRAP__` is absent.

### Adapt

- `frontend/src/application/offline/OfflineCommandQueue.ts`: preserve the interface and runtime guard, replace `localStorage` persistence with IndexedDB.
- `frontend/src/app/App.tsx`: preserve Participant/Captain composition, add a projection store and visible command-state feedback.
- Preview fixtures: preserve schema validity, connect them to deterministic Day 1 scenario tests.
- Current state-based navigation: sufficient for the first prototype, but route/deep-link policy remains a later concern.
- `README.md`: update implementation status after the runtime gate is complete.

### Reference only

- Component Library and Design Kit views used for design QA.
- Original Figma Make router, fixture switcher and simulation controls.
- Any archive-local domain type or state machine.

### Replace / do not introduce

- Manual TypeScript copies of JSON Schema contracts.
- Client-side calculations for permissions, rotation, Definition of Done, voting result, Recovery Day availability, XP, rating or Expedition completion.
- A second component or token catalog.
- A second frontend root.

## Verified strengths

1. `ADR-011` explicitly assigns production React/TypeScript to `frontend/`, visual contracts to `design-system/`, and generated domain types to JSON Schema generation.
2. The current app renders Participant and Captain modes from injected authoritative projections.
3. The command dispatcher separates offline queue delivery from server-confirmed transport.
4. Frontend source validation already checks command/event parity, offline vocabulary, fixtures, token IDs, component IDs and runtime boundary files.
5. The component catalog already defines the card-first interaction model and stable IDs.

## Blocking gaps before a runnable vertical slice

### P0 — frontend validation is not part of protected CI

The root workflow currently runs only:

- `python scripts/validate_repository.py .`;
- `pytest -q`.

It does not run `frontend` source generation, source validation, TypeScript or Vite build. Therefore the required `contracts-and-tests` check can be green while the frontend is broken.

Required resolution:

- extend the protected CI workflow with Node setup;
- install frontend dependencies;
- run `npm run check` from `frontend/`.

### P0 — no committed frontend lockfile

`frontend/package.json` pins dependency versions, but no `frontend/package-lock.json` is currently committed. A deterministic CI install cannot use `npm ci` until the lockfile is generated and committed.

Required resolution:

- generate and commit `frontend/package-lock.json`;
- use `npm ci` in CI.

### P0 — offline persistence does not meet the declared architecture

The current queue uses `localStorage` with an in-memory fallback. The accepted runtime direction requires IndexedDB plus a service worker.

Required resolution:

- preserve `OfflineCommandQueue` as the application port;
- implement `IndexedDbCommandQueue` as the browser adapter;
- retain an in-memory fallback for unavailable/private storage;
- do not change the canonical command envelope or idempotency behavior.

### P0 — queued commands do not update the visible projection state

Participant actions enqueue commands, but the screen continues rendering the original bootstrap projection. The user cannot reliably see `pending`, `synced`, `conflict` or `rejected` as a result of the action.

Required resolution:

- introduce a local projection/overlay store owned by the application layer;
- mark only explicitly allowed optimistic fields as `pending_sync`;
- replace the overlay when an authoritative projection arrives;
- never calculate authoritative completion or permissions in the client.

### P1 — Vite application is not yet a PWA

`frontend/vite.config.ts` currently defines a normal Vite build only. There is no manifest or service-worker delivery.

Required resolution:

- add the PWA manifest and installable metadata;
- cache only the application shell and immutable content releases;
- do not treat cached projections as authoritative after synchronization.

### P1 — production composition root is missing

Production mode requires `window.__ILKA_BOOTSTRAP__`, but no authenticated projection loader or remote server transport is implemented. This is consistent with ADR-011, which places remote transport outside the migration, but it blocks production use.

For the first vertical prototype, use a clearly identified local scenario composition root. Supabase remains out of scope until ADR-012 is accepted.

### P1 — repository status text is stale

The root README still states that GitHub is being populated through a bootstrap PR, although the canonical baseline is now on protected `main` and tagged.

Update this only together with the first runnable frontend gate so the status reflects an actual delivered capability.

## First vertical slice scope

The first runtime slice must stay limited to:

```text
Participant opens Day 1
→ sees Product Role and Onboard Role
→ acknowledges a published card
→ starts and completes one task
→ command receives pending state locally
→ Captain overview reads the resulting scenario projection
```

The prototype may use deterministic local scenario projections. It must not emulate an authoritative Engine reducer inside React.

## Offline behavior for the slice

- Local data: current projection, immutable card content, queued commands and sync metadata.
- Allowed offline actions: only command types declared `offline_allowed: true`.
- Persistence: IndexedDB through an application port.
- Idempotency: canonical `command_id` and `idempotency_key`; repeated enqueue returns the existing queue record.
- Retry: update attempts and last error without duplicating the command.
- Conflict: retain the command record, render `conflict`, wait for authoritative projection or Captain resolution.
- Rejected: retain rejection code/message and do not apply an authoritative completion state.
- Server-confirmed Captain actions: never queued as offline commands.

## Acceptance criteria for Frontend Foundation

- [ ] `frontend/package-lock.json` is committed.
- [ ] Protected CI runs repository validation, pytest and `frontend npm run check`.
- [ ] `npm run check` generates design/contracts, validates sources, typechecks and builds.
- [ ] IndexedDB is the primary offline queue adapter.
- [ ] Repeated command enqueue is idempotent.
- [ ] UI visibly supports `pending`, `synced`, `conflict`, `rejected` and `offline`.
- [ ] A deterministic Day 1 Participant → Captain scenario is available in preview.
- [ ] No client-side authoritative business calculation is introduced.
- [ ] README implementation status is updated only after the gate passes.

## Explicitly out of scope

- Supabase migrations, RLS, Auth and production command gateway.
- Multi-device synchronization.
- Production scheduler and automatic day-boundary execution.
- AI Shore Team runtime.
- Reworking the accepted design system.
- New XP, rating or competitive mechanics.
- Full 12-day UI implementation.

## Recommended implementation order

1. Commit lockfile and add frontend CI.
2. Add IndexedDB queue adapter and queue tests.
3. Add local projection overlay and sync-state rendering.
4. Add deterministic Day 1 preview composition.
5. Add PWA manifest/service worker shell.
6. Run protected CI and update README/CHANGELOG.
