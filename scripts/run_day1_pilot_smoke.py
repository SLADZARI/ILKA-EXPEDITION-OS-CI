#!/usr/bin/env python3
"""Authenticated Gate 9E Day 1 live smoke. Secrets are environment-only."""
from __future__ import annotations

import argparse, base64, hashlib, hmac, json, os, re, secrets, sys, time
import urllib.error, urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence
from zoneinfo import ZoneInfo

TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{43}$")
JWT_RE = re.compile(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$")
EMAIL_RE = re.compile(r"(?<![\w.+-])[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}(?![\w.-])")
KEY_RE = re.compile(r"^[a-z0-9][a-z0-9_]{0,127}$")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
SECRET_KEYS = {"access_token", "refresh_token", "authorization", "invitation_token", "email", "profile_id", "auth_user_id", "system_clock_hmac_secret", "system_clock_bearer_token"}
SECRET_SUFFIXES = ("_access_token", "_refresh_token", "_invitation_token", "_profile_id", "_auth_user_id", "_hmac_secret", "_bearer_token")


def sanitize(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(k): "[REDACTED]" if str(k).lower() in SECRET_KEYS or str(k).lower().endswith(SECRET_SUFFIXES) else sanitize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize(v) for v in value]
    if isinstance(value, str):
        if JWT_RE.fullmatch(value) or TOKEN_RE.fullmatch(value) or re.fullmatch(r"[0-9a-f]{64}", value, re.I):
            return "[REDACTED_SECRET]"
        return EMAIL_RE.sub("[REDACTED_EMAIL]", value)
    return value


class SmokeError(RuntimeError): pass


@dataclass(frozen=True)
class Participant:
    display_name: str
    email: str
    access_token: str
    profile_id: str


@dataclass(frozen=True)
class Identity:
    user_id: str
    email: str | None
    verified: bool


@dataclass(frozen=True)
class Config:
    url: str
    api_key: str
    captain_token: str
    captain_profile_id: str
    participants: tuple[Participant, ...]
    hmac_secret: str
    system_token: str
    expedition_key: str
    name: str
    timezone: str
    boundary_time: str
    local_date: str
    boundary_at: str
    output: Path | None
    preflight_only: bool


def now_utc() -> datetime: return datetime.now(timezone.utc)
def iso_now() -> str: return now_utc().isoformat(timespec="milliseconds").replace("+00:00", "Z")
def compact(value: Any) -> str: return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value: raise SmokeError(f"Missing required environment variable: {name}")
    return value


def uuid(value: str, label: str) -> str:
    value = value.strip().lower()
    if not UUID_RE.fullmatch(value): raise SmokeError(f"{label} must be a UUID.")
    return value


def parse_participants(raw: str) -> tuple[Participant, ...]:
    try: data = json.loads(raw)
    except json.JSONDecodeError as exc: raise SmokeError("ILKA_PARTICIPANTS_JSON must be valid JSON.") from exc
    if not isinstance(data, list) or not 3 <= len(data) <= 5: raise SmokeError("ILKA_PARTICIPANTS_JSON must contain 3–5 objects.")
    result = []
    for i, item in enumerate(data, 1):
        if not isinstance(item, Mapping): raise SmokeError(f"Participant {i} must be an object.")
        values = {}
        for key in ("display_name", "email", "access_token", "profile_id"):
            value = item.get(key)
            if not isinstance(value, str) or not value.strip(): raise SmokeError(f"Participant {i} is missing {key}.")
            values[key] = value.strip()
        values["email"] = values["email"].lower()
        values["profile_id"] = uuid(values["profile_id"], f"Participant {i} profile_id")
        result.append(Participant(**values))
    if len({p.email for p in result}) != len(result): raise SmokeError("Participant emails must be unique.")
    if len({p.profile_id for p in result}) != len(result): raise SmokeError("Participant profile_id values must be unique.")
    return tuple(result)


def boundary(timezone_name: str, local_date: str | None, local_time: str, now: Callable[[], datetime] = now_utc) -> tuple[str, str]:
    try: zone = ZoneInfo(timezone_name)
    except Exception as exc: raise SmokeError(f"Unknown IANA timezone: {timezone_name}") from exc
    try:
        hour, minute = map(int, local_time.split(":", 1))
        if hour not in range(24) or minute not in range(60): raise ValueError
    except ValueError as exc: raise SmokeError("Boundary time must use HH:MM.") from exc
    current = now().astimezone(zone)
    try: date = current.date() if local_date is None else datetime.strptime(local_date, "%Y-%m-%d").date()
    except ValueError as exc: raise SmokeError("Local date must use YYYY-MM-DD.") from exc
    point = datetime(date.year, date.month, date.day, hour, minute, tzinfo=zone)
    if point > current: raise SmokeError(f"Day boundary {point.isoformat()} has not been reached.")
    return date.isoformat(), point.isoformat(timespec="seconds")


def invitation_token() -> str:
    token = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")
    if not TOKEN_RE.fullmatch(token): raise AssertionError("invalid generated invitation token")
    return token


def signature(secret: str, timestamp: str, raw: str) -> str:
    return hmac.new(secret.encode(), f"{timestamp}.{raw}".encode(), hashlib.sha256).hexdigest()


def cmd(kind: str, expedition: str, actor: str, role: str, payload: Mapping[str, Any], command_id: str, **extra: Any) -> dict[str, Any]:
    return {"command_id": command_id, "command_type": kind, "issued_at": iso_now(), "actor_id": actor, "actor_role": role, "expedition_id": expedition, "idempotency_key": command_id, "day_number": extra.get("day_number"), "stage_id": extra.get("stage_id"), "day_revision": None, "device_id": extra.get("device_id"), "payload": dict(payload)}


class Client:
    def __init__(self, url: str, api_key: str, opener: Callable[[urllib.request.Request], Any] = urllib.request.urlopen, epoch: Callable[[], int] = lambda: int(time.time())):
        self.url, self.api_key, self.opener, self.epoch = url.rstrip("/"), api_key, opener, epoch

    def request(self, path: str, token: str, method: str, body: Mapping[str, Any] | None = None, headers: Mapping[str, str] | None = None) -> Any:
        raw = compact(body) if body is not None else None
        request_headers = {"apikey": self.api_key, "authorization": f"Bearer {token}", "accept": "application/json"}
        if raw is not None: request_headers["content-type"] = "application/json"
        if headers: request_headers.update(headers)
        request = urllib.request.Request(self.url + path, data=raw.encode() if raw is not None else None, headers=request_headers, method=method)
        try:
            with self.opener(request) as response:
                text = response.read().decode()
                return json.loads(text) if text else None
        except urllib.error.HTTPError as exc:
            text = exc.read().decode()
            try: detail = json.loads(text) if text else None
            except json.JSONDecodeError: detail = text
            raise SmokeError(f"HTTP {exc.code} from {path}: {sanitize(detail)}") from exc
        except urllib.error.URLError as exc: raise SmokeError(f"Network request failed for {path}: {exc.reason}") from exc

    def user(self, token: str) -> Identity:
        data = self.request("/auth/v1/user", token, "GET")
        if not isinstance(data, Mapping) or not isinstance(data.get("id"), str): raise SmokeError("Supabase Auth returned an invalid user document.")
        email = data.get("email") if isinstance(data.get("email"), str) else None
        verified = bool(data.get("email_confirmed_at") or data.get("confirmed_at") or isinstance(data.get("user_metadata"), Mapping) and data["user_metadata"].get("email_verified") is True)
        return Identity(str(data["id"]), email.lower() if email else None, verified)

    def gateway(self, token: str, command: Mapping[str, Any]) -> dict[str, Any]:
        data = self.request("/functions/v1/command-gateway", token, "POST", command)
        if not isinstance(data, Mapping) or not isinstance(data.get("data"), Mapping): raise SmokeError("command-gateway returned an invalid envelope.")
        result = dict(data["data"])
        if result.get("outcome") != "accepted" or not isinstance(result.get("receipt"), Mapping): raise SmokeError(f"Command was not accepted: {sanitize(data)}")
        return result

    def system_gateway(self, token: str, secret: str, command: Mapping[str, Any]) -> dict[str, Any]:
        raw, timestamp = compact(command), str(self.epoch())
        data = self.request("/functions/v1/command-gateway", token, "POST", command, {"x-ilka-system-timestamp": timestamp, "x-ilka-system-signature": signature(secret, timestamp, raw)})
        if not isinstance(data, Mapping) or not isinstance(data.get("data"), Mapping): raise SmokeError("trusted gateway returned an invalid envelope.")
        result = dict(data["data"])
        if result.get("outcome") != "accepted": raise SmokeError(f"Day boundary was not accepted: {sanitize(data)}")
        return result

    def rpc(self, name: str, token: str, expedition: str) -> dict[str, Any]:
        data = self.request(f"/rest/v1/rpc/{name}", token, "POST", {"p_expedition_key": expedition})
        if not isinstance(data, Mapping): raise SmokeError(f"{name} returned a non-object response.")
        return dict(data)


def receipt(result: Mapping[str, Any]) -> Mapping[str, Any]:
    value = result.get("receipt")
    if not isinstance(value, Mapping): raise SmokeError("Missing authoritative receipt.")
    return value


def receipt_view(result: Mapping[str, Any]) -> dict[str, Any]:
    r = receipt(result)
    return {key: r.get(key) for key in ("command_id", "command_type", "status", "event_ids", "stream_position", "projection_version", "runtime_release_id", "reducer_version")} | {"replayed": bool(result.get("replayed"))}


def member_actor(result: Mapping[str, Any]) -> str:
    value = receipt(result).get("actor_membership_id")
    if not isinstance(value, str) or not UUID_RE.fullmatch(value): raise SmokeError("Receipt is missing authoritative membership ID.")
    return "member_" + value.replace("-", "")


def task(view: Mapping[str, Any]) -> str:
    for item in view.get("tasks", []):
        if isinstance(item, Mapping) and isinstance(item.get("task_id"), str) and item.get("status") in {"available", "in_progress"}: return str(item["task_id"])
    raise SmokeError("No completable Day 1 task found.")


def blockers(view: Mapping[str, Any]) -> set[str]:
    return {str(item["entity_id"]) for item in view.get("blockers", []) if isinstance(item, Mapping) and item.get("code") == "required_task_incomplete" and isinstance(item.get("entity_id"), str)}


def preflight(config: Config, client: Client) -> int:
    captain, seen = client.user(config.captain_token), set()
    for index, participant in enumerate(config.participants, 1):
        identity = client.user(participant.access_token)
        if identity.email != participant.email: raise SmokeError(f"Participant {index} JWT email does not match invitation email.")
        if not identity.verified: raise SmokeError(f"Participant {index} email is not confirmed.")
        if identity.user_id == captain.user_id or identity.user_id in seen: raise SmokeError("All JWTs must belong to distinct Auth users.")
        seen.add(identity.user_id)
    if config.captain_profile_id in {p.profile_id for p in config.participants}: raise SmokeError("Captain and Participant Profile IDs must be distinct.")
    return 1 + len(config.participants)


def run(config: Config, client: Client) -> dict[str, Any]:
    count = preflight(config, client)
    evidence: dict[str, Any] = {"schema_version": 1, "started_at": iso_now(), "environment": "development", "supabase_project": config.url, "expedition_key": config.expedition_key, "receipts": [], "checks": {"preflight_passed": True, "authenticated_identity_count": count}}
    if config.preflight_only:
        evidence.update({"mode": "preflight_only", "completed_at": iso_now()}); return sanitize(evidence)
    add = lambda result: evidence["receipts"].append(receipt_view(result))
    create = cmd("create_expedition", config.expedition_key, config.captain_profile_id, "captain", {"name": config.name, "timezone": config.timezone, "duration_days": 12, "day_boundary_local_time": config.boundary_time}, f"cmd_create_{config.expedition_key}")
    created = client.gateway(config.captain_token, create); add(created); captain_actor = member_actor(created)
    tokens = [invitation_token() for _ in config.participants]
    for i, (participant, token) in enumerate(zip(config.participants, tokens, strict=True), 1):
        add(client.gateway(config.captain_token, cmd("invite_participant", config.expedition_key, captain_actor, "captain", {"email": participant.email, "invitation_token": token}, f"cmd_invite_{config.expedition_key}_{i}")))
    for i, (participant, token) in enumerate(zip(config.participants, tokens, strict=True), 1):
        add(client.gateway(participant.access_token, cmd("accept_invitation", config.expedition_key, participant.profile_id, "participant", {"invitation_token": token, "display_name": participant.display_name}, f"cmd_accept_{config.expedition_key}_{i}")))
    setup = client.rpc("get_expedition_setup_view", config.captain_token, config.expedition_key)
    if len(setup.get("participants", [])) != len(config.participants) or any(i.get("status") == "pending" for i in setup.get("invitations", []) if isinstance(i, Mapping)): raise SmokeError("SetupView is not invitation-complete.")
    add(client.gateway(config.captain_token, cmd("generate_rotation", config.expedition_key, captain_actor, "captain", {}, f"cmd_rotation_{config.expedition_key}")))
    ready = client.rpc("get_expedition_setup_view", config.captain_token, config.expedition_key)
    if ready.get("expedition_status") != "ready" or not isinstance(ready.get("rotation"), Mapping) or ready["rotation"].get("status") != "generated": raise SmokeError("Rotation did not make Expedition ready.")
    add(client.gateway(config.captain_token, cmd("start_expedition", config.expedition_key, captain_actor, "captain", {}, f"cmd_start_{config.expedition_key}")))
    boundary_id = f"cmd_day_boundary_{config.expedition_key}_{config.local_date.replace('-', '')}"
    add(client.system_gateway(config.system_token, config.hmac_secret, cmd("process_day_boundary", config.expedition_key, "system_clock", "system_clock", {"local_calendar_date": config.local_date, "boundary_at": config.boundary_at}, boundary_id)))
    views = [client.rpc("get_today_view", p.access_token, config.expedition_key) for p in config.participants]
    ids = {str(v.get("participant_id")) for v in views}
    if len(ids) != len(config.participants) or any(v.get("expedition_id") != config.expedition_key or v.get("expedition_status") != "active" for v in views): raise SmokeError("TodayView set is invalid.")
    captain = client.rpc("get_captain_day_view", config.captain_token, config.expedition_key)
    captain_ids = {str(i.get("participant_id")) for i in captain.get("participants", []) if isinstance(i, Mapping)}
    if captain.get("expedition_id") != config.expedition_key or captain_ids != ids: raise SmokeError("CaptainDayView participant set is invalid.")
    selected, credential = views[0], config.participants[0]; task_id, participant_id = task(selected), str(selected["participant_id"])
    expected = {f"{value}:{task_id}" for value in ids}
    if not expected.issubset(blockers(captain)): raise SmokeError("Participant-scoped task blockers are incomplete.")
    role = "product_captain" if isinstance(selected.get("product_role"), Mapping) and selected["product_role"].get("role_id") == "product_captain" else "participant"
    complete = cmd("complete_task", config.expedition_key, participant_id, role, {"task_id": task_id}, f"cmd_complete_{config.expedition_key}_{task_id}_{participant_id[-8:]}", day_number=1, stage_id="onboarding", device_id="pilot_device_1")
    first, replay = client.gateway(credential.access_token, complete), client.gateway(credential.access_token, complete); add(first); add(replay)
    if receipt_view(first)["event_ids"] != receipt_view(replay)["event_ids"] or not replay.get("replayed"): raise SmokeError("Exact replay was not preserved.")
    updated = client.rpc("get_today_view", credential.access_token, config.expedition_key)
    states = {i.get("task_id"): i.get("status") for i in updated.get("tasks", []) if isinstance(i, Mapping)}
    if states.get(task_id) not in {"completed", "completed_late"}: raise SmokeError("TodayView did not update after complete_task.")
    after = blockers(client.rpc("get_captain_day_view", config.captain_token, config.expedition_key)); selected_blocker = f"{participant_id}:{task_id}"
    if selected_blocker in after or not (expected - {selected_blocker}).issubset(after): raise SmokeError("Task completion changed the wrong Participant blocker.")
    unique = [r for r in evidence["receipts"] if not r["replayed"]]; expected_count = 2 * len(config.participants) + 5
    positions = [r["stream_position"] for r in unique]; events = [event for r in unique for event in (r["event_ids"] or [])]
    if len(unique) != expected_count or not all(isinstance(p, int) for p in positions) or any(b <= a for a, b in zip(positions, positions[1:])): raise SmokeError("Receipt stream is not strictly append-only.")
    if len(events) != len(set(events)): raise SmokeError("Canonical event IDs are not unique.")
    if len({r["runtime_release_id"] for r in unique}) != 1: raise SmokeError("Commands did not use one pinned runtime release.")
    evidence["checks"].update({"active_captain_count": 1, "active_participant_count": len(config.participants), "pending_invitation_count": 0, "rotation_status": "generated", "expedition_status": "active", "today_view_count": len(views), "captain_day_view_count": 1, "participant_scoped_task_blockers": True, "complete_task_replay_preserved": True, "unique_command_receipt_count": len(unique), "append_only_stream_positions": True, "unique_authoritative_event_ids": True, "single_pinned_runtime_release": True, "raw_invitation_tokens_emitted": False, "participant_emails_emitted": False})
    evidence["completed_at"] = iso_now(); return sanitize(evidence)


def load(args: argparse.Namespace) -> Config:
    participants = parse_participants(required("ILKA_PARTICIPANTS_JSON")); expedition_key = args.expedition_key or f"pilot_{now_utc().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(3)}"
    if not KEY_RE.fullmatch(expedition_key): raise SmokeError("Invalid expedition key.")
    local_date, boundary_at = boundary(args.timezone, args.local_date, args.day_boundary_local_time)
    captain_token = required("ILKA_CAPTAIN_ACCESS_TOKEN")
    return Config(required("ILKA_SUPABASE_URL"), required("ILKA_SUPABASE_PUBLIC_KEY"), captain_token, uuid(required("ILKA_CAPTAIN_PROFILE_ID"), "ILKA_CAPTAIN_PROFILE_ID"), participants, required("ILKA_SYSTEM_CLOCK_HMAC_SECRET"), os.environ.get("ILKA_SYSTEM_CLOCK_BEARER_TOKEN", "").strip() or captain_token, expedition_key, args.name, args.timezone, args.day_boundary_local_time, local_date, boundary_at, Path(args.output) if args.output else None, args.preflight_only)


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description="Run the authenticated Gate 9E Day 1 pilot smoke.")
    value.add_argument("--expedition-key"); value.add_argument("--name", default="ILKA Day 1 Pilot"); value.add_argument("--timezone", default="Europe/Warsaw"); value.add_argument("--day-boundary-local-time", default="06:00"); value.add_argument("--local-date"); value.add_argument("--output"); value.add_argument("--preflight-only", action="store_true")
    return value


def main(argv: Sequence[str] | None = None) -> int:
    try:
        config = load(parser().parse_args(argv)); rendered = json.dumps(run(config, Client(config.url, config.api_key)), ensure_ascii=False, indent=2) + "\n"
        if config.output: config.output.parent.mkdir(parents=True, exist_ok=True); config.output.write_text(rendered, encoding="utf-8")
        sys.stdout.write(rendered); return 0
    except SmokeError as exc:
        print(f"pilot_smoke_failed: {sanitize(str(exc))}", file=sys.stderr); return 1


if __name__ == "__main__": raise SystemExit(main())
