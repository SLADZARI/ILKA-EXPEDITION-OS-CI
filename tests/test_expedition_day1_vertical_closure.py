from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_json(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def test_day1_fixtures_use_participant_scoped_task_blockers():
    initial = load_json("frontend/src/dev/captain-day-view.day1.fixture.json")
    progress = load_json("frontend/src/dev/captain-day-view.day1-progress.fixture.json")
    participant_ids = {item["participant_id"] for item in initial["participants"]}
    expected = {f"{participant}:task_team_agreement" for participant in participant_ids}
    initial_ids = {
        blocker["entity_id"] for blocker in initial["blockers"]
        if blocker["code"] == "required_task_incomplete"
    }
    progress_ids = {
        blocker["entity_id"] for blocker in progress["blockers"]
        if blocker["code"] == "required_task_incomplete"
    }
    assert initial_ids == expected
    assert progress_ids == expected - {"participant_01:task_team_agreement"}
    assert "participant_02:task_team_agreement" in progress_ids


def test_day1_examples_use_boundary_runtime_identity_and_shape():
    commands = load_json("examples/sample-commands.json")
    boundary = next(item for item in commands if item["command_type"] == "process_day_boundary")
    expected_id = "cmd_day_boundary_ilka_demo_2026_01_20260718"
    assert boundary["command_id"] == expected_id
    assert boundary["idempotency_key"] == expected_id

    events = load_json("examples/sample-events.json")
    selected = [
        item for item in events
        if item["event_type"] in {
            "day.started", "role_assignments.activated", "card_bundles.published"
        } and item.get("day_number") == 1
    ]
    assert [item["event_type"] for item in selected] == [
        "day.started", "role_assignments.activated", "card_bundles.published"
    ]
    assert {item["command_id"] for item in selected} == {expected_id}
    assert {item["idempotency_key"] for item in selected} == {expected_id}
    assert len(selected[1]["payload"]["assignments"]) == 10
    assert len(selected[2]["payload"]["bundles"]) == 5


def test_complete_task_example_is_participant_attributed():
    events = load_json("examples/sample-events.json")
    task = next(
        item for item in events
        if item["event_type"] == "task.completed" and item.get("day_number") == 1
    )
    assert task["payload"] == {
        "task_id": "task_team_agreement",
        "participant_id": "participant_01",
        "previous_status": "available",
        "completed_on_day_number": 1,
        "due_day_number": 1,
    }
    assert task["day_revision"] == 2
