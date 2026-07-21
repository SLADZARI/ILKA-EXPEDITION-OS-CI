#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def insert_ready_after_rotation(path: Path) -> None:
    events = json.loads(path.read_text(encoding="utf-8"))
    rotation_index = next(
        index for index, event in enumerate(events)
        if event.get("event_type") == "rotation.generated"
    )
    rotation = events[rotation_index]
    if (
        rotation_index + 1 < len(events)
        and events[rotation_index + 1].get("event_type") == "expedition.ready"
    ):
        return
    ready = {
        "event_id": "evt_0007_ready",
        "event_type": "expedition.ready",
        "occurred_at": rotation["occurred_at"],
        "recorded_at": rotation["recorded_at"],
        "actor_id": rotation["actor_id"],
        "actor_role": rotation["actor_role"],
        "expedition_id": rotation["expedition_id"],
        "command_id": rotation["command_id"],
        "idempotency_key": rotation["idempotency_key"],
        "schema_version": rotation["schema_version"],
        "payload": {"rotation_id": rotation["payload"]["rotation_id"]},
        "device_id": rotation.get("device_id"),
        "sync_status": rotation.get("sync_status", "synced"),
        "correction_of": rotation.get("correction_of"),
    }
    events.insert(rotation_index + 1, ready)
    write_json(path, events)


def insert_setup_rotation_pair(path: Path) -> None:
    events = json.loads(path.read_text(encoding="utf-8"))
    ready_index = next(
        index for index, event in enumerate(events)
        if event.get("event_type") == "expedition.ready"
    )
    ready = events[ready_index]
    if ready_index > 0 and events[ready_index - 1].get("event_type") == "rotation.generated":
        return
    rotation = {
        "event_id": "evt_setup_rotation_01_01",
        "event_type": "rotation.generated",
        "occurred_at": ready["occurred_at"],
        "recorded_at": ready["recorded_at"],
        "actor_id": ready["actor_id"],
        "actor_role": ready["actor_role"],
        "expedition_id": ready["expedition_id"],
        "command_id": ready["command_id"],
        "idempotency_key": ready["idempotency_key"],
        "schema_version": ready["schema_version"],
        "payload": {
            "rotation_id": ready["payload"]["rotation_id"],
            "seed": "ilka_setup_demo:participant_order:v1",
            "rules_version": 2,
            "assignments": [
                {
                    "assignment_id": "assignment_11111111111111111111111111111111",
                    "participant_id": "participant_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    "product_role_id": "product_captain",
                    "onboard_role_id": "navigation"
                },
                {
                    "assignment_id": "assignment_22222222222222222222222222222222",
                    "participant_id": "participant_cccccccccccccccccccccccccccccccc",
                    "product_role_id": "product_support",
                    "onboard_role_id": "mooring"
                },
                {
                    "assignment_id": "assignment_33333333333333333333333333333333",
                    "participant_id": "participant_dddddddddddddddddddddddddddddddd",
                    "product_role_id": "product_support",
                    "onboard_role_id": "order"
                }
            ]
        }
    }
    events.insert(ready_index, rotation)
    write_json(path, events)


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one match in {path}, found {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


insert_ready_after_rotation(Path("examples/sample-events.json"))
insert_setup_rotation_pair(Path("examples/sample-expedition-setup-events.json"))

validator = Path("scripts/validate_expedition_setup_contract.py")
replace_once(
    validator,
    'SETUP_EVENT_EXAMPLES = ROOT / "examples/sample-expedition-setup-events.json"\n',
    'SETUP_EVENT_EXAMPLES = ROOT / "examples/sample-expedition-setup-events.json"\nMAIN_EVENT_EXAMPLES = ROOT / "examples/sample-events.json"\n',
)
replace_once(
    validator,
    '        SETUP_COMMAND_EXAMPLES, SETUP_EVENT_EXAMPLES,\n',
    '        SETUP_COMMAND_EXAMPLES, SETUP_EVENT_EXAMPLES, MAIN_EVENT_EXAMPLES,\n',
)
replace_once(
    validator,
    '''    event_examples = json.loads(SETUP_EVENT_EXAMPLES.read_text(encoding="utf-8"))
    serialized_events = json.dumps(event_examples, sort_keys=True)
    if "invitation_token" in serialized_events or "token_hash" in serialized_events or "anna@example.test" in serialized_events:
        errors.append("setup event examples expose raw invitation identity or secret")
''',
    '''    event_examples = json.loads(SETUP_EVENT_EXAMPLES.read_text(encoding="utf-8"))
    serialized_events = json.dumps(event_examples, sort_keys=True)
    if "invitation_token" in serialized_events or "token_hash" in serialized_events or "anna@example.test" in serialized_events:
        errors.append("setup event examples expose raw invitation identity or secret")

    def validate_rotation_ready_pair(values: list[dict], label: str) -> None:
        for index, item in enumerate(values):
            if item.get("event_type") != "expedition.ready":
                continue
            if index == 0:
                errors.append(f"{label}: expedition.ready has no preceding rotation.generated")
                continue
            previous = values[index - 1]
            if previous.get("event_type") != "rotation.generated":
                errors.append(f"{label}: expedition.ready must immediately follow rotation.generated")
                continue
            if previous.get("command_id") != item.get("command_id"):
                errors.append(f"{label}: rotation.generated and expedition.ready must share command_id")
            if previous.get("payload", {}).get("rotation_id") != item.get("payload", {}).get("rotation_id"):
                errors.append(f"{label}: rotation.generated and expedition.ready must share rotation_id")

    validate_rotation_ready_pair(event_examples, "setup event examples")
    validate_rotation_ready_pair(
        json.loads(MAIN_EVENT_EXAMPLES.read_text(encoding="utf-8")),
        "main event examples",
    )
''',
)
