#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "supabase/functions/_shared/engine-runtime/day1-pilot-v1.ts"
POLICY = ROOT / "supabase/functions/_shared/engine-runtime/day1-pilot-policy.generated.ts"
GENERATOR = ROOT / "scripts/generate_day1_pilot_policy.py"
REGISTRY = ROOT / "supabase/functions/_shared/command-gateway/runtime-registry.ts"
UNIT_TEST = ROOT / "supabase/functions/command-gateway/tests/unit/day1-pilot-runtime.test.ts"
WORKFLOW = ROOT / ".github/workflows/validate.yml"
ARCHITECTURE = ROOT / "docs/architecture/expedition-setup-and-day1-pilot-runtime.md"


def generated_policy() -> dict[str, object]:
    text = POLICY.read_text(encoding="utf-8")
    match = re.search(r"export const DAY1_PILOT_POLICY = (\{.*\}) as const;", text, re.S)
    if not match:
        raise ValueError("generated policy does not expose DAY1_PILOT_POLICY")
    return json.loads(match.group(1))


def validate(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    required = [RUNTIME, POLICY, GENERATOR, UNIT_TEST, WORKFLOW, ARCHITECTURE]
    for path in required:
        if not path.exists():
            errors.append(f"missing required Gate 9E1 file: {path.relative_to(root)}")
    if errors:
        return errors

    runtime = RUNTIME.read_text(encoding="utf-8")
    policy_text = POLICY.read_text(encoding="utf-8")
    registry = REGISTRY.read_text(encoding="utf-8")
    unit = UNIT_TEST.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    architecture = ARCHITECTURE.read_text(encoding="utf-8")

    for factory in (
        "createExpeditionBootstrapRuntime",
        "createExpeditionInvitationRuntime",
        "createExpeditionRotationRuntime",
        "createExpeditionStartRuntime",
        "createDay1BoundaryRuntime",
        "createDay1CompleteTaskRuntime",
    ):
        if factory not in runtime:
            errors.append(f"composite runtime does not delegate to {factory}")

    for command in (
        "create_expedition",
        "invite_participant",
        "accept_invitation",
        "revoke_invitation",
        "generate_rotation",
        "start_expedition",
        "process_day_boundary",
        "complete_task",
    ):
        if f'case "{command}"' not in runtime:
            errors.append(f"composite runtime does not dispatch {command}")

    for capability in (
        "bootstrap_policy",
        "invitation_policy",
        "rotation_policy",
        "start_policy",
        "day1_policy",
        "reduceBoundary",
    ):
        if capability not in runtime:
            errors.append(f"composite runtime is missing {capability}")

    if "DAY1_PILOT_POLICY" not in runtime:
        errors.append("composite runtime must consume generated canonical policy")
    if "cards/" not in policy_text or "Do not edit" not in policy_text:
        errors.append("generated policy must identify canonical methodology sources")

    try:
        policy = generated_policy()
    except (ValueError, json.JSONDecodeError) as error:
        errors.append(str(error))
        policy = {}

    pipeline = yaml.safe_load((root / "engine/pipeline.yaml").read_text(encoding="utf-8"))
    stage = yaml.safe_load((root / "stages/01_onboarding.yaml").read_text(encoding="utf-8"))
    rotation = yaml.safe_load(
        (root / "engine/role-rotation-rules.yaml").read_text(encoding="utf-8")
    )
    if policy:
        expected_scalars = {
            "duration_days": pipeline["duration_days"],
            "recovery_days_available": pipeline["recovery_day"]["max_uses"],
            "team_size_min": stage["assignment_rules"]["team_size"]["minimum"],
            "team_size_max": stage["assignment_rules"]["team_size"]["maximum"],
            "invitation_ttl_hours": 168,
            "rotation_rules_version": rotation["rotation"]["rules_version"],
            "first_stage_id": stage["stage_id"],
        }
        for key, expected in expected_scalars.items():
            if policy.get(key) != expected:
                errors.append(f"generated policy {key} does not match canonical source")
        day1 = policy.get("day1", {})
        if not isinstance(day1, dict):
            errors.append("generated policy day1 must be an object")
        else:
            if day1.get("stage_id") != stage["stage_id"]:
                errors.append("generated Day 1 stage does not match onboarding")
            generated_cards = [
                item.get("card_id")
                for item in day1.get("shared_cards", [])
                if isinstance(item, dict)
            ]
            if generated_cards != stage["card_refs"]["shared"]:
                errors.append("generated shared card order does not match onboarding")

    if "day1_pilot_v1" in registry or "createDay1PilotRuntime" in registry:
        errors.append("Gate 9E1 must not register day1_pilot_v1 before its merge SHA exists")
    migration_text = "\n".join(
        path.read_text(encoding="utf-8") for path in sorted((root / "supabase/migrations").glob("*.sql"))
    )
    if "day1_pilot_v1" in migration_text:
        errors.append("Gate 9E1 must not insert the immutable release row")

    for assertion in (
        "isExpeditionBootstrapRuntime(runtime)",
        "isExpeditionInvitationRuntime(runtime)",
        "isExpeditionRotationRuntime(runtime)",
        "isExpeditionStartRuntime(runtime)",
        "isDay1BoundaryRuntime(runtime)",
        "runtime.reduceBoundary",
        '"complete_task"',
    ):
        if assertion not in unit:
            errors.append(f"unit test does not prove composite capability: {assertion}")

    for invocation in (
        "python scripts/generate_day1_pilot_policy.py",
        "python scripts/validate_day1_pilot_runtime.py",
    ):
        if invocation not in workflow:
            errors.append(f"protected CI is missing: {invocation}")

    if "Gate 9E1" not in architecture or "Gate 9E2" not in architecture:
        errors.append("architecture must state the protected composition/registration split")

    return errors


def main() -> int:
    errors = validate()
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("Gate 9E1 Day 1 pilot runtime composition is valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
