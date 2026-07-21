from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_gate8d_smoke_checklist_keeps_security_and_postconditions() -> None:
    text = (ROOT / "docs/deployment/gate-8d-development-smoke.md").read_text(
        encoding="utf-8"
    )
    for required in (
        "ILKA_DEFAULT_RUNTIME_RELEASE_KEY",
        "expedition_bootstrap_v1",
        "JWT verification enabled",
        "replayed = true",
        "1 draft Expedition",
        "0 Participants",
        "0 invitations",
        "0 projection documents",
        "Do not manually insert",
        "deployment-blocked",
    ):
        assert required in text
