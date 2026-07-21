#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
ADR = ROOT / "docs/decisions/ADR-021-start-expedition-and-day1-boundary.md"
ARCH = ROOT / "docs/architecture/expedition-day1-start.md"
COMMANDS = ROOT / "engine/command-catalog.yaml"
ENGINE = ROOT / "engine/game-engine.yaml"
PERMISSIONS = ROOT / "engine/permissions.yaml"
PIPELINE = ROOT / "engine/pipeline.yaml"
ROLE_RULES = ROOT / "engine/role-rotation-rules.yaml"
ROLES = ROOT / "engine/roles-catalog.yaml"
ONBOARDING = ROOT / "stages/01_onboarding.yaml"
APP_COMMANDS = ROOT / "app/api/commands.yaml"
SETUP_SCHEMA = ROOT / "app/contracts/expedition-setup-view.schema.json"
TODAY_SCHEMA = ROOT / "app/contracts/today-view.schema.json"
CAPTAIN_SCHEMA = ROOT / "app/contracts/captain-day-view.schema.json"
COMMAND_SCHEMA = ROOT / "schemas/command.schema.json"
EVENT_SCHEMA = ROOT / "engine/event.schema.json"
CARD_SCHEMA = ROOT / "schemas/card.schema.json"
RUNTIME_REGISTRY = ROOT / "supabase/functions/_shared/command-gateway/runtime-registry.ts"
WORKFLOW = ROOT / ".github/workflows/validate.yml"

REQUIRED = (
    ADR,
    ARCH,
    COMMANDS,
    ENGINE,
    PERMISSIONS,
    PIPELINE,
    ROLE_RULES,
    ROLES,
    ONBOARDING,
    APP_COMMANDS,
    SETUP_SCHEMA,
    TODAY_SCHEMA,
    CAPTAIN_SCHEMA,
    COMMAND_SCHEMA,
    EVENT_SCHEMA,
    CARD_SCHEMA,
    RUNTIME_REGISTRY,
    WORKFLOW,
)


def report(errors: list[str]) -> int:
    print("EXPEDITION DAY 1 START CONTRACT FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


def require(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    for value in values:
        if value not in text:
            errors.append(f"{label}: missing {value}")


def command(items: list[dict], command_type: str) -> dict:
    return next(
        (item for item in items if item.get("command_type") == command_type),
        {},
    )


def main() -> int:
    errors: list[str] = []
    for path in REQUIRED:
        if not path.is_file():
            errors.append(f"missing Gate 9D1 file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    adr = ADR.read_text(encoding="utf-8")
    require(
        adr,
        (
            "Status: Accepted",
            "Gate 9D1 adds no executable runtime",
            "expedition.started",
            "stage.opened",
            "day.started",
            "role_assignments.activated",
            "card_bundles.published",
            "Day 1 does not emit `role_assignments.expired` or `task.overdue`",
            "idempotency_key == command_id",
            "cmd_day_boundary_<expedition_key>_<YYYYMMDD>",
            "x-ilka-system-timestamp",
            "x-ilka-system-signature",
            "HMAC-SHA256",
            "private.start_expedition(jsonb)",
            "private.process_day_boundary(jsonb)",
            "<participant_key>:<task_id>",
            "No Day, assignment or Card Bundle table is introduced",
        ),
        "ADR-021",
        errors,
    )

    architecture = ARCH.read_text(encoding="utf-8")
    require(
        architecture,
        (
            "ExpeditionSetupView.ready",
            "Human start command path",
            "Trusted system clock path",
            "constant time",
            "loadSystemContext",
            "Assignment instances",
            "Card Bundles",
            "Projection construction",
            "private.process_command(jsonb)",
            "Conflict and replay matrix",
        ),
        "Day 1 architecture",
        errors,
    )

    commands = yaml.safe_load(COMMANDS.read_text(encoding="utf-8"))
    if commands.get("idempotency_key") != "command_id":
        errors.append("command catalog global idempotency must remain command_id")
    items = commands.get("commands", [])

    start = command(items, "start_expedition")
    if start.get("allowed_actors") != ["captain"]:
        errors.append("start_expedition must be Captain-only")
    if start.get("payload_required") != []:
        errors.append("start_expedition payload must remain empty")
    if start.get("emits") != ["expedition.started", "stage.opened"]:
        errors.append("start_expedition event order drifted")
    if start.get("offline_allowed") is not False:
        errors.append("start_expedition must remain online-only")

    boundary = command(items, "process_day_boundary")
    if boundary.get("allowed_actors") != ["system_clock"]:
        errors.append("process_day_boundary must be system_clock-only")
    if boundary.get("payload_required") != ["local_calendar_date", "boundary_at"]:
        errors.append("process_day_boundary payload contract drifted")
    if boundary.get("command_id_template") != "cmd_day_boundary_<expedition_id>_<local_calendar_date_compact>":
        errors.append("deterministic boundary command ID template drifted")
    if boundary.get("idempotency_key") != "command_id":
        errors.append("boundary idempotency key must equal command_id")
    if boundary.get("transport") != "trusted_system_clock":
        errors.append("boundary must use trusted_system_clock transport")
    if boundary.get("browser_api_allowed") is not False:
        errors.append("browser must not submit process_day_boundary")
    if boundary.get("emits") != [
        "day.started",
        "role_assignments.activated",
        "card_bundles.published",
    ]:
        errors.append("Day 1 base event order drifted")
    conditional = boundary.get("conditional_emits", {})
    if conditional.get("previous_day_exists") != [
        "role_assignments.expired",
        "task.overdue",
    ]:
        errors.append("prior-day events must be conditional")
    if boundary.get("offline_allowed") is not False:
        errors.append("process_day_boundary must remain server-only")

    engine = yaml.safe_load(ENGINE.read_text(encoding="utf-8"))
    engine_commands = engine.get("commands", {})
    engine_start = engine_commands.get("start_expedition", {})
    if engine_start.get("actor_roles") != ["captain"]:
        errors.append("game engine start_expedition actor drifted")
    if engine_start.get("expedition_from") != ["ready"]:
        errors.append("game engine start_expedition must be ready-only")
    if engine_start.get("emits") != ["expedition.started", "stage.opened"]:
        errors.append("game engine start event order drifted")
    if "no_calendar_day_exists" not in engine_start.get("guards", []):
        errors.append("start_expedition must guard against an existing Calendar Day")

    engine_boundary = engine_commands.get("process_day_boundary", {})
    if engine_boundary.get("actor_roles") != ["system_clock"]:
        errors.append("game engine boundary actor drifted")
    if engine_boundary.get("emits") != [
        "day.started",
        "role_assignments.activated",
        "card_bundles.published",
    ]:
        errors.append("game engine Day 1 event order drifted")
    if engine_boundary.get("conditional_emits", {}).get("previous_day_exists") != [
        "role_assignments.expired",
        "task.overdue",
    ]:
        errors.append("game engine prior-day events must remain conditional")

    idempotency = engine.get("idempotency", {})
    if idempotency.get("command_invariant") != "idempotency_key_equals_command_id":
        errors.append("Engine idempotency invariant missing")
    if idempotency.get("boundary_command_id") != "cmd_day_boundary_<expedition_id>_<local_calendar_date_compact>":
        errors.append("Engine boundary command ID drifted")

    invariants = set(engine.get("invariants", []))
    for invariant in (
        "normal_day_start_is_system_clock_only",
        "captain_cannot_impersonate_system_clock",
        "idempotency_key_equals_command_id",
        "day1_has_no_prior_day_expiry_or_overdue_events",
        "day1_assignment_ids_are_participant_scoped",
    ):
        if invariant not in invariants:
            errors.append(f"Engine invariant missing: {invariant}")

    permissions = yaml.safe_load(PERMISSIONS.read_text(encoding="utf-8"))
    roles = permissions.get("roles", {})
    captain = set(roles.get("captain", {}).get("can", []))
    system_clock = set(roles.get("system_clock", {}).get("can", []))
    if "start_expedition" not in captain:
        errors.append("Captain start_expedition permission missing")
    if "process_day_boundary" in captain:
        errors.append("Captain must not own process_day_boundary")
    if system_clock != {"process_day_boundary"}:
        errors.append("system_clock permission must be exactly process_day_boundary")
    restrictions = permissions.get("restrictions", {})
    if restrictions.get("normal_day_start") != "system_clock_only":
        errors.append("normal day start restriction drifted")
    if restrictions.get("captain_cannot_impersonate_system_clock") is not True:
        errors.append("Captain system_clock impersonation restriction missing")

    pipeline = yaml.safe_load(PIPELINE.read_text(encoding="utf-8"))
    stages = pipeline.get("stages", [])
    if not stages or stages[0].get("id") != "onboarding":
        errors.append("pipeline first Stage must remain onboarding")
    if pipeline.get("stage_progression", {}).get("card_bundles_publish_on") != "day.started":
        errors.append("Card Bundles must publish on day.started")

    onboarding = yaml.safe_load(ONBOARDING.read_text(encoding="utf-8"))
    if onboarding.get("stage_id") != "onboarding":
        errors.append("Day 1 Stage file must remain onboarding")
    card_refs = onboarding.get("card_refs", {})
    if not card_refs.get("shared"):
        errors.append("onboarding shared Card Bundle refs missing")
    if set(card_refs.get("by_product_role", {})) != {"product_captain", "product_support"}:
        errors.append("onboarding product-role Card Bundle refs drifted")
    expected_onboard = {"navigation", "mooring", "order", "cook", "product_focus"}
    if set(card_refs.get("by_onboard_role", {})) != expected_onboard:
        errors.append("onboarding onboard-role Card Bundle refs drifted")

    app = yaml.safe_load(APP_COMMANDS.read_text(encoding="utf-8"))
    day1 = app.get("expedition_day1_start", {})
    if day1.get("source_of_truth") != "docs/decisions/ADR-021-start-expedition-and-day1-boundary.md":
        errors.append("app transport must point to ADR-021")
    if day1.get("implementation_status") != "contracts_only_gate_9d1":
        errors.append("Gate 9D1 app status must remain contract-only")
    app_start = day1.get("start_expedition", {})
    if app_start.get("creates_calendar_day") is not False:
        errors.append("start_expedition transport must not create a Calendar Day")
    app_boundary = day1.get("process_day_boundary", {})
    if app_boundary.get("browser_api_allowed") is not False:
        errors.append("app transport must deny browser boundary execution")
    if app_boundary.get("day1_events") != [
        "day.started",
        "role_assignments.activated",
        "card_bundles.published",
    ]:
        errors.append("app Day 1 event projection drifted")
    headers = day1.get("system_clock_headers", {})
    if headers.get("timestamp") != "x-ilka-system-timestamp":
        errors.append("system timestamp header drifted")
    if headers.get("signature") != "x-ilka-system-signature":
        errors.append("system signature header drifted")
    if headers.get("constant_time_compare_required") is not True:
        errors.append("system signature must require constant-time comparison")
    if day1.get("participant_task_blocker_key") != "<participant_key>:<task_id>":
        errors.append("Participant-scoped task blocker contract drifted")

    role_rules = yaml.safe_load(ROLE_RULES.read_text(encoding="utf-8"))
    if role_rules.get("rotation", {}).get("participant_order_source") != "participants.participant_order":
        errors.append("Day 1 assignments must retain Participant order source")
    roles_catalog = yaml.safe_load(ROLES.read_text(encoding="utf-8"))
    product_roles = {item.get("id") for item in roles_catalog.get("product_roles", [])}
    if not {"product_captain", "product_support"} <= product_roles:
        errors.append("Day 1 product roles are not resolvable")

    registry = RUNTIME_REGISTRY.read_text(encoding="utf-8")
    if "day1_pilot_v1" in registry:
        errors.append("Gate 9D1 must not register day1_pilot_v1")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "python scripts/validate_expedition_day1_start_contract.py" not in workflow:
        errors.append("protected CI does not execute Gate 9D1 validator")

    if errors:
        return report(errors)
    print("EXPEDITION DAY 1 START CONTRACT OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
