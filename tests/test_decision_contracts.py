from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator, FormatChecker, ValidationError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.replay_events import replay


def y(path: str):
    return yaml.safe_load((ROOT / path).read_text())


def j(path: str):
    return json.loads((ROOT / path).read_text())


def command(command_type: str, payload: dict, actor_role: str = "product_captain"):
    return {
        "command_id": f"cmd_test_{command_type}",
        "command_type": command_type,
        "issued_at": "2026-07-18T20:00:00+03:00",
        "actor_id": "participant_01" if actor_role != "captain" else "captain_01",
        "actor_role": actor_role,
        "expedition_id": "exp_demo",
        "idempotency_key": f"test:{command_type}",
        "payload": payload,
    }


def test_decision_vocabulary_counts_and_sync():
    commands = {x["command_type"] for x in y("engine/command-catalog.yaml")["commands"]}
    events = {x["event_type"] for x in y("engine/event-catalog.yaml")["events"]}
    assert {"create_decision_draft", "create_vote", "vote", "finalize_product_decision", "override_product_decision"} <= commands
    assert {"decision.draft_created", "vote.opened", "vote.cast", "vote.closed", "product_decision.recorded", "product_decision.overridden"} <= events


def test_decision_permissions_are_explicit():
    permissions = y("engine/permissions.yaml")["roles"]
    assert {"create_decision_draft", "create_vote", "vote", "finalize_product_decision", "override_product_decision"} <= set(permissions["captain"]["can"])
    assert {"create_decision_draft", "create_vote", "vote", "finalize_product_decision"} <= set(permissions["product_captain"]["can"])
    assert "vote" in permissions["participant"]["can"]
    assert "override_product_decision" not in permissions["product_captain"]["can"]


def test_offline_and_server_confirmation_boundary():
    api = y("app/api/commands.yaml")
    assert {"create_decision_draft", "create_vote", "vote"} <= set(api["offline_delivery"]["queueable_commands"])
    assert {"finalize_product_decision", "override_product_decision"} <= set(api["server_confirmation_required"])
    assert {"finalize_product_decision", "override_product_decision"}.isdisjoint(api["offline_delivery"]["queueable_commands"])


def test_command_and_event_schema_vocabularies_are_complete():
    commands = {x["command_type"] for x in y("engine/command-catalog.yaml")["commands"]}
    events = {x["event_type"] for x in y("engine/event-catalog.yaml")["events"]}
    assert set(j("schemas/command.schema.json")["properties"]["command_type"]["enum"]) == commands
    command_items = y("engine/command-catalog.yaml")["commands"]
    offline_ids = {x["command_type"] for x in command_items if x["offline_allowed"]}
    assert set(j("app/contracts/offline-command.schema.json")["properties"]["command_type"]["enum"]) == offline_ids
    assert set(j("engine/event.schema.json")["properties"]["event_type"]["enum"]) == events


def test_decision_command_examples_validate():
    validator = Draft202012Validator(j("schemas/command.schema.json"), format_checker=FormatChecker())
    selected = [x for x in j("examples/sample-commands.json") if x["command_type"] in {"create_decision_draft", "create_vote", "vote", "finalize_product_decision", "override_product_decision"}]
    assert len(selected) == 5
    for item in selected:
        validator.validate(item)


def test_decision_event_examples_validate():
    validator = Draft202012Validator(j("engine/event.schema.json"), format_checker=FormatChecker())
    examples = j("examples/sample-decision-events.json")
    assert len(examples) == 6
    for item in examples:
        validator.validate(item)


def test_decision_draft_requires_two_to_five_options():
    validator = Draft202012Validator(j("schemas/command.schema.json"), format_checker=FormatChecker())
    payload = {
        "decision_id": "decision_x", "stage_id": "product_decision", "question": "Q?",
        "options": [{"option_id": "only_one", "title": "Only"}],
        "criteria": ["evidence"], "evidence_refs": ["evidence_1"],
    }
    with pytest.raises(ValidationError):
        validator.validate(command("create_decision_draft", payload))


def test_vote_round_requires_at_least_three_unique_eligible_voters():
    validator = Draft202012Validator(j("schemas/command.schema.json"), format_checker=FormatChecker())
    payload = {
        "vote_id": "vote_x", "decision_id": "decision_x", "eligible_voter_ids": ["p1", "p2"],
        "vote_mode": "single_choice", "quorum_rule": "all_eligible", "threshold_rule": "strict_majority_of_eligible", "round_version": 1,
    }
    with pytest.raises(ValidationError):
        validator.validate(command("create_vote", payload))


def test_vote_requires_ballot_revision():
    validator = Draft202012Validator(j("schemas/command.schema.json"), format_checker=FormatChecker())
    with pytest.raises(ValidationError):
        validator.validate(command("vote", {"vote_id": "vote_x", "choice": "option_a"}, "participant"))


def test_finalize_requires_rejected_alternatives_and_round_version():
    validator = Draft202012Validator(j("schemas/command.schema.json"), format_checker=FormatChecker())
    payload = {"vote_id": "vote_x", "decision_id": "decision_x", "selected_option_id": "a", "rationale": "R", "objection_summary": [], "evidence_refs": ["e1"]}
    with pytest.raises(ValidationError):
        validator.validate(command("finalize_product_decision", payload))


def test_override_requires_reason_and_unresolved_objections():
    validator = Draft202012Validator(j("schemas/command.schema.json"), format_checker=FormatChecker())
    payload = {"vote_id": "vote_x", "decision_id": "decision_x", "selected_option_id": "a", "evidence_refs": ["e1"], "expected_round_version": 1}
    with pytest.raises(ValidationError):
        validator.validate(command("override_product_decision", payload, "captain"))


def test_game_engine_uses_strict_majority_of_all_eligible_voters():
    rules = y("engine/game-engine.yaml")["decision_rules"]
    assert rules["vote_mode"] == "single_choice"
    assert rules["ballot_visibility"] == "attributable"
    assert rules["quorum"] == "all_eligible_voters_cast_option_or_abstain"
    assert rules["threshold"] == "strict_majority_of_all_eligible_voters"


def test_replay_keeps_highest_ballot_revision_per_actor():
    events = j("examples/sample-decision-events.json")[:2]
    first = j("examples/sample-decision-events.json")[2]
    revised = {**first, "event_id": "evt_decision_recast", "recorded_at": "2026-07-18T18:00:02+03:00", "payload": {"vote_id": "vote_primary_direction_v1", "choice": "self_service_flow", "ballot_revision": 2}}
    state = replay(events + [first, revised])
    ballot = state["decision"]["effective_ballots"]["participant_02"]
    assert ballot["choice"] == "self_service_flow"
    assert ballot["ballot_revision"] == 2


def test_replay_finalizes_normal_product_decision():
    state = replay(j("examples/sample-decision-events.json")[:5])
    assert state["decision"]["status"] == "finalized"
    assert state["decision"]["result"]["selected_option_id"] == "concierge_flow"
    assert state["decision"]["vote_status"] == "closed"


def test_replay_preserves_captain_override_as_separate_result():
    state = replay(j("examples/sample-decision-events.json"))
    assert state["decision"]["status"] == "overridden"
    assert state["decision"]["result"]["selected_option_id"] == "self_service_flow"
    assert state["decision"]["result"]["unresolved_objections"]
