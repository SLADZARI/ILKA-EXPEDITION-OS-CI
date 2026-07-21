#!/usr/bin/env python3
from pathlib import Path

path = Path("docs/architecture/expedition-setup-and-day1-pilot-runtime.md")
text = path.read_text(encoding="utf-8")
source = "## Runtime composition and registration\n"
target = "## Implementation sequence\n"
if source not in text:
    raise SystemExit("expected architecture heading not found")
path.write_text(text.replace(source, target, 1), encoding="utf-8")
