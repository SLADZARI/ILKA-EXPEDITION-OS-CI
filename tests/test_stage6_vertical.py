from __future__ import annotations

import json
import re
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
FRONT = re.compile(r"^---\n(.*?)\n---\n", re.S)


def stage():
    return yaml.safe_load((ROOT / "stages/06_mvp_scope.yaml").read_text())


def metadata(path: Path):
    match = FRONT.match(path.read_text())
    assert match
    return yaml.safe_load(match.group(1))


def stage6_paths():
    wanted = set(yaml.safe_load((ROOT / "cards/manifest.yaml").read_text())["stage_card_ids"]["mvp_scope"])
    found = {}
    for path in (ROOT / "cards").rglob("*.md"):
        meta = metadata(path)
        if meta["id"] in wanted:
            found[meta["id"]] = path
    return wanted, found


def test_stage6_schema_and_boundary():
    data = stage()
    schema = json.loads((ROOT / "schemas/stage.schema.json").read_text())
    Draft202012Validator(schema).validate(data)
    assert data["version"] == 3
    assert data["stage_id"] == "mvp_scope"
    assert data["order"] == 6


def test_stage6_inputs_outputs_and_roles():
    data = stage()
    assert set(data["required_inputs"]) == {"product_decision", "decision_rationale", "rejected_alternatives"}
    assert {x["id"] for x in data["required_outputs"]} == {"mvp_scope", "out_of_scope", "acceptance_criteria"}
    assert set(data["allowed_product_roles"]) == {"product_captain", "scope_lead", "product_support"}
    assert {x["role_id"] for x in data["required_product_roles"]} == {"product_captain", "scope_lead", "product_support"}
    assert data["assignment_rules"]["cook_product_load_limit"] == "low"


def test_stage6_has_exactly_eleven_valid_cards():
    wanted, found = stage6_paths()
    assert len(wanted) == 11
    assert set(found) == wanted
    card_schema = json.loads((ROOT / "schemas/card.schema.json").read_text())
    validator = Draft202012Validator(card_schema)
    for path in found.values():
        meta = metadata(path)
        validator.validate(meta)
        assert "mvp_scope" in meta["available_stages"]
        assert meta["offline"] is True


def test_manifest_count_tracks_all_stage_bundles():
    manifest = yaml.safe_load((ROOT / "cards/manifest.yaml").read_text())
    assert manifest["card_count"] == sum(len(ids) for ids in manifest["stage_card_ids"].values())
    assert len(manifest["stage_card_ids"]["mvp_scope"]) == 11


def test_stage6_definition_of_done_and_gamification_controls():
    data = stage()
    conditions = data["definition_of_done"]["all"]
    confirmed = {x["output_confirmed"] for x in conditions if "output_confirmed" in x}
    assert confirmed == {"mvp_scope", "out_of_scope", "acceptance_criteria"}
    assert {"scope_maps_to_product_decision": True} in conditions
    assert {"every_in_scope_item_has_acceptance_criteria": True} in conditions
    assert {"verify_role_assignment", "adjust_role_xp"} <= set(data["captain_controls"])
