# Expedition start execution

## Gate

This document defines Gate 9D2A under accepted `ADR-021`.

Gate 9D2 is an umbrella split into:

- **9D2A — reducer, executor and atomic persistence wrapper**;
- **9D2B — `command-gateway` routing and full handler/PostgreSQL integration**.

The split follows the established Gate 9B2 contract/persistence/execution pattern. Gate 9D2A proves the domain and transaction boundary before changing the shared public handler.

## Command boundary

```text
start_expedition
Captain-only
Expedition ready → active
payload {}
online-only
```

Accepted output:

```text
expedition.started
stage.opened(onboarding)
complete ExpeditionSetupView replacement
```

No Calendar Day, assignment instance, Card Bundle, `TodayView` or `CaptainDayView` is created.

## Pure runtime

`supabase/functions/_shared/engine-runtime/expedition-start-v1.ts` owns:

- command and Captain guards;
- ready-state validation;
- complete frozen-team validation;
- generated Rotation Plan validation;
- first Stage resolution to `onboarding`;
- ordered canonical event generation;
- complete active `ExpeditionSetupView` replacement.

The runtime is pure and receives an immutable policy:

```text
team_size_min: 3
team_size_max: 5
first_stage_id: onboarding
rotation_rules_version: 2
product_captain_role: product_captain
product_support_role: product_support
cook_role: cook
```

It is not registered as a production runtime. Gate 9E will compose the protected implementation into `day1_pilot_v1` after the complete Gate 9 implementation SHA is known.

## Executor

`createStartExecutor(...)`:

1. accepts only `start_expedition`;
2. requires empty payload and null Day/Stage context;
3. loads authoritative Expedition context using the authenticated user;
4. resolves the active Captain membership and canonical membership actor ID;
5. requires an exact pinned runtime with start capability;
6. invokes the pure reducer;
7. validates both canonical events and the complete setup projection;
8. validates `private-start-expedition-request.schema.json`;
9. calls only `StartDatabase.startExpedition(...)`;
10. validates the returned immutable command result.

Gate 9D2A does not yet route the public handler to this executor. That single shared-handler change is Gate 9D2B.

## Private request

```text
expedition_transition:
  expedition_id
  expected_status: ready
  next_status: active
  stage_id: onboarding
  rotation_id
  rules_version
process_command_request:
  canonical private.process_command request
```

The transition identity is derived from authoritative runtime output, never browser payload.

## PostgreSQL wrapper

`private.start_expedition(jsonb)` is `SECURITY DEFINER`, has empty `search_path`, and is executable only by `service_role`.

Fixed transaction order:

```text
minimal parse
→ command advisory lock
→ Expedition advisory lock
→ exact replay / mismatch
→ lock Expedition
→ verify pinned runtime
→ resolve active Captain
→ verify no Calendar Day
→ verify 3–5 active Participants and zero pending invitations
→ lock and validate current ready ExpeditionSetupView
→ validate generated Rotation Plan
→ validate two events and one complete projection replacement
→ private.process_command(process_request)
→ update Expedition ready → active
→ return authoritative result
```

Exact replay is resolved before mutable status guards. The wrapper does not insert into receipts, event log or projection documents directly.

## Atomic postcondition

```text
Expedition status: active
stream position: previous + 2
projection version: previous + 1
new events: expedition.started, stage.opened
updated projection: expedition_setup_view
Calendar Day events: 0
TodayView documents: 0
CaptainDayView documents: 0
```

Any exception rolls back all effects, including the Expedition status update.

## Stable failures

```text
active_captain_membership_required
actor_spoofing_detected
expedition_not_found
expedition_not_ready
expedition_already_started
expedition_setup_projection_missing
projection_contract_mismatch
team_not_frozen
rotation_not_ready
first_stage_unresolvable
calendar_day_already_exists
idempotency_key_reused_with_different_payload
receipt_actor_mismatch
version_conflict
runtime_release_unavailable
start_persistence_unavailable
```

## Offline behavior

The command is online-only. A local Captain UI draft is not authoritative and must not change Expedition status. Exact network retry preserves the original command body and ID. Accepted state is displayed only after receipt plus authoritative setup-view refetch.

## 9D2A acceptance

- pure runtime tests cover accepted start, immutable Rotation preservation, invalid state, actor spoofing, payload injection, incompatible rotation and existing Day projection;
- executor tests cover one trusted wrapper request, wrong role, spoofing, missing runtime and stable database errors;
- pgTAP protects function existence, privileges, `SECURITY DEFINER`, empty `search_path` and delegation to `private.process_command`;
- static validation protects lock order, replay order, event/projection counts, atomic status update and absence of runtime registration;
- all existing protected CI remains green.

## Explicitly deferred to 9D2B

- `createCommandGatewayHandler` routing for `start_expedition`;
- `command-gateway/index.ts` composition;
- handler-level exact replay scenarios;
- complete gateway-to-PostgreSQL integration;
- runtime registration, migration deployment and live smoke.
