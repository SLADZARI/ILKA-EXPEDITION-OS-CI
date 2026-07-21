#!/usr/bin/env python3
from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise SystemExit(f"expected one match in {path}, found {text.count(old)}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "tests/test_captain_super_admin.py",
    '''def test_captain_can_execute_every_human_facing_command():
    catalog = load_yaml("engine/command-catalog.yaml")
    permissions = load_yaml("engine/permissions.yaml")
    captain_can = set(permissions["roles"]["captain"]["can"])
    command_ids = {item["command_type"] for item in catalog["commands"]}
    system_only = {
        item["command_type"]
        for item in catalog["commands"]
        if set(item["allowed_actors"]) <= {"system", "system_clock"}
    }
    assert command_ids - system_only <= captain_can

    for item in catalog["commands"]:
        if item["command_type"] in system_only:
            assert set(item["allowed_actors"]) <= {"system", "system_clock"}
        else:
            assert "captain" in item["allowed_actors"]
''',
    '''def test_captain_can_execute_every_inheritable_human_facing_command():
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
''',
)

replace_once(
    "tests/test_command_delivery_modes.py",
    '''    assert len(commands) == 36
    assert all(type(item.get("offline_allowed")) is bool for item in commands)
''',
    '''    assert len(commands) == 39
    assert all(type(item.get("offline_allowed")) is bool for item in commands)
''',
)
replace_once(
    "tests/test_command_delivery_modes.py",
    '''    assert "activate_recovery_day" not in allowed
''',
    '''    assert "activate_recovery_day" not in allowed
    assert {"invite_participant", "accept_invitation", "revoke_invitation"}.isdisjoint(allowed)
''',
)

replace_once(
    "tests/test_expedition_completion.py",
    '''    assert len(command_ids) == 36
    assert len(event_ids) == 48
''',
    '''    assert len(command_ids) == 39
    assert len(event_ids) == 52
''',
)
