import json
import sys
from pathlib import Path
import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.replay_events import replay


def test_sample_expedition_has_five_participants_and_cook_guard():
    expedition = yaml.safe_load((ROOT / "examples/sample-expedition.yaml").read_text())
    assert len(expedition["participants"]) == 5
    cook = [participant for participant, role in expedition["rotation"]["day_01"]["onboard_roles"].items() if role == "cook"][0]
    assert expedition["rotation"]["day_01"]["product_roles"][cook] == "product_support"
    assert expedition["calendar_day"]["day_number"] != expedition["product_stage"]["stage_id"]


def test_sample_events_replay_to_closed_day():
    events = json.loads((ROOT / "examples/sample-events.json").read_text())
    state = replay(events)
    assert state["day"]["status"] == "closed"
    assert len(state["participants"]) == 5
    assert state["tasks"]["task_team_agreement"]["status"] == "completed"
    assert len(state["roles"]) == 5
    assert len(state["card_bundles"]) == 5
    assert state["stage"]["stage_id"] == "validation"
    assert state["stage"]["status"] == "active"
    assert {item["stage_id"] for item in state["completed_stages"]} >= {"problem_discovery", "hypothesis"}
    assert state["stage_advance_request"] is None


def test_replay_ignores_duplicate_event_id():
    events = json.loads((ROOT / "examples/sample-events.json").read_text())
    state = replay(events + [events[-1]])
    assert len(state["processed_event_ids"]) == len(events)


def test_command_catalog_has_first_vertical_commands():
    data = yaml.safe_load((ROOT / "engine/command-catalog.yaml").read_text())
    names = {command["command_type"] for command in data["commands"]}
    assert {
        "create_expedition", "add_participant", "generate_rotation", "start_expedition",
        "process_day_boundary", "acknowledge_card", "complete_task", "close_day",
        "override_role_assignment", "override_day_close", "recover_day_transition",
    } <= names


def test_read_model_schemas_are_valid_json_schema():
    for name in ("today-view.schema.json", "captain-day-view.schema.json"):
        schema = json.loads((ROOT / "app/contracts" / name).read_text())
        Draft202012Validator.check_schema(schema)


def test_participant_and_captain_views_are_distinct():
    today = json.loads((ROOT / "app/contracts/today-view.schema.json").read_text())
    captain = json.loads((ROOT / "app/contracts/captain-day-view.schema.json").read_text())
    assert "tasks" in today["properties"]
    assert "controls" in captain["properties"]
    assert captain["properties"]["controls"]["properties"]["normal_start_day"]["const"] is False


def test_super_admin_events_replay_as_corrections():
    base = [
        {
            "event_id": "evt_participant_base", "event_type": "participant.added",
            "occurred_at": "2026-07-18T10:00:00+03:00", "recorded_at": "2026-07-18T10:00:00+03:00",
            "actor_id": "captain_01", "actor_role": "captain", "expedition_id": "exp_demo",
            "command_id": "cmd_add", "idempotency_key": "cmd_add", "schema_version": 4,
            "payload": {"participant_id": "participant_03", "display_name": "P3"},
        },
        {
            "event_id": "evt_day_base", "event_type": "day.started",
            "occurred_at": "2026-07-18T11:00:00+03:00", "recorded_at": "2026-07-18T11:00:00+03:00",
            "actor_id": "system_clock", "actor_role": "system_clock", "expedition_id": "exp_demo",
            "command_id": "cmd_day", "idempotency_key": "cmd_day", "schema_version": 4,
            "day_revision": 1,
            "payload": {"day_number": 5, "calendar_date": "2026-07-22", "stage_id": "product_decision", "boundary_at": "2026-07-22T06:00:00+03:00"},
        },
    ]
    admin = json.loads((ROOT / "examples/sample-super-admin-events.json").read_text())
    state = replay(base + admin)
    assert state["participants"]["participant_03"]["status"] == "active"
    assert state["participants"]["participant_03"]["access_revoked"] is False
    assert state["day"]["day_number"] == 4
    assert state["day"]["revision"] == 2
    assert state["superseded_days"] == [5]
