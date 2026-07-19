from __future__ import annotations

import json
import re
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
FRONT = re.compile(r"^---\n(.*?)\n---\n", re.S)


def stage():
    return yaml.safe_load((ROOT / "stages/12_demo_day.yaml").read_text())


def metadata(path: Path):
    match = FRONT.match(path.read_text())
    assert match
    return yaml.safe_load(match.group(1))


def stage12_paths():
    wanted = set(yaml.safe_load((ROOT / "cards/manifest.yaml").read_text())["stage_card_ids"]["demo_day"])
    found = {}
    for path in (ROOT / "cards").rglob("*.md"):
        meta = metadata(path)
        if meta["id"] in wanted:
            found[meta["id"]] = path
    return wanted, found


def test_stage12_schema_and_final_boundary():
    data = stage()
    schema = json.loads((ROOT / "schemas/stage.schema.json").read_text())
    Draft202012Validator(schema).validate(data)
    assert data["version"] == 3
    assert data["stage_id"] == "demo_day"
    assert data["order"] == 12


def test_stage12_inputs_outputs_and_roles():
    data = stage()
    assert set(data["required_inputs"]) == {
        "iteration_decision", "updated_increment", "change_log", "launch_metrics", "signal_summary",
        "known_limitations", "mvp_scope", "out_of_scope", "acceptance_criteria",
    }
    assert {x["id"] for x in data["required_outputs"]} == {"demo", "shore_package", "next_steps"}
    assert set(data["allowed_product_roles"]) == {"product_captain", "demo_lead", "product_support"}
    assert {x["role_id"] for x in data["required_product_roles"]} == {"product_captain", "demo_lead", "product_support"}
    assert data["assignment_rules"]["cook_product_load_limit"] == "low"
    assert data["assignment_rules"]["demo_lead_incompatible_onboard_roles"] == ["cook"]


def test_stage12_has_exactly_eleven_valid_cards():
    wanted, found = stage12_paths()
    assert len(wanted) == 11
    assert set(found) == wanted
    validator = Draft202012Validator(json.loads((ROOT / "schemas/card.schema.json").read_text()))
    for path in found.values():
        meta = metadata(path)
        validator.validate(meta)
        assert "demo_day" in meta["available_stages"]
        assert meta["offline"] is True


def test_manifest_contains_complete_stage12_bundle():
    manifest = yaml.safe_load((ROOT / "cards/manifest.yaml").read_text())
    assert manifest["card_count"] >= 132
    assert manifest["card_count"] == sum(len(ids) for ids in manifest["stage_card_ids"].values())
    assert len(manifest["stage_card_ids"]["demo_day"]) == 11


def test_stage12_definition_of_done_and_final_controls():
    data = stage()
    conditions = data["definition_of_done"]["all"]
    confirmed = {x["output_confirmed"] for x in conditions if "output_confirmed" in x}
    assert confirmed == {"demo", "shore_package", "next_steps"}
    assert {"offline_demo_fallback_is_available": True} in conditions
    assert {"shore_package_integrity_manifest_is_complete": True} in conditions
    assert {"expedition_close_handover_prepared": True} in conditions
    assert "close_expedition" in data["captain_controls"]
    assert "advance_stage" not in data["captain_controls"]
    assert "override_stage_advance" not in data["captain_controls"]
    assert "captain_override" not in data["definition_of_done"]


def test_stage12_card_assignment_matches_manifest():
    data = stage()
    refs = set(data["card_refs"]["shared"])
    for group in ("by_product_role", "by_onboard_role"):
        for values in data["card_refs"][group].values():
            refs.update(values)
    manifest = yaml.safe_load((ROOT / "cards/manifest.yaml").read_text())
    assert refs == set(manifest["stage_card_ids"]["demo_day"])


def test_stage12_reuses_demo_lead_and_has_no_parallel_role():
    roles = yaml.safe_load((ROOT / "engine/roles-catalog.yaml").read_text())
    role_by_id = {item["id"]: item for item in roles["product_roles"]}
    assert "demo_day" in role_by_id["demo_lead"]["available_stages"]
    assert "demo_day_lead" not in role_by_id
    assert "finalization_lead" not in role_by_id


def test_participant_ui_keeps_final_completion_authoritative():
    text = (ROOT / "app/participant-app-requirements.md").read_text()
    assert "## Demo Day Stage" in text
    assert "there is no `request_stage_advance` from the final Stage" in text
    assert "Participant and Product Captain never receive a `close_expedition` action" in text
