#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_json(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def main() -> int:
    errors: list[str] = []

    runtime = (ROOT / "supabase/functions/_shared/engine-runtime/day1-complete-task-v1.ts").read_text(encoding="utf-8")
    if 'const actorTaskBlockerId = `${actor.participant_key}:${taskId}`;' not in runtime:
        errors.append("complete_task does not derive a Participant-scoped blocker ID")
    if "actorTaskIds" in runtime:
        errors.append("complete_task still removes blockers by unscoped task IDs")

    today = load_json("frontend/src/dev/today-view.day1.fixture.json")
    captain = load_json("frontend/src/dev/captain-day-view.day1.fixture.json")
    progress = load_json("frontend/src/dev/captain-day-view.day1-progress.fixture.json")
    participants = [item["participant_id"] for item in captain["participants"]]

    if today["product_role"]["assignment_id"] != "assignment_day_01_participant_01_product":
        errors.append("Participant fixture product assignment ID drifted")
    if today["onboard_role"]["assignment_id"] != "assignment_day_01_participant_01_onboard":
        errors.append("Participant fixture onboard assignment ID drifted")

    expected_task_blockers = {f"{participant}:task_team_agreement" for participant in participants}
    initial_task_blockers = {
        blocker["entity_id"] for blocker in captain["blockers"]
        if blocker["code"] == "required_task_incomplete"
    }
    if initial_task_blockers != expected_task_blockers:
        errors.append("initial Captain task blockers are not Participant-scoped")

    progress_task_blockers = {
        blocker["entity_id"] for blocker in progress["blockers"]
        if blocker["code"] == "required_task_incomplete"
    }
    expected_progress = expected_task_blockers - {"participant_01:task_team_agreement"}
    if progress_task_blockers != expected_progress:
        errors.append("after-sync fixture removes another Participant task blocker")
    if progress["participants"][0]["required_tasks_terminal"] is not True:
        errors.append("after-sync actor is not terminal")
    if any(item["required_tasks_terminal"] for item in progress["participants"][1:]):
        errors.append("after-sync fixture marks an unrelated Participant terminal")
    if progress["participants"][0]["required_cards_acknowledged"] is not False:
        errors.append("complete_task fixture acknowledges cards")
    if progress["day"]["revision"] != captain["day"]["revision"] + 1:
        errors.append("after-sync Day revision does not advance exactly once")
    if progress["completion_readiness"]["expected_projection_version"] != 2:
        errors.append("after-sync projection version drifted")

    commands = load_json("examples/sample-commands.json")
    boundary_commands = [item for item in commands if item["command_type"] == "process_day_boundary"]
    if len(boundary_commands) != 1:
        errors.append("sample commands must contain one Day 1 boundary")
    else:
        boundary = boundary_commands[0]
        expected_id = "cmd_day_boundary_ilka_demo_2026_01_20260718"
        if boundary["command_id"] != expected_id or boundary["idempotency_key"] != expected_id:
            errors.append("sample boundary identity is not deterministic")
        if set(boundary["payload"]) != {"local_calendar_date", "boundary_at"}:
            errors.append("sample boundary payload is not exact")

    start = [item for item in commands if item["command_type"] == "start_expedition"]
    complete = [item for item in commands if item["command_type"] == "complete_task"]
    if len(start) != 1 or start[0]["payload"] != {}:
        errors.append("sample commands do not contain one exact start_expedition")
    if len(complete) != 1 or complete[0]["payload"] != {"task_id": "task_team_agreement"}:
        errors.append("sample commands do not contain one exact complete_task")

    events = load_json("examples/sample-events.json")
    boundary_events = [
        item for item in events
        if item["event_type"] in {
            "day.started", "role_assignments.activated", "card_bundles.published"
        } and item.get("day_number") == 1
    ]
    if [item["event_type"] for item in boundary_events] != [
        "day.started", "role_assignments.activated", "card_bundles.published"
    ]:
        errors.append("sample Day 1 event order drifted")
    else:
        ids = {item["command_id"] for item in boundary_events}
        keys = {item["idempotency_key"] for item in boundary_events}
        times = {(item["occurred_at"], item["recorded_at"]) for item in boundary_events}
        if ids != {"cmd_day_boundary_ilka_demo_2026_01_20260718"} or keys != ids:
            errors.append("sample boundary events do not share deterministic command identity")
        if times != {("2026-07-18T06:00:00+03:00", "2026-07-18T06:00:00+03:00")}:
            errors.append("sample boundary events do not share trusted gateway time")
        assignments = boundary_events[1]["payload"]["assignments"]
        if len(assignments) != 2 * len(participants):
            errors.append("sample boundary does not contain two assignment instances per Participant")
        for participant in participants:
            expected_ids = {
                f"assignment_day_01_{participant}_product",
                f"assignment_day_01_{participant}_onboard",
            }
            actual_ids = {
                item["assignment_id"] for item in assignments
                if item["participant_id"] == participant
            }
            if actual_ids != expected_ids:
                errors.append(f"sample assignment IDs drifted for {participant}")
        bundles = boundary_events[2]["payload"]["bundles"]
        if len(bundles) != len(participants):
            errors.append("sample boundary does not contain one bundle per Participant")
        for bundle in bundles:
            required = {
                "bundle_id", "participant_id", "product_assignment_id",
                "onboard_assignment_id", "card_ids", "task_ids", "output_ids",
            }
            if set(bundle) != required:
                errors.append(f"sample Card Bundle shape drifted for {bundle.get('participant_id')}")

    task_events = [item for item in events if item["event_type"] == "task.completed" and item.get("day_number") == 1]
    if len(task_events) != 1:
        errors.append("sample events must contain one Day 1 task.completed")
    else:
        payload = task_events[0]["payload"]
        if payload.get("participant_id") != "participant_01" or payload.get("previous_status") != "available":
            errors.append("sample task.completed payload does not match complete_task runtime")

    unit_test = (ROOT / "supabase/functions/command-gateway/tests/unit/day1-complete-task-runtime.test.ts").read_text(encoding="utf-8")
    integration_test = (ROOT / "supabase/functions/command-gateway/tests/integration/day1-complete-task.test.ts").read_text(encoding="utf-8")
    marker = 'participant_02:task_team_agreement'
    if marker not in unit_test or marker not in integration_test:
        errors.append("shared task blocker isolation is not protected in unit and integration tests")

    docs = (ROOT / "docs/architecture/expedition-day1-start.md").read_text(encoding="utf-8")
    if "## Gate 9D4 vertical closure" not in docs:
        errors.append("Gate 9D4 architecture closure is missing")

    if errors:
        print("EXPEDITION DAY 1 VERTICAL CLOSURE FAILED", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("EXPEDITION DAY 1 VERTICAL CLOSURE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
