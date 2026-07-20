# Frontend Foundation Audit — 2026-07-20

## Status

- Result: **Completed**.
- Scope: canonical `main` after `v0.1.0-canonical-baseline`.
- No domain rule is introduced by this document.
- Source-of-truth priority remains ADR → JSON Schema → Engine YAML → stages/cards → app contracts → UI implementation.

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

## Delivered foundation

### Deterministic frontend gate

- `frontend/package-lock.json` is committed.
- Protected `contracts-and-tests` uses `npm ci`.
- CI generates design-system runtime sources and TypeScript contracts from canonical inputs.
- CI validates source parity, runs frontend tests, strict TypeScript, production build, static preview build and generated-source diff checks.
- The malformed `xp_summary_card.states` component catalog entry was repaired at the canonical source.

### Offline command persistence

- `OfflineCommandQueue` remains the application port.
- `IndexedDbCommandQueue` is the primary browser adapter.
- `MemoryCommandQueue` remains the unavailable/private-storage fallback.
- Repeated enqueue is idempotent by canonical `command_id` and stable `local_id`.
- Queue updates are restricted to delivery metadata: `status`, `attempts`, `last_error`.
- Server-confirmed Captain commands are not accepted by the offline queue.

### Participant delivery overlay

- Queue records are hydrated when Participant App starts.
- Browser online/offline events update display state.
- Local overlay may change only `pending_sync` and top-level `sync_status`.
- `card.acknowledged`, `task.status`, outputs, permissions and Definition of Done remain authoritative projections.
- Display precedence is `conflict → rejected → offline → pending → authoritative`.
- Pending actions suppress duplicate acknowledge/start/complete commands.

### Day 1 vertical preview

The static preview contains three schema-valid projections:

```text
Participant Day 1
Captain Day 1 · initial
Captain Day 1 · after authoritative sync
```

Validation binds:

- Participant cards to `stages/01_onboarding.yaml` shared/product/onboard card refs;
- required outputs to onboarding `required_outputs`;
- Captain assignments to Day 1 `role_assignments.activated` in `examples/sample-events.json`.

The after-sync Captain screen is a separate authoritative fixture. React does not reduce Participant commands into Captain state.

### PWA shell

- installable manifest and mobile metadata are present;
- service worker registration is production-only and base-aware;
- only same-origin static assets are cacheable;
- navigation documents are network-only with a safe offline fallback;
- JSON and `/api/`, `/commands/`, `/events/`, `/projections/`, `/sync/` responses bypass cache;
- offline commands remain in IndexedDB;
- cached content is not promoted to an authoritative projection.

## Acceptance criteria

- [x] `frontend/package-lock.json` is committed.
- [x] Protected CI runs repository validation, pytest and the explicit steps represented by `frontend npm run check`.
- [x] `npm run check` generates design/contracts, validates sources, runs tests, typechecks and builds production plus static preview.
- [x] IndexedDB is the primary offline queue adapter.
- [x] Repeated command enqueue is idempotent.
- [x] UI visibly supports `pending`, `synced`, `conflict`, `rejected` and `offline`.
- [x] A deterministic Day 1 Participant → Captain scenario is available in preview.
- [x] No client-side authoritative business calculation was introduced.
- [x] Installable PWA metadata and a projection-safe service worker are present.
- [x] README and CHANGELOG reflect the delivered gate.

## Merge evidence

- deterministic frontend CI: `d69551cec7f4f413eed769e1a8b8d1118a129b64`;
- IndexedDB offline queue: `a6b88ced5badc0d893347d3295f4f4696b037c0d`;
- Participant delivery overlay: `55edfba8cec5191041dbb38166caf462df98c29e`;
- canonical Day 1 static preview: `161ffe718f536aeba565f55a000352a20116030f`;
- projection-safe PWA shell: `729e8a526632c4bad6ec302ec4d8d2ed1e4bedf5`.

## Explicitly not completed by this gate

- production Auth and user/session bootstrap;
- remote Participant/Captain projection loading;
- server `command-gateway` transport;
- server acknowledgements and multi-device synchronization;
- Supabase migrations, RLS and Edge Functions;
- production scheduler and automatic day-boundary execution;
- AI Shore Team runtime;
- full 12-day UI implementation.

ADR-012 remains Proposed. No Supabase migrations have been applied.
