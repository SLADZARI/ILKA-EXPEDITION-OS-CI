#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCH = ROOT / "docs/architecture/expedition-start-execution.md"
ADR = ROOT / "docs/decisions/ADR-021-start-expedition-and-day1-boundary.md"
RUNTIME = ROOT / "supabase/functions/_shared/engine-runtime/expedition-start-v1.ts"
EXECUTOR = ROOT / "supabase/functions/_shared/command-gateway/start.ts"
DATABASE = ROOT / "supabase/functions/_shared/command-gateway/start-database.ts"
VALIDATOR = ROOT / "supabase/functions/_shared/command-gateway/start-schema-validation.ts"
CONTRACT = ROOT / "supabase/contracts/private-start-expedition-request.schema.json"
MIGRATION = ROOT / "supabase/migrations/20260722010000_start_expedition_transaction.sql"
PGTAP = ROOT / "supabase/tests/start_expedition_transaction.test.sql"
RUNTIME_TEST = ROOT / "supabase/functions/command-gateway/tests/unit/start-runtime.test.ts"
EXECUTOR_TEST = ROOT / "supabase/functions/command-gateway/tests/unit/start-executor.test.ts"
REGISTRY = ROOT / "supabase/functions/_shared/command-gateway/runtime-registry.ts"
HANDLER = ROOT / "supabase/functions/_shared/command-gateway/handler.ts"
WORKFLOW = ROOT / ".github/workflows/validate.yml"
DATABASE_TYPES = ROOT / "supabase/database.types.ts"

REQUIRED = (
    ARCH,
    ADR,
    RUNTIME,
    EXECUTOR,
    DATABASE,
    VALIDATOR,
    CONTRACT,
    MIGRATION,
    PGTAP,
    RUNTIME_TEST,
    EXECUTOR_TEST,
    REGISTRY,
    HANDLER,
    WORKFLOW,
    DATABASE_TYPES,
)


def report(errors: list[str]) -> int:
    print("EXPEDITION START EXECUTION FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


def require(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    for value in values:
        if value not in text:
            errors.append(f"{label}: missing {value}")


def position(text: str, value: str, label: str, errors: list[str]) -> int:
    found = text.find(value)
    if found < 0:
        errors.append(f"{label}: missing {value}")
    return found


def main() -> int:
    errors: list[str] = []
    for path in REQUIRED:
        if not path.is_file():
            errors.append(f"missing Gate 9D2A file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    architecture = ARCH.read_text(encoding="utf-8")
    require(
        architecture,
        (
            "9D2A — reducer, executor and atomic persistence wrapper",
            "9D2B — `command-gateway` routing",
            "expedition.started",
            "stage.opened(onboarding)",
            "No Calendar Day",
            "createStartExecutor",
            "private.start_expedition(jsonb)",
            "private.process_command(process_request)",
            "Exact replay is resolved before mutable status guards",
            "Any exception rolls back all effects",
        ),
        "start execution architecture",
        errors,
    )

    adr = ADR.read_text(encoding="utf-8")
    require(
        adr,
        (
            "private.start_expedition(jsonb)",
            "expedition.started",
            "stage.opened",
            "It does not create a Calendar Day",
        ),
        "ADR-021",
        errors,
    )

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    if contract.get("additionalProperties") is not False:
        errors.append("private start request must reject extra properties")
    required = contract.get("required", [])
    if required != ["expedition_transition", "process_command_request"]:
        errors.append("private start request top-level shape drifted")
    transition = contract.get("properties", {}).get("expedition_transition", {})
    properties = transition.get("properties", {})
    for key, expected in (
        ("expected_status", "ready"),
        ("next_status", "active"),
        ("stage_id", "onboarding"),
    ):
        if properties.get(key, {}).get("const") != expected:
            errors.append(f"private start transition {key} drifted")

    runtime = RUNTIME.read_text(encoding="utf-8")
    require(
        runtime,
        (
            "createExpeditionStartRuntime",
            "isExpeditionStartRuntime",
            "start_policy",
            'input.command.command_type !== "start_expedition"',
            'input.context.expedition_status !== "ready"',
            '"expedition.started"',
            '"stage.opened"',
            'policy.first_stage_id !== "onboarding"',
            'document.projection_type === "today_view"',
            'document.projection_type === "captain_day_view"',
            'view.expedition_status = "active"',
            'view.expected_projection_version = input.context.projection_version + 1',
        ),
        "start runtime",
        errors,
    )
    if "day.started" in runtime or "card_bundles.published" in runtime:
        errors.append("Gate 9D2A start runtime must not create a Calendar Day or Card Bundles")

    executor = EXECUTOR.read_text(encoding="utf-8")
    require(
        executor,
        (
            "createStartExecutor",
            "isExpeditionStartRuntime",
            'command.command_type !== "start_expedition"',
            "active_captain_membership_required",
            "actor_spoofing_detected",
            "createStartRequestValidator",
            "dependencies.database.startExpedition(outerRequest)",
            'prepared.events[0].event_type !== "expedition.started"',
            'prepared.events[1].event_type !== "stage.opened"',
            'expected_status: "ready"',
            'next_status: "active"',
        ),
        "start executor",
        errors,
    )

    database = DATABASE.read_text(encoding="utf-8")
    require(
        database,
        (
            "PostgresStartDatabase",
            "set local role service_role",
            "select private.start_expedition",
            "start_expedition_returned_no_result",
        ),
        "start database adapter",
        errors,
    )

    validator = VALIDATOR.read_text(encoding="utf-8")
    require(
        validator,
        (
            "private-start-expedition-request.schema.json",
            "private-process-command-request.schema.json",
            "engine/event.schema.json",
            "expedition-setup-view.schema.json",
            "createStartRequestValidator",
        ),
        "start request validator",
        errors,
    )

    migration = MIGRATION.read_text(encoding="utf-8")
    require(
        migration,
        (
            "create or replace function private.start_expedition(p_request jsonb)",
            "security definer",
            "set search_path = ''",
            "active_captain_membership_required",
            "expedition_not_ready",
            "expedition_already_started",
            "calendar_day_already_exists",
            "team_not_frozen",
            "rotation_not_ready",
            "start_expedition_event_contract_mismatch",
            "expedition_active_projection_mismatch",
            "private.process_command(v_process_request)",
            "set status = 'active'",
            "grant execute on function private.start_expedition(jsonb) to service_role",
        ),
        "start migration",
        errors,
    )
    command_lock = position(migration, "'ilka:command:'", "start migration", errors)
    expedition_lock = position(migration, "'ilka:expedition:'", "start migration", errors)
    receipt_lookup = position(migration, "from ilka.command_receipts", "start migration", errors)
    expedition_status = position(migration, "if v_expedition_status <> 'ready'", "start migration", errors)
    process_call = position(migration, "v_result := private.process_command(v_process_request)", "start migration", errors)
    status_update = position(migration, "set status = 'active'", "start migration", errors)
    if min(command_lock, expedition_lock, receipt_lookup, expedition_status, process_call, status_update) >= 0:
        if not command_lock < expedition_lock < receipt_lookup < expedition_status < process_call < status_update:
            errors.append("start migration lock/replay/state/process/update order drifted")
    lower_migration = migration.lower()
    if "insert into ilka.event_log" in lower_migration:
        errors.append("start wrapper must not insert directly into event_log")
    if "insert into ilka.projection_documents" in lower_migration:
        errors.append("start wrapper must not insert directly into projection_documents")
    if "create table" in lower_migration:
        errors.append("Gate 9D2A must not create a parallel state table")

    pgtap = PGTAP.read_text(encoding="utf-8")
    require(
        pgtap,
        (
            "private.start_expedition(jsonb) exists",
            "service_role can execute start wrapper",
            "authenticated cannot execute private start wrapper",
            "anon cannot execute private start wrapper",
            "start wrapper is SECURITY DEFINER",
            "start wrapper has empty search_path",
            "delegates immutable persistence to private.process_command",
        ),
        "start pgTAP",
        errors,
    )

    runtime_test = RUNTIME_TEST.read_text(encoding="utf-8")
    require(
        runtime_test,
        (
            "opens onboarding and activates only the Expedition",
            "preserves generated Rotation Plan",
            "rejects non-ready aggregate",
            "rejects an already active aggregate",
            "rejects a spoofed Captain",
            "rejects non-empty payload",
            "rejects an incompatible rotation",
            "rejects existing Day projections",
        ),
        "start runtime tests",
        errors,
    )
    executor_test = EXECUTOR_TEST.read_text(encoding="utf-8")
    require(
        executor_test,
        (
            "prepares one trusted atomic wrapper request",
            "rejects non-Captain before persistence",
            "rejects spoofed actor before persistence",
            "requires exact pinned start runtime",
            "maps stable wrapper failures",
        ),
        "start executor tests",
        errors,
    )

    registry = REGISTRY.read_text(encoding="utf-8")
    if "createExpeditionStartRuntime" in registry or "day1_pilot_v1" in registry:
        errors.append("Gate 9D2A must not register a production start runtime")

    handler = HANDLER.read_text(encoding="utf-8")
    if 'command.command_type === "start_expedition"' in handler:
        errors.append("Gate 9D2A must not partially route start_expedition in the shared handler")

    if "start_expedition: { Args: { p_request: Json }; Returns: Json }" not in DATABASE_TYPES.read_text(encoding="utf-8"):
        errors.append("generated database types do not expose private.start_expedition")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "python scripts/validate_expedition_start_execution.py" not in workflow:
        errors.append("protected CI does not execute Gate 9D2A validator")

    if errors:
        return report(errors)
    print("EXPEDITION START EXECUTION OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
