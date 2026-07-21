from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator, FormatChecker, ValidationError

ROOT = Path(__file__).resolve().parents[1]


def load_yaml(rel: str):
    return yaml.safe_load((ROOT / rel).read_text())


def load_json(rel: str):
    return json.loads((ROOT / rel).read_text())


def command_example(command_type: str, payload: dict) -> dict:
    return {
        "command_id": f"cmd_test_{command_type}",
        "command_type": command_type,
        "issued_at": "2026-07-18T20:00:00+03:00",
        "actor_id": "captain_01",
        "actor_role": "captain",
        "expedition_id": "exp_demo",
        "idempotency_key": f"cmd_test_{command_type}",
        "day_number": 4,
        "day_revision": 1,
        "stage_id": "validation",
        "device_id": None,
        "payload": payload,
    }


def event_example(event_type: str, payload: dict) -> dict:
    return {
        "event_id": f"evt_test_{event_type.replace('.', '_')}",
        "event_type": event_type,
        "occurred_at": "2026-07-18T20:00:00+03:00",
        "recorded_at": "2026-07-18T20:00:01+03:00",
        "actor_id": "captain_01",
        "actor_role": "captain",
        "expedition_id": "exp_demo",
        "day_number": 4,
        "day_revision": 2,
        "stage_id": "validation",
        "command_id": "cmd_test_admin",
        "idempotency_key": "cmd_test_admin",
        "device_id": None,
        "sync_status": "synced",
        "schema_version": 4,
        "payload": payload,
        "correction_of": None,
    }


def test_catalog_counts_and_schema_vocabulary_are_synchronized():
    commands = load_yaml("engine/command-catalog.yaml")["commands"]
    events = load_yaml("engine/event-catalog.yaml")["events"]
    command_ids = {item["command_type"] for item in commands}
    event_ids = {item["event_type"] for item in events}

    assert {"force_day_transition", "rewind_day", "ban_participant", "unban_participant", "verify_role_assignment", "adjust_role_xp", "publish_rating_snapshot"} <= command_ids
    assert {"day.transition_forced", "day.rewind_applied", "participant.banned", "participant.unbanned", "role_xp.awarded", "rating.snapshot_published"} <= event_ids
    assert set(load_json("schemas/command.schema.json")["properties"]["command_type"]["enum"]) == command_ids
    offline_ids = {item["command_type"] for item in commands if item["offline_allowed"]}
    assert set(load_json("app/contracts/offline-command.schema.json")["properties"]["command_type"]["enum"]) == offline_ids
    assert set(load_json("engine/event.schema.json")["properties"]["event_type"]["enum"]) == event_ids


def test_captain_is_expedition_super_admin_and_inherits_human_roles():
    permissions = load_yaml("engine/permissions.yaml")
    captain = permissions["roles"]["captain"]
    assert captain["scope"] == "expedition"
    assert captain["super_admin"] is True
    assert set(captain["inherits"]) == {"product_captain", "participant"}
    assert permissions["restrictions"]["captain_super_admin_scope"] == "expedition_only"


def test_captain_can_execute_every_inheritable_human_facing_command():
    catalog = load_yaml("engine/command-catalog.yaml")
    permissions = load_yaml("engine/permissions.yaml")
    captain_can = set(permissions["roles"]["captain"]["can"])
    commands = catalog["commands"]
    command_ids = {item["command_type"] for item in commands}
    system_only = {
        item["command_type"]
        for item in commands
        if item["allowed_actors"]
        and set(item["allowed_actors"]) <= {"system", "system_clock"}
    }
    pre_membership_self_service = {
        item["command_type"]
        for item in commands
        if item.get("pre_membership_allowed") is True
    }
    legacy_non_public = {
        item["command_type"]
        for item in commands
        if item.get("external_api_allowed") is False
    }

    inheritable = command_ids - system_only - pre_membership_self_service - legacy_non_public
    assert inheritable <= captain_can
    assert pre_membership_self_service == {"accept_invitation"}
    assert legacy_non_public == {"add_participant"}

    for item in commands:
        command_type = item["command_type"]
        if command_type in legacy_non_public:
            assert item["allowed_actors"] == []
        elif command_type in pre_membership_self_service:
            assert item["allowed_actors"] == ["participant"]
            assert command_type not in captain_can
        elif command_type in system_only:
            assert set(item["allowed_actors"]) <= {"system", "system_clock"}
        else:
            assert "captain" in item["allowed_actors"]


def test_super_admin_commands_are_server_confirmed_and_not_offline_queueable():
    api = load_yaml("app/api/commands.yaml")
    dangerous = {"force_day_transition", "rewind_day", "ban_participant", "unban_participant", "close_expedition"}
    assert dangerous == set(api["dangerous_super_admin_commands"])
    assert dangerous <= set(api["server_confirmation_required"])
    assert dangerous.isdisjoint(set(api["offline_delivery"]["queueable_commands"]))
    assert dangerous == set(api["offline_draft_only_commands"])


def test_force_day_transition_does_not_impersonate_system_clock():
    engine = load_yaml("engine/game-engine.yaml")
    assert engine["commands"]["process_day_boundary"]["actor_roles"] == ["system_clock"]
    assert engine["commands"]["force_day_transition"]["actor_roles"] == ["captain"]
    assert "captain_cannot_impersonate_system_clock" in engine["invariants"]


def test_rewind_preserves_history_and_product_stage():
    engine = load_yaml("engine/game-engine.yaml")
    events = load_yaml("engine/event-catalog.yaml")
    reducers = load_yaml("engine/reducers.yaml")
    assert "day_rewind_preserves_event_history" in engine["invariants"]
    assert "rewind_does_not_change_product_stage" in engine["invariants"]
    assert "events_are_append_only" in engine["invariants"]
    assert "day.rewind_applied marks later days superseded and increments day_revision" in events["replay_rules"]
    assert reducers["day_projection"]["handlers"]["day.rewind_applied"]["action"] == "restore_target_day_as_new_revision_preserving_history"


def test_ban_is_expedition_scoped_and_cannot_target_captain():
    engine = load_yaml("engine/game-engine.yaml")
    permissions = load_yaml("engine/permissions.yaml")
    guards = set(engine["commands"]["ban_participant"]["guards"])
    assert "target_is_not_current_captain" in guards
    assert permissions["restrictions"]["participant_ban_scope"] == "current_expedition_only"
    assert permissions["restrictions"]["participant_ban_preserves_history"] is True
    assert permissions["restrictions"]["captain_cannot_ban_current_captain"] is True


def test_ban_and_unban_projection_is_explicit():
    reducers = load_yaml("engine/reducers.yaml")
    handlers = reducers["participant_projection"]["handlers"]
    assert handlers["participant.banned"]["set"]["status"] == "banned"
    assert handlers["participant.banned"]["set"]["access_revoked"] is True
    assert handlers["participant.unbanned"]["set"]["status"] == "active"
    assert handlers["participant.unbanned"]["set"]["access_revoked"] is False
    assert reducers["role_assignment_projection"]["handlers"]["role_assignments.revoked"]["action"] == "revoke_assignment_ids_preserving_history"


def test_new_command_examples_validate():
    schema = load_json("schemas/command.schema.json")
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    examples = load_json("examples/sample-commands.json")
    wanted = {"force_day_transition", "rewind_day", "ban_participant", "unban_participant"}
    selected = [item for item in examples if item["command_type"] in wanted]
    assert {item["command_type"] for item in selected} == wanted
    for item in selected:
        validator.validate(item)


def test_new_event_examples_validate():
    schema = load_json("engine/event.schema.json")
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    examples = load_json("examples/sample-super-admin-events.json")
    wanted = {"day.transition_forced", "day.rewind_applied", "participant.banned", "participant.unbanned", "role_assignments.revoked"}
    selected = [item for item in examples if item["event_type"] in wanted]
    assert {item["event_type"] for item in selected} == wanted
    for item in selected:
        validator.validate(item)


@pytest.mark.parametrize(
    ("command_type", "payload"),
    [
        ("force_day_transition", {}),
        ("rewind_day", {"from_day_number": 5}),
        ("ban_participant", {"participant_id": "participant_03"}),
        ("unban_participant", {"participant_id": "participant_03"}),
    ],
)
def test_missing_super_admin_payload_is_rejected(command_type: str, payload: dict):
    validator = Draft202012Validator(load_json("schemas/command.schema.json"), format_checker=FormatChecker())
    with pytest.raises(ValidationError):
        validator.validate(command_example(command_type, payload))


def test_captain_day_view_exposes_super_admin_controls_without_event_delete():
    schema = load_json("app/contracts/captain-day-view.schema.json")
    controls = schema["properties"]["controls"]["properties"]
    assert {"force_day_transition", "rewind_day", "ban_participant", "unban_participant"} <= set(controls)
    super_admin = schema["properties"]["super_admin"]["properties"]
    assert super_admin["scope"]["const"] == "expedition"
    assert super_admin["can_delete_events"]["const"] is False
    assert super_admin["can_impersonate_system_clock"]["const"] is False


def test_docs_state_the_same_authority_boundary():
    adr = (ROOT / "docs/decisions/ADR-007-captain-expedition-super-admin.md").read_text()
    captain_ui = (ROOT / "app/captain-console-requirements.md").read_text()
    participant_ui = (ROOT / "app/participant-app-requirements.md").read_text()
    assert "Super Admin within one Expedition" in adr
    assert "history is never deleted" in adr
    assert "current Captain" in captain_ui
    assert "access is revoked" in participant_ui
