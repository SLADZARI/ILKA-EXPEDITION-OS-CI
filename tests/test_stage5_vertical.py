from __future__ import annotations

import json
import re
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
FRONT = re.compile(r"^---\n(.*?)\n---\n", re.S)


def stage():
    return yaml.safe_load((ROOT / "stages/05_product_decision.yaml").read_text())


def metadata(path: Path):
    match = FRONT.match(path.read_text())
    assert match
    return yaml.safe_load(match.group(1))


def test_stage5_schema_is_valid():
    data = stage()
    schema = json.loads((ROOT / "schemas/stage.schema.json").read_text())
    Draft202012Validator(schema).validate(data)
    assert data["version"] == 3
    assert data["stage_id"] == "product_decision"
    assert data["order"] == 5


def test_stage5_inputs_and_outputs_are_traceable():
    data = stage()
    assert set(data["required_inputs"]) == {"hypothesis_decision", "insight_summary", "validation_evidence"}
    assert {x["id"] for x in data["required_outputs"]} == {"product_decision", "decision_rationale", "rejected_alternatives"}


def test_stage5_roles_preserve_cook_load_rule():
    data = stage()
    assert set(data["allowed_product_roles"]) == {"product_captain", "validation_lead", "product_support"}
    assert data["assignment_rules"]["cook_product_load_limit"] == "low"
    assert data["required_product_roles"][-1] == {"role_id": "product_support", "count": "remaining"}


def test_stage5_references_exactly_eleven_cards():
    data = stage()
    refs = set(data["card_refs"]["shared"])
    for group in ("by_product_role", "by_onboard_role"):
        for values in data["card_refs"][group].values():
            refs.update(values)
    assert len(refs) == 11
    assert refs == set(yaml.safe_load((ROOT / "cards/manifest.yaml").read_text())["stage_card_ids"]["product_decision"])


def test_manifest_preserves_stage5_bundle_after_expansion():
    manifest = yaml.safe_load((ROOT / "cards/manifest.yaml").read_text())
    assert manifest["card_count"] == sum(len(ids) for ids in manifest["stage_card_ids"].values())
    assert len(manifest["stage_card_ids"]["product_decision"]) == 11


def test_stage5_definition_of_done_requires_finalized_round_and_three_outputs():
    conditions = stage()["definition_of_done"]["all"]
    assert {"decision_round_finalized": True} in conditions
    assert {"product_decision_traceable_to_validation": True} in conditions
    assert {"rejected_alternatives_recorded": True} in conditions
    confirmed = {x["output_confirmed"] for x in conditions if "output_confirmed" in x}
    assert confirmed == {"product_decision", "decision_rationale", "rejected_alternatives"}


def test_stage5_captain_controls_use_canonical_decision_commands():
    controls = set(stage()["captain_controls"])
    assert {"create_decision_draft", "create_vote", "finalize_product_decision", "override_product_decision"} <= controls
    commands = {x["command_type"] for x in yaml.safe_load((ROOT / "engine/command-catalog.yaml").read_text())["commands"]}
    assert controls <= commands


def test_all_stage5_cards_validate_and_are_available_for_stage():
    schema = json.loads((ROOT / "schemas/card.schema.json").read_text())
    validator = Draft202012Validator(schema)
    wanted = set(yaml.safe_load((ROOT / "cards/manifest.yaml").read_text())["stage_card_ids"]["product_decision"])
    found = {}
    for path in sorted((ROOT / "cards").rglob("*.md")):
        meta = metadata(path)
        if meta["id"] in wanted:
            found[meta["id"]] = (path, meta)
    assert set(found) == wanted
    assert len(found) == 11
    for path, meta in found.values():
        validator.validate(meta)
        assert "product_decision" in meta["available_stages"]
        assert meta["offline"] is True
