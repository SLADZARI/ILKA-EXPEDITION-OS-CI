#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
ADR = ROOT / "docs/decisions/ADR-016-offline-command-sync-and-reconciliation.md"
ARCH = ROOT / "docs/architecture/offline-command-sync.md"
API = ROOT / "app/api/commands.yaml"
CREATE_COMMAND = ROOT / "frontend/src/application/commands/createCommand.ts"
QUEUE = ROOT / "frontend/src/application/offline/OfflineCommandQueue.ts"
SYNC_TYPES = ROOT / "frontend/src/application/sync/OfflineSyncTypes.ts"
SYNCHRONIZER = ROOT / "frontend/src/application/sync/OfflineCommandSynchronizer.ts"
GATEWAY = ROOT / "frontend/src/infrastructure/supabase/SupabaseCommandGatewayTransport.ts"
PROJECTION = ROOT / "frontend/src/infrastructure/supabase/SupabaseParticipantProjectionLoader.ts"
FACTORY = ROOT / "frontend/src/infrastructure/supabase/createSupabaseParticipantSyncRuntime.ts"
BOOTSTRAP = ROOT / "frontend/src/application/projections/bootstrap.ts"
APP = ROOT / "frontend/src/app/App.tsx"
GENERATED = ROOT / "frontend/src/contracts/generated/command-result.ts"
GENERATOR = ROOT / "frontend/scripts/generate-contracts.mjs"
QUEUE_TEST = ROOT / "frontend/src/application/offline/OfflineCommandQueue.test.ts"
SYNC_TEST = ROOT / "frontend/src/application/sync/OfflineCommandSynchronizer.test.ts"
GATEWAY_TEST = ROOT / "frontend/src/infrastructure/supabase/SupabaseCommandGatewayTransport.test.ts"
PROJECTION_TEST = ROOT / "frontend/src/infrastructure/supabase/SupabaseParticipantProjectionLoader.test.ts"
COMMAND_TEST = ROOT / "frontend/src/application/commands/createCommand.test.ts"
SERVICE_WORKER = ROOT / "frontend/public/sw.js"
WORKFLOW = ROOT / ".github/workflows/validate.yml"

REQUIRED = (
    ADR,
    ARCH,
    API,
    CREATE_COMMAND,
    QUEUE,
    SYNC_TYPES,
    SYNCHRONIZER,
    GATEWAY,
    PROJECTION,
    FACTORY,
    BOOTSTRAP,
    APP,
    GENERATED,
    GENERATOR,
    QUEUE_TEST,
    SYNC_TEST,
    GATEWAY_TEST,
    PROJECTION_TEST,
    COMMAND_TEST,
    SERVICE_WORKER,
    WORKFLOW,
)


def normalized(text: str) -> str:
    return " ".join(text.replace("`", "").split()).lower()


def require(text: str, needles: tuple[str, ...], label: str, errors: list[str]) -> None:
    value = normalized(text)
    for needle in needles:
        if normalized(needle) not in value:
            errors.append(f"{label}: {needle}")


def main() -> int:
    errors: list[str] = []
    for path in REQUIRED:
        if not path.is_file():
            errors.append(f"missing Gate 7 file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    adr = ADR.read_text(encoding="utf-8")
    require(
        adr,
        (
            "Status: Accepted",
            "idempotency_key == command_id",
            "FIFO",
            "one active sync cycle",
            "Accepted or exact replay",
            "Persisted rejection",
            "Stream conflict",
            "Retryable failure",
            "automatic Day 1",
        ),
        "ADR-016 missing decision",
        errors,
    )

    api = yaml.safe_load(API.read_text(encoding="utf-8"))
    if api.get("transport", {}).get("endpoint") != "/functions/v1/command-gateway":
        errors.append("command API must use /functions/v1/command-gateway")
    if api.get("transport", {}).get("idempotency") != "command_id":
        errors.append("command API idempotency must be command_id")
    delivery = api.get("offline_delivery", {})
    if delivery.get("ordering") != "fifo_sequential":
        errors.append("offline delivery must be FIFO sequential")
    if delivery.get("single_flight") is not True:
        errors.append("offline delivery must be single-flight")
    if delivery.get("outcome_mapping", {}).get("stream_conflict", {}).get("stop_fifo_cycle") is not True:
        errors.append("stream conflict must stop the FIFO cycle")

    create_command = CREATE_COMMAND.read_text(encoding="utf-8")
    if "idempotency_key: commandId" not in create_command:
        errors.append("frontend command factory must set idempotency_key to commandId")
    if "${context.expedition_id}:${commandType}:${commandId}" in create_command:
        errors.append("legacy composite idempotency key remains in command factory")

    queue = QUEUE.read_text(encoding="utf-8")
    require(
        queue,
        (
            "last_attempt_at",
            "settled_at",
            "QueueReceipt",
            "receipt",
            "command: existing.command",
            "created_at: existing.created_at",
        ),
        "offline queue missing immutable delivery metadata",
        errors,
    )

    sync = SYNCHRONIZER.read_text(encoding="utf-8")
    require(
        sync,
        (
            "private activeCycle",
            "if (this.activeCycle) return this.activeCycle",
            "item.status !== 'pending'",
            "status: 'synced'",
            "status: 'rejected'",
            "status: 'conflict'",
            "status: 'pending'",
            "await this.loadProjection()",
            "return this.summary",
        ),
        "synchronizer missing outcome behavior",
        errors,
    )
    if sync.find("await this.loadProjection()") > sync.find("status: 'synced'"):
        errors.append("accepted command must refetch projection before becoming synced")

    gateway = GATEWAY.read_text(encoding="utf-8")
    require(
        gateway,
        (
            "/functions/v1/command-gateway",
            "JSON.stringify(command)",
            "authentication_required",
            "retryable_error",
            "terminal_error",
            "receipt identity does not match",
        ),
        "command gateway transport missing boundary",
        errors,
    )

    projection = PROJECTION.read_text(encoding="utf-8")
    require(
        projection,
        (
            "/rest/v1/rpc/get_today_view",
            "p_expedition_key",
            "invalid_projection_response",
            "projection_identity_mismatch",
            "body.expedition_id !== expeditionKey",
            "body.participant_id !== participantId",
        ),
        "projection loader missing reconciliation guard",
        errors,
    )

    bootstrap = BOOTSTRAP.read_text(encoding="utf-8")
    if "sync_runtime?: ParticipantSyncRuntime" not in bootstrap:
        errors.append("Participant bootstrap lacks injected sync runtime")

    app = APP.read_text(encoding="utf-8")
    require(
        app,
        (
            "new OfflineCommandSynchronizer",
            "on_projection: setAuthoritative",
            "connectivity === 'online'",
            "window.addEventListener('online'",
            "synchronizer.sync()",
        ),
        "Participant App missing sync triggers",
        errors,
    )
    for forbidden in ("task.status =", "acknowledged = true", "can_close_day ="):
        if forbidden in app:
            errors.append(f"Participant App contains forbidden domain reduction: {forbidden}")

    generator = GENERATOR.read_text(encoding="utf-8")
    if "private-process-command-result.schema.json" not in generator:
        errors.append("frontend generator must derive CommandResult from canonical Supabase schema")
    if "GENERATED from supabase/contracts/private-process-command-result.schema.json" not in GENERATED.read_text(encoding="utf-8"):
        errors.append("generated CommandResult provenance missing")

    tests = "\n".join(path.read_text(encoding="utf-8") for path in (
        QUEUE_TEST,
        SYNC_TEST,
        GATEWAY_TEST,
        PROJECTION_TEST,
        COMMAND_TEST,
    ))
    require(
        tests,
        (
            "canonical idempotency key",
            "accepted command synced only after authoritative projection refetch",
            "stops FIFO delivery after a stream conflict",
            "keeps retryable failures pending",
            "is single-flight",
            "projection_identity_mismatch",
            "persists accepted receipt metadata",
        ),
        "Gate 7 tests missing scenario",
        errors,
    )

    if "command-gateway" in SERVICE_WORKER.read_text(encoding="utf-8"):
        errors.append("service worker must not submit command-gateway requests")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "Validate frontend offline synchronization contract" not in workflow:
        errors.append("protected CI missing Gate 7 validator")

    if errors:
        return report(errors)
    print("FRONTEND OFFLINE SYNC CONTRACT OK")
    return 0


def report(errors: list[str]) -> int:
    print("FRONTEND OFFLINE SYNC CONTRACT FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
