from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "validate_expedition_start_gateway.py"


def test_expedition_start_gateway() -> None:
    spec = importlib.util.spec_from_file_location(
        "validate_expedition_start_gateway",
        SCRIPT,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.main() == 0
