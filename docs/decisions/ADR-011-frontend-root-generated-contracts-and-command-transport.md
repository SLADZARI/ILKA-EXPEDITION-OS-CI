# ADR-011 — Frontend root, generated contracts and command transport

- Status: Accepted
- Date: 2026-07-19
- Owners: Product Architecture / Frontend / Design System

## Context

The Figma Make package contains reusable visual code together with manual domain types and prototype state. A prior migration candidate used the identifier ADR-010, which now belongs to Expedition completion. The repository also contained a raw Vite project at root while the accepted target architecture placed production UI in `frontend/`.

## Decision

1. Production React/TypeScript PWA source lives only in `frontend/`.
2. Canonical visual tokens and stable UI IDs live in `design-system/`.
3. The original Figma Make package remains reference-only under `design-system/reference/`.
4. `app/` owns UI requirements, API descriptions and JSON read-model schemas.
5. TypeScript domain contracts in `frontend/src/contracts/generated/` are generated from canonical JSON Schema and are never edited manually.
6. Every Engine command declares explicit `offline_allowed: true|false`.
7. The persistent offline queue accepts only commands with `offline_allowed: true`; server-confirmed and system commands are rejected by type and runtime guard.
8. `close_expedition` is submitted only through injected server transport. It is never queued and never applied optimistically.
9. Completion UI renders `completion_readiness` and `expedition_completion` projections; it does not calculate readiness or terminal state.
10. The raw root UI upload is archived as migration evidence and is not a source of truth.

## Consequences

- ADR numbering no longer conflicts with ADR-010 Expedition completion.
- Frontend contract generation follows the 36-command / 48-event canonical baseline.
- Remote authentication, server transport implementation, service worker and production persistence remain outside this migration.
