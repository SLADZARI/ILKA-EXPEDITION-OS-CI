#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def replay(events):
    state = {
        "expedition": None,
        "participants": {},
        "stage": None,
        "completed_stages": [],
        "stage_advance_request": None,
        "stage_advance_override": None,
        "outputs": {},
        "day": {"status": "not_started", "revision": 1},
        "superseded_days": [],
        "roles": {},
        "card_bundles": {},
        "cards": {},
        "tasks": {},
        "decision": {"status": "none", "effective_ballots": {}},
        "processed_event_ids": set(),
    }
    for event in sorted(events, key=lambda item: (item["recorded_at"], item["event_id"])):
        if event["event_id"] in state["processed_event_ids"]:
            continue
        state["processed_event_ids"].add(event["event_id"])
        event_type = event["event_type"]
        payload = event["payload"]

        if event_type == "expedition.created":
            state["expedition"] = {"expedition_id": event["expedition_id"], **payload, "status": "draft"}
        elif event_type == "participant.added":
            state["participants"][payload["participant_id"]] = {**payload, "status": "active", "access_revoked": False}
        elif event_type == "participant.banned":
            participant = state["participants"].setdefault(payload["participant_id"], {"participant_id": payload["participant_id"]})
            participant.update({"status": "banned", "access_revoked": True, "ban_reason": payload["reason"], "effective_at": payload["effective_at"]})
        elif event_type == "participant.unbanned":
            participant = state["participants"].setdefault(payload["participant_id"], {"participant_id": payload["participant_id"]})
            participant.update({"status": "active", "access_revoked": False, "ban_reason": None, "effective_at": None})
        elif event_type == "rotation.generated":
            state["rotation"] = payload
        elif event_type == "expedition.started":
            state["expedition"]["status"] = "active"
        elif event_type == "expedition.completed":
            state["expedition"].update({
                "status": "completed",
                "completed_at": event["occurred_at"],
                "final_stage_id": payload["final_stage_id"],
                "final_day_number": payload["final_day_number"],
                "shore_package_ref": payload["shore_package_ref"],
                "completion_summary": payload["completion_summary"],
                "final_projection_version": payload["final_projection_version"],
            })
        elif event_type == "stage.advance_requested":
            state["stage_advance_request"] = {**payload, "status": "synced", "requested_by": event["actor_id"]}
        elif event_type == "stage.advance_overridden":
            state["stage_advance_override"] = payload
        elif event_type == "stage.completed":
            state["completed_stages"].append(payload)
            if state["stage"] and state["stage"].get("stage_id") == payload["stage_id"]:
                state["stage"]["status"] = "completed"
        elif event_type == "stage.opened":
            state["stage"] = {**payload, "status": "active"}
            state["stage_advance_request"] = None
        elif event_type == "day.started":
            state["day"] = {**payload, "status": "active", "revision": event.get("day_revision") or payload.get("day_revision") or 1}
        elif event_type == "day.transition_forced":
            state["last_day_admin_action"] = {"type": "forced", **payload}
        elif event_type == "day.rewind_applied":
            state["superseded_days"] = payload["superseded_day_numbers"]
            state["day"] = {
                "day_number": payload["to_day_number"],
                "status": "active",
                "revision": payload["new_day_revision"],
                "rewind_reason": payload["reason"],
            }
            state["last_day_admin_action"] = {"type": "rewound", **payload}
        elif event_type == "role_assignments.expired":
            for assignment_id in payload["assignment_ids"]:
                if assignment_id in state["roles"]:
                    state["roles"][assignment_id]["state"] = "expired"
        elif event_type == "role_assignments.activated":
            for assignment in payload["assignments"]:
                state["roles"][assignment["assignment_id"]] = {**assignment, "state": "active"}
        elif event_type == "role_assignments.revoked":
            for assignment_id in payload["assignment_ids"]:
                if assignment_id in state["roles"]:
                    state["roles"][assignment_id]["state"] = "revoked"
        elif event_type == "role_assignment.overridden":
            state["role_override"] = payload
        elif event_type == "card_bundles.published":
            for bundle in payload["bundles"]:
                state["card_bundles"][bundle["participant_id"]] = bundle
                for card_id in bundle["card_ids"]:
                    state["cards"].setdefault(card_id, {"acknowledged": False})
        elif event_type == "card.acknowledged":
            state["cards"].setdefault(payload["card_id"], {})["acknowledged"] = True
        elif event_type == "task.started":
            state["tasks"][payload["task_id"]] = {"status": "in_progress"}
        elif event_type == "task.blocked":
            state["tasks"][payload["task_id"]] = {"status": "blocked", "reason": payload["reason"]}
        elif event_type == "task.completed":
            state["tasks"][payload["task_id"]] = {"status": "completed"}
        elif event_type == "task.overdue":
            state["tasks"][payload["task_id"]] = {"status": "overdue"}
        elif event_type == "task.completed_late":
            state["tasks"][payload["task_id"]] = {"status": "completed_late"}
        elif event_type == "task.waived":
            state["tasks"][payload["task_id"]] = {"status": "waived"}
        elif event_type == "day.transition_failed":
            state["day"] = {**payload, "status": "transition_failed"}
        elif event_type == "day.transition_recovered":
            state["day_recovery"] = payload
        elif event_type == "decision.draft_created":
            state["decision"] = {"status": "draft", "draft": payload, "effective_ballots": {}}
        elif event_type == "vote.opened":
            state["decision"].update({"status": "vote_open", "vote_round": payload, "effective_ballots": {}})
        elif event_type == "vote.cast":
            ballots = state["decision"].setdefault("effective_ballots", {})
            actor = event["actor_id"]
            current = ballots.get(actor)
            if current is None or payload["ballot_revision"] > current["ballot_revision"]:
                ballots[actor] = {**payload, "actor_id": actor}
        elif event_type == "vote.closed":
            state["decision"].update({"vote_status": "closed", "vote_result": payload})
        elif event_type == "product_decision.recorded":
            state["decision"].update({"status": "finalized", "result": payload})
        elif event_type == "product_decision.overridden":
            state["decision"].update({"status": "overridden", "result": payload})
        elif event_type == "day.closed":
            state["day"] = {**payload, "status": "closed"}

    state["processed_event_ids"] = sorted(state["processed_event_ids"])
    return state


if __name__ == "__main__":
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "examples/sample-events.json")
    print(json.dumps(replay(json.loads(path.read_text(encoding="utf-8"))), ensure_ascii=False, indent=2))
