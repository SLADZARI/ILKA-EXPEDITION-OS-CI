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
        ("app/contracts/today-view.schema.json", "src/dev/today-view.day1.fixture.json", "TodayView Day 1"),
        ("app/contracts/captain-day-view.schema.json", "src/dev/captain-day-view.fixture.json", "CaptainDayView active"),
        ("app/contracts/captain-day-view.schema.json", "src/dev/captain-day-view.completion-ready.fixture.json", "CaptainDayView ready"),
        ("app/contracts/captain-day-view.schema.json", "src/dev/captain-day-view.completed.fixture.json", "CaptainDayView completed"),
        ("app/contracts/captain-day-view.schema.json", "src/dev/captain-day-view.day1.fixture.json", "CaptainDayView Day 1"),
        ("app/contracts/captain-day-view.schema.json", "src/dev/captain-day-view.day1-progress.fixture.json", "CaptainDayView Day 1 after sync"),
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

    onboarding = load_yaml("stages/01_onboarding.yaml")
    day1_today = json.loads((FRONTEND / "src/dev/today-view.day1.fixture.json").read_text(encoding="utf-8"))
    if day1_today["day"]["number"] != 1 or day1_today["stage"]["stage_id"] != onboarding["stage_id"]:
        errors.append("Day 1 Participant fixture does not target canonical onboarding")
    product_role_id = day1_today["product_role"]["role_id"]
    onboard_role_id = day1_today["onboard_role"]["role_id"]
    expected_cards = set(onboarding["card_refs"]["shared"])
    expected_cards.update(onboarding["card_refs"]["by_product_role"][product_role_id])
    expected_cards.update(onboarding["card_refs"]["by_onboard_role"][onboard_role_id])
    actual_cards = {card["card_id"] for card in day1_today["cards"]}
    if actual_cards != expected_cards:
        errors.append(f"Day 1 Participant cards mismatch stage refs expected={sorted(expected_cards)} actual={sorted(actual_cards)}")
    expected_outputs = {output["id"] for output in onboarding["required_outputs"]}
    actual_outputs = {output["output_id"] for output in day1_today["outputs"]}
    if actual_outputs != expected_outputs:
        errors.append(f"Day 1 Participant outputs mismatch stage refs expected={sorted(expected_outputs)} actual={sorted(actual_outputs)}")

    sample_events = load_json("examples/sample-events.json")
    activation_events = [event for event in sample_events if event["event_type"] == "role_assignments.activated" and event.get("day_number") == 1]
    if not activation_events:
        errors.append("sample event stream lacks Day 1 role_assignments.activated")
    else:
        expected_assignments = {
            item["participant_id"]: (item["product_role_id"], item["onboard_role_id"])
            for item in activation_events[-1]["payload"]["assignments"]
        }
        for fixture_name in ("captain-day-view.day1.fixture.json", "captain-day-view.day1-progress.fixture.json"):
            captain_day1 = json.loads((FRONTEND / "src/dev" / fixture_name).read_text(encoding="utf-8"))
            actual_assignments = {
                item["participant_id"]: (item["product_role_id"], item["onboard_role_id"])
                for item in captain_day1["participants"]
            }
            if actual_assignments != expected_assignments:
                errors.append(f"{fixture_name} assignments mismatch sample event stream")

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
        "src/application/projections/participant-command-overlay.ts",
        "src/dev/preview-bootstrap.ts",
        "src/dev/PreviewLauncher.tsx",
        "src/pwa/register-service-worker.ts",
        "src/screens/captain/DayOverviewScreen.tsx",
        "src/screens/captain/StageControlScreen.tsx",
        "src/screens/captain/RecoveryDayScreen.tsx",
        "src/contracts/generated/command.ts",
        "src/contracts/generated/offline-command.ts",
        "src/contracts/generated/today-view.ts",
        "src/contracts/generated/captain-day-view.ts",
        "public/manifest.webmanifest",
        "public/offline.html",
        "public/ilka-icon.svg",
        "public/sw.js",
    ]
    for relative in required_runtime_files:
        if not (FRONTEND / relative).exists():
            errors.append(f"missing runtime target: {relative}")

    manifest_path = FRONTEND / "public/manifest.webmanifest"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for field in ("name", "short_name", "start_url", "scope", "display", "theme_color", "background_color", "icons"):
            if not manifest.get(field):
                errors.append(f"PWA manifest missing {field}")
        if manifest.get("display") != "standalone":
            errors.append("PWA manifest display must be standalone")
        for icon in manifest.get("icons", []):
            source = icon.get("src", "").removeprefix("./")
            if not source or not (FRONTEND / "public" / source).exists():
                errors.append(f"PWA manifest icon missing: {icon.get('src')}")

    index_source = (FRONTEND / "index.html").read_text(encoding="utf-8")
    if "%BASE_URL%manifest.webmanifest" not in index_source:
        errors.append("index.html does not link the base-aware PWA manifest")
    if "apple-mobile-web-app-capable" not in index_source:
        errors.append("index.html lacks mobile standalone metadata")

    service_worker_source = (FRONTEND / "public/sw.js").read_text(encoding="utf-8")
    required_service_worker_guards = [
        "request.mode === 'navigate'",
        "fetch(request).catch(() => caches.match(OFFLINE_FALLBACK))",
        "CACHEABLE_DESTINATIONS",
        "application/json",
        "/api/",
        "/commands/",
        "/events/",
        "/projections/",
        "/sync/",
    ]
    for guard in required_service_worker_guards:
        if guard not in service_worker_source:
            errors.append(f"service worker safety guard missing: {guard}")
    navigation_section = service_worker_source.split("if (request.mode === 'navigate')", 1)[-1].split("if (CACHEABLE_DESTINATIONS", 1)[0]
    if "cache.put" in navigation_section:
        errors.append("service worker must not cache navigation/projection documents")

    registration_source = (FRONTEND / "src/pwa/register-service-worker.ts").read_text(encoding="utf-8")
    if "import.meta.env.PROD" not in registration_source or "import.meta.env.BASE_URL" not in registration_source:
        errors.append("PWA registration must be production-only and base-aware")
    offline_source = (FRONTEND / "public/offline.html").read_text(encoding="utf-8")
    if "IndexedDB" not in offline_source or "__ILKA_BOOTSTRAP__" in offline_source:
        errors.append("offline fallback must explain queue persistence without embedding a projection")

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
