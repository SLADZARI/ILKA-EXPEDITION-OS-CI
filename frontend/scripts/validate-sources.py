from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker

FRONTEND = Path(__file__).resolve().parents[1]
REPO = FRONTEND.parent


def load_json(path: str):
    return json.loads((REPO / path).read_text(encoding="utf-8"))


def load_yaml(path: str):
    return yaml.safe_load((REPO / path).read_text(encoding="utf-8"))


def main() -> int:
    errors: list[str] = []
    command_items = load_yaml("engine/command-catalog.yaml")["commands"]
    event_items = load_yaml("engine/event-catalog.yaml")["events"]
    command_catalog = {item["command_type"] for item in command_items}
    event_catalog = {item["event_type"] for item in event_items}
    command_schema = set(load_json("schemas/command.schema.json")["properties"]["command_type"]["enum"])
    event_schema = set(load_json("engine/event.schema.json")["properties"]["event_type"]["enum"])

    for label, values in (
        ("schema-only commands", command_schema - command_catalog),
        ("catalog-only commands", command_catalog - command_schema),
        ("schema-only events", event_schema - event_catalog),
        ("catalog-only events", event_catalog - event_schema),
    ):
        if values:
            errors.append(f"{label}: {', '.join(sorted(values))}")

    if len(command_catalog) != 36:
        errors.append(f"expected 36 commands, found {len(command_catalog)}")
    if len(event_catalog) != 48:
        errors.append(f"expected 48 events, found {len(event_catalog)}")
    if "close_expedition" not in command_catalog or "expedition.completed" not in event_catalog:
        errors.append("Stage 12 completion command/event missing")

    missing_modes = [item["command_type"] for item in command_items if type(item.get("offline_allowed")) is not bool]
    if missing_modes:
        errors.append("commands missing explicit offline_allowed: " + ", ".join(missing_modes))
    offline_catalog = {item["command_type"] for item in command_items if item.get("offline_allowed") is True}
    offline_schema = set(load_json("app/contracts/offline-command.schema.json")["properties"]["command_type"]["enum"])
    api = load_yaml("app/api/commands.yaml")
    offline_api = set(api["offline_delivery"]["queueable_commands"])
    if not (offline_catalog == offline_schema == offline_api):
        errors.append(f"offline command mismatch catalog={sorted(offline_catalog)} schema={sorted(offline_schema)} api={sorted(offline_api)}")
    for identifier in api["server_confirmation_required"]:
        if identifier in offline_catalog:
            errors.append(f"server-confirmed command is offline queueable: {identifier}")
    if "close_expedition" in offline_catalog:
        errors.append("close_expedition must not be offline queueable")

    view_schema = load_json("app/contracts/gamification-view.schema.json")
    refs = [entry.get("$ref") for entry in view_schema.get("allOf", [])]
    if "../../schemas/gamification.schema.json" not in refs:
        errors.append("GamificationView must reference schemas/gamification.schema.json")

    token_doc = load_json("design-system/tokens/design-tokens.with-ids.json")
    component_doc = load_json("design-system/components/component-catalog.with-ids.json")
    for label, ids in (
        ("token", [item["id"] for item in token_doc["tokens"]]),
        ("component", [item["id"] for item in component_doc["components"]] + [item["id"] for item in component_doc["screen_compositions"]]),
    ):
        duplicates = sorted({item for item in ids if ids.count(item) > 1})
        if duplicates:
            errors.append(f"duplicate {label} IDs: {', '.join(duplicates)}")

    fixtures = [
        ("app/contracts/today-view.schema.json", "src/dev/today-view.fixture.json", "TodayView active"),
        ("app/contracts/today-view.schema.json", "src/dev/today-view.completed.fixture.json", "TodayView completed"),
        ("app/contracts/captain-day-view.schema.json", "src/dev/captain-day-view.fixture.json", "CaptainDayView active"),
        ("app/contracts/captain-day-view.schema.json", "src/dev/captain-day-view.completion-ready.fixture.json", "CaptainDayView ready"),
        ("app/contracts/captain-day-view.schema.json", "src/dev/captain-day-view.completed.fixture.json", "CaptainDayView completed"),
        ("schemas/gamification.schema.json", "src/dev/gamification-view.fixture.json", "GamificationView"),
    ]
    checker = FormatChecker()
    for schema_path, fixture_path, label in fixtures:
        fixture_file = FRONTEND / fixture_path
        if not fixture_file.exists():
            errors.append(f"missing fixture: {fixture_path}")
            continue
        schema = load_json(schema_path)
        fixture = json.loads(fixture_file.read_text(encoding="utf-8"))
        for error in Draft202012Validator(schema, format_checker=checker).iter_errors(fixture):
            errors.append(f"{label}: {'/'.join(map(str, error.path))}: {error.message}")

    captain_schema = load_json("app/contracts/captain-day-view.schema.json")
    if not {"expedition_status", "expedition_completion", "completion_readiness"} <= set(captain_schema["required"]):
        errors.append("CaptainDayView completion projection fields must be required")
    today_schema = load_json("app/contracts/today-view.schema.json")
    if not {"expedition_status", "expedition_completion"} <= set(today_schema["required"]):
        errors.append("TodayView completion projection fields must be required")

    required_runtime_files = [
        "src/application/commands/closeExpedition.ts",
        "src/application/commands/CommandDispatcher.ts",
        "src/application/offline/OfflineCommandQueue.ts",
        "src/screens/captain/DayOverviewScreen.tsx",
        "src/screens/captain/StageControlScreen.tsx",
        "src/screens/captain/RecoveryDayScreen.tsx",
        "src/contracts/generated/command.ts",
        "src/contracts/generated/offline-command.ts",
        "src/contracts/generated/today-view.ts",
        "src/contracts/generated/captain-day-view.ts",
    ]
    for relative in required_runtime_files:
        if not (FRONTEND / relative).exists():
            errors.append(f"missing runtime target: {relative}")

    if (REPO / "docs/decisions/ADR-010-frontend-root-and-generated-contracts.md").exists():
        errors.append("conflicting frontend ADR-010 remains canonical")
    if not (REPO / "docs/decisions/ADR-011-frontend-root-generated-contracts-and-command-transport.md").exists():
        errors.append("ADR-011 is missing")

    queue_source = (FRONTEND / "src/application/offline/OfflineCommandQueue.ts").read_text(encoding="utf-8")
    dispatcher_source = (FRONTEND / "src/application/commands/CommandDispatcher.ts").read_text(encoding="utf-8")
    stage_source = (FRONTEND / "src/screens/captain/StageControlScreen.tsx").read_text(encoding="utf-8")
    recovery_source = (FRONTEND / "src/screens/captain/RecoveryDayScreen.tsx").read_text(encoding="utf-8")
    if "isOfflineQueueableCommand" not in queue_source or "OfflineQueueableCommand" not in queue_source:
        errors.append("offline queue runtime guard missing")
    if "dispatchServer" not in dispatcher_source or "server_transport_missing" not in dispatcher_source:
        errors.append("server transport boundary missing")
    if "dispatchServer(command)" not in stage_source or "dispatchServer(command)" not in recovery_source:
        errors.append("Captain server commands are still routed through offline queue")

    generated_command = (FRONTEND / "src/contracts/generated/command.ts").read_text(encoding="utf-8")
    generated_offline = (FRONTEND / "src/contracts/generated/offline-command.ts").read_text(encoding="utf-8")
    generated_captain = (FRONTEND / "src/contracts/generated/captain-day-view.ts").read_text(encoding="utf-8")
    if '"close_expedition"' not in generated_command:
        errors.append("generated command types lack close_expedition")
    if '"close_expedition"' in generated_offline:
        errors.append("generated offline types contain close_expedition")
    if '"completion_readiness"' not in generated_captain or '"expedition_completion"' not in generated_captain:
        errors.append("generated CaptainDayView lacks completion projections")

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(
        f"UI reconciliation parity OK: {len(command_catalog)} commands, {len(event_catalog)} events, "
        f"{len(offline_catalog)} offline commands, {len(token_doc['tokens'])} tokens."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
