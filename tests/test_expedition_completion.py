from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator, FormatChecker, ValidationError

from scripts.replay_events import replay

ROOT = Path(__file__).resolve().parents[1]


def load_yaml(rel: str):
    return yaml.safe_load((ROOT / rel).read_text())


def load_json(rel: str):
    return json.loads((ROOT / rel).read_text())


def test_completion_command_event_and_counts_are_synchronized():
    commands = load_yaml("engine/command-catalog.yaml")["commands"]
    events = load_yaml("engine/event-catalog.yaml")["events"]
    command_ids = {item["command_type"] for item in commands}
    event_ids = {item["event_type"] for item in events}
    assert len(command_ids) == 39
    assert len(event_ids) == 52
    assert "close_expedition" in command_ids
    assert "expedition.completed" in event_ids
    assert set(load_json("schemas/command.schema.json")["properties"]["command_type"]["enum"]) == command_ids
    offline_ids = {item["command_type"] for item in commands if item["offline_allowed"]}
    assert set(load_json("app/contracts/offline-command.schema.json")["properties"]["command_type"]["enum"]) == offline_ids
    assert "close_expedition" not in offline_ids
    assert set(load_json("engine/event.schema.json")["properties"]["event_type"]["enum"]) == event_ids


def test_final_stage_uses_separate_completion_contract():
    pipeline = load_yaml("engine/pipeline.yaml")
    final = pipeline["stage_progression"]["final_stage"]
    assert final == {
        "id": "demo_day",
        "completion_command": "close_expedition",
        "stage_completion_event": "stage.completed",
        "expedition_completion_event": "expedition.completed",
        "next_stage_id": None,
        "requires_closed_day": True,
        "captain_confirmation_required": True,
    }
    engine = load_yaml("engine/game-engine.yaml")
    close = engine["commands"]["close_expedition"]
    assert close["actor_roles"] == ["captain"]
    assert close["day_from"] == ["closed"]
    assert close["emits"] == ["role_assignments.expired", "stage.completed", "expedition.completed"]
    assert "final_stage_has_no_next_stage" in engine["invariants"]


def test_completion_permissions_and_offline_boundary():
    permissions = load_yaml("engine/permissions.yaml")
    assert "close_expedition" in permissions["roles"]["captain"]["can"]
    assert "close_expedition" not in permissions["roles"]["product_captain"]["can"]
    assert permissions["restrictions"]["product_captain_cannot_close_expedition"] is True
    api = load_yaml("app/api/commands.yaml")
    assert "close_expedition" in api["server_confirmation_required"]
    assert "close_expedition" in api["dangerous_super_admin_commands"]
    assert "close_expedition" in api["offline_draft_only_commands"]
    assert "close_expedition" not in api["offline_delivery"]["queueable_commands"]


def test_close_expedition_command_example_validates_and_missing_payload_fails():
    schema = load_json("schemas/command.schema.json")
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    example = next(x for x in load_json("examples/sample-commands.json") if x["command_type"] == "close_expedition")
    validator.validate(example)
    broken = json.loads(json.dumps(example))
    broken["payload"].pop("shore_package_ref")
    with pytest.raises(ValidationError):
        validator.validate(broken)


def test_final_completion_events_validate_with_null_next_stage():
    validator = Draft202012Validator(load_json("engine/event.schema.json"), format_checker=FormatChecker())
    events = load_json("examples/sample-expedition-completion-events.json")
    assert [e["event_type"] for e in events] == ["role_assignments.expired", "stage.completed", "expedition.completed"]
    assert events[1]["payload"]["next_stage_id"] is None
    for event in events:
        validator.validate(event)


def test_null_next_stage_is_reserved_for_demo_day_only():
    validator = Draft202012Validator(load_json("engine/event.schema.json"), format_checker=FormatChecker())
    events = load_json("examples/sample-expedition-completion-events.json")
    final_stage_completed = next(e for e in events if e["event_type"] == "stage.completed")
    validator.validate(final_stage_completed)

    non_final_with_null = json.loads(json.dumps(final_stage_completed))
    non_final_with_null["event_id"] = "evt_non_final_null"
    non_final_with_null["stage_id"] = "iteration"
    non_final_with_null["payload"]["stage_id"] = "iteration"
    non_final_with_null["payload"]["completed_on_day_number"] = 11
    with pytest.raises(ValidationError):
        validator.validate(non_final_with_null)

    final_with_next_stage = json.loads(json.dumps(final_stage_completed))
    final_with_next_stage["event_id"] = "evt_final_with_next"
    final_with_next_stage["payload"]["next_stage_id"] = "imaginary_stage_13"
    with pytest.raises(ValidationError):
        validator.validate(final_with_next_stage)


def test_completion_reducer_makes_expedition_terminal_without_deleting_history():
    events = [
        {
            "event_id": "evt_created", "event_type": "expedition.created",
            "occurred_at": "2026-07-19T08:00:00+03:00", "recorded_at": "2026-07-19T08:00:01+03:00",
            "actor_id": "captain_01", "actor_role": "captain", "expedition_id": "exp_demo",
            "day_number": None, "stage_id": None, "command_id": "cmd_create", "payload": {
                "name": "Demo", "timezone": "Europe/Athens", "duration_days": 12, "day_boundary_local_time": "06:00"
            }
        },
        {
            "event_id": "evt_started", "event_type": "expedition.started",
            "occurred_at": "2026-07-19T08:01:00+03:00", "recorded_at": "2026-07-19T08:01:01+03:00",
            "actor_id": "captain_01", "actor_role": "captain", "expedition_id": "exp_demo",
            "day_number": 1, "stage_id": "onboarding", "command_id": "cmd_start", "payload": {}
        },
        {
            "event_id": "evt_completed", "event_type": "expedition.completed",
            "occurred_at": "2026-07-30T21:30:03+03:00", "recorded_at": "2026-07-30T21:30:03+03:00",
            "actor_id": "captain_01", "actor_role": "captain", "expedition_id": "exp_demo",
            "day_number": 12, "stage_id": "demo_day", "command_id": "cmd_close", "payload": {
                "final_stage_id": "demo_day", "final_day_number": 12,
                "shore_package_ref": "artifact_shore_package_v1",
                "completion_summary": "Complete", "final_projection_version": 185
            }
        },
    ]
    state = replay(events)
    assert state["expedition"]["status"] == "completed"
    assert state["expedition"]["final_stage_id"] == "demo_day"
    assert state["processed_event_ids"] == ["evt_completed", "evt_created", "evt_started"]


def test_completion_is_owned_by_adr_and_projection_contracts():
    adr = (ROOT / "docs/decisions/ADR-010-expedition-completion.md").read_text()
    assert "`close_expedition`" in adr
    assert "`next_stage_id: null`" in adr
    reducers = load_yaml("engine/reducers.yaml")
    handler = reducers["expedition_projection"]["handlers"]["expedition.completed"]
    assert handler["set"]["status"] == "completed"
    captain_schema = load_json("app/contracts/captain-day-view.schema.json")
    assert "close_expedition" in captain_schema["properties"]["controls"]["properties"]
    assert {"expedition_status", "expedition_completion", "completion_readiness"} <= set(captain_schema["required"])
