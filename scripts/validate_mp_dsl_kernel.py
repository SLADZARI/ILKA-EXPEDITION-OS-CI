#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

DOCUMENT_TYPES = {
    "PRODUCT", "BRIEF", "SCOPE", "ARCHITECTURE", "DOMAIN", "DESIGN", "DECISION",
    "RESULT", "REPORT", "PROTOCOL", "TRANSCRIPT", "RESEARCH", "ESTIMATE", "RUNBOOK",
    "STANDARD", "CHANGE_PROPOSAL", "RELEASE", "LESSON",
}
PROJECT_STAGES = {"SIGNAL", "CLARITY", "DECISION", "BUILD", "HANDOVER", "ARCHIVE"}
GATES = {
    "G0_SIGNAL", "G1_PRODUCT_LOCK", "G2_DOMAIN_LOCK", "G3_ARCHITECTURE_LOCK",
    "G4_DESIGN_LOCK", "G5_BUILD", "G6_VALIDATION", "G7_RELEASE", "G8_CLEANUP",
}
STATUSES = {"DRAFT", "REVIEW", "APPROVED", "SUPERSEDED", "ARCHIVED"}
SOURCE_SYSTEMS = {"GIT", "DRIVE", "SUPABASE", "EXTERNAL"}
AUTHORITY_TYPES = {
    "APPROVED_AUTHORITY", "IMPLEMENTATION_AUTHORITY", "RUNTIME", "EVIDENCE", "REFERENCE", "HISTORY",
}


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    errors: list[str] = []

    required = ["PROJECT.json", "ARTIFACT_INDEX.json", "APPROVED_STATE.json"]
    for relative in required:
        if not (root / relative).is_file():
            errors.append(f"missing required kernel file {relative}")
    if errors:
        print("MP_DSL KERNEL VALIDATION FAILED")
        for error in errors:
            print("-", error)
        return 1

    project = load_json(root / "PROJECT.json")
    index = load_json(root / "ARTIFACT_INDEX.json")
    approved = load_json(root / "APPROVED_STATE.json")

    if project.get("canonicalRepository") != "SLADZARI/ILKA-EXPEDITION-OS-CI":
        errors.append("PROJECT.json canonicalRepository must be SLADZARI/ILKA-EXPEDITION-OS-CI")
    if project.get("defaultBranch") != "main":
        errors.append("PROJECT.json defaultBranch must be main")
    if project.get("projectStage") not in PROJECT_STAGES:
        errors.append(f"invalid projectStage {project.get('projectStage')!r}")
    if project.get("currentGate") not in GATES:
        errors.append(f"invalid currentGate {project.get('currentGate')!r}")

    expected_read_first = ["PROJECT.json", "ARTIFACT_INDEX.json", "APPROVED_STATE.json"]
    if project.get("readFirst", [])[:3] != expected_read_first:
        errors.append("PROJECT.json readFirst must begin PROJECT.json -> ARTIFACT_INDEX.json -> APPROVED_STATE.json")

    artifacts = index.get("artifacts", [])
    ids = [item.get("artifactId") for item in artifacts]
    if len(ids) != len(set(ids)):
        errors.append("ARTIFACT_INDEX.json contains duplicate artifactId values")

    indexed = {item.get("artifactId"): item for item in artifacts}
    for item in artifacts:
        artifact_id = item.get("artifactId")
        if item.get("documentType") not in DOCUMENT_TYPES:
            errors.append(f"{artifact_id}: invalid documentType {item.get('documentType')!r}")
        if item.get("status") not in STATUSES:
            errors.append(f"{artifact_id}: invalid status {item.get('status')!r}")
        if item.get("sourceSystem") not in SOURCE_SYSTEMS:
            errors.append(f"{artifact_id}: invalid sourceSystem {item.get('sourceSystem')!r}")
        if item.get("authorityType") not in AUTHORITY_TYPES:
            errors.append(f"{artifact_id}: invalid authorityType {item.get('authorityType')!r}")
        path = item.get("path")
        if path and not (root / path).exists():
            errors.append(f"{artifact_id}: indexed path does not exist: {path}")

    protected = approved.get("protected", {})
    for key in ("PRODUCT", "DOMAIN", "ARCHITECTURE", "DESIGN"):
        entry = protected.get(key)
        if not entry:
            errors.append(f"APPROVED_STATE.json missing protected {key}")
            continue
        artifact_id = entry.get("artifactId")
        item = indexed.get(artifact_id)
        if not item:
            errors.append(f"APPROVED_STATE {key} references missing artifactId {artifact_id}")
            continue
        if entry.get("status") != "APPROVED":
            errors.append(f"APPROVED_STATE {key} must be APPROVED")
        if item.get("status") != "APPROVED":
            errors.append(f"ARTIFACT_INDEX {artifact_id} must be APPROVED while protected")

    current_result = project.get("currentResult")
    approved_result = approved.get("currentResult", {}).get("artifactId")
    if current_result != approved_result:
        errors.append("current Result mismatch between PROJECT.json and APPROVED_STATE.json")
    result_item = indexed.get(current_result)
    if not result_item or result_item.get("documentType") != "RESULT":
        errors.append("current Result must resolve to a RESULT in ARTIFACT_INDEX.json")

    if approved.get("projectStage") != project.get("projectStage"):
        errors.append("projectStage mismatch between PROJECT.json and APPROVED_STATE.json")
    if approved.get("currentGate") != project.get("currentGate"):
        errors.append("currentGate mismatch between PROJECT.json and APPROVED_STATE.json")
    if approved.get("legacyDeliveryGate") != project.get("legacyDeliveryGate"):
        errors.append("legacyDeliveryGate mismatch between PROJECT.json and APPROVED_STATE.json")

    if errors:
        print("MP_DSL KERNEL VALIDATION FAILED")
        for error in errors:
            print("-", error)
        return 1

    print("MP_DSL KERNEL VALIDATION PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
