# ILKA Expedition OS — Project Instructions

## Working order

Before designing or changing a function:

1. inspect existing project files and prior decisions;
2. identify the current source of truth;
3. do not create a parallel entity when an equivalent already exists;
4. agree business rules, states and data first;
5. only then change files or code.

Do not start a major implementation until these are defined:

- function boundary;
- user scenarios;
- states and transitions;
- business rules;
- data structure;
- events;
- permissions;
- offline behavior;
- acceptance criteria.

## Source-of-truth priority

1. ADR;
2. JSON Schema;
3. Engine YAML;
4. Stage and card files;
5. App and UI documents.

Core ownership:

- state and transitions — `engine/game-engine.yaml`;
- Expedition program — `engine/pipeline.yaml` and `stages/`;
- roles — `engine/roles-catalog.yaml`;
- rotation — `engine/role-rotation-rules.yaml`;
- permissions — `engine/permissions.yaml`;
- commands — `engine/command-catalog.yaml` and `schemas/command.schema.json`;
- events — `engine/event-catalog.yaml` and `engine/event.schema.json`;
- cards — `cards/` and `schemas/card.schema.json`;
- interfaces — `app/`;
- production frontend — `frontend/`;
- Supabase runtime — `supabase/` after ADR-012 acceptance.

## Fixed product principles

- one Expedition unites one team around one shared product;
- vessel safety and Captain decisions override the digital scenario;
- Product Captain does not receive vessel or safety authority;
- every Participant receives a product role and an onboard/domestic role;
- onboard roles rotate sequentially;
- Cook receives a reduced product workload;
- main team product sessions happen in the evening;
- execution time may be flexible, but mandatory daily outcomes must be achieved;
- one floating Recovery Day is available;
- every meaningful action creates an append-only event;
- corrections are represented by new correcting events;
- every manual Captain action is logged;
- methodology and content are separate from application code;
- the 12-day program is configuration, not hard-coded Engine logic.

## Terminology

Use `Product Captain` until a separate ADR changes the term.

`Captain` is the vessel captain and final safety authority.

## Offline-first requirements

For every function define:

- locally available data;
- commands allowed offline;
- command/event created locally;
- idempotency behavior;
- duplicate retry behavior;
- version-conflict behavior;
- server-confirmed actions;
- Captain precedence;
- UI state: `pending`, `synced`, `conflict`, `rejected`.

Critical business logic must not exist only in UI.

## File changes

After decision approval:

- change only required files;
- keep stable IDs in `snake_case`;
- use ISO 8601 with timezone;
- update schemas when structures change;
- add tests and examples;
- update `CHANGELOG.md` for core changes;
- create or update ADR for architectural decisions;
- run repository validation and tests.
