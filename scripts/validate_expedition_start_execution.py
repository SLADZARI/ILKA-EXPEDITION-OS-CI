#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "architecture": ROOT / "docs/architecture/expedition-start-execution.md",
    "adr": ROOT / "docs/decisions/ADR-021-start-expedition-and-day1-boundary.md",
    "runtime": ROOT / "supabase/functions/_shared/engine-runtime/expedition-start-v1.ts",
    "executor": ROOT / "supabase/functions/_shared/command-gateway/start.ts",
    "database": ROOT / "supabase/functions/_shared/command-gateway/start-database.ts",
    "validator": ROOT / "supabase/functions/_shared/command-gateway/start-schema-validation.ts",
    "contract": ROOT / "supabase/contracts/private-start-expedition-request.schema.json",
    "migration": ROOT / "supabase/migrations/20260722010000_start_expedition_transaction.sql",
    "pgtap": ROOT / "supabase/tests/start_expedition_transaction.test.sql",
    "runtime_test": ROOT / "supabase/functions/command-gateway/tests/unit/start-runtime.test.ts",
    "executor_test": ROOT / "supabase/functions/command-gateway/tests/unit/start-executor.test.ts",
    "database_types": ROOT / "supabase/database.types.ts",
    "registry": ROOT / "supabase/functions/_shared/command-gateway/runtime-registry.ts",
    "workflow": ROOT / ".github/workflows/validate.yml",
}


def fail(errors: list[str]) -> int:
    print("EXPEDITION START EXECUTION FAILED", file=sys.stderr)
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
        text["architecture"],
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
        "architecture",
        errors,
    )
    require(
        text["adr"],
        (
            "private.start_expedition(jsonb)",
            "expedition.started",
            "stage.opened",
            "It does not create a Calendar Day",
        ),
        "ADR-021",
        errors,
    )

    contract = json.loads(text["contract"])
    if contract.get("additionalProperties") is not False:
        errors.append("private start request must reject extra properties")
    if contract.get("required") != ["expedition_transition", "process_command_request"]:
        errors.append("private start request top-level shape drifted")
    properties = contract["properties"]["expedition_transition"]["properties"]
    for key, expected in (
        ("expected_status", "ready"),
        ("next_status", "active"),
        ("stage_id", "onboarding"),
    ):
        if properties.get(key, {}).get("const") != expected:
            errors.append(f"transition {key} drifted")

    require(
        text["runtime"],
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
        "runtime",
        errors,
    )
    if "day.started" in text["runtime"] or "card_bundles.published" in text["runtime"]:
        errors.append("start runtime must not create Day or Card Bundles")

    require(
        text["executor"],
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
        "executor",
        errors,
    )
    require(
        text["database"],
        (
            "PostgresStartDatabase",
            "set local role service_role",
            "select private.start_expedition",
            "start_expedition_returned_no_result",
        ),
        "database",
        errors,
    )
    require(
        text["validator"],
        (
            "private-start-expedition-request.schema.json",
            "private-process-command-request.schema.json",
            "engine/event.schema.json",
            "expedition-setup-view.schema.json",
            "createStartRequestValidator",
        ),
        "request validator",
        errors,
    )

    migration = text["migration"]
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
        "migration",
        errors,
    )
    markers = [
        migration.find("'ilka:command:'"),
        migration.find("'ilka:expedition:'"),
        migration.find("from ilka.command_receipts"),
        migration.find("if v_expedition_status <> 'ready'"),
        migration.find("v_result := private.process_command(v_process_request)"),
        migration.find("set status = 'active'"),
    ]
    if any(marker < 0 for marker in markers) or markers != sorted(markers):
        errors.append("migration lock/replay/state/process/update order drifted")
    lower = migration.lower()
    if "insert into ilka.event_log" in lower or "insert into ilka.projection_documents" in lower:
        errors.append("wrapper contains direct history/projection inserts")
    if "create table" in lower:
        errors.append("Gate 9D2 creates a parallel state table")

    require(
        text["pgtap"],
        (
            "private.start_expedition(jsonb) exists",
            "service_role can execute start wrapper",
            "authenticated cannot execute private start wrapper",
            "anon cannot execute private start wrapper",
            "start wrapper is SECURITY DEFINER",
            "start wrapper has empty search_path",
            "delegates immutable persistence to private.process_command",
        ),
        "pgTAP",
        errors,
    )
    require(
        text["runtime_test"],
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
        "runtime tests",
        errors,
    )
    require(
        text["executor_test"],
        (
            "prepares one trusted atomic wrapper request",
            "rejects non-Captain before persistence",
            "rejects spoofed actor before persistence",
            "requires exact pinned start runtime",
            "maps stable wrapper failures",
        ),
        "executor tests",
        errors,
    )

    if "start_expedition: { Args: { p_request: Json }; Returns: Json }" not in text["database_types"]:
        errors.append("generated Supabase types do not expose private.start_expedition")
    # Gate 9E2 owns production composite registration after the Gate 9D2
    # start capability is protected.

    workflow = text["workflow"]
    require(
        workflow,
        (
            "permissions:\n  contents: read",
            "Check command gateway and Engine runtime formatting",
            "deno fmt --check",
            "python scripts/validate_expedition_start_execution.py",
            "Verify generated sources are committed",
        ),
        "workflow",
        errors,
    )
    for forbidden in (
        "actions/upload-artifact",
        "Commit exact generated database types",
        "contents: write",
        "Checkout Gate 9D2A branch",
    ):
        if forbidden in workflow:
            errors.append(f"workflow retains temporary diagnostic step: {forbidden}")

    if errors:
        return fail(errors)
    print("EXPEDITION START EXECUTION OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
