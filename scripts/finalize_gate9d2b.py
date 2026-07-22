from __future__ import annotations

from pathlib import Path


WORKFLOW_PATH = Path(".github/workflows/finalize-gate9d2b.yml")

CHANGELOG_ENTRY = """## 2026-07-22 — Gate 9D2 executable Expedition start

- Added the pure `expedition-start-v1` reducer for Captain-only `start_expedition` from `ready` with exact empty payload.
- Added authoritative frozen-team, generated-Rotation, Cook compatibility, first-Stage and no-existing-Day guards.
- Added ordered `expedition.started → stage.opened(onboarding)` events and one complete active `ExpeditionSetupView` replacement without creating a Calendar Day.
- Added `StartExecutor`, command-specific private request validation, `PostgresStartDatabase` and service-role-only `private.start_expedition(jsonb)`.
- Preserved command → Expedition lock order, exact replay before mutable guards and `private.process_command(jsonb)` as the only receipt/event/projection writer.
- Routed `start_expedition` through the existing authenticated `command-gateway` after exact replay and before the generic membership/runtime path.
- Added composition in `command-gateway/index.ts` without a second endpoint, direct table write or alternate runtime registry.
- Added handler tests and a full gateway-to-PostgreSQL integration proving actor rejection, complete rollback, `ready → active`, ordered events, no premature Day state and replay after Captain revocation.
- Added protected Gate 9D2A/9D2B static validation and generated-source parity.

Gate 9D2 adds no `process_day_boundary`, assignment instance, Card Bundle, `TodayView`, `CaptainDayView`, production runtime registration, cloud migration, deployment or pilot data. Gate 9D3 implements trusted `system_clock` Day 1 execution.

"""

README_OLD = "The production runtime registry remains unchanged. Gate 9D implements `start_expedition` and Day 1 boundary; Gate 9E composes, pins and deploys the protected `day1_pilot_v1` release."
README_NEW = """Gate 9D2 executable Expedition start is complete locally under accepted `ADR-021`:

- `start_expedition` is Captain-only, online-only, ready-only and accepts an exact empty payload;
- the pure runtime opens `onboarding`, emits `expedition.started → stage.opened` and replaces the complete `ExpeditionSetupView` without creating a Calendar Day;
- `private.start_expedition(jsonb)` atomically persists through `private.process_command(jsonb)` and transitions `ready → active`;
- the existing authenticated `command-gateway` routes the command through `StartExecutor` only after exact replay;
- protected handler and PostgreSQL integration tests prove rollback, ordered events, no premature Day projections and replay after Captain revocation.

The production runtime registry remains unchanged. Gate 9D3 implements trusted `system_clock` Day 1 boundary execution; Gate 9D4 closes fixtures and the complete vertical; Gate 9E composes, pins and deploys `day1_pilot_v1`."""


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one marker, found {count}")
    return text.replace(old, new, 1)


def update_changelog() -> None:
    path = Path("CHANGELOG.md")
    text = path.read_text(encoding="utf-8")
    header = "# Changelog\n\n"
    if "## 2026-07-22 — Gate 9D2 executable Expedition start" in text:
        return
    if not text.startswith(header):
        raise RuntimeError("unexpected CHANGELOG header")
    path.write_text(header + CHANGELOG_ENTRY + text[len(header):], encoding="utf-8")


def update_readme() -> None:
    path = Path("README.md")
    text = path.read_text(encoding="utf-8")
    if README_OLD in text:
        text = text.replace(README_OLD, README_NEW, 1)
    elif "Gate 9D2 executable Expedition start is complete locally" not in text:
        raise RuntimeError("README Gate 9D marker not found")

    validation_old = """python scripts/validate_expedition_rotation.py
pytest -q
"""
    validation_new = """python scripts/validate_expedition_rotation.py
python scripts/validate_expedition_day1_start_contract.py
python scripts/validate_expedition_start_execution.py
python scripts/validate_expedition_start_gateway.py
pytest -q
"""
    if validation_old in text:
        text = text.replace(validation_old, validation_new, 1)
    elif "python scripts/validate_expedition_start_gateway.py" not in text:
        raise RuntimeError("README validation marker not found")
    path.write_text(text, encoding="utf-8")


def update_protected_workflow() -> None:
    path = Path(".github/workflows/validate.yml")
    text = path.read_text(encoding="utf-8")
    old = """      - name: Validate Expedition start execution
        run: python scripts/validate_expedition_start_execution.py

      - name: Run test suite
"""
    new = """      - name: Validate Expedition start execution
        run: python scripts/validate_expedition_start_execution.py

      - name: Validate Expedition start gateway
        run: python scripts/validate_expedition_start_gateway.py

      - name: Run test suite
"""
    if old in text:
        text = text.replace(old, new, 1)
    elif "python scripts/validate_expedition_start_gateway.py" not in text:
        raise RuntimeError("protected workflow Gate 9D2B marker not found")
    path.write_text(text, encoding="utf-8")


def fix_integration_trigger() -> None:
    path = Path("supabase/functions/command-gateway/tests/integration/start-execution.test.ts")
    text = path.read_text(encoding="utf-8")
    old = "if new.id = ${expeditionId}::uuid and new.status = 'active' then"
    new = "if new.id = '53000000-0000-0000-0000-0000000000b1'::uuid and new.status = 'active' then"
    text = replace_once(text, old, new, "integration trigger UUID")
    path.write_text(text, encoding="utf-8")


def main() -> None:
    update_changelog()
    update_readme()
    update_protected_workflow()
    fix_integration_trigger()
    Path(__file__).unlink()
    WORKFLOW_PATH.unlink()


if __name__ == "__main__":
    main()
