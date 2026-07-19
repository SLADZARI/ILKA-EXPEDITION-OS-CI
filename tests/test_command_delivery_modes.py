from __future__ import annotations

import json
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]


def load_yaml(rel: str):
    return yaml.safe_load((ROOT / rel).read_text(encoding="utf-8"))


def load_json(rel: str):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


def test_every_command_declares_delivery_mode_and_offline_sets_match():
    commands = load_yaml("engine/command-catalog.yaml")["commands"]
    assert len(commands) == 36
    assert all(type(item.get("offline_allowed")) is bool for item in commands)
    allowed = {item["command_type"] for item in commands if item["offline_allowed"]}
    expected = {
        "acknowledge_card", "start_task", "block_task", "complete_task",
        "confirm_output", "request_day_close", "request_stage_advance",
        "create_decision_draft", "create_vote", "vote",
    }
    assert allowed == expected
    api = load_yaml("app/api/commands.yaml")
    assert set(api["offline_delivery"]["queueable_commands"]) == allowed
    schema = load_json("app/contracts/offline-command.schema.json")
    assert set(schema["properties"]["command_type"]["enum"]) == allowed
    assert "close_expedition" not in allowed
    assert "advance_stage" not in allowed
    assert "activate_recovery_day" not in allowed


def test_completion_projections_are_schema_owned_and_fixtures_validate():
    format_checker = FormatChecker()
    pairs = [
        ("app/contracts/today-view.schema.json", "frontend/src/dev/today-view.fixture.json"),
        ("app/contracts/today-view.schema.json", "frontend/src/dev/today-view.completed.fixture.json"),
        ("app/contracts/captain-day-view.schema.json", "frontend/src/dev/captain-day-view.fixture.json"),
        ("app/contracts/captain-day-view.schema.json", "frontend/src/dev/captain-day-view.completion-ready.fixture.json"),
        ("app/contracts/captain-day-view.schema.json", "frontend/src/dev/captain-day-view.completed.fixture.json"),
    ]
    for schema_rel, fixture_rel in pairs:
        Draft202012Validator(load_json(schema_rel), format_checker=format_checker).validate(load_json(fixture_rel))

    captain_schema = load_json("app/contracts/captain-day-view.schema.json")
    required = set(captain_schema["required"])
    assert {"expedition_status", "expedition_completion", "completion_readiness"} <= required
    today_schema = load_json("app/contracts/today-view.schema.json")
    assert {"expedition_status", "expedition_completion"} <= set(today_schema["required"])


def test_frontend_transport_boundary_is_explicit():
    queue = (ROOT / "frontend/src/application/offline/OfflineCommandQueue.ts").read_text(encoding="utf-8")
    dispatcher = (ROOT / "frontend/src/application/commands/CommandDispatcher.ts").read_text(encoding="utf-8")
    close = (ROOT / "frontend/src/application/commands/closeExpedition.ts").read_text(encoding="utf-8")
    stage_screen = (ROOT / "frontend/src/screens/captain/StageControlScreen.tsx").read_text(encoding="utf-8")
    recovery_screen = (ROOT / "frontend/src/screens/captain/RecoveryDayScreen.tsx").read_text(encoding="utf-8")
    assert "OfflineQueueableCommand" in queue
    assert "isOfflineQueueableCommand" in queue
    assert "dispatchServer" in dispatcher
    assert "server_transport_missing" in dispatcher
    assert "createCommand('close_expedition'" in close
    assert "dispatchServer(command)" in stage_screen
    assert "dispatchServer(command)" in recovery_screen
    assert "dispatcher.dispatch(command)" not in stage_screen
    assert "dispatcher.dispatch(command)" not in recovery_screen


def test_adr_numbering_and_source_of_truth_are_unambiguous():
    adr10 = (ROOT / "docs/decisions/ADR-010-expedition-completion.md").read_text(encoding="utf-8")
    adr11 = (ROOT / "docs/decisions/ADR-011-frontend-root-generated-contracts-and-command-transport.md").read_text(encoding="utf-8")
    source_map = (ROOT / "docs/architecture/source-of-truth.md").read_text(encoding="utf-8")
    assert "Final Stage and Expedition Completion" in adr10
    assert "Frontend root" in adr11
    assert "ADR-011" in source_map
    assert not (ROOT / "docs/decisions/ADR-010-frontend-root-and-generated-contracts.md").exists()
