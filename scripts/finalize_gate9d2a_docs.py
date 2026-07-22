from __future__ import annotations

from pathlib import Path
import subprocess


CHANGELOG_ENTRY = """## 2026-07-22 — Gate 9D2A executable Expedition start

- Added the pure `expedition-start-v1` reducer for Captain-only `start_expedition` from `ready` with exact empty payload.
- Added authoritative frozen-team, generated-Rotation, Cook compatibility, first-Stage and no-existing-Day guards.
- Added ordered `expedition.started → stage.opened(onboarding)` events and one complete active `ExpeditionSetupView` replacement without creating a Calendar Day.
- Added `StartExecutor`, command-specific private request validation and a service-role PostgreSQL adapter.
- Added `private.start_expedition(jsonb)` with command → Expedition lock order, exact replay before mutable guards and atomic `ready → active` transition.
- Preserved `private.process_command(jsonb)` as the only receipt, event and projection writer; no Day, assignment or Card Bundle table was introduced.
- Added runtime/executor unit coverage, pgTAP privilege/delegation checks, generated Supabase types and protected static validation.

Gate 9D2A does not yet route `start_expedition` through the public `command-gateway`. Gate 9D2B adds handler/index composition and complete gateway-to-PostgreSQL integration. Runtime registration, cloud migration, Day 1 boundary, scheduler, deployment and pilot data remain outside this subgate.

"""

README_OLD = "The production runtime registry remains unchanged. Gate 9D implements `start_expedition` and Day 1 boundary; Gate 9E composes, pins and deploys the protected `day1_pilot_v1` release."
README_NEW = """Gate 9D1 has accepted and protected the canonical `start_expedition` and first Day boundary contracts. Gate 9D2A now provides the pure Expedition-start reducer, trusted executor and atomic `private.start_expedition(jsonb)` wrapper while deliberately leaving the shared public handler unchanged.

The production runtime registry remains unchanged. Gate 9D2B routes `start_expedition` through `command-gateway`; Gate 9D3 implements the trusted Day 1 boundary; Gate 9D4 closes the vertical; Gate 9E composes, pins and deploys `day1_pilot_v1`."""

WORKFLOW_NEEDLE = """      - name: Validate Expedition Day 1 start contract
        run: python scripts/validate_expedition_day1_start_contract.py

      - name: Run test suite
"""
WORKFLOW_REPLACEMENT = """      - name: Validate Expedition Day 1 start contract
        run: python scripts/validate_expedition_day1_start_contract.py

      - name: Validate Expedition start execution
        run: python scripts/validate_expedition_start_execution.py

      - name: Run test suite
"""


def main() -> None:
    changelog = Path("CHANGELOG.md")
    changelog_text = changelog.read_text(encoding="utf-8")
    header = "# Changelog\n\n"
    if "## 2026-07-22 — Gate 9D2A executable Expedition start" not in changelog_text:
        if not changelog_text.startswith(header):
            raise RuntimeError("unexpected CHANGELOG header")
        changelog.write_text(
            header + CHANGELOG_ENTRY + changelog_text[len(header):],
            encoding="utf-8",
        )

    readme = Path("README.md")
    readme_text = readme.read_text(encoding="utf-8")
    if README_OLD in readme_text:
        readme.write_text(
            readme_text.replace(README_OLD, README_NEW, 1),
            encoding="utf-8",
        )
    elif "Gate 9D2A now provides the pure Expedition-start reducer" not in readme_text:
        raise RuntimeError("README Gate 9D status marker not found")

    workflow = subprocess.check_output(
        ["git", "show", "origin/main:.github/workflows/validate.yml"],
        text=True,
    )
    if WORKFLOW_NEEDLE not in workflow:
        raise RuntimeError("protected workflow insertion marker not found")
    Path(".github/workflows/validate.yml").write_text(
        workflow.replace(WORKFLOW_NEEDLE, WORKFLOW_REPLACEMENT, 1),
        encoding="utf-8",
    )

    Path(__file__).unlink()


if __name__ == "__main__":
    main()
