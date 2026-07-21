#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

validator = ROOT / "scripts/validate_expedition_invitation_transaction_contract.py"
text = validator.read_text(encoding="utf-8")
text = text.replace(
    'ADR = ROOT / "docs/decisions/ADR-018-expedition-setup-and-day1-pilot-runtime.md"',
    'ADR = ROOT / "docs/decisions/ADR-019-invitation-transaction-boundaries.md"',
)
text = text.replace(
    '            "## Gate 9B2A invitation transaction contracts",\n'
    '            "three private request schemas",\n'
    '            "no SQL migration, reducer, gateway execution branch or read API",',
    '            "# ADR-019 — Invitation transaction boundaries",\n'
    '            "three private request schemas",\n'
    '            "no SQL migration, reducer, gateway execution branch or read API",',
)
text = text.replace('        "ADR-018 Gate 9B2A record",', '        "ADR-019 Gate 9B2A record",')
validator.write_text(text, encoding="utf-8")

architecture = ROOT / "docs/architecture/expedition-invitation-transactions.md"
text = architecture.read_text(encoding="utf-8")
needle = "Decision authority: `docs/decisions/ADR-018-expedition-setup-and-day1-pilot-runtime.md`\n"
replacement = (
    needle
    + "Transaction boundary decision: `docs/decisions/ADR-019-invitation-transaction-boundaries.md`\n"
)
if "Transaction boundary decision:" not in text:
    text = text.replace(needle, replacement)
architecture.write_text(text, encoding="utf-8")

changelog = ROOT / "CHANGELOG.md"
text = changelog.read_text(encoding="utf-8")
entry = """## 2026-07-21 — Gate 9B2A invitation transaction contracts

- Accepted `ADR-019` for the structural invitation transaction boundary extending `ADR-018`.
- Added private request schemas for `invite_participant`, `accept_invitation` and `revoke_invitation`.
- Fixed command → Expedition → invitation-email/row → projection lock order and exact replay before mutable invitation guards.
- Required verified authoritative Auth email for pre-membership acceptance and SHA-256-only token handling in private requests.
- Fixed atomic membership/Participant creation, ordered acceptance events and one complete `ExpeditionSetupView` upsert contract.
- Added stable public error mapping, privacy constraints and protected Gate 9B2A validation.

Gate 9B2A is contract-only. It adds no SQL migration, private function, reducer, gateway execution branch, read API, runtime bundle, runtime release, deployment or cloud data. Gate 9B2B implements PostgreSQL wrappers and the Captain setup read API.

"""
if "Gate 9B2A invitation transaction contracts" not in text:
    marker = "# Changelog\n\n"
    if marker not in text:
        raise SystemExit("CHANGELOG header not found")
    text = text.replace(marker, marker + entry, 1)
changelog.write_text(text, encoding="utf-8")
