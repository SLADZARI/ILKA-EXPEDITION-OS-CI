# ILKA frontend

Production-oriented PWA root established by ADR-010 and completed by MIGRATION-010.

```bash
npm ci
npm run check
npm run dev
```

## Runtime boundary

The composition root injects `window.__ILKA_BOOTSTRAP__` with either Participant or Captain projections. In development only, a schema-valid Participant fixture is used when no bootstrap is supplied.

Canonical inputs are outside this folder:

- `../design-system/` — tokens, stable UI IDs and original Figma Make reference;
- `../app/contracts/` — TodayView, CaptainDayView and offline read-model schemas;
- `../schemas/command.schema.json` — canonical command envelope and payloads;
- `../schemas/gamification.schema.json` — Role XP and rating projection;
- `../engine/command-catalog.yaml` and `../engine/event-catalog.yaml` — canonical vocabularies;
- `../engine/pipeline.yaml` — canonical 12-stage order.

Generated files under `src/contracts/generated` and `src/design-system/generated` must not be edited manually.

## Migrated screens

Participant: Today, Product Role Detail, Product Decision Vote, Gamification.

Captain: Day Overview, Product Stage Control, Recovery Day.

Commands are queued with canonical IDs and idempotency keys. Remote transport and synchronization acknowledgements are separate implementation features.
