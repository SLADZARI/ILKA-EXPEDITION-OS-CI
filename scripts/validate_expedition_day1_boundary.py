#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "adr": ROOT / "docs/decisions/ADR-021-start-expedition-and-day1-boundary.md",
    "architecture": ROOT / "docs/architecture/expedition-day1-start.md",
    "command_schema": ROOT / "schemas/command.schema.json",
    "runtime": ROOT / "supabase/functions/_shared/engine-runtime/day1-boundary-v1.ts",
    "auth": ROOT / "supabase/functions/_shared/command-gateway/system-clock-auth.ts",
    "database": ROOT / "supabase/functions/_shared/command-gateway/day-boundary-database.ts",
    "executor": ROOT / "supabase/functions/_shared/command-gateway/day-boundary.ts",
    "request_validator": ROOT / "supabase/functions/_shared/command-gateway/day-boundary-schema-validation.ts",
    "request_schema": ROOT / "supabase/contracts/private-process-day-boundary-request.schema.json",
    "handler": ROOT / "supabase/functions/_shared/command-gateway/handler.ts",
    "index": ROOT / "supabase/functions/command-gateway/index.ts",
    "migration": ROOT / "supabase/migrations/20260723010000_process_day_boundary_transaction.sql",
    "pgtap": ROOT / "supabase/tests/process_day_boundary_transaction.test.sql",
    "runtime_test": ROOT / "supabase/functions/command-gateway/tests/unit/day1-boundary-runtime.test.ts",
    "auth_test": ROOT / "supabase/functions/command-gateway/tests/unit/system-clock-auth.test.ts",
    "executor_test": ROOT / "supabase/functions/command-gateway/tests/unit/day1-boundary-executor.test.ts",
    "handler_test": ROOT / "supabase/functions/command-gateway/tests/unit/day1-boundary-handler.test.ts",
    "integration": ROOT / "supabase/functions/command-gateway/tests/integration/day1-boundary-execution.test.ts",
    "registry": ROOT / "supabase/functions/_shared/command-gateway/runtime-registry.ts",
    "config": ROOT / "supabase/config.toml",
    "app_commands": ROOT / "app/api/commands.yaml",
    "database_types": ROOT / "supabase/database.types.ts",
    "workflow": ROOT / ".github/workflows/validate.yml",
}


def fail(errors: list[str]) -> int:
    print("EXPEDITION DAY 1 BOUNDARY FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


def require(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    for value in values:
        if value not in text:
            errors.append(f"{label}: missing {value}")


def main() -> int:
    errors: list[str] = []
    for label, path in FILES.items():
        if not path.is_file():
            errors.append(f"missing {label}: {path.relative_to(ROOT)}")
    if errors:
        return fail(errors)
    text = {name: path.read_text(encoding="utf-8") for name, path in FILES.items()}

    require(
        text["adr"],
        (
            "Status: Accepted",
            "trusted `system_clock` Day 1 boundary",
            "HMAC-SHA256(secret, timestamp + \".\" + raw_request_body)",
            "occurred_at = trusted gateway received_at",
            "private.process_day_boundary(jsonb)",
            "N × today_view:<participant_key>",
            "<participant_key>:<task_id>",
        ),
        "ADR-021",
        errors,
    )
    require(
        text["architecture"],
        (
            "Gate 9D3 executable implementation",
            "HMAC verification over the exact raw body",
            "exact replay before mutable state checks",
            "2N` assignment instances",
            "N TodayView + 1 CaptainDayView",
            "rolls back the receipt, all three events",
        ),
        "architecture",
        errors,
    )

    command_schema = json.loads(text["command_schema"])
    boundary_rule = next(
        item for item in command_schema["allOf"]
        if item.get("if", {}).get("properties", {}).get("command_type", {}).get("const")
        == "process_day_boundary"
    )
    payload = boundary_rule["then"]["properties"]["payload"]
    if payload.get("required") != ["local_calendar_date", "boundary_at"]:
        errors.append("boundary command payload fields drifted")
    if payload.get("additionalProperties") is not False:
        errors.append("boundary command payload must reject browser-supplied fields")

    request_schema = json.loads(text["request_schema"])
    if request_schema.get("additionalProperties") is not False:
        errors.append("private boundary request must reject extra properties")
    transition = request_schema["properties"]["boundary_transition"]
    if transition["properties"]["day_number"].get("const") != 1:
        errors.append("private boundary request is not Day 1-only")
    if transition["properties"]["stage_id"].get("const") != "onboarding":
        errors.append("private boundary request Stage drifted")

    require(
        text["runtime"],
        (
            "createDay1BoundaryRuntime",
            "isDay1BoundaryRuntime",
            "reduceBoundary",
            '"day.started"',
            '"role_assignments.activated"',
            '"card_bundles.published"',
            "assignment_day_01_",
            "bundle_day_01_",
            "today_view:",
            "captain_day_view",
            "occurred_at: input.received_at",
            "input.received_at",
            "left.participant_order - right.participant_order",
            "card_bundle_unresolvable",
        ),
        "Day 1 runtime",
        errors,
    )
    if "role_assignments.expired" in text["runtime"] or "task.overdue" in text["runtime"]:
        errors.append("Day 1 runtime emits prior-day events")

    require(
        text["auth"],
        (
            "x-ilka-system-timestamp",
            "x-ilka-system-signature",
            'name: "HMAC"',
            'hash: "SHA-256"',
            "constantTimeEqual",
            "replayWindowSeconds",
            "timestamp}.${request.raw_body}",
        ),
        "system clock verifier",
        errors,
    )
    require(
        text["handler"],
        (
            "TrustedSystemClockBranch",
            "hasSystemHeaders",
            "systemClock.verifier.verify",
            'systemCommand.command_type !== "process_day_boundary"',
            "existingSystemReceipt",
            'receipt.actor_role !== "system_clock"',
            "systemClock.executor.execute",
        ),
        "command gateway handler",
        errors,
    )
    signature = text["handler"].find("systemClock.verifier.verify")
    parsing = text["handler"].find("systemParsed = JSON.parse")
    receipt = text["handler"].find("existingSystemReceipt = await")
    if min(signature, parsing, receipt) < 0 or not signature < parsing < receipt:
        errors.append("signature must be verified before parse and receipt lookup")

    require(
        text["executor"],
        (
            "createDayBoundaryExecutor",
            "loadSystemContext",
            "isDay1BoundaryRuntime",
            "createDayBoundaryRequestValidator",
            "processDayBoundary(outerRequest)",
            "auth_user_id: null",
            'prepared.events[0].event_type !== "day.started"',
        ),
        "Day boundary executor",
        errors,
    )
    require(
        text["database"],
        (
            "PostgresDayBoundaryDatabase",
            "loadSystemContext",
            "set local role service_role",
            "select private.process_day_boundary",
            "expedition_started_at",
            "active_stage_id",
        ),
        "Day boundary database",
        errors,
    )

    migration = text["migration"]
    require(
        migration,
        (
            "create or replace function private.process_day_boundary(p_request jsonb)",
            "security definer",
            "set search_path = ''",
            "pg_advisory_xact_lock",
            "boundary_already_processed",
            "scheduled_assignments_unresolvable",
            "card_bundle_unresolvable",
            "private.process_command(v_process_request)",
            "grant execute on function private.process_day_boundary(jsonb) to service_role",
        ),
        "Day boundary migration",
        errors,
    )
    markers = [
        migration.find("'ilka:command:'"),
        migration.find("'ilka:expedition:'"),
        migration.find("from ilka.command_receipts"),
        migration.find("if v_expedition_status <> 'active'"),
        migration.find("v_result := private.process_command(v_process_request)"),
    ]
    if any(marker < 0 for marker in markers) or markers != sorted(markers):
        errors.append("boundary lock/replay/state/process order drifted")
    lower_migration = migration.lower()
    if "insert into ilka.event_log" in lower_migration:
        errors.append("boundary wrapper inserts directly into event_log")
    if "insert into ilka.projection_documents" in lower_migration:
        errors.append("boundary wrapper inserts directly into projections")
    if "create table" in lower_migration:
        errors.append("Gate 9D3 creates a mutable Day state table")

    require(
        text["pgtap"],
        (
            "private.process_day_boundary(jsonb) exists",
            "service_role can execute Day boundary wrapper",
            "authenticated cannot execute private Day boundary wrapper",
            "Day boundary wrapper is SECURITY DEFINER",
            "delegates immutable persistence to private.process_command",
        ),
        "pgTAP",
        errors,
    )
    for label, values in {
        "runtime tests": (
            "emits canonical events and all read models",
            "catch-up preserves planned boundary",
            "rejects before the configured local time",
            "rejects an existing authoritative Day",
        ),
        "auth tests": (
            "accepts exact raw-body HMAC",
            "rejects stale timestamp",
            "rejects uppercase or altered signature",
        ),
        "executor tests": (
            "prepares one null-actor atomic request",
            "requires exact pinned boundary runtime",
            "preserves stable wrapper failures",
        ),
        "handler tests": (
            "before human authentication",
            "rejects partial system headers",
            "verifies signature before parsing",
            "returns exact system replay",
        ),
        "integration": (
            "catches up, rolls back atomically and replays exactly",
            "forced_boundary_projection_failure",
            "day_boundary_persistence_unavailable",
            "stream_position: 2",
            "projection_version: 2",
            "replayed, true",
        ),
    }.items():
        key = {
            "runtime tests": "runtime_test",
            "auth tests": "auth_test",
            "executor tests": "executor_test",
            "handler tests": "handler_test",
            "integration": "integration",
        }[label]
        require(text[key], values, label, errors)

    # Gate 9E2 owns production composite registration after the Gate 9D3
    # boundary capability is protected.
    if "verify_jwt = true" not in text["config"]:
        errors.append("platform JWT verification must remain enabled")
    app = yaml.safe_load(text["app_commands"])
    day1 = app.get("expedition_day1_start", {})
    if day1.get("implementation_status") != "executable_gate_9d3":
        errors.append("app command status does not expose Gate 9D3 execution")
    if day1.get("process_day_boundary", {}).get("private_transaction") != "private.process_day_boundary":
        errors.append("app command private transaction drifted")
    if "process_day_boundary: { Args: { p_request: Json }; Returns: Json }" not in text["database_types"]:
        errors.append("generated database types do not expose process_day_boundary")

    workflow = text["workflow"]
    if "python scripts/validate_expedition_day1_boundary.py" not in workflow:
        errors.append("protected CI does not run Gate 9D3 validator")
    for forbidden in (
        "snapshot-gate9d3",
        "actions/upload-artifact",
        "contents: write",
    ):
        if forbidden in workflow:
            errors.append(f"protected workflow retains temporary mechanism: {forbidden}")

    if errors:
        return fail(errors)
    print("EXPEDITION DAY 1 BOUNDARY OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
