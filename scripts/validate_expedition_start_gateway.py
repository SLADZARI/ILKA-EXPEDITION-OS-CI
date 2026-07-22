#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HANDLER = ROOT / "supabase/functions/_shared/command-gateway/handler.ts"
INDEX = ROOT / "supabase/functions/command-gateway/index.ts"
UNIT = ROOT / "supabase/functions/command-gateway/tests/unit/start-handler.test.ts"
INTEGRATION = ROOT / "supabase/functions/command-gateway/tests/integration/start-execution.test.ts"
ARCH = ROOT / "docs/architecture/expedition-start-execution.md"
ADR = ROOT / "docs/decisions/ADR-021-start-expedition-and-day1-boundary.md"
REGISTRY = ROOT / "supabase/functions/_shared/command-gateway/runtime-registry.ts"
WORKFLOW = ROOT / ".github/workflows/validate.yml"
REQUIRED = (HANDLER, INDEX, UNIT, INTEGRATION, ARCH, ADR, REGISTRY, WORKFLOW)


def fail(errors: list[str]) -> int:
    print("EXPEDITION START GATEWAY FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


def require(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    for value in values:
        if value not in text:
            errors.append(f"{label}: missing {value}")


def main() -> int:
    errors: list[str] = []
    for path in REQUIRED:
        if not path.is_file():
            errors.append(f"missing Gate 9D2B file: {path.relative_to(ROOT)}")
    if errors:
        return fail(errors)

    handler = HANDLER.read_text(encoding="utf-8")
    require(
        handler,
        (
            'import type { StartExecutor } from "./start.ts";',
            "startExecutor?: StartExecutor",
            'command.command_type === "start_expedition"',
            '"runtime_release_unavailable"',
            '"start_persistence_unavailable"',
            "await startExecutor.execute({",
            "request_hash: requestHash",
            "responseStatus(outcome.result)",
        ),
        "handler",
        errors,
    )
    replay = handler.find("existing = await dependencies.database.getReceipt")
    start_branch = handler.find('if (command.command_type === "start_expedition")')
    generic_context = handler.find("let context: GatewayExecutionContext | null")
    if min(replay, start_branch, generic_context) < 0 or not replay < start_branch < generic_context:
        errors.append("handler must resolve exact replay before start routing and generic context")
    if handler.count('command.command_type === "start_expedition"') != 1:
        errors.append("handler must contain exactly one start_expedition routing branch")

    index = INDEX.read_text(encoding="utf-8")
    require(
        index,
        (
            "PostgresStartDatabase",
            "createStartExecutor",
            "const startDatabase = new PostgresStartDatabase(connectionString);",
            "const startExecutor = createStartExecutor({",
            "database: startDatabase",
            "contextDatabase: database",
            "startExecutor,",
        ),
        "command-gateway index",
        errors,
    )

    unit = UNIT.read_text(encoding="utf-8")
    require(
        unit,
        (
            "routes start_expedition before generic membership handling",
            "returns runtime_release_unavailable when StartExecutor is absent",
            "maps stable StartExecutor failures",
            "returns exact start replay before StartExecutor and mutable context",
            "commandRequestHash",
        ),
        "start handler tests",
        errors,
    )

    integration = INTEGRATION.read_text(encoding="utf-8")
    require(
        integration,
        (
            "rolls back atomically and replays after Captain revocation",
            "forced_start_status_failure",
            "start_persistence_unavailable",
            'status: "ready"',
            'assertEquals(expedition.rows[0]?.status, "active")',
            '"expedition.started"',
            '"stage.opened"',
            "day_event_count: 0",
            "day_projection_count: 0",
            "Gate 9D2B replay proof",
            "replayed, true",
        ),
        "start integration",
        errors,
    )

    architecture = ARCH.read_text(encoding="utf-8").lower()
    require(
        architecture,
        (
            "gate 9d2b",
            "exact replay occurs before mutable membership",
            "startexecutor",
            "gateway-to-postgresql",
            "no calendar day",
        ),
        "start execution architecture",
        errors,
    )
    if "Status: Accepted" not in ADR.read_text(encoding="utf-8"):
        errors.append("ADR-021 must remain accepted")

    registry = REGISTRY.read_text(encoding="utf-8")
    if "createExpeditionStartRuntime" in registry or "day1_pilot_v1" in registry:
        errors.append("Gate 9D2B must not register a production start runtime")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "python scripts/validate_expedition_start_gateway.py" not in workflow:
        errors.append("protected CI does not execute Gate 9D2B validator")

    for forbidden in (
        "apply-gate9d2b-routing",
        "apply_gate9d2b_routing.py",
        "actions/upload-artifact",
        "contents: write",
    ):
        if forbidden in workflow:
            errors.append(f"workflow retains temporary Gate 9D2B mechanism: {forbidden}")

    if errors:
        return fail(errors)
    print("EXPEDITION START GATEWAY OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
