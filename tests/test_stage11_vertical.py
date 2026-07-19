from __future__ import annotations

import json
import re
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
FRONT = re.compile(r"^---\n(.*?)\n---\n", re.S)


def stage():
    return yaml.safe_load((ROOT / "stages/11_iteration.yaml").read_text())


def metadata(path: Path):
    match = FRONT.match(path.read_text())
    assert match
    return yaml.safe_load(match.group(1))


def stage11_paths():
    wanted = set(yaml.safe_load((ROOT / "cards/manifest.yaml").read_text())["stage_card_ids"]["iteration"])
    found = {}
    for path in (ROOT / "cards").rglob("*.md"):
        meta = metadata(path)
        if meta["id"] in wanted:
            found[meta["id"]] = path
    return wanted, found


def test_stage11_schema_and_boundary():
    data = stage()
    schema = json.loads((ROOT / "schemas/stage.schema.json").read_text())
    Draft202012Validator(schema).validate(data)
    assert data["version"] == 3
    assert data["stage_id"] == "iteration"
    assert data["order"] == 11


def test_stage11_inputs_outputs_and_roles():
    data = stage()
    assert set(data["required_inputs"]) == {
        "working_increment", "launch_package", "launch_metrics", "known_limitations",
        "feedback_log", "signal_summary", "priority_issues",
        "mvp_scope", "out_of_scope", "acceptance_criteria",
    }
    assert {x["id"] for x in data["required_outputs"]} == {
        "iteration_decision", "updated_increment", "change_log",
    }
    assert set(data["allowed_product_roles"]) == {
        "product_captain", "build_lead", "product_support",
    }
    assert {x["role_id"] for x in data["required_product_roles"]} == {
        "product_captain", "build_lead", "product_support",
    }
    assert data["assignment_rules"]["cook_product_load_limit"] == "low"
    assert data["assignment_rules"]["build_lead_incompatible_onboard_roles"] == ["cook"]


def test_stage11_has_exactly_eleven_valid_cards():
    wanted, found = stage11_paths()
    assert len(wanted) == 11
    assert set(found) == wanted
    card_schema = json.loads((ROOT / "schemas/card.schema.json").read_text())
    validator = Draft202012Validator(card_schema)
    for path in found.values():
        meta = metadata(path)
        validator.validate(meta)
        assert "iteration" in meta["available_stages"]
        assert meta["offline"] is True


def test_manifest_contains_complete_stage11_bundle():
    manifest = yaml.safe_load((ROOT / "cards/manifest.yaml").read_text())
    assert manifest["card_count"] >= 121
    assert manifest["card_count"] == sum(len(ids) for ids in manifest["stage_card_ids"].values())
    assert len(manifest["stage_card_ids"]["iteration"]) == 11


def test_stage11_definition_of_done_and_existing_engine_controls():
    data = stage()
    conditions = data["definition_of_done"]["all"]
    confirmed = {x["output_confirmed"] for x in conditions if "output_confirmed" in x}
    assert confirmed == {"iteration_decision", "updated_increment", "change_log"}
    assert {"iteration_decision_selects_one_priority_issue": True} in conditions
    assert {"iteration_acceptance_checks_declared_before_change": True} in conditions
    assert {"primary_user_scenario_regression_passed": True} in conditions
    assert {"updated_increment_contains_only_the_approved_iteration": True} in conditions
    assert {"verify_role_assignment", "adjust_role_xp"} <= set(data["captain_controls"])


def test_stage11_card_assignment_is_complete():
    data = stage()
    refs = set(data["card_refs"]["shared"])
    for group in ("by_product_role", "by_onboard_role"):
        for values in data["card_refs"][group].values():
            refs.update(values)
    manifest = yaml.safe_load((ROOT / "cards/manifest.yaml").read_text())
    assert refs == set(manifest["stage_card_ids"]["iteration"])


def test_stage11_reuses_build_lead_and_generic_engine_contracts():
    roles = yaml.safe_load((ROOT / "engine/roles-catalog.yaml").read_text())
    role_by_id = {item["id"]: item for item in roles["product_roles"]}
    assert "iteration" in role_by_id["build_lead"]["available_stages"]
    assert "demo_day" in role_by_id["demo_lead"]["available_stages"]
    assert "iteration_lead" not in role_by_id

    commands = yaml.safe_load((ROOT / "engine/command-catalog.yaml").read_text())
    command_ids = {item["command_type"] for item in commands["commands"]}
    assert {"acknowledge_card", "start_task", "block_task", "complete_task", "confirm_output", "request_stage_advance"} <= command_ids


def test_participant_ui_keeps_iteration_projection_driven():
    text = (ROOT / "app/participant-app-requirements.md").read_text()
    assert "## Iteration Stage" in text
    assert "UI does not infer issue selection" in text
