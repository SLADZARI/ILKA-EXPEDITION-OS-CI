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


def validate_artifact_meta(meta: dict, label: str, errors: list[str]) -> None:
    if meta.get("documentType") not in DOCUMENT_TYPES:
        errors.append(f"{label}: invalid documentType {meta.get('documentType')!r}")
    if meta.get("projectStage") not in PROJECT_STAGES:
        errors.append(f"{label}: invalid projectStage {meta.get('projectStage')!r}")
    if meta.get("gate") not in GATES:
        errors.append(f"{label}: invalid gate {meta.get('gate')!r}")
    if meta.get("status") not in STATUSES:
        errors.append(f"{label}: invalid status {meta.get('status')!r}")
    if meta.get("sourceSystem") not in SOURCE_SYSTEMS:
        errors.append(f"{label}: invalid sourceSystem {meta.get('sourceSystem')!r}")
    if meta.get("authorityType") not in AUTHORITY_TYPES:
        errors.append(f"{label}: invalid authorityType {meta.get('authorityType')!r}")


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    kernel = root / ".weekly-os"
    errors: list[str] = []

    required = ["PROJECT.json", "ARTIFACT_INDEX.json", "APPROVED_STATE.json"]
    for relative in required:
        if not (kernel / relative).is_file():
            errors.append(f"missing required WeeklyOS kernel file .weekly-os/{relative}")
    if errors:
        print("MP_DSL KERNEL VALIDATION FAILED")
        for error in errors:
            print("-", error)
        return 1

    project = load_json(kernel / "PROJECT.json")
    index = load_json(kernel / "ARTIFACT_INDEX.json")
    approved = load_json(kernel / "APPROVED_STATE.json")

    for label, doc in (("PROJECT", project), ("ARTIFACT_INDEX", index), ("APPROVED_STATE", approved)):
        if doc.get("schemaVersion") != "1.0":
            errors.append(f"{label}: schemaVersion must be 1.0")
        meta = doc.get("_artifact")
        if not isinstance(meta, dict):
            errors.append(f"{label}: missing _artifact metadata")
        else:
            validate_artifact_meta(meta, label, errors)

    if project.get("canonicalRepository") != "SLADZARI/ILKA-EXPEDITION-OS-CI":
        errors.append("PROJECT canonicalRepository must be SLADZARI/ILKA-EXPEDITION-OS-CI")
    if project.get("defaultBranch") != "main":
        errors.append("PROJECT defaultBranch must be main")
    if project.get("projectStage") not in PROJECT_STAGES:
        errors.append(f"invalid projectStage {project.get('projectStage')!r}")
    if project.get("gate") not in GATES:
        errors.append(f"invalid gate {project.get('gate')!r}")

    expected_read_first = [
        ".weekly-os/PROJECT.json",
        ".weekly-os/ARTIFACT_INDEX.json",
        ".weekly-os/APPROVED_STATE.json",
    ]
    if project.get("readFirst", [])[:3] != expected_read_first:
        errors.append("PROJECT readFirst must begin .weekly-os/PROJECT.json -> ARTIFACT_INDEX.json -> APPROVED_STATE.json")

    current_artifacts = index.get("currentArtifacts", [])
    ids = [item.get("artifactId") for item in current_artifacts]
    if len(ids) != len(set(ids)):
        errors.append("ARTIFACT_INDEX currentArtifacts contains duplicate artifactId values")

    indexed = {item.get("artifactId"): item for item in current_artifacts}
    for item in current_artifacts + index.get("referenceArtifacts", []):
        artifact_id = item.get("artifactId")
        if item.get("documentType") not in DOCUMENT_TYPES:
            errors.append(f"{artifact_id}: invalid documentType {item.get('documentType')!r}")
        if item.get("status") not in STATUSES:
            errors.append(f"{artifact_id}: invalid status {item.get('status')!r}")
        if item.get("sourceSystem") not in SOURCE_SYSTEMS:
            errors.append(f"{artifact_id}: invalid sourceSystem {item.get('sourceSystem')!r}")
        if item.get("authorityType") not in AUTHORITY_TYPES:
            errors.append(f"{artifact_id}: invalid authorityType {item.get('authorityType')!r}")
        location = item.get("location")
        if location and not (root / location).exists():
            errors.append(f"{artifact_id}: indexed location does not exist: {location}")

    protected = approved.get("protected", {})
    for key in ("PRODUCT", "DOMAIN", "ARCHITECTURE", "DESIGN"):
        entry = protected.get(key)
        if entry is None:
            continue
        artifact_id = entry.get("artifactId") if isinstance(entry, dict) else None
        item = indexed.get(artifact_id)
        if not item:
            errors.append(f"APPROVED_STATE {key} references missing current artifactId {artifact_id}")
        elif entry.get("status") != "APPROVED" or item.get("status") != "APPROVED":
            errors.append(f"protected {key} must resolve to APPROVED current artifact")

    current_result = project.get("currentResult")
    approved_result = approved.get("currentResult", {}).get("artifactId")
    if current_result != approved_result:
        errors.append("current Result mismatch between PROJECT and APPROVED_STATE")
    result_item = indexed.get(current_result)
    if not result_item or result_item.get("documentType") != "RESULT":
        errors.append("current Result must resolve to a RESULT in currentArtifacts")
    if project.get("activeIntegrationBranch") != approved.get("currentResult", {}).get("branch"):
        errors.append("active integration branch mismatch between PROJECT and APPROVED_STATE")

    legacy = project.get("legacyDeliveryContext", {})
    if legacy.get("label") and str(legacy.get("label")).startswith("G"):
        errors.append("legacy ILKA delivery context must not masquerade as an MP_DSL G0-G8 gate")

    rules = approved.get("rules", {})
    if rules.get("promoteReferenceToApprovedAutomatically") is not False:
        errors.append("APPROVED_STATE must forbid automatic promotion of references")

    if errors:
        print("MP_DSL KERNEL VALIDATION FAILED")
        for error in errors:
            print("-", error)
        return 1

    print("MP_DSL KERNEL VALIDATION PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
