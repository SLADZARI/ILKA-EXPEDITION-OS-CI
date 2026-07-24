from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any, Mapping

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "run_day1_pilot_smoke.py"
SPEC = importlib.util.spec_from_file_location("run_day1_pilot_smoke", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
smoke = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = smoke
SPEC.loader.exec_module(smoke)

CAPTAIN_PROFILE = "20000000-0000-4000-8000-000000000001"
PROFILES = tuple(f"20000000-0000-4000-8000-{value:012d}" for value in range(11, 14))
CAPTAIN_MEMBERSHIP = "30000000-0000-4000-8000-000000000001"


def config(preflight_only: bool = False) -> Any:
    participants = tuple(smoke.Participant(f"Participant {i}", f"p{i}@example.test", f"token-{i}", profile) for i, profile in enumerate(PROFILES, 1))
    return smoke.Config("https://example.supabase.co", "public", "captain-token", CAPTAIN_PROFILE, participants, "clock-secret", "captain-token", "pilot_test", "Pilot", "Europe/Warsaw", "06:00", "2026-07-24", "2026-07-24T06:00:00+02:00", None, preflight_only)


def result(command: Mapping[str, Any], position: int, membership: str | None = None, replayed: bool = False) -> dict[str, Any]:
    return {"outcome": "accepted", "replayed": replayed, "receipt": {"command_id": command["command_id"], "command_type": command["command_type"], "status": "accepted", "event_ids": [f"evt_{command['command_id'][4:]}"], "stream_position": position, "projection_version": position, "runtime_release_id": "60000000-0000-4000-8000-000000000001", "reducer_version": "day1_pilot_v1", "actor_membership_id": membership}}


class FakeClient:
    def __init__(self, cfg: Any):
        self.cfg, self.position, self.completed = cfg, 0, False
        self.commands: list[dict[str, Any]] = []
        self.system: list[dict[str, Any]] = []
        self.saved: dict[str, dict[str, Any]] = {}
        self.setup_calls = 0
        self.ids = {p.access_token: f"participant_{i:032x}" for i, p in enumerate(cfg.participants, 1)}

    def user(self, token: str) -> Any:
        if token == self.cfg.captain_token: return smoke.Identity("captain-user", "captain@example.test", True)
        for i, participant in enumerate(self.cfg.participants, 1):
            if token == participant.access_token: return smoke.Identity(f"participant-user-{i}", participant.email, True)
        raise AssertionError(token)

    def gateway(self, token: str, command: Mapping[str, Any]) -> dict[str, Any]:
        command = dict(command); self.commands.append(command); command_id = str(command["command_id"])
        if command_id in self.saved:
            replay = json.loads(json.dumps(self.saved[command_id])); replay["replayed"] = True; return replay
        self.position += 1
        membership = CAPTAIN_MEMBERSHIP if command["command_type"] != "complete_task" else "30000000-0000-4000-8000-000000000011"
        value = result(command, self.position, membership); self.saved[command_id] = value
        if command["command_type"] == "complete_task": self.completed = True
        return value

    def system_gateway(self, token: str, secret: str, command: Mapping[str, Any]) -> dict[str, Any]:
        assert token == self.cfg.system_token and secret == self.cfg.hmac_secret
        command = dict(command); self.system.append(command); self.position += 1
        return result(command, self.position)

    def rpc(self, name: str, token: str, expedition: str) -> dict[str, Any]:
        assert expedition == self.cfg.expedition_key
        if name == "get_expedition_setup_view":
            self.setup_calls += 1
            return {"expedition_id": expedition, "expedition_status": "draft" if self.setup_calls == 1 else "ready", "participants": [{"participant_id": value} for value in self.ids.values()], "invitations": [{"status": "accepted"} for _ in self.ids], "rotation": {"status": "not_generated" if self.setup_calls == 1 else "generated"}}
        if name == "get_today_view":
            participant_id = self.ids[token]; selected = token == self.cfg.participants[0].access_token
            return {"expedition_id": expedition, "expedition_status": "active", "participant_id": participant_id, "product_role": {"role_id": "product_captain" if selected else "product_support"}, "tasks": [{"task_id": "task_team_agreement", "status": "completed" if selected and self.completed else "available"}]}
        if name == "get_captain_day_view":
            selected = self.ids[self.cfg.participants[0].access_token]
            return {"expedition_id": expedition, "participants": [{"participant_id": value} for value in self.ids.values()], "blockers": [{"code": "required_task_incomplete", "entity_id": f"{value}:task_team_agreement"} for value in self.ids.values() if not (self.completed and value == selected)]}
        raise AssertionError(name)


def test_sanitize_keeps_evidence_flags() -> None:
    safe = smoke.sanitize({"email": "a@example.test", "message": "a@example.test", "participant_emails_emitted": False})
    assert safe == {"email": "[REDACTED]", "message": "[REDACTED_EMAIL]", "participant_emails_emitted": False}


def test_signature_contract() -> None:
    assert smoke.signature("secret", "1234567890", '{"a":1}') == "f772ca1f88a25d8ff8eaecdc0b0d80476bc0789816b8b89b95e320972554edc7"


def test_duplicate_profiles_are_rejected() -> None:
    raw = json.dumps([{"display_name": f"P{i}", "email": f"p{i}@example.test", "access_token": f"t{i}", "profile_id": PROFILES[0]} for i in range(3)])
    with pytest.raises(smoke.SmokeError, match="profile_id values must be unique"): smoke.parse_participants(raw)


def test_preflight_has_no_writes() -> None:
    cfg = config(True); client = FakeClient(cfg); evidence = smoke.run(cfg, client)
    assert evidence["mode"] == "preflight_only" and client.commands == [] and client.system == []


def test_full_smoke_uses_canonical_actors_and_scoped_blockers() -> None:
    cfg = config(); client = FakeClient(cfg); evidence = smoke.run(cfg, client)
    create = next(item for item in client.commands if item["command_type"] == "create_expedition")
    invites = [item for item in client.commands if item["command_type"] == "invite_participant"]
    accepts = [item for item in client.commands if item["command_type"] == "accept_invitation"]
    complete = [item for item in client.commands if item["command_type"] == "complete_task"]
    assert create["actor_id"] == CAPTAIN_PROFILE
    assert {item["actor_id"] for item in invites} == {f"member_{CAPTAIN_MEMBERSHIP.replace('-', '')}"}
    assert [item["actor_id"] for item in accepts] == list(PROFILES)
    assert len(complete) == 2 and complete[0] == complete[1]
    assert evidence["checks"]["participant_scoped_task_blockers"] is True
    assert evidence["checks"]["unique_command_receipt_count"] == 11
    assert evidence["receipts"][-1]["replayed"] is True
    assert client.system[0]["command_id"] == "cmd_day_boundary_pilot_test_20260724"
