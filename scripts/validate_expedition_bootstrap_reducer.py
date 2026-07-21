#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ADR = ROOT / "docs/decisions/ADR-017-expedition-bootstrap-command.md"
TYPES = ROOT / "supabase/functions/_shared/command-gateway/types.ts"
REDUCER = ROOT / "supabase/functions/_shared/engine-runtime/create-expedition-v1.ts"
TEST = ROOT / "supabase/functions/command-gateway/tests/unit/create-expedition-v1.test.ts"
REGISTRY = ROOT / "supabase/functions/_shared/command-gateway/runtime-registry.ts"
WORKFLOW = ROOT / ".github/workflows/validate.yml"


def require(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    for value in values:
        if value not in text:
            errors.append(f"{label}: {value}")


def main() -> int:
    errors: list[str] = []
    for path in (ADR, TYPES, REDUCER, TEST, REGISTRY, WORKFLOW):
        if not path.is_file():
            errors.append(f"missing Gate 8C1 file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    adr = ADR.read_text(encoding="utf-8")
    require(
        adr,
        (
            "A pure server TypeScript bootstrap reducer",
            "produces only `expedition.created`",
            "program constants from the selected release/configuration",
            "SQL enforces transactional integrity",
        ),
        "ADR-017 reducer decision missing",
        errors,
    )

    types = TYPES.read_text(encoding="utf-8")
    require(
        types,
        (
            "export interface BootstrapProgramPolicy",
            "duration_days: number",
            "recovery_days_available: number",
            "export interface BootstrapActorContext",
            'profile_status: "active" | "disabled"',
            "export interface BootstrapRuntimeInput",
            'actor_role: "captain"',
            "export interface BootstrapRuntimeCapability",
            "reduceCreateExpedition",
            "readonly bootstrap?: BootstrapRuntimeCapability",
        ),
        "bootstrap runtime types missing",
        errors,
    )

    reducer = REDUCER.read_text(encoding="utf-8")
    require(
        reducer,
        (
            "createExpeditionBootstrapCapability",
            "command.command_type !== \"create_expedition\"",
            'input.actor.profile_status !== "active"',
            'command.actor_role !== "captain"',
            "expectedActorId",
            "command.idempotency_key !== command.command_id",
            "command.day_number != null",
            "validTimeZone(timezone)",
            "durationDays !== program.duration_days",
            "BOUNDARY_TIME_PATTERN",
            'event_type: "expedition.created"',
            "occurred_at: command.issued_at",
            "recorded_at: input.received_at",
            "projection_mutations: []",
            "invalid_bootstrap_program_policy",
        ),
        "bootstrap reducer implementation missing",
        errors,
    )
    if "insert into" in reducer.lower() or "private.bootstrap_expedition" in reducer:
        errors.append("pure bootstrap reducer must not contain persistence logic")
    if "duration_days: 12" in reducer or "recovery_days_available: 1" in reducer:
        errors.append("pure reducer must not hard-code the current 12-day program")
    if "today_view" in reducer or "captain_day_view" in reducer:
        errors.append("create_expedition reducer must not create Day projections")

    test = TEST.read_text(encoding="utf-8")
    require(
        test,
        (
            "emits one canonical creation event",
            "preserves release-owned program policy",
            "rejects an invalid program policy",
            "requires an active Profile",
            "rejects a forged Captain membership actor",
            "requires a canonical Expedition key",
            "enforces command_id idempotency",
            "forbids Day and Stage context",
            "rejects a non-trimmed name",
            "validates the IANA timezone",
            "enforces the pinned program duration",
            "validates the local Day boundary",
        ),
        "Gate 8C1 unit scenario missing",
        errors,
    )

    registry = REGISTRY.read_text(encoding="utf-8")
    if "create-expedition-v1" in registry or "createExpeditionBootstrapCapability" in registry:
        errors.append("Gate 8C1 must not silently register the bootstrap reducer")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "Validate Expedition bootstrap reducer" not in workflow:
        errors.append("protected CI missing Gate 8C1 validator")

    if errors:
        return report(errors)
    print("EXPEDITION BOOTSTRAP REDUCER OK")
    return 0


def report(errors: list[str]) -> int:
    print("EXPEDITION BOOTSTRAP REDUCER FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
