from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_day1_pilot_runtime_contract() -> None:
    completed = subprocess.run(
        [sys.executable, "scripts/validate_day1_pilot_runtime.py"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
