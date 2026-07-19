from __future__ import annotations

import json
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]


def test_gamification_rules_are_safe_and_versioned():
    rules = yaml.safe_load((ROOT / "engine/gamification-rules.yaml").read_text())
    assert rules["version"] == 1
    assert rules["source_of_truth"] == "engine/gamification-rules.yaml"
    assert rules["ledger"]["allow_direct_client_award"] is False
    assert rules["ledger"]["allow_negative_balance"] is False
    assert rules["ratings"]["expedition_contribution_rating"]["normalize_cook_and_low_load_roles"] is True
    assert "safety.override_applied" in rules["excluded_sources"]


def test_gamification_commands_and_events_are_canonical():
    commands = yaml.safe_load((ROOT / "engine/command-catalog.yaml").read_text())
    events = yaml.safe_load((ROOT / "engine/event-catalog.yaml").read_text())
    command_ids = {x["command_type"] for x in commands["commands"]}
    event_ids = {x["event_type"] for x in events["events"]}
    assert {"verify_role_assignment", "adjust_role_xp", "publish_rating_snapshot"} <= command_ids
    assert {"role_assignment.verified", "role_xp.awarded", "role_xp.adjusted", "role_level.changed", "rating.snapshot_published"} <= event_ids


def test_permissions_do_not_allow_client_xp_award():
    permissions = yaml.safe_load((ROOT / "engine/permissions.yaml").read_text())
    assert "verify_role_assignment" in permissions["roles"]["captain"]["can"]
    assert "adjust_role_xp" in permissions["roles"]["captain"]["can"]
    assert "publish_rating_snapshot" in permissions["roles"]["system"]["can"]
    for actor in ("participant", "product_captain", "shore_operator"):
        assert "adjust_role_xp" not in permissions["roles"][actor]["can"]
        assert "publish_rating_snapshot" not in permissions["roles"][actor]["can"]


def test_new_command_and_event_samples_validate():
    command_schema = json.loads((ROOT / "schemas/command.schema.json").read_text())
    event_schema = json.loads((ROOT / "engine/event.schema.json").read_text())
    Draft202012Validator.check_schema(command_schema)
    validator = Draft202012Validator(event_schema, format_checker=FormatChecker())
    events = json.loads((ROOT / "examples/sample-gamification-events.json").read_text())
    for event in events:
        validator.validate(event)


def test_gamification_projection_schema_is_valid():
    schema = json.loads((ROOT / "schemas/gamification.schema.json").read_text())
    Draft202012Validator.check_schema(schema)
    sample = {
        "expedition_id": "ilka_2026_01",
        "participant_id": "participant_03",
        "rules_version": 1,
        "role_mastery": [{"role_id": "scope_lead", "xp": 40, "level": "crew", "next_level_xp": 100}],
        "contribution": {"score": 100, "rank": 1, "status": "active", "snapshot_at": "2026-07-25T21:00:00+03:00"},
        "sync_state": "synced"
    }
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(sample)
